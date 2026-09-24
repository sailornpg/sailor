# Panels（面板宿主）

Codex 风格的右侧面板系统：一个 dock 承载多个面板 tab，面板本身是注册表驱动的插件。本文件是该能力的单一设计来源；`docs/architecture.md` 只保留结果描述。

## 目标行为

1. **功能列表常驻**：dock 顶部列出所有已注册面板（图标 + 标题 + 快捷键提示）；点选打开并激活，不可用面板保留条目并给出真实原因。
2. **tab 宿主**：面板以 tab 驻留在 dock 内，可多开、切换、关闭。
3. **布局模式**：隐藏 / 停靠（后续可扩展分屏、全宽）；左右两栏可拖拽调宽，左栏可收起。
4. **上下文重绑定**：面板声明 `scope`，切换会话或工作区时按 scope 重新解析可用性与数据源。

## 分层

```text
组件层   PanelDock ─ PanelMenu / PanelTabStrip ─ PanelHost ─ components/panels/<id>/...
              ↑ 只读 state，只派发 action
外壳层   PaneResizer（左右两栏分隔条）+ ProjectSidebar 完整态/图标条
状态层   panelRegistry（静态描述符） + panelLayout（纯 reducer + 版本化持久化）
         + uiLayout（左栏宽度与收起，纯 reducer + 版本化持久化）
              ↑ 纯函数，node --test 直接覆盖
能力层   每个面板自己的窄 IPC；主进程校验复用 WorkspaceToolScope 一类既有基元
```

不变式：

- dock 不 import 任何面板实现；面板不 import dock。二者只通过 `PanelDescriptor` 与 `PanelProps` 通信。
- 面板打开请求只能经注册表 action 或类型化的 `panelRequests` 通道，不使用 `window.dispatchEvent` 广播。
- 面板的数据来源必须真实；未接入的能力显示明确原因，不渲染伪造数据。

## 面板描述符

```ts
interface PanelDescriptor {
  id: PanelId                       // 'review' | 'files' | 'terminal' | 'browser' | 'side-chat' | ...
  title: string
  icon: ComponentType<{ size?: number }>
  shortcut: PanelShortcut           // 展示与匹配共用同一份定义
  scope: PanelScope                 // 'workspace' | 'global'
  multiplicity: 'single' | 'multi'  // 每个 scope 允许的实例数
  availability(ctx: PanelContext): PanelAvailability
  load(): Promise<{ default: ComponentType<PanelProps> }>
}
```

- `availability` 依据真实上下文（是否已关联工作区、是否选中会话、主进程能力）返回 `{ available: false, reason }`；菜单与 dock 直接展示该 reason。
- `scope` 是唯一的上下文绑定轴：切换会话只重解析 `scope: 'workspace'` 的面板。新增面板只要声明 scope 即获得正确行为。
- `load` 懒加载面板实现，主包不因新增面板膨胀。
- 同一份描述符同时驱动三个入口：`+` 菜单、快捷键表、后续的命令面板。

## 布局状态

```ts
interface PanelLayoutState {
  visible: boolean
  width: number                      // clamp 到 [minWidth, maxWidth]
  open: PanelInstance[]              // 打开顺序即 tab 顺序
  activeInstanceId: string | null
}
```

reducer action：`open` / `close` / `activate` / `setVisible` / `setWidth`（后续追加 `move`、`split`，因此状态结构写成数组 + 实例 id，而不是固定槽位）。

不变式：

- 打开已打开的 single 实例 = 激活，不新增 tab。
- 关闭当前激活 tab 后，激活相邻 tab；关闭最后一个 tab 时 dock 保持可见并回到功能列表空态，同时保留 active 记忆（可见性是用户的选择，不由 tab 数量推导）。
- 激活实例失效（持久化数据被外部改写、面板下线）时回退到第一个 tab，dock 不渲染空白。
- tab 数量有上限；宽度越界被 clamp。
- 持久化数据是外部输入：版本号不匹配、结构非法、面板 id 已不存在时整体降级到默认布局，不抛错。

持久化沿用 `appearancePreferences.ts` 的模式（版本化 key、读时校验、写失败不抛错），key 为 `sailor.panels.v1`。左栏宽度与收起状态是外壳几何，属于 `lib/layout/uiLayout.ts`（key `sailor.ui-layout.v2`），两者都只存 renderer localStorage，不进 `workspaces.json`，因此不改变持久化格式与 IPC 契约。

