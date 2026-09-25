# Agent Progress

## 当前 Active Feature

**feat-ask-user-human-in-loop** — Ask User Human-in-the-Loop Interaction

状态：`in-progress`

---

## Checklist 执行进度

| #   | Action                                            | Verify                                                                                                                                                                                 | Status |
| --- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1   | 定义并校验 ask_user 结构化契约                    | `node --test tests/ask-user-contract.test.ts`; `pnpm run typecheck`                                                                                                                    | done   |
| 2   | 实现 main/Pi ask_user 暂停生命周期                | `node --test tests/ask-user-agent.test.ts tests/pi-agent.test.ts`; `pnpm run typecheck`                                                                                                | done   |
| 3   | 扩展 shared contracts、preload、IPC/runtime       | `node --test tests/ask-user-ipc.test.ts tests/tool-write-approval.test.ts tests/workspace-ipc.test.ts`; `pnpm run typecheck`                                                           | done   |
| 4   | 定义计划 Todo 契约与持久化边界                    | `node --test tests/plan-todo.test.ts tests/workspace-store.test.ts`; `pnpm run typecheck`                                                                                              | done   |
| 5   | 接入 elements-todo-list、ask_user 卡片和 TodoList | `node --test tests/ask-user-ui.test.ts tests/plan-todo-ui.test.ts tests/tool-feedback-ui.test.ts tests/assistant-ui-message-rendering.test.ts`; `pnpm run typecheck`; `pnpm run build` | done   |
| 6   | 验收 ask_user/TodoList 状态、可访问性和视觉       | `test -f .agent-harness/evidence/ask-user-ui-acceptance.md`; `pnpm run lint`; `pnpm run typecheck`; `pnpm run build`                                                                   | done   |
| 7   | 同步文档并执行 feature 全量验证                   | 静态扫描；feature verifier；`pnpm run build`                                                                                                                                           | done   |

---

## 执行记录

### Baseline

- checklist schema 校验通过。
- `./.agent-harness/init.sh` 通过：`pnpm run typecheck`、`pnpm run build`。
- 既有 Rollup zod 注释 warning 不影响构建。

### Checklist #1 — ask_user 结构化契约

- **执行内容**：新增 `src/shared/askUser.ts`，定义问题、选项、回答和终态 schema，限制文本/选项数量，校验重复选项及回答是否符合问题能力；`WriteApprovalResponse` 增加可选 `optionId` 与 `text`，保持旧审批响应兼容。
- **TDD evidence**：Red 阶段测试因 `src/shared/askUser.ts` 不存在失败；Green 阶段 3 项契约测试通过；未做超出当前契约项范围的重构。
- **验证结果**：`node ./.agent-harness/scripts/verify-feature.mjs --feature-id feat-ask-user-human-in-loop --item 1` 输出 `PASS feat-ask-user-human-in-loop #1`。
- **状态**：done
- **时间**：2026-09-24

### Checklist #7 — 文档同步与 feature 全量验证

- **执行内容**：更新 README、`docs/architecture.md` 和 `docs/product-okr.md`，记录 plan-execute、TodoList revision/持久化、ask_user 恢复/失效语义，以及真实 bash 暂缓范围。
- **TDD evidence**：本项按 `static` 不执行 TDD；通过文档关键词扫描、feature schema verifier 和构建 gate。
- **验证结果**：`node ./.agent-harness/scripts/verify-feature.mjs --feature-id feat-ask-user-human-in-loop --item 7` 输出 `PASS feat-ask-user-human-in-the-loop #7`。
- **状态**：done
- **时间**：2026-09-24

---

## Feature 完成

**feat-ask-user-human-in-loop** 所有 checklist 项已完成。

状态已更新为 `done`。

视觉验收保留限制：Electron accessibility/screenshot 工具在本轮超时，详情见 `.agent-harness/evidence/ask-user-ui-acceptance.md`。

### 修复 plan-execute 历史消息校验 — 2026-09-24

