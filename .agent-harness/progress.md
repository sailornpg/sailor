# Session Progress Log

## Current State

**Last Updated:** 2026-10-14
**Active Feature:** feat-sidebar-browser-agent-control (done)

## Status

### 已完成

- [x] feat-sidebar-browser-agent-control — 侧边栏浏览器与 Agent 浏览器操作
  - Details: 10/10 checklist item 由 `.agent-harness/scripts/verify-feature.mjs` 逐项跑通并把 feature 置为 done。
  - Evidence: 每项 `evidence` 字段；桌面证据在 `.agent-harness/evidence/sidebar-browser/`。

### 进行中

- [ ] 无

## Deliverables

### 调查（REA）

- `docs/claude-in-chrome.md`：对 Claude Code 2.1.296 darwin-arm64 单文件可执行体（SHA-256
  `c9b53416…419937`）的调查。结论：browser use 是 **Claude in Chrome**——内置动态 MCP server
  `claude-in-chrome`（`claude --claude-in-chrome-mcp`）+ native messaging host
  `com.anthropic.claude_code_browser_extension` + 扩展 `fcoeoabgfenejglbffodgkkbkcdhcgfn`，
  共 22 个 `mcp__claude-in-chrome__*` 工具，站点权限由扩展持有，并有完整的系统提示词纪律。
- REA 路径与阻塞均已记录：`open_binary` 成功（artifact identity/format/digest）；
  `analyze_javascript_application` 因宿主 Swift 工具链损坏（CommandLineTools SDK 与 swiftc
  构建号不匹配 + `SwiftBridging` 模块重复定义）在 worker 启动阶段失败，最小 `print("hi")`
  可复现，与输入无关。回退路径：从 `__BUN,__bun` section 抽取 Bun module graph（2350 个 module、
  44.9 MB）后按 REA 的 JS 应用口径定位相关 module。

### 实现（Sailor）

- `src/shared/browser.ts`、`src/main/browser/{snapshot,cdp,keys,BrowserSite,BrowserRegistry,BrowserCaptures,ElectronBrowserTabs,BrowserIpcHandler,browserTools}.ts`、
  `src/renderer/src/lib/panels/browserSurface.ts`、`src/renderer/src/lib/browserFeedback.ts`、
  `src/renderer/src/components/panels/BrowserPanel.tsx`、
  `src/renderer/src/components/chat/tools/SailorBrowserTool.tsx`。
- 接线：`contracts.ts`（13 个 browser IPC channel + `SailorApi.browser`）、`preload/index.ts`、
  `registerIpc.ts`、`AgentService`/`PiRunner`（`browser_*` 工具按条件注册 + 指令段落）、
  `WorkspaceToolContext.projectId`、面板注册表（browser 改为 project scope + 真实面板）、
  `globals.css`（`.panel-web*`，替换已删除的 `.panel-browser*`）。

## 后续变更（同一 feature 内）

- **2026-10-14 追改（checklist #12）**：按用户要求移除「允许 Agent 操作」授权开关，
  浏览器改为**默认允许**。不只去掉开关：用户不需要先打开面板，main 在第一次工具调用时
  自己创建站点与空白标签页；标签页被关光后下一次调用自动补。删除了 registry 的 consent 状态、
  `browser:set-agent-access` IPC 与 preload 方法、面板开关、renderer 的 localStorage 授权偏好，
  以及 `BrowserSiteState.agentEnabled` 字段。可见性边界不变（面板关掉就摘掉原生视图），
  因此默认允许 ≠ 后台偷看。取舍记录写在 `docs/browser-use.md` 的「授权模型：默认允许」。

## 后续变更（同一 feature 内，续）

- **2026-10-14 追改（checklist #13）**：Agent 一调用 `browser_*` 就自动打开右侧栏并切到浏览器面板。
  链路：`BrowserRegistry.acquire` → `onAgentActivity(projectId)` → IPC `browser:reveal` →
  AppShell `onReveal` → `shouldRevealBrowserFor(projectId, 当前工作区)` → 既有
  `requestPanelOpen({ panelId: 'browser' })` → dock 打开。只在 Agent 动作时触发（用户自己操作不触发），
  且只在被操作的工作区就是当前工作区时响应；每次调用都请求一次，幂等。
  证据：冒烟里 renderer 真的收到 7 次带 `project-fixture` 的 reveal；
  「reveal → dock 真的可见」沿用已有的面板打开通道，本轮没有单独跑真实 AppShell 的端到端渲染。

## Decisions Made

- **用 `WebContentsView` 而非 `<webview>`**：`webviewTag` 会把控制权交给 renderer，
  与 `sandbox: true` 与 `docs/panels.md` 的既有边界冲突。