## 外壳几何（左栏 / 中栏 / 右栏）

- 三栏宽度由 `.app-shell` 的 CSS 变量驱动：`--sidebar-width`（左栏，200–420px）与 `--panel-width`（右栏，280–720px），中栏 `minmax(0, 1fr)` 自适应。
- 左栏可收起为 52px 图标条（⌘/Ctrl+B），状态持久化在 `uiLayout`；右栏可见性由面板布局的 `toggleVisible` 决定，且与"是否打开面板"解耦：打开右栏只显示功能列表，绝不替用户选中面板。
- `PaneResizer` 是两条分隔条的唯一实现：绝对定位在栏内边缘、`role="separator"` + `aria-valuenow`、方向键 ±16px（`Shift` ±64px）、拖拽用 pointer capture（不可用时降级为普通事件）。
- 窗口变窄时右栏由媒体查询收窄为 `min(var(--panel-width), 34vw / 42vw)`，避免中栏被挤到不可用。

## 面板的边界与成本

| 面板 | 数据来源 | 新增依赖 | 安全边界 |
| --- | --- | --- | --- |
| 审查 review | 会话内 agent 文件改动聚合（已有 `fileChangeFeedback` / 审批记录）；git diff 需主进程新能力 | 无 | 只读 |
| 文件 files | 主进程只读文件能力，preload 无通用 fs | 无 | 复用 `WorkspaceToolScope` 的路径/敏感文件/字节上限校验 |
| 终端 terminal | 主进程 `node-pty`（当前用户权限，非 OS 沙盒） | `node-pty` + `@xterm/xterm` + `@xterm/addon-fit` | 用户手动命令通道：AI 不注册、不订阅、输出不入模；窄 IPC 只接受主进程签发的 projectId/sessionId |
| 浏览器 browser | 现有 `WebPreview` 渲染结果 | 完整浏览器需 `webviewTag` 或 `WebContentsView` | `webviewTag` 会削弱当前 `sandbox: true` 边界 |
| 侧边聊天 side-chat | `WorkspaceChats` 每 chatId 稳定实例，主进程已支持并发 run | 无 | 同一 chat 不得同时挂两个 surface |

## 终端面板（feat-workspace-terminal）

用户手动操作的本机交互终端：每个工作区可同时打开多个终端，面板内用会话 tab 切换，初始 cwd 都是主进程解析的项目根目录。首版在 macOS 验收；不包含 AI 操控、分屏、跨应用重启恢复、输出自动入模和日志落盘。

### 依赖与必要性

| 依赖 | 层 | 为什么必需 |
| --- | --- | --- |
| `node-pty` | main | 唯一成熟的真实 PTY 绑定：TTY 行规程、作业控制、SIGWINCH 与 Ctrl+C/Ctrl+D 语义、TUI 全屏程序都依赖它。just-bash 是 JS 模拟器，不能运行本机程序。 |
| `@xterm/xterm` | renderer | VT/ANSI 解析、滚动缓冲、选区与输入法；仓库内没有任何终端仿真实现可复用。 |
| `@xterm/addon-fit` | renderer | 由容器尺寸计算 cols/rows，避免手写测量。 |

原生 ABI 与打包接线（已实测）：

- `node-pty@1.1.0` 随包发布 Node-API prebuild（`prebuilds/darwin-arm64/pty.node` 与 `spawn-helper`）。N-API 跨 Node/Electron ABI 稳定（本机 Electron 44.4.2 对应 `abi_version` 149），因此不需要 `electron-rebuild`，也不需要本机原生编译。
- pnpm 构建许可：`pnpm-workspace.yaml` 的 `allowBuilds` 显式写 `node-pty: false`。node-pty 的 `install` 脚本只检查/删除 prebuild，不参与正确性，跳过它能避免误触发 node-gyp。
- 包缺陷与修复：npm 包里 `spawn-helper` 的权限是 0644，缺执行位时 `pty.fork` 直接抛 `posix_spawnp failed`。`scripts/ensure-node-pty-helper.mjs` 在 `postinstall` 补 0755（已用全新 `pnpm install` 验证），打包沿用同一份文件模式。脚本在 node-pty 不存在或平台不需要时静默退出，不让安装失败。
- 打包：`asarUnpack` 覆盖 `**/node_modules/node-pty/**`，因为 node-pty 运行时会把 `app.asar` 路径改写为 `app.asar.unpacked` 并执行其中的 `spawn-helper`；`npmRebuild: false`，只使用已验证的 prebuild。`electron.vite.config.ts` 的 `externalizeDepsPlugin` 让 `node-pty` 保持外部 `require`，不被打进 main bundle。