- **根因**：`validateChatMessages` 只把旧的 `tool-updatePlan` 转为动态工具；当前 `update_plan` 及 `ask_user` 是按 Pi run 注册的 host tool，不在 `pi.builtinTools` 中，调用后再次读取或管理会话会触发“会话消息格式无效”。
- **修复**：兼容 `update_plan`、旧拼写 `updatePlan` 和 `ask_user`，将历史调用保留为可展示的 `dynamic-tool`，不重放工具。
- **验证结果**：`node --test tests/workspace-chat-lifecycle.test.ts tests/workspace-context.test.ts`（15 项通过）；`pnpm run lint`、`pnpm run build`、`node ./.agent-harness/scripts/clean-state-check.mjs` 均通过。

### 计划浮层与消息遮挡修复 — 2026-09-25

- **执行内容**：正常 `update_plan` 不再在消息流中重复渲染通用工具行，统一由 composer 上方的 TodoList 计划浮层呈现；失败态和旧 `updatePlan` 历史仍保留工具反馈。计划浮层改为参与 footer 正常布局，展开时为主会话消息预留空间，同时保留从 composer 背部滑入/退场动画。
- **验证结果**：ask_user、TodoList、assistant-ui 消息和工具渲染测试 13 项通过；`pnpm run lint`、`pnpm run build`、`node ./.agent-harness/scripts/clean-state-check.mjs` 均通过。
- **视觉限制**：尝试读取真实 Electron 窗口时工具超时，未声称完成桌面截图验收；静态渲染与 CSS 布局断言已覆盖重复工具行和遮挡回归。

### 修复会话内计划残留与 ask_user 展示 — 2026-09-25

- **根因**：新一轮 `beginRun` 没有清空 workspace chat 的持久化 `plan`；`ask_user` 仍由消息流的 `SailorToolCall` 直接渲染。
- **修复**：新 run 开始时清空并落盘上一轮计划；pending `ask_user` 从消息工具渲染器移除，按当前 assistant message 的 `requires-action` 工具调用投影到 composer 上方交互浮层，回答结束后自动退场。
- **验证结果**：相关历史、TodoList、ask_user 和工具 UI 测试 25 项通过；`pnpm run lint`、`pnpm run build`、`node ./.agent-harness/scripts/clean-state-check.mjs` 均通过。

### TodoList 浮层布局修复 — 2026-09-24

- **执行内容**：将 TodoList 从聊天消息流顶部移到 composer 上方的可折叠浮层；浮层内部限制高度并滚动，移除阴影；入场从 composer 背部向上滑入，退场向下滑回 composer 背部。
- **消失时机**：计划有待处理、进行中或阻塞步骤时持续显示；运行结束且步骤全部完成或跳过后保留约 1.2 秒，再自动退场。减少动态效果时关闭动画。
- **验证结果**：TodoList/工具 UI 测试、`pnpm run lint`、`pnpm run typecheck`、`pnpm run build` 和 `clean-state-check` 均通过。
- **视觉限制**：真实 Electron 截图工具仍超时，未声称完成桌面视觉截图验收。

### 修复 Electron IPC 启动竞态与多实例 — 2026-09-24

- **根因**：窗口开始加载 renderer 后才注册 `ipcMain` handlers；开发服务被中断后遗留的 Electron 进程又会与新实例共用同一份 `userData`，导致 handler 被不同实例清理、工作区保存状态互相干扰。
- **修复**：窗口创建与页面加载拆开，先注册 IPC 再调用 `loadMainWindow`；Electron 使用 `requestSingleInstanceLock`，第二个实例只聚焦已有窗口并立即退出。
- **验证结果**：第二次 `pnpm dev` 不再启动第二个 Electron；工作区生命周期/计划测试、`pnpm run lint`、`pnpm run typecheck`、`pnpm run build` 和 `clean-state-check` 均通过。

### Checklist #6 — UI 状态、可访问性和视觉验收

