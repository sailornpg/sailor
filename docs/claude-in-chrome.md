# Claude Code 的浏览器能力（Claude in Chrome）逆向调查

本文记录对 Claude Code 2.1.296 的调查结果，用于指导 Sailor 侧边栏浏览器的设计。
只记录**从 shipped artifact 得到的观察**、由其推导的**推断**，以及**仍未确定**的部分。

## 调查对象与证据来源

| 项       | 值                                                                      |
| -------- | ----------------------------------------------------------------------- |
| 目标     | `@anthropic-ai/claude-code@2.1.296` 的 darwin-arm64 单文件可执行体      |
| 路径     | `.../node_modules/@anthropic-ai/claude-code-darwin-arm64/claude`        |
| SHA-256  | `c9b5341637becbd423ddffc5b254afb645682a3868cb708bbc6cc0e7bb419937`      |
| 格式     | Mach-O arm64，240 MB，Bun single-file executable（含内嵌 module graph） |
| REA 会话 | `mcp__rea__open_binary`（成功绑定 artifact identity/format/digest）     |

### REA 分析路径与已记录的阻塞

1. `mcp__rea__open_binary` —— 成功，返回格式 `mach-o`、`kind: executable`、`architecture: arm64`、上表 SHA-256。
2. `mcp__rea__analyze_javascript_application` —— **在本机不可执行**。该操作走
   `javascript-static-analysis` provider，其 worker 在启动阶段必须先用
   `xcrun swiftc` 编译 macOS 进程所有权采集 helper；本机只有 CommandLineTools 且状态损坏：

   - `redefinition of module 'SwiftBridging'`（`usr/include/swift/module.modulemap` 与 `bridging.modulemap` 重复定义）；
   - `the SDK is built with 'Apple Swift version 6.0.3 effective-5.10 (swiftlang-6.0.3.1.5)'，while this compiler is '...1.10'`。

   同样的失败在 `xcrun swiftc` 直接编译最小 `print("hi")` 时复现，说明是宿主工具链问题，
   与本次输入无关（`rea doctor` 同时报告 Hopper / Ghidra / IDA 均缺失，原生 provider 不可用）。
   证据 `ev_f7d333167aa687d658d3667e2a1fae2531987ccc840a0f07831f64948a33a94d`、
   `ev_6618c5ddb380229a11aee1232eddbfa36d4ff37350da8c4eca5ef2106e648f53`。

3. 回退路径（REA skill 对 ASAR / 已抽取 JavaScript 的推荐路线）：把 `__BUN,__bun` section
   中的内嵌 module graph 抽取成 JavaScript 应用树（2350 个 module，44.9 MB），
   再按 REA 的 JS 应用分析口径定位并读取相关 module。

上述回退抽出的文件位于 `/tmp/rea-claude-code-2.1.296/`（非本仓库内容，不进版本库）。

## 结论

Claude Code 的 "browser use" 不是内置浏览器，而是 **Claude in Chrome**：
让模型通过一组 MCP 工具去操作用户自己那个已经在跑的 Chrome。

### 四层链路

```text
Chrome 扩展（用户自己的 Chrome 会话、用户自己的登录态）
   │  chrome.runtime.connectNative("com.anthropic.claude_code_browser_extension")
   ▼  native messaging（stdio，4 字节小端长度前缀 + JSON）
native host 进程： claude --chrome-native-host
   │  在 unix domain socket 上监听，接受多个 MCP client
   ▼
MCP server 进程： claude --claude-in-chrome-mcp
   │  MCP over stdio
   ▼
Claude Code 主进程（agent）→ 工具名 mcp__claude-in-chrome__*
```

关键观察：

- MCP server 配置由 CLI 自己生成，是本机自举：
  `Dbe()` 返回 `{type:"stdio", command: process.execPath, args:["--claude-in-chrome-mcp"], scope:"dynamic"}`。
  即 `claude-in-chrome` 是一个 **动态（dynamic）内置 MCP server**，用当前可执行体自身启动。
- native host 侧注册的 manifest：
  `{name:"com.anthropic.claude_code_browser_extension", description:"Claude Code Browser Extension Native Host",
path:"<claude … --chrome-native-host>", type:"stdio", allowed_origins:["chrome-extension://fcoeoabgfenejglbffodgkkbkcdhcgfn/"]}`，
  写入每个浏览器 profile 的 `NativeMessagingHosts/` 目录；Windows 走注册表 `HKCU/HKLM\Software\Google\Chrome\NativeMessagingHosts\...`。
- 扩展 ID：`fcoeoabgfenejglbffodgkkbkcdhcgfn`，安装页 `https://claude.ai/chrome`；
  另有两个辅助页 `https://clau.de/chrome/reconnect`、`https://clau.de/chrome/permissions`。
- 支持的浏览器被显式枚举：`chrome / brave / arc / edge / chromium / vivaldi / opera`，
  并按平台列举 profile 数据目录去探测扩展是否已安装。
