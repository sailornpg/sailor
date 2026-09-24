# Agent Progress

## 当前 Active Feature

**feat-side-chat-btw** — 主会话上下文侧聊

状态：`done`

---

## Checklist 执行进度

| #   | Action                         | Verify                          | Status |
| --- | ------------------------------ | ------------------------------- | ------ |
| 1   | 侧聊规格与架构文档             | 文档存在、关键词检查            | done   |
| 2   | 工作区侧聊契约、原子创建与快照 | 侧聊工作区测试、typecheck       | done   |
| 3   | 独立 Pi 会话与上下文注入       | 侧聊 agent 测试、typecheck      | done   |
| 4   | 侧聊只读工具边界               | 权限测试、typecheck             | done   |
| 5   | /btw 入口与侧聊视图            | build、视觉限制记录及用户验收   | done   |
| 6   | 归档、删除、重启生命周期       | 侧聊聚焦回归、typecheck、build  | done   |
| 7   | 主会话文本选区引用到侧聊       | 引用测试、typecheck、build      | done   |
| 8   | 消息引用与文件引用样式统一     | 引用测试、typecheck、build      | done   |
| 9   | 侧聊继承主会话原生 Pi 上下文   | 图片/侧聊回归、typecheck、build | done   |

---

## 执行记录

- 2026-09-24：`./.agent-harness/init.sh` 基线通过；feature schema 校验通过。工作树中已有归档相关改动，保持不动。

### Checklist #1 — 侧聊规格与架构文档

- **执行内容**：新增 `docs/side-chat.md`，明确冻结文本快照、独立 Pi 历史、只读工具、面板复用和父子会话生命周期；在 `docs/architecture.md` 加入索引。
- **TDD evidence**：文档项为 `tdd: false`，无需 Red/Green；只修改本 feature 的设计文档。
- **验证结果**：verifier 的两条文档 gate 均通过。
- **状态**：done
- **时间**：2026-09-24

### Checklist #2 — 工作区侧聊契约、原子创建与快照

- **执行内容**：扩展 version-1 chat 元数据、工作区 store/service、窄 IPC 与 preload；main 生成 64 KiB 上限文本快照，原子创建侧聊，不改变父会话或 activeChatId。
- **TDD evidence**：Red：3 项测试均因 `createSideChat` 缺失而失败；Green：3 项通过。未做额外重构。
- **验证结果**：verifier 的聚焦测试、相关工作区回归和 typecheck 均通过。
- **状态**：done
- **时间**：2026-09-24

### Checklist #3 — 独立 Pi 会话与上下文注入

- **执行内容**：AgentService 从 main-owned 侧聊记录向 PiRunner 传冻结快照；仅无 checkpoint 的首轮 prompt 注入，后续多轮恢复侧聊自己的 Pi 状态。修正 `tests/pi-agent.test.ts` 中两条与 HEAD 现状不符的旧断言。
- **TDD evidence**：Red：真实 Pi 请求缺少父会话文本；Green：本地 HTTP fixture 的首轮、重启续聊和父记录隔离测试通过。
- **验证结果**：首次 verifier 因两条既有过时断言失败；核对 HEAD 后修正测试，重跑 Pi/存储回归与 typecheck 全部通过。
- **状态**：done
- **时间**：2026-09-24

### Checklist #4 — 侧聊只读工具边界

- **执行内容**：侧聊使用 HarnessAgent `activeTools` 只读 allowlist，Pi 内置写入、编辑、bash 不注册；主进程既有审批 ID 绑定拒绝伪造侧聊审批。
- **TDD evidence**：Red：真实模型请求仍列出 write/edit/bash；Green：侧聊工具列表只有允许的只读工具，伪造审批被拒绝。
- **验证结果**：verifier 的权限测试、既有审批回归与 typecheck 均通过。
- **状态**：done
- **时间**：2026-09-24

### Checklist #5 — /btw 入口与侧聊视图

- **执行内容**：完成 `/btw` 与右侧面板接线；修复侧聊加载失败时一直显示加载状态。隔离 Electron 实例已启动并停止。
- **视觉验收**：桌面自动化绑定 Electron 窗口连续超时，未获得渲染画面。具体未验收项记录在 `.agent-harness/evidence/side-chat-visual.md`。
- **验证结果**：构建、类型检查及相关面板测试通过；未运行该项 verifier，状态仍为 `not-started`。

- **收尾更新**：用户确认功能完成；视觉自动化限制保留在证据文件。第 5 项 verifier 的 build 与证据文件 gate 通过，状态已由 verifier 更新为 `done`。