- **执行内容**：覆盖 SSR/UI 测试中的未回答、选项无默认选中、自由文本、提交/跳过、取消/终态、Todo 更新/blocked/空态；加入 `role=radio`、`aria-checked`、`aria-busy`/`role=status`/`role=alert` 等语义；运行 lint/typecheck/build。
- **TDD evidence**：本项按 checklist 的 `manual-exception` 不执行 Red-Green；静态渲染测试作为辅助证据。Electron accessibility/screenshot 读取尝试超时，限制已记录于 `.agent-harness/evidence/ask-user-ui-acceptance.md`，未声称桌面视觉已验收。
- **验证结果**：`node ./.agent-harness/scripts/verify-feature.mjs --feature-id feat-ask-user-human-in-loop --item 6` 输出 `PASS feat-ask-user-human-in-loop #6`。
- **状态**：done（Electron 真实视觉检查存在工具超时限制）
- **时间**：2026-09-24

### Checklist #5 — assistant-ui TodoList 与 ask_user UI

- **执行内容**：通过 `npx assistant-ui@latest add elements-todo-list` 接入官方 TodoList；新增计划投影 `PlanTodoListView`，将持久化状态映射为 pending/active/done/failed 并显示 revision/空态；新增 `SailorAskUserCard`，支持选项、自由文本、跳过、提交中、终态和错误；通过 `SailorChatProvider` 回调封装 IPC，卡片不直接绕过 runtime；在 `SailorToolCall` 和主线程计划区域接入。
- **TDD evidence**：Red 阶段 UI 模块不存在导致 4 个测试失败；Green 阶段专用 UI、既有工具 UI/消息渲染测试均通过；仅做当前 feature 需要的 registry/组件接入。
- **验证结果**：`node ./.agent-harness/scripts/verify-feature.mjs --feature-id feat-ask-user-human-in-loop --item 5` 输出 `PASS feat-ask-user-human-in-loop #5`。
- **状态**：done
- **时间**：2026-09-24

### Checklist #4 — 计划 Todo 契约与持久化边界

- **执行内容**：新增 `planTodo` schema、稳定 step ID、五种步骤状态和 revision 合并规则；`WorkspaceChat.plan` 接入 `WorkspaceStore` 原子持久化；新增 `update_plan` host tool 通过当前 `chatId/runId` 更新计划并保留已完成步骤。
- **TDD evidence**：Red 阶段测试因 plan schema/tool 不存在失败；Green 阶段覆盖持久化恢复、completed 保留、stale revision、foreign run、重复 ID 和 host tool callback。
- **验证结果**：`node ./.agent-harness/scripts/verify-feature.mjs --feature-id feat-ask-user-human-in-loop --item 4` 输出 `PASS feat-ask-user-human-in-loop #4`。
- **状态**：done
- **时间**：2026-09-24

### Checklist #3 — shared contracts、preload、IPC/runtime

- **执行内容**：共享层新增 `AskUserInteractionResponse` schema/type 和 `agentRespondToAskUser` IPC；preload 暴露窄方法；main IPC 严格解析并转发至 `AgentService`/`PiRunner`；renderer transport 保存当前 chat 的 run ID，回答可绑定原运行。
- **TDD evidence**：Red 阶段 schema/IPC wiring 测试失败；Green 阶段专用测试及既有审批/工作区 IPC 测试通过；未修改真实 bash 能力。
- **验证结果**：`node ./.agent-harness/scripts/verify-feature.mjs --feature-id feat-ask-user-human-in-loop --item 3` 输出 `PASS feat-ask-user-human-in-loop #3`。
- **状态**：done
- **时间**：2026-09-24

### Checklist #2 — main/Pi ask_user 暂停生命周期

