# Panels（面板宿主）

Codex 风格的右侧面板系统：一个 dock 承载多个面板 tab，面板本身是注册表驱动的插件。本文件是该能力的单一设计来源；`docs/architecture.md` 只保留结果描述。

## 目标行为

1. **面板选择菜单**：列出所有已注册面板（图标 + 标题 + 快捷键提示）；不可用面板保留条目并给出真实原因。
2. **tab 宿主**：面板以 tab 驻留在 dock 内，可多开、切换、关闭，`+` 打开选择菜单。
3. **布局模式**：隐藏 / 停靠（后续可扩展分屏、全宽）。
4. **上下文重绑定**：面板声明 `scope`，切换会话或工作区时按 scope 重新解析可用性与数据源。

## 分层

```text
组件层   PanelDock ─ PanelTabStrip ─ PanelPickerMenu ─ PanelHost ─ components/panels/<id>/...
              ↑ 只读 state，只派发 action
状态层   panelRegistry（静态描述符） + panelLayout（纯 reducer + 版本化持久化）
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
- 关闭当前激活 tab 后，激活相邻 tab；关闭最后一个 tab 时 dock 不可见但保留 active 记忆，便于再次打开。
- 激活实例失效（持久化数据被外部改写、面板下线）时回退到第一个 tab，dock 不渲染空白。
- tab 数量有上限；宽度越界被 clamp。
- 持久化数据是外部输入：版本号不匹配、结构非法、面板 id 已不存在时整体降级到默认布局，不抛错。

持久化沿用 `appearancePreferences.ts` 的模式（版本化 key、读时校验、写失败不抛错），key 为 `sailor.panels.v1`。P0 布局只存 renderer localStorage，不进 `workspaces.json`，因此不改变持久化格式与 IPC 契约。

## 面板的边界与成本

| 面板 | 数据来源 | 新增依赖 | 安全边界 |
| --- | --- | --- | --- |
| 审查 review | 会话内 agent 文件改动聚合（已有 `fileChangeFeedback` / 审批记录）；git diff 需主进程新能力 | 无 | 只读 |
| 文件 files | 主进程只读文件能力，preload 无通用 fs | 无 | 复用 `WorkspaceToolScope` 的路径/敏感文件/字节上限校验 |
| 终端 terminal | `just-bash` 是 JS 模拟器，不能运行本机程序 | 真 PTY 需 `node-pty` + `xterm.js` | 交互终端等于任意命令通道，需单独评审 |
| 浏览器 browser | 现有 `WebPreview` 渲染结果 | 完整浏览器需 `webviewTag` 或 `WebContentsView` | `webviewTag` 会削弱当前 `sandbox: true` 边界 |
| 侧边聊天 side-chat | `WorkspaceChats` 每 chatId 稳定实例，主进程已支持并发 run | 无 | 同一 chat 不得同时挂两个 surface |

## P0 范围（feat-panel-dock-skeleton）

- 注册表、布局 reducer、版本化持久化、快捷键表、可用性解析。
- `PanelDock` / `PanelTabStrip` / `PanelPickerMenu` / `PanelHost`，替换硬编码的 `InspectorPanel`。
- 注册五个面板：审查、文件、终端、浏览器（承载现有只读预览）、侧边聊天；除浏览器外均为带真实原因的占位。
- 退役 `sailor:web-preview` 全局事件，改为类型化面板打开动作。
- `ChatWorkspace` 顶栏的面板开关升级为「选择菜单 + 可见性开关」。

不做（后续 feature）：git diff、只读终端输出、只读文件树、第二 chat surface、分屏、拖拽排序、per-chat 布局持久化。

## 新增一个面板的步骤

1. 在 `components/panels/<id>/` 实现组件，props 只依赖 `PanelProps`。
2. 在注册表追加描述符：id、标题、图标、快捷键、scope、multiplicity、`availability`、`load`。
3. 若需要新的主进程能力：先补窄 IPC 契约与校验，再在 `availability` 中按真实能力返回可用性。
4. 补测试：纯逻辑进 `tests/panel-*.test.ts`；组件接线用 Vite `ssrLoadModule` + `renderToStaticMarkup` 断言；视觉变化走 offscreen Electron 截图。

## 验证

- `node --test tests/panel-layout.test.ts tests/panel-shortcuts.test.ts tests/panel-dock.test.ts tests/panel-registry.test.ts`
- `pnpm run typecheck && pnpm run build`
- offscreen Electron 截图：`.agent-harness/evidence/panel-dock-preview/`