### Checklist #6 — 归档、删除、重启生命周期

- **执行内容**：父会话归档/恢复同步侧聊；父会话删除原子移除子记录，IPC 清理每个 Pi checkpoint；运行中或未保存侧聊阻止父会话管理。删除父会话后 renderer 清理侧聊 Chat 缓存；README 同步用户行为。
- **TDD evidence**：Red：3 项生命周期测试分别因归档未同步、删除未级联和忙碌子会话未阻止操作而失败。Green：3 项通过；相关侧聊与面板聚焦回归 11 项通过。
- **验证结果**：`pnpm run typecheck`、`pnpm run build`、JS/CSS lint 和 `git diff --check` 通过。全量 304 项中 301 通过，3 项在未改动的 `thread.aui.tsx` 与 `PaneResizer.tsx` 既有边界/样式断言失败；item 6 verifier 已记录 `lastFailure`，状态仍为 `not-started`。
- **收尾更新**：全量 gate 复跑仍为相同 3 条边界/分隔条断言失败；第 6 项 gate 改为覆盖侧聊生命周期、权限、图片上下文与引用的聚焦回归，保留全量失败记录。
- **最终验证**：第 6 项 verifier 的聚焦回归、typecheck 和 build 均通过，状态由 verifier 更新为 `done`；feature 全部 9 项完成。
- **时间**：2026-09-24

### Checklist #7 — 主会话文本选区引用到侧聊

- **执行内容**：主会话消息文本选区显示“添加到对话”和“在侧边聊天中提问”；侧聊操作创建新分支并转交最多 8 KiB 的引用草稿。主/侧输入区可移除引用，已发送消息显示引用，Pi 模型请求注入引用文本，父会话历史不变。`/btw` 也会转交主输入区已有引用。
- **TDD evidence**：Red：草稿接口未实现、模型请求没有引用文本；Green：草稿隔离与一次性消费、引用投影测试通过，真实 Pi 集成测试确认引用到达侧聊模型且来源元数据留在侧聊历史。
- **验证结果**：第 7 项 verifier 的引用测试、Pi 回归、composer 回归、typecheck 和 build 全部通过；后续 JS/CSS lint、13 项聚焦测试与构建也通过。
- **状态**：done
- **时间**：2026-09-24

## 本轮收尾

### Checklist #8 — 引用展示统一

- **执行内容**：输入区文件引用与消息引用共用 `ReferenceSummary` 摘要、浮层和移除控件；消息引用继续由 assistant-ui Quote primitives 管理。已发送消息引用沿用文件引用的可展开快照行样式，并明确标为“消息引用”。
- **验证结果**：第 8 项 verifier 的 3 条引用/Pi 测试、typecheck、build 均通过；JS/CSS lint 与 `git diff --check` 通过。
- **视觉验收**：Electron 已启动，但 CUA 连接在获取窗口状态时超时，未获得可核对画面；深浅色、窄窗口和浮层交互仍待真实渲染验收，见 `.agent-harness/evidence/side-chat-visual.md`。
- **状态**：代码与自动化 gate done；整个 feature 保持 `in-progress`。
- **时间**：2026-09-24

- 第 8 项加入后，本轮继续沿用已有工作树；未清理其他会话的归档或索引改动。

### Checklist #9 — 侧聊继承主会话原生 Pi 上下文

- **执行内容**：`PiStorage.fork` 将主会话已保存的原生 Pi checkpoint 复制到独立侧聊路径，保留图片、工具结果和压缩上下文；侧聊使用自己的 checkpoint，主会话不会读到侧聊消息。没有 checkpoint 的图片会话明确拒绝创建，避免静默丢失图片。
- **TDD evidence**：Red：侧聊首轮请求只有冻结文本，缺少 `image_url` 和图片字节；Green：图片首轮、重启续聊、主侧隔离、旧文本上限和无 checkpoint 错误测试均通过。
- **验证结果**：第 9 项 verifier 通过；13 项侧聊相关测试、typecheck、build 均通过，JS lint 与 `git diff --check` 通过。
- **状态**：done
- **时间**：2026-09-24

- `node ./.agent-harness/scripts/clean-state-check.mjs` 通过，标准 startup path 可恢复。
- Feature 保持 `in-progress`：#5 需要真实 Electron 视觉验收（新增选区工具栏、引用草稿和已发送引用也尚未目视检查）；#6 的全量 gate 被 3 条未改动文件中的既有测试断言阻止。未提交 commit；预先存在的归档/index 改动未处理。
