# 侧边栏浏览器与 Agent 浏览器操作（browser use）

本文件是「让 Sailor 的侧边栏浏览器具备 Claude Code 那样的 browser use 能力」的单一设计来源。
能力面的取证见 [`claude-in-chrome.md`](./claude-in-chrome.md)；本文只写 Sailor 自己的取舍。

## 目标

1. 右侧「浏览器」面板从静态预览升级为**真实浏览器**：地址栏、前进/后退/刷新、多个 tab、真实的导航与渲染。
2. 模型能通过工具**读取页面结构并操作页面**：导航、读取可交互元素、点击、输入、按键、滚动、截图、tab 管理、读 console。
3. 浏览器归用户所有：用户看得见、能随时接管、能一键关掉 Agent 控制。

## 非目标（本轮）

- 不接入用户本机 Chrome、不做浏览器扩展、不做 native messaging。
- 不做多设备 / 跨机浏览器选择（`list_connected_browsers` / `select_browser` / `switch_browser` 的对应物）。
- 不做 GIF 录制、shortcuts/workflow、站点级权限规则表、`javascript_tool` 任意脚本执行。
- 不把浏览器画面作为图片回灌给模型（本轮模型靠可访问性树 + ref 定位，而不是靠坐标）。

## 能力映射

Claude in Chrome 的能力面按"是否值得照搬"逐项判断：

| Claude in Chrome                                          | Sailor 的对应物                                                     | 取舍理由                                                                |
| --------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `tabs_context_mcp` / `tabs_create_mcp` / `tabs_close_mcp` | `browser_tabs`（action: `list` / `open` / `close` / `activate`）    | tab 是 browser use 的基本单位；Sailor 只有一套 tab，不需要 group 概念。 |
| `navigate`（含 `back` / `forward`）                       | `browser_navigate`（`url` 接受 URL 或 `back` / `forward`）          | 语义一致，删掉 `tabId`（会话内只有一个活动 tab）。                      |
| `read_page`（a11y tree + refs）                           | `browser_read_page`                                                 | 直接照搬：这是让模型能点对元素的关键，`ref_N` 必须稳定可复用。          |
| `find`                                                    | 并入 `browser_read_page` 的 `query` 过滤（按名称/角色匹配）         | 自然语言检索可以先落成确定性匹配，避免再引入一层不确定性。              |
| `get_page_text`                                           | `browser_read_text`                                                 | 正文与结构是两个不同用途，保留为独立工具。                              |
| `computer`（坐标级鼠标键盘）                              | `browser_click` / `browser_type` / `browser_key` / `browser_scroll` | 按动作拆成独立工具，参数由 Zod 严格校验；坐标仅作 `ref` 缺失时的兜底。  |
| `computer action:screenshot` / `zoom`                     | `browser_screenshot`                                                | 截图给**用户**看，存盘 + 在会话卡片里展示；不回灌成图片 part。          |
| `resize_window`                                           | 面板尺寸由用户拖拽决定，不暴露给模型                                | 浏览器在侧边栏里，尺寸是用户的选择，不是模型的。                        |
| `browser_batch`                                           | 不提供                                                              | 单轮多工具调用已由模型侧合并；先不做，避免多一层嵌套与语义。            |
| `read_console_messages` / `read_network_requests`         | `browser_console`（本轮）／`browser_network`（后续）                | console 排查成本低、价值高，先做；网络面板稍后。                        |
| `form_input` / `upload_image` / `file_upload`             | 暂不提供                                                            | 需要额外文件授权模型，且表单可用 `browser_type` 覆盖。                  |
| `javascript_tool`                                         | 不提供                                                              | 任意脚本执行等同于绕过所有页面约束，收益与风险不成比例。                |
| 站点级权限（扩展侧）                                      | 不做站点级授权：浏览器默认对 Agent 可用                             | Sailor 的浏览器是应用内面板、用户随时可见可接管，不需要扩展那套授权层。 |
| 系统提示词的纪律条款                                      | 移植为 `SAILOR_INSTRUCTIONS` 中的浏览器段落                         | 反兔子洞、禁触发模态框、tab 自清理这些是真实踩坑经验。                  |

## 架构

```text
renderer
  BrowserPanel ── 只上报自己内容区的矩形（ResizeObserver）与用户动作
      │ window.sailor.browser.*（窄 IPC，无通用 fs / 无 URL 自由执行）
      ▼
main
  BrowserService ── 每个项目一个 BrowserSite
      ├─ tab 栈：WebContentsView（sandbox + contextIsolation，独立 session partition）
      ├─ CdpDriver ── webContents.debugger（Chrome DevTools Protocol），无新增依赖
      ├─ SnapshotBuilder ── a11y 树 → 带 ref 的可读文本（纯函数）
      └─ 事件投影 ── 标题 / URL / 加载状态 / 可前进后退 → renderer
      ▲
  PiRunner ── browser_* 工具（默认注册，不需要任何用户前置动作）
```