### 权限边界

- 终端进程以**当前 macOS 用户**的权限运行，cwd 是项目根目录，但项目目录不是 OS 沙盒：用户可以 `cd ..`、访问绝对路径并运行任意本机程序。这是普通终端应有的能力，也是本面板被单独评审的原因。
- AI 侧零接入：不注册终端工具、不向模型发送终端输出、terminal IPC 不出现在 Pi 的工具或上下文里。Pi 继续使用 just-bash 挂载与逐次审批，本 feature 不改变该边界。
- main 永不接受 renderer 提供的可执行路径、argv、cwd 或 env：只接受 `projectId`（经工作区存储解析）和 main 自己签发的 `sessionId`。
- 终端环境变量来自 main 的 `process.env`（用户自己的登录环境），剔除 Electron/Node 注入项并固定 `TERM=xterm-256color`；应用模型凭据从不写入环境变量或 argv，因此不会被终端继承。
- 终端输出是不可信数据：不自动写剪贴板、不自动打开链接（不安装 web-links addon）、不落盘、不进入模型上下文。

### 生命周期

- scope 为 `project`：dock 里仍只有一个「终端」实例（id `terminal:<projectId>`），实例内部再按会话 tab 管理多个 shell。旧持久化记录里的 `terminal:<chatId>` 由既有的 `rebindPanelScopes` 在上下文解析时改写为 project scope，不需要单独迁移分支。
- 打开面板就等于要一个终端：该工作区还没有任何会话时自动创建并激活第一个（同一工作区的并发/重复挂载只创建一次）；已有会话（含已退出的 tab）只恢复，不偷偷新建 shell。
- 面板顶部只有会话 tab 与「+」：tab 用状态点表达运行/已退出/失败，`+` 新建一个独立 shell（每个新会话在主进程拿到稳定 `ordinal`，用于 tab 命名并在 renderer 重载后保持一致），关闭 tab 即终止该 shell；shell 自己 `exit` 后 tab 保留，可以在会话区重新新建。
- 保活范围：切换会话、切换/关闭面板 tab（关闭 = 隐藏，不销毁进程）、隐藏 dock、切换工作区（仅解绑渲染；其它工作区的 shell 继续存活，切回时重新附着）。
- 显式终止：面板的「终止」按钮，或用户在 shell 中输入 `exit`。终止后状态为 `exited`，面板给出「重新启动」，`restart` 以同一个 projectId 建立新会话（新 sessionId）。
- 资源上限：每工作区最多 4 个存活会话（超出时 `+` 禁用并给出原因），保留的已退出 tab 每工作区最多 8 条；全局最多 8 个存活 PTY，超限时回收最久未使用的会话。会话在应用退出时全部清理。
- 应用退出清理：先向会话进程组发 `SIGHUP`（交互 shell 会转发给作业），宽限 1.5s 后对仍存活的进程组发 `SIGKILL`。**脱离进程组/会话的 daemon（自行 `setsid`）不在清理保证内**，这一点在面板文案与文档中都明确，不假装覆盖。

### 失败状态

| 状态 | 触发 | 面板表现 |
| --- | --- | --- |
| `starting` | 已受理、PTY 未就绪 | 加载态，禁止输入 |
| `running` | PTY 已启动 | 可输入、可 resize |
| `exited` | shell 退出（`exit`、终止或信号） | 显示退出码/信号 + 重新启动 |
| `failed` | spawn 抛错，或工作区目录不存在/不是目录 | 显示可读原因 + 重试；不伪造输出 |

后续对已退出会话的 `write`/`resize` 被拒绝（typed error），迟到事件与重复终止是幂等的，不会让状态回退。