- **执行内容**：新增 `AskUserInteractionStore` 管理 pending interaction；新增 `ask_user` host tool，调用后暂停同一 Pi turn；`PiRunner` 注册工具并绑定 `chatId/runId/toolCallId`，取消运行/删除会话时释放 pending；`AgentService` 暴露主进程转发入口。
- **TDD evidence**：Red 阶段测试因生命周期模块不存在失败；Green 阶段覆盖一次性回答、伪造上下文、过期、取消、重启失效及 host tool 阻塞恢复；无跨 feature 重构。
- **验证结果**：`node ./.agent-harness/scripts/verify-feature.mjs --feature-id feat-ask-user-human-in-loop --item 2` 输出 `PASS feat-ask-user-human-in-loop #2`。
- **状态**：done
- **时间**：2026-09-24

### 修复 ask_user 卡住与 TodoList 闪烁 — 2026-09-25

- **根因**：`ask_user` 挂起在普通工具执行 Promise 上，assistant message 保持 streaming/input-available，不会进入 `requires-action`；composer 只检查 `requires-action`，所以用户看不到问题卡片。TodoList 使用 `summary?.plan && ...`，快照短暂缺 plan 时会卸载后重新挂载。
- **修复**：抽出 `findPendingAskUser`，仅在当前运行中投影未完成的 `ask_user` 工具调用；计划浮层始终由 composer 宿主管理，同一 `runId` 的快照空窗保留当前计划，新运行立即清空，运行结束后按退场动画移除。
- **验证结果**：`node --test tests/ask-user-ui.test.ts tests/plan-todo-ui.test.ts tests/tool-call.test.ts tests/workspace-chat-lifecycle.test.ts`（26 项通过）；`pnpm run lint`、`pnpm run typecheck`、`pnpm run build`、`node ./.agent-harness/scripts/clean-state-check.mjs` 均通过。
- **视觉限制**：真实 Electron AX/screenshot 读取本轮仍超时；`pnpm dev` 可启动并自动切换到 `5174`，但无法完成桌面交互验收。

### 修复 ask_user 白屏回归 — 2026-09-25

- **真实回归**：通过 `pnpm dev -- --remote-debugging-port=9222` 启动真实 Electron，并使用项目 CDP fixture 发送完整 plan-execute 文案；首次复现 renderer 异常 `Maximum update depth exceeded`，栈指向 `SailorAskUserCard.tsx` 的 pending effect。
- **根因**：`pending.args`/`pending.result` 每次流式更新都会产生新对象，直接作为 effect 依赖；effect 内 `setCurrent` 触发无限更新，最终 React 卸载根节点形成白屏。
- **修复**：使用 `pendingAskUserKey` 对 toolCallId、args、result 和状态做值签名作为稳定依赖；保留流式参数更新能力，避免对象 identity 触发循环。
- **真实验证**：修复后同一 Electron/CDP 流程保持 `.app-shell`，无 `error`/`unhandledrejection`；`ask_user` 卡片显示在 composer 上方，选择“继续”并提交后原运行恢复，三步计划完成且 workspace snapshot 为 `completed`。
- **自动化验证**：新增稳定 key 回归测试；`node --test tests/ask-user-ui.test.ts`（5 项通过）。

### 修复 TodoList 快照空窗闪烁 — 2026-09-25

- **根因**：TodoList effect 同时依赖 `displayPlan` 对象和外部 plan 快照；同一 run 的 plan/status 瞬态变化会清理并重新安排退场定时器，且非 running 的空快照会把组件置为透明或卸载。
- **修复**：按 `runId` 和 plan 值签名跟踪输入，使用单一退场定时器；同一 run 的 plan 空快照始终保留最后计划，只有运行结束后完成/跳过的计划才延迟退场，新的 revision 或恢复运行会取消退场。
- **验证结果**：`node --test tests/plan-todo-ui.test.ts`（3 项通过）；`pnpm run lint`、`pnpm run typecheck` 通过；真实 Electron + CDP 重载后验证已完成计划呈现 `closing` 并在约 1.4 秒后移除，运行中的计划保持 `open`。