关键决定：

- **用 `WebContentsView` 而不是 `<webview>`**。`webviewTag` 会把控制权交给 renderer 页面，
  与 `CLAUDE.md` §3 的 "renderer 不得获得 Node 权限" 以及 `docs/panels.md` 记录的边界冲突；
  `WebContentsView` 由 main 持有，renderer 只能通过窄 IPC 上报几何与用户意图。
- **用 `webContents.debugger`（CDP）而不是 Playwright**。Electron 自带 CDP 客户端，
  零新增依赖，且和 `WebContentsView` 是同一套进程模型。
- 浏览器使用独立的 `persist:sailor-browser` session partition，与应用的 cookie/storage 隔离。
- 浏览器的 webContents 不加载 preload、不开 Node、不注入任何应用桥。

## 工具面（模型可见）

工具名与参数都走 Zod 严格校验，结果统一走 `src/shared/toolFeedback.ts` 的 `ToolResult` 契约。

| 工具                 | 作用                                                                                                           | 读写 |
| -------------------- | -------------------------------------------------------------------------------------------------------------- | ---- |
| `browser_navigate`   | 打开 URL，或 `back` / `forward`。返回页面标题、URL、加载结果。                                                 | 写   |
| `browser_read_page`  | 返回页面可访问性树文本，元素带稳定 `ref_N`；支持 `mode: interactive\|all`、`maxChars`、`refId` 聚焦、`depth`。 | 读   |
| `browser_read_text`  | 返回正文文本（去重、按段落）。                                                                                 | 读   |
| `browser_click`      | 按 `ref` 点击（`button`、`clickCount`、`modifiers`）；`ref` 缺失时可用 `coordinate`。                          | 写   |
| `browser_type`       | 聚焦 `ref` 并输入文本，可选 `submit`。                                                                         | 写   |
| `browser_key`        | 发送按键序列，如 `"Enter"`、`"cmd+a"`、`"Backspace Backspace"`。                                               | 写   |
| `browser_scroll`     | 按 `ref` 滚到元素，或按 `direction` + `amount` 滚动视口。                                                      | 写   |
| `browser_screenshot` | 截图存到 `userData/browser-captures/<chatId>/`，返回 `artifactRefs`；会话卡片按 `artifactRef` 读取展示。       | 读   |
| `browser_console`    | 读取该 tab 的 console 消息，支持 `pattern`（正则）、`onlyErrors`、`limit`、`clear`。                           | 读   |
| `browser_tabs`       | `list` / `open` / `close` / `activate`。                                                                       | 写   |

工具描述里必须写明（照搬 Claude in Chrome 的真实教训）：

- 动手前先 `browser_read_page` 拿 ref，不要凭猜测点击。
- 不要触发 `alert` / `confirm` / `prompt`：它们会挂住后续所有浏览器操作。
- 同一动作连续失败 2–3 次就停下来问用户，不要重复重试。
- 自己开的 tab 自己关掉。

## 授权模型：默认允许

`browser_*` 工具对**每个带工作区的会话**都注册（侧边聊天除外），**不需要任何用户前置动作**：

- 用户没打开过面板？main 在第一次工具调用时自动创建该工作区的浏览器站点与一个空白标签页。
- 用户把标签页都关了？下一次工具调用自动补一个。
- 用户没有点过任何开关？没有开关。

只有两种情况会拒绝，而且都是能力问题不是权限问题：

| 情况                      | 返回             | 恢复指引                               |
| ------------------------- | ---------------- | -------------------------------------- |
| 工作区无效 / 站点建不出来 | `NOT_CONFIGURED` | 确认会话仍关联有效工作区后重试         |
| 标签页数打满              | `LIMIT_EXCEEDED` | 先用 `browser_tabs` 关掉不需要的标签页 |

拒绝发生在**工具层且先于任何 CDP 调用**（`tests/browser-agent.test.ts` 断言此时一次 CDP 都没发出）。

### 自动展示

Agent 第一次（以及之后每一次）动用浏览器时，main 会通过 `browser:reveal` 通知 renderer，
AppShell 用既有的 `requestPanelOpen({ panelId: 'browser' })` 通道把右侧栏打开并切到浏览器面板，
所以"用户不需要先开面板"和"用户一定看得到"这两件事同时成立：