### 缓存、背压与订阅

- 输入与尺寸：单次写入上限 64 KiB（按 UTF-8 字节）；IPC 层用严格 schema 拒绝非整数和越界的行列，服务层对非法尺寸再 clamp 一次作为兜底，`resize` 只在运行中且数值变化时下发。
- 每会话一个有上限的输出环形缓冲（256 KiB）与单调递增序号 `seq`；每块 `{ seq, data }`。
- 附着时 main 返回 `sinceSeq` 之后的回放快照、`nextSeq` 与 `truncated` 标记；实时事件携带同一个 `seq`，renderer 据此去重和排序，回放与实时流不重不漏。
- main 按约 16ms 或 64 KiB 合并 PTY 数据后再发一个批量事件，避免逐块跨进程。
- 每个订阅者有独立的待发预算（256 KiB）；慢消费者超预算时丢弃最旧的待发数据并只发一条明确的截断通知，绝不无界占用内存。隐藏的终端同样受上限约束。
- 订阅是显式的 `attach`/`detach`：main 按 `subscriptionId` 路由事件，`detach`、窗口销毁或 renderer 卸载都会释放监听；订阅者只收到自己会话的事件。

### macOS 验收边界

- 已验证：macOS 14.6 arm64、Electron 44.4.2、`node-pty` darwin-arm64 N-API prebuild、`electron-builder --mac --dir` 产物。
- 不声称：Windows/Linux、非 arm64、跨应用重启恢复、`setsid` 脱离进程组的进程，以及除默认 `$SHELL` 之外 shell 的特殊配置。
- 默认 shell：`$SHELL`，回退 `/bin/zsh`，以 login shell（`-l`）启动，与系统终端行为一致。

## 当前形态（feat-panel-dock-skeleton + 三栏布局）

- 注册表、布局 reducer、版本化持久化、快捷键表、可用性解析。
- `PanelDock` / `PanelMenu` / `PanelTabStrip` / `PanelHost`，替换硬编码的 `InspectorPanel`。
- 功能入口只有两条、互不重复：有 tab 时由 tab 条右侧的 `+` 下拉（`PanelPickerMenu` / `PanelAddButton`，注册表驱动）新增；没有 tab 时整份功能列表垂直居中作为 dock 内容。两者都可点选打开并激活，不可用项保留条目与真实原因。
- 注册五个面板：审查、文件、终端、浏览器（承载现有只读预览）、侧边聊天；文件、终端、浏览器为真实实现，审查与侧边聊天仍为带真实原因的占位。
- 终端面板按 project scope 绑定工作区，走独立的窄 IPC（见下节）；其余面板不读取终端状态。
- 退役 `sailor:web-preview` 全局事件，改为类型化面板打开动作。
- `ChatWorkspace` 顶栏只保留一个面板可见性开关（`PanelToolbar`），不再与选择菜单重复。

不做（后续 feature）：git diff、只读文件树、第二 chat surface、分屏、拖拽排序、per-chat 布局持久化。（终端已从「只读执行记录」升级为真实交互终端，见上节。）

## 新增一个面板的步骤

1. 在 `components/panels/<id>/` 实现组件，props 只依赖 `PanelProps`。
2. 在注册表追加描述符：id、标题、图标、快捷键、scope、multiplicity、`availability`、`load`（功能列表自动出现该项）。
3. 若需要新的主进程能力：先补窄 IPC 契约与校验，再在 `availability` 中按真实能力返回可用性。
4. 补测试：纯逻辑进 `tests/panel-*.test.ts`；组件接线用 Vite `ssrLoadModule` + `renderToStaticMarkup` 断言；视觉变化走 offscreen Electron 截图。

## 验证

- `node --test tests/panel-layout.test.ts tests/panel-shortcuts.test.ts tests/panel-dock.test.ts tests/panel-registry.test.ts`
- 外壳几何：`node --test tests/ui-layout.test.ts tests/pane-resizer.test.ts tests/sidebar-rail.test.ts`
- `pnpm run typecheck && pnpm run build`
- offscreen Electron 截图：`.agent-harness/evidence/panel-dock-preview/`（dock 骨架）与 `.agent-harness/evidence/shell-layout-preview/`（三栏拖拽、左栏收起、功能列表，含交互断言）