- **用 `webContents.debugger`（CDP）而非 Playwright**：零新增依赖，同一套进程模型。
- **实测约束**：`WebContentsView` 未开 focus emulation 时会丢弃 CDP 注入的鼠标与键盘事件
  （`Input.insertText` 例外）；`CdpSession` 首次命令前打开
  `Emulation.setFocusEmulationEnabled`，不抢应用焦点。详见 `docs/browser-use.md`。
- **授权模型（已被 #12 取代）**：见下方「后续变更」。当前是**默认允许 + 可见性边界**，
  既不改 `workspaces.json`，也不再需要任何 renderer 侧偏好。
- **没有**把浏览器写操作接进逐次审批：那需要把 `WriteApprovalResponse.toolName` 的枚举从
  `write/edit/bash/host_exec` 扩到浏览器工具名，属于公共契约变更，按 `CLAUDE.md` §6.3 必须
  先经用户确认。已作为后续项记录在 `docs/browser-use.md`。

## Known baseline failures（既有，与本 feature 无关）

- `tests/panel-registry.test.ts` → `面板打开不再经全局 DOM 事件广播`：断言要求
  `requestPanelOpen({ panelId: "browser"`（双引号），而 `StructuredToolFallback.tsx` 一直是单引号。
  已用 `git show HEAD:…` 确认 HEAD 上同样失败。
- `tests/panel-dock.test.ts` → `占位面板显示真实不可用原因，而不是伪造内容`：断言要求 ReviewPanel
  渲染含 `Git diff`，但该组件渲染的是「会话文件变更」。`ReviewPanel.tsx` 未被本次改动触碰。

## Evidence of Completion

### Checklist 状态

- [x] feat-sidebar-browser-agent-control #1 设计文档与取证（static）
- [x] #2 地址校验纯函数（unit）
- [x] #3 可访问性快照与 ref 表（unit）
- [x] #4 CDP 封装与 BrowserSite（unit）
- [x] #5 窄 IPC + preload + Electron 标签页适配器（integration）
- [x] #6 真实浏览器面板（unit）
- [x] #7 browser_* 工具与 PiRunner 接线（unit）
- [x] #8 会话内浏览器工具卡片（unit）
- [x] #9 真实 Electron 冒烟 24/24（e2e）
- [x] #10 文档同步（static）
- [x] #11 真实 agent 读页并点击（Node agent 链路 + Electron 真实页面，e2e）
- [x] #12 移除 Agent 授权开关，浏览器默认可用（e2e）
- [x] #13 调用浏览器功能时自动打开右侧栏并切到浏览器面板（e2e）

### 验证

- `node .agent-harness/scripts/verify-feature.mjs --feature-id feat-sidebar-browser-agent-control --item <1..13>` 全部 PASS（含 `--validate`）。
- `pnpm run typecheck`、`pnpm run build` 通过（build 产出 `BrowserPanel-*.js` 懒加载 chunk）。
- `node tests/browser-electron-smoke.mjs` → `resolved 24/24`，证据在
  `.agent-harness/evidence/sidebar-browser/`。
- `node --test tests/pi-agent.test.ts`（22/22）、`tests/pi-context-payload.test.ts`、
  `tests/agent-tools.test.ts` 均无回归。
- `npx eslint` 覆盖全部新增文件，无告警。

## 怎么复跑（下一会话直接用）

```bash
# 假模型 → 真实 PiRunner → browser_* 工具 → 真实 BrowserSite
node --test tests/browser-agent.test.ts
# 真实 Electron：生产面板 + 生产服务 + 真实页面 + 一个 agent 回合
node tests/browser-electron-smoke.mjs
```

后者会把 agent 的工具调用转录写到
`.agent-harness/evidence/sidebar-browser/agent-tool-calls.json`，内容是
`browser_read_page{mode:interactive}` → `[ref_1] button "点我"` → `browser_click{ref:ref_1}` → ok。

## 未验收 / 风险

- 面板的**手动交互**（真人点地址栏、拖拽 dock 宽度、深色主题下的观感）本轮只做了真实渲染的
  自动断言与截图核对，没有做逐状态的目视巡检；`.agent-harness/evidence/sidebar-browser/app-window.png`
  显示工具条与 tab 条正常，原生视图不参与 `capturePage`，所以内容区是空的（属预期）。
- 浏览器站点的多工作区 LRU 淘汰、应用退出时的清理按代码与单测覆盖，未在真实桌面会话里长跑验证。
- Windows/Linux 未验证。

## Notes for Next Session

- 下一步候选（按价值排序）：把浏览器写操作接进逐次审批（先和用户确认契约变更）；
  截图回灌给模型做视觉判断；`browser_network`；站点白名单。
- `panelData.ts` 里的 `preview` 运行时字段现在只剩「面板打开时导航」这一个用途，
  如果后续改成类型化 action，可以顺手清掉。