- 信号只由 `BrowserRegistry.acquire`（即模型发起的工具调用）触发，用户自己点地址栏、切 tab、
  关面板都不会被强行拉回来；
- renderer 侧只在被操作的工作区就是当前会话所属工作区时响应（`shouldRevealBrowserFor`），
  后台跑别的项目的会话不会抢走当前视图；
- 每次调用都请求一次，是幂等的：任务中途用户关掉侧栏，下一次动作会重新打开。

覆盖方式：`tests/browser-electron-smoke.mjs` 断言 renderer 真的收到了带正确 projectId 的 reveal 信号
（含"每次调用都请求一次"），`tests/browser-panel.test.ts` 断言 AppShell 的订阅与
`shouldRevealBrowserFor` 的判定，`tests/browser-ipc.test.ts` 断言只有 Agent 活动才触发回调。
"reveal → dock 真的可见"这一步依赖既有的面板打开通道，由 `tests/panel-dock.test.ts` /
`tests/panel-layout.test.ts` 覆盖，本轮没有单独再跑一次真实 AppShell 的端到端渲染。

### 可见性边界

默认允许不等于"偷偷浏览"：页面本身由 `WebContentsView` 承载，只在面板打开并且几何被上报时才挂在窗口上；
面板关掉、切到别的面板 tab、对话框或下拉菜单遮住面板、窗口不可见时，renderer 立即上报 `null`，main 把原生视图摘掉。
也就是说——**用户没在看的时候，浏览器不在屏幕上；用户打开面板时看到的就是 Agent 正在操作的那个页面**，
可以随时用地址栏或鼠标接管。

> 取舍记录：早先的版本在面板里有一个「允许 Agent 操作」开关（默认关闭）。它带来的摩擦大于价值：
> 用户要先开面板、再点开关，模型才能动；而浏览器本来就在应用内、用户随时可见可接管。
> 现在改成默认允许 + 可见性边界，与"用户自己的 Chrome 需要扩展授权"这一前提不再相同，是有意的分歧。

## 面板形态

- 顶部工具条：后退 / 前进 / 刷新 / 停止、地址栏（可编辑，回车导航）、新建 tab。
- tab 条：与终端面板一致的心智，显示标题与加载状态点；`+` 新建，关闭即销毁该 tab。
- 内容区只上报几何：`BrowserPanel` 用一个填满剩余空间的占位 div，`ResizeObserver` 把它的
  `getBoundingClientRect()` 发给 main，main 据此 `setBounds`。这块 div 是留边 8px 的圆角卡片，
  原生视图按同一半径切角（`setBorderRadius`），所以页面看起来就是容器里的一张圆角卡片。
- 几何失效即隐藏：面板不可见、tab 被切换、窗口失焦/最小化、对话框或压在面板上的下拉菜单打开时，
  renderer 上报 `null` bounds，main 把 view 移除或设为不可见，避免浮层遮挡与"幽灵页面"。
- 空态：没有 tab 时显示官方设计的空态（不是伪造的页面）。

## 生命周期与上限

- 每个项目最多 1 个 `BrowserSite`；每个 site 最多 4 个 tab。
- tab 创建时以 `about:blank` 起步，用户或模型导航后进入真实页面。
- 切换 tab 只切换"哪个 view 挂在 contentView 上"，不销毁 webContents。
- 关闭 tab 即 `webContents.close()` 并释放 CDP 附着。
- 窗口关闭 / 应用退出时统一销毁所有 view 与 CDP 附着。
- 导航只允许 `http:` / `https:` / `about:`（拒绝 `file:`、`javascript:`、`data:`、`devtools:` 等）。

## 失败状态

| 状态                | 触发                          | 表现                                                      |
| ------------------- | ----------------------------- | --------------------------------------------------------- |
| `no-workspace`      | 会话没有工作区                | 面板不可用并给出真实原因                                  |
| `no-tab`            | 没有 tab 时调用浏览器工具     | 工具返回 `NOT_CONFIGURED`，提示用户打开面板               |
| `limit-exceeded`    | 标签页数量打满                | 工具返回 `LIMIT_EXCEEDED`，提示先用 `browser_tabs` 关     |
| `navigation-failed` | 加载失败（DNS / 超时 / 证书） | 面板显示错误页，工具结果带 `UPSTREAM_ERROR` 与可读原因    |
| `cdp-unavailable`   | debugger 附着失败             | 工具返回 `INTERNAL_ERROR`，面板仍可用（降级为手动浏览器） |
| `ref-stale`         | ref 对应的元素已不存在        | 工具返回 `NOT_FOUND`，提示重新 `browser_read_page`        |

