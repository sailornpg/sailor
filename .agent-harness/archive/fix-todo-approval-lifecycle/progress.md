# Session Progress Log

## Active Feature

**fix-todo-approval-lifecycle** — 审批续跑期间 TodoList 持续显示

Last Updated: 2026-09-25
Status: done（由 verify-feature.mjs 推进）

## Checklist

| 项目                                                        | 状态 | 验证                                                          |
| ----------------------------------------------------------- | ---- | ------------------------------------------------------------- |
| 主进程保留审批续跑计划，连续允许/拒绝后继续更新，新任务清空 | done | 真实 Pi 两项 Red → Green；计划与 workspace 生命周期 15 项通过 |
| 真实 React/Electron 生命周期、历史恢复、会话切换、退场      | done | Electron 7 项通过；UI 静态渲染 4 项通过                       |
| 文档、视觉证据、build 和 lint                               | done | verifier #3 通过                                              |

## 根因与修复

审批续跑会生成新传输 runId；WorkspaceService.beginRun 原先无条件清空 plan。前两次只修补前端缓存与首帧显示，未覆盖此根因。现在按 Pi 现有 continuation 语义保留同一用户任务的计划，新用户消息才重置。

composer 根据 AI SDK 的当前消息审批状态与运行状态阻止误退场；已完成历史首帧不挂载。Pi 对被拒绝工具返回的结果改映射为 tool-output-denied，避免下一次恢复时发生 output-available + approved:false 的历史校验失败。权限授权仍由 PiRunner 的真实审批记录验证。

## 验证证据

- verify-feature.mjs 的 item 1/2/3 分别通过，feature/checklist 与 evidence 已由脚本更新。
- 连续两次允许/连续两次拒绝：修复前恢复 snapshot.plan 为 undefined；修复后两项通过，最后新任务清空旧计划。
- Electron StrictMode：生产 PlanTodoListView 的审批等待、runId 更新、快照缺失、DOM 连续性、单次退场、历史不重放、会话切换、新任务、审批选择器、折叠滚动均通过。
- 原有 write/bash/edit 权限与重启失效/伪造/重复响应回归 4 项通过。
- pnpm run build（含 typecheck）、pnpm run lint、git diff --check 通过。
- 浅/深色、1100px/480px 四张截图已查看；证据位于 .agent-harness/evidence/todo-approval-lifecycle.md。
- clean-state 使用 --skip-verification，复用刚通过的 verifier 构建结果，避免重复构建。

## 文件范围

- Main: WorkspaceService、PiRunner；未修改 IPC、持久化 schema 或审批安全规则。
- Renderer: PlanTodoListView、SailorComposer、pendingToolApproval，以及前两次同任务的 WorkspaceChats/AppShell 投影缓存。
- Tests: pi-agent、plan-todo-ui、workspace-chat-lifecycle；新增隔离的 Electron fixture 和 tests/plan-todo-electron.test.mjs。
- Docs/state: architecture、feature_list、progress 与本地 evidence。

## Blockers / Risks

没有代码或验证 blocker。视觉测试使用隔离 userData 的 Electron 页面挂载生产组件，未操控用户已有会话；不声称真实提供商的完整 AppShell 鼠标验收。

## 下一步

主进程也已修改，需要重新启动开发应用后加载修复。未 commit，未归档。