- native host 与 MCP server 之间是**本机 socket**（`socketPath`），
  native host 把 `tool_response` 广播给所有已连接的 MCP client，也支持多设备（`deviceId`）。

### 模型看到的工具面（22 个）

工具名一律是 `mcp__claude-in-chrome__<name>`，顺序与 `d2n` 常量一致：

`javascript_tool`、`read_page`、`find`、`form_input`、`computer`、`browser_batch`、
`navigate`、`resize_window`、`gif_creator`、`upload_image`、`get_page_text`、
`tabs_context_mcp`、`tabs_create_mcp`、`tabs_close_mcp`、`read_console_messages`、
`read_network_requests`、`shortcuts_list`、`shortcuts_execute`、`file_upload`、
`switch_browser`、`list_connected_browsers`、`select_browser`

语义要点（摘自工具 schema 原文）：

| 工具                                                            | 语义                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tabs_context_mcp`                                              | 会话开始必须先调用；返回本会话 tab group 内的 tab id 列表；`createIfEmpty` 会新建窗口 + 空 tab group。                                                                                                                                                                                                    |
| `tabs_create_mcp` / `tabs_close_mcp`                            | 在**自己的 tab group** 内新建/关闭 tab；关掉最后一个 tab 时 Chrome 会自动移除该 group。                                                                                                                                                                                                                   |
| `navigate`                                                      | URL 或 `back`/`forward`；单独调用时可省略 `tabId`，此时自动 `tabs_context_mcp{createIfEmpty:true}` 并把 tab 列表附加到结果里；在 `browser_batch` 内必须显式传 `tabId`。                                                                                                                                   |
| `read_page`                                                     | 页面的 **accessibility tree**（默认含非可见元素），默认上限 50000 字符，超出按行截断并给出全量大小；支持 `filter:"interactive"`、`depth`、`ref_id` 聚焦、`max_chars`。                                                                                                                                    |
| `find`                                                          | 自然语言查找元素（如 "search bar"），最多 20 个命中，返回可被其它工具使用的 `ref`。                                                                                                                                                                                                                       |
| `get_page_text`                                                 | 抽取正文纯文本（优先 article 内容）。                                                                                                                                                                                                                                                                     |
| `form_input`                                                    | 用 `read_page` 得到的 `ref` 给表单元素赋值（checkbox 用 boolean，select 用 option value 或文本）。                                                                                                                                                                                                        |
| `computer`                                                      | 动作枚举：`left_click / right_click / double_click / triple_click / type / screenshot / wait / scroll / key / left_click_drag / zoom / scroll_to / hover`；坐标为 viewport 像素；`key` 支持 `"cmd+a"` 这类组合与 `repeat`；`zoom` 用于放大局部；`scale` 可控截图 token 成本（坐标永远是全分辨率坐标系）。 |
| `browser_batch`                                                 | 一次 round trip 顺序执行多条工具调用（`{name, input}`），遇到第一个错误即停；**不可嵌套**；截图与文本结果交错返回；本批内写的坐标以本批之前的截图为准；服务端超时 90s。                                                                                                                                   |
| `javascript_tool`                                               | 在页面上下文执行 JS（REPL 语义，顶层 await 可用，最后一个表达式的结果被返回）。                                                                                                                                                                                                                           |
| `read_console_messages`                                         | 读 console（含 error/warn），支持 `onlyErrors`、`pattern`（正则）、`limit`、`clear`；提示"务必带 pattern"。                                                                                                                                                                                               |
| `read_network_requests`                                         | 读 XHR/Fetch/文档/图片等请求，跨域也返回；换域导航时自动清空；支持 `urlPattern`、`limit`、`clear`。                                                                                                                                                                                                       |
| `gif_creator`                                                   | 录制/导出操作 GIF（click 指示圈、drag 箭头、动作标签、进度条、水印、质量）。                                                                                                                                                                                                                              |
| `resize_window`                                                 | 调整浏览器窗口尺寸（响应式验证）。                                                                                                                                                                                                                                                                        |
| `upload_image` / `file_upload`                                  | 把 `computer` 截图产物上传到文件输入或拖放区 / 上传用户已共享给会话的文件（路径受读权限限制）。                                                                                                                                                                                                           |
| `read_page` 之外的文本工具                                      | `get_page_text` 偏正文，`read_page` 偏可交互结构，`find` 偏定位。                                                                                                                                                                                                                                         |
| `list_connected_browsers` / `select_browser` / `switch_browser` | 多设备/多浏览器选择：列已连接的 Chrome，按 `deviceId` 选定，或向所有扩展广播连接请求让用户在 Chrome 里点 "Connect"。                                                                                                                                                                                      |
| `shortcuts_list` / `shortcuts_execute`                          | 调用扩展里配置的 shortcut / workflow（在 side panel 中执行，立即返回不等完成）。                                                                                                                                                                                                                          |

### 权限与开关

- 站点级权限归**扩展**管：工具描述写明 "Requires site-level permissions before executing (configured in the extension)"。
  权限页 `https://clau.de/chrome/permissions`；扩展侧存在模式集合 `["ask","skip_all_permission_checks","follow_a_plan"]`，
  并有 `chrome_permission_prompt` / `chrome_permission_sync` 遥测事件。