## 实测约束与已记录的坑

以下都是在真实 Electron 里跑出来的结论，不是猜测：

1. **`WebContentsView` 会丢弃 CDP 注入的鼠标与键盘事件**，除非目标处于焦点仿真状态。
   在 macOS 14.6 + Electron 44.4.2 上：

   - 隐藏或未聚焦的 `WebContentsView`：`Input.dispatchMouseEvent` 与
     `Input.dispatchKeyEvent` 完全不到达页面（页面收不到任何 mousedown/keydown），
     但 `Input.insertText` 仍然生效；
   - 同一个 webContents 打开 `Emulation.setFocusEmulationEnabled` 之后，鼠标、按键、
     文本三类输入都正常；
   - 只调用 `webContents.focus()` 不足以修复，而且会抢走应用自身焦点，因此不采用。

   结论：`CdpSession` 在第一次发送命令前打开 focus emulation（短超时、失败不致命），
   之后所有输入类工具才真的作用于页面。

2. **原生视图不参与 `webContents.capturePage()`**。给人类看的面板截图里，
   工具条与 tab 条是真实渲染的，内容区是空的；页面本身要靠 `browser_screenshot`
   或独立的页面截图来验收。

3. **`webviewTag` 不是备选**：它会把页面控制权交给 renderer，与 `sandbox: true`
   边界冲突，所以整条链路都建立在 main 进程持有 `WebContentsView` 之上。

## 怎么测

### 自动化

```bash
# 纯逻辑与接线（不需要 Electron）
node --test tests/browser-url.test.ts tests/browser-snapshot.test.ts tests/browser-site.test.ts \
  tests/browser-ipc.test.ts tests/browser-tools.test.ts tests/browser-panel.test.ts tests/browser-tool-ui.test.ts

# 真实 agent：scripted 模型 → PiRunner → browser_* 工具 → 真实 BrowserSite
node --test tests/browser-agent.test.ts

# 真实桌面：生产面板 + 生产服务 + 真实页面 + 一个 agent 回合
node tests/browser-electron-smoke.mjs

pnpm run typecheck && pnpm run build
```

`tests/browser-agent.test.ts` 断言的是一条完整的 agent 链路：模型被广告到 `browser_*` 工具、
自己发起 `browser_read_page`、`browser_click` 的参数（ref）只能来自上一步的工具结果、
工具结果真的回到模型上下文；拿不到浏览器时同一调用被拒且一次 CDP 都没有发出。

`tests/browser-electron-smoke.mjs` 在真实 Electron 里再加一段 agent 回合：scripted 模型从真实页面的
可访问性树里解析出 `[ref_1] button "点我"` 并点击，断言**真实页面文本因此改变**，转录写到
`.agent-harness/evidence/sidebar-browser/agent-tool-calls.json`。

### 手动

1. `pnpm dev` 启动应用，打开一个工作区会话。
2. 直接让模型做事，例如「打开 example.com，读一下页面结构，然后点第一个链接」——
   **不需要先打开面板、也不需要点任何开关**。
3. 需要看画面时再打开右侧面板「浏览器」（⌘T）：看到的就是 Agent 正在操作的那个页面，
   地址栏和鼠标都能随时接管。
4. 观察：面板里页面真的在动；会话里出现 `browser_*` 工具卡片（截图以图片卡展示）；
   把面板关掉再让它操作，工具照常工作（视图被摘掉而已）。

## 验证

- 纯逻辑：`node --test tests/browser-snapshot.test.ts tests/browser-url.test.ts tests/browser-tabs.test.ts`
- 契约/接线：`node --test tests/browser-service.test.ts`（用假 webContents 驱动服务层）
- 桌面验收：`node tests/browser-electron-smoke.mjs`（真实 Electron：打开面板 → 上报几何 →
  真实导航到本地 fixture 页面 → `browser_read_page` → `browser_click` → 断言页面状态变化 →
  截图落到 evidence 目录）
- `pnpm run typecheck && pnpm run build`

## 后续（不在本轮）

- 逐次审批接入（见上，需要契约变更确认）。
- 截图回灌给模型（vision），用于纯视觉判断与坐标级兜底操作。
- `browser_network`（CDP Network domain 过滤）。
- 站点白名单 / 黑名单与"只允许访问当前项目文档域"这类约束。
- 会话级浏览器操作时间线（Claude in Chrome 的 GIF 录制对应物）。
