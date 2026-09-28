# Session Progress Log

## Current State

**Last Updated:** 2026-09-28
**Active Feature:** fix-chat-external-links (done)

## Checklist

- [x] 修复 Composer 拼音组合输入时残留原始字母的问题。
- [x] 组合期间持续显示 Skill 指令高亮及拼音，不露出原始 `/skill:*` 文本。
- [x] 保留 `/skill:*` literal 文本和发送语义。
- [x] 关闭 Composer 原生拼写检查，消除透明文字仍可见的红色虚线。
- [x] Skill 标记与后续正文垂直对齐。

## 验证 Evidence

- `node tests/composer-input-directive-highlight-electron.test.mjs`：普通与 Skill 后的 `nihao`、`ma` 组合输入和发送断言通过；亮色、暗色窄窗口及预编辑截图已检查，组合期间标记仍可见。
- `node tests/composer-slash-commands-electron.test.mjs` 和 `node tests/composer-pi-tui-actions-electron.test.mjs`：通过。
- `node ./.agent-harness/scripts/verify-feature.mjs --feature-id fix-composer-chinese-ime --item 3`：新增的组合期高亮验收项及 typecheck、build 通过，证据见 `feature_list.json`。
- `node ./.agent-harness/scripts/verify-feature.mjs --feature-id fix-composer-chinese-ime --item 4`：拼写检查与对齐验收项、typecheck、build 通过；Electron 中标签和正文顶边差为 0.5px（修复前为 2.5px）。
- `pnpm exec eslint` 检查改动的 TSX 文件通过。
- `pnpm exec stylelint src/renderer/src/styles/globals.css`：通过。

## Notes

- 诊断对照确认：普通 React 受控 textarea 与独立 `ComposerPrimitive.Input` 正常；Sailor 在 composition 期间更新自绘光标状态导致组合区丢失。修复时暂停这类状态更新，并在结束后同步。
- Electron 冒烟使用 Chromium IME 接口模拟组合输入；尚未自动驱动 macOS 输入法候选窗。

## 2026-09-28 Pi 运行事件展示方案

- 已编写 `docs/pi-runtime-event-ui.md`，明确压缩与自动重试的事件边界、运行态/历史态展示、手动 `/compact`、去重和恢复路径。
- 已创建 `feat-pi-runtime-event-ui`，状态为 `not-started`；六项 checklist 包含专用 Electron 冒烟 `node tests/pi-runtime-events-electron.test.mjs`。
- 本轮未实施运行时/UI 代码。基线 `./.agent-harness/init.sh` 的 typecheck 和 build 均通过。

## 当前 Active Feature

**feat-pi-runtime-event-ui** — Pi 运行事件展示

状态：`in-progress`

| #   | Action                    | Verify                                               | Status |
| --- | ------------------------- | ---------------------------------------------------- | ------ |
| 1   | Pi 事件桥接与隔离         | `pi-event-bridge.test.ts`、typecheck                 | done   |
| 2   | 自动事件历史与 checkpoint | `pi-event-history.test.ts`                           | done   |
| 3   | 手动压缩事件与前端同步    | `pi-manual-compaction-events.test.ts`、Composer 回归 | done   |
| 4   | assistant-ui 事件展示     | typecheck、ESLint                                    | done   |
| 5   | Electron 冒烟与视觉验收   | `pi-runtime-events-electron.test.mjs`                | done   |
| 6   | 文档与回归                | Pi 测试、typecheck、build                            | done   |

执行记录：启动基线 `./.agent-harness/init.sh` 通过；2026-09-28 开始第 1 项。

### Checklist #1 — Pi 事件桥接与隔离

- **执行内容**：扩展 pinned `harness-pi` patch 的四类事件回调，新增有界 `PiDisplayEvent` 契约和按 chat/run 投影的 `PiEventProjector`，接入 `PiRunner`。
- **TDD evidence**：Red 时桥接 patch 和投影缺失；补充连续周期测试后因终态阻断再次 Red。Green 后四个 bridge 测试通过，仅整理本项投影逻辑。
- **验证结果**：`verify-feature.mjs --feature-id feat-pi-runtime-event-ui --item 1` 通过，包含专用测试和 typecheck。
- **状态**：done
- **时间**：2026-09-28

### Checklist #2 — 自动事件历史与 checkpoint

- **执行内容**：将自动压缩/重试转为运行态通知及唯一的终态 `data-pi-event`；Pi checkpoint 成功保存后才发送终态，保存失败清理运行态。新历史抑制旧动态 `compaction` 工具行；恢复时校验事件 schema 并从模型输入中排除展示数据。
- **TDD evidence**：Red 时 history class 和 `pi-event` schema 缺失，AgentService 未转发运行态。Green 后五个专用测试通过；真实 Pi 自动压缩回归通过，历史仅有一条事件记录。
- **验证结果**：`verify-feature.mjs --feature-id feat-pi-runtime-event-ui --item 2` 通过。
- **状态**：done
- **时间**：2026-09-28

### Checklist #3 — 手动压缩事件与前端同步

- **执行内容**：手动压缩复用 Pi 事件投影；checkpoint 成功后向最近 assistant 消息追加事件，空 assistant 历史创建事件消息。IPC 返回更新后的消息，现有 Chat 实例同步；失败时重新读取历史，并在开始异步检查前占用互斥锁。
- **TDD evidence**：Red 时 compact 返回 void、缺少 Chat 同步和提前互斥；后续补充失败刷新测试再次 Red。Green 后三个专用集成测试、Composer IPC 回归和真实 Pi 手动压缩测试通过。
- **验证结果**：`verify-feature.mjs --feature-id feat-pi-runtime-event-ui --item 3` 通过。
- **状态**：done
- **时间**：2026-09-28