- 主机侧只读/可写分类（CLI 内部用来做自动放行判定）：
  - 只读集合：`find`、`get_page_text`、`list_connected_browsers`、`read_page`、`resize_window`、`shortcuts_list`、`switch_browser`、`tabs_close_mcp`；
  - 条件只读：`read_console_messages` / `read_network_requests`（`clear` 为假时）、`tabs_context_mcp`（`createIfEmpty` 为假时）；
  - `computer` 的动作级分类：`screenshot / zoom / wait / get_page_text / find / scroll / scroll_to / hover / mouse_move / cursor_position / left_click / right_click / middle_click / double_click / triple_click / left_click_drag` 视为只读（且 `save_to_disk` 为假时）；
  - `browser_batch` 逐项按同样规则判定。
- 非交互场景注入 `CLAUDE_CHROME_PERMISSION_MODE=skip_all_permission_checks`。
- 组织/企业策略：managed setting `allow_claude_browser_extension`；managed MCP 锁定可用
  `allowClaudeInChromeWithManagedMcp` 放开；`deniedMcpServers` 也可以拒掉它。
- 启动开关：`--chrome`（子会话）、`/chrome` 命令、用户设置 `claudeInChromeDefaultEnabled`、
  环境变量 `CLAUDE_CODE_ENABLE_CFC=1|0`；项目级 settings **不能**打开它（changelog 明确）。
  未安装扩展时走 `offer_chrome_setup` / `chrome_install_upsell` 引导安装，
  安装态有 `waiting_install → connecting → stalled/connected/failed` 阶段，并用
  `list_connected_browsers` 的结果作为"已连上"的探针。

### 系统提示词（`ke` 常量，原文要点）

`# Claude in Chrome browser automation`，主要内容：

1. 延迟加载：如果 `mcp__claude-in-chrome__*` 工具是 deferred 的，**一次** ToolSearch 调用把需要的工具全部载入，
   核心集合是 `tabs_context_mcp, navigate, computer, read_page, tabs_create_mcp, tabs_close_mcp`。
2. GIF 录制：多步交互建议用 `gif_creator` 录制，动作前后都要补帧，文件要取有意义的名字。
3. Console 调试：读 console 必须带 `pattern`。
4. **禁止触发 alert/confirm/prompt/浏览器模态对话框**——它们会阻塞扩展收到后续命令；需要时先用 `javascript_tool` 清理。
5. 反兔子洞：连续 2–3 次失败、扩展无响应、元素不响应点击、页面超时等情况要停下来问用户，不要重复重试或乱逛。
6. tab 上下文：每次会话开始先 `tabs_context_mcp`；**不要复用**上一个会话的 tab id；用户没明确要求就新建 tab；
   tab 失效就重新取上下文；自己开的 tab 要自己关掉。

另外两处行为约束：

- 单工具调用的一轮之后会追加提醒："You used a single tool call this turn. Prefer browser_batch to execute multiple actions in one call — it is significantly faster."
- `computer` / `browser_batch` 里带 `left_click/right_click/double_click/triple_click/left_click_drag/key/type` 的动作，
  以及 `form_input`，schema 会被追加一个必填的"动作摘要"字段：
  _"A few words saying what this action does and to what"_（例如 "Opens the Filters menu"）。
  目的是让权限提示/审计能读懂模型要做什么。

## 对 Sailor 的取舍

Claude in Chrome 的形态被"目标浏览器是用户自己的 Chrome"约束死了：必须靠扩展 + native messaging + 多设备桥。
Sailor 的场景不同——浏览器就在应用里，因此**不应该**照抄扩展链路，而应保留其**能力面**（工具语义、权限分层、提示词纪律），
把传输换成主进程内的直接控制。

具体映射见 [`browser-use.md`](./browser-use.md)。

## 仍未确定的部分（本轮未取证）

- 扩展内部实现：`read_page` 的 ref 编号规则、`find` 的匹配算法、tab group 的具体命名、
  站点权限 UI 的存法与 `follow_a_plan` 的确切语义。
- native host 侧的 socket 协议细节（帧格式、鉴权、多客户端仲裁）。
- GIF 编码实现与 `shortcuts_*` 背后指的产品能力。

上列内容都在扩展或远端，不在 GPU 侧可取得的 artifact 里；本机未安装该扩展，也没有可用的
Swift 工具链去跑 REA 的 JS worker，因此不做推测。