### Checklist #4 — assistant-ui 事件展示

- **执行内容**：新增 Pi 事件专用状态行与历史行；使用 `makeAssistantDataUI` 注册 data part，并将旧 `compaction` 工具记录注册为 standalone 兼容视图。运行态显示在现有 Thread footer，按 chat 过滤通知，沿用主题语义色及 reduced-motion 动效规则。
- **TDD evidence**：此项为清单声明的静态/视觉例外；真实交互和视觉留给第 5 项 Electron 冒烟验收。
- **验证结果**：`verify-feature.mjs --feature-id feat-pi-runtime-event-ui --item 4` 通过，包含 typecheck 与 events 目录 ESLint。
- **状态**：done
- **时间**：2026-09-28

### Checklist #5 — Electron 冒烟与视觉验收

- **执行内容**：新增专用 Electron fixture，真实挂载生产 `Thread`、`SailorChatProvider`、事件 data renderer 与状态组件；经 sandboxed preload/IPC 注入自动压缩、手动压缩和重试成功/失败，检查会话切换、唯一终态、旧历史兼容与窗口重载恢复。
- **TDD evidence**：Red 时专用 Electron harness 缺失；Green 后测试通过。fixture 复用生产渲染组件，没有复制 Pi 事件 UI 实现。
- **验证结果**：`verify-feature.mjs --feature-id feat-pi-runtime-event-ui --item 5` 通过；已实际查看进行中、浅色、深色、窄窗口截图，事件行清晰且无横向溢出、遮挡。截图留在测试临时目录作本轮检查，不纳入仓库。
- **状态**：done
- **时间**：2026-09-28

### Checklist #6 — 文档与回归

- **执行内容**：更新 README、架构与事件方案文档。旧 Pi 审批回归测试原先假定工作区默认请求批准，现显式设置 `allow-reads`，以对齐已有 `allow-all` 默认权限并继续验证审批路径。
- **TDD evidence**：此项为清单声明的静态交付；行为测试已在第 1、2、3、5 项完成 Red/Green。
- **验证结果**：`verify-feature.mjs --feature-id feat-pi-runtime-event-ui --item 6` 通过，包含 34 个 Pi/事件测试、typecheck 与 production build；改动范围 ESLint 和 `git diff --check` 通过。
- **状态**：done
- **时间**：2026-09-28

---

## Feature 完成

**feat-pi-runtime-event-ui** 六项 checklist 均由 verifier 标记为 `done`。

Clean-state gate：`node ./.agent-harness/scripts/clean-state-check.mjs` 通过（含标准 typecheck/build）；未创建 commit，原有 Composer 未提交改动保留。

## 2026-09-28 — fix-chat-external-links

- Scope：修复会话 URL 替换主窗口的问题，HTTP(S) 和 localhost 预览交给系统默认浏览器；不增加 IPC 或依赖。
- Baseline：`./.agent-harness/init.sh` 通过。既有 Pi 事件及 Composer 未提交改动保留。
- Red：`node tests/external-links-electron.test.mjs` 在生产 `createMainWindow` 上复现主窗口从 `/chat` 导航到 `/preview`，断言“链接不能替换 Sailor 主窗口”失败。
- 根因：`setWindowOpenHandler` 仅覆盖新窗口；普通 Markdown anchor 的同窗口跳转没有 `will-navigate` 处理。症状确定且事件边界直接可验证，因此省略多假设探针和临时日志。
- Green：主进程取消普通导航，并将普通/新窗口 HTTP(S) URL 统一传给 `shell.openExternal`；不支持的协议不外开，打开失败捕获 rejection。
- Electron：专用测试通过，覆盖普通/新窗口、HTTP(S)、localhost、非网页协议、浏览器失败和页内锚点；检查主窗口 URL、会话内存标记和窗口数。
- 验收边界：Electron 测试复用生产窗口，在系统调用边界替换 `shell.openExternal`，验证调用及参数，不实际启动用户浏览器。未改 renderer 组件或样式，无视觉布局变更。
- 文档：`docs/architecture.md` 同步主窗口外链行为。
- 交付 gate：两项 checklist 已经 `verify-feature.mjs` 验证并标记 done；专用 Electron smoke、范围 ESLint、typecheck、production build 和 clean-state gate 全部通过。`git diff --check` 通过；未创建 commit。

## 2026-09-28 — Pi 压缩反馈与错误提示修复

- 压缩成功后 Context 卡片停止展示压缩前的旧 token 用量，提示下一次模型调用后更新；下一次真实用量到达后恢复显示。重复压缩错误改为明确的中文提示。
- Pi 运行态事件移入 Thread 消息列表末尾，终态继续保存在消息历史中。Composer 与侧聊的临时错误提示支持手动关闭和 8 秒自动关闭；可重试的持久保存错误仍保留操作入口。
- 验证：`node --test tests/composer-context.test.ts`（11/11）、`pnpm exec eslint src/renderer/src/components/chat/composer/contextUsage.ts`、`git diff --check`、`node .agent-harness/scripts/clean-state-check.mjs` 均通过。相关 Pi 集成测试、Electron 冒烟与视觉验收已在本轮前段完成；未创建 commit，保留工作区其他未提交改动。
