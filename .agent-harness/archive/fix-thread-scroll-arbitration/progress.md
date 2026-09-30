# Agent Progress

## 当前 Active Feature

**fix-thread-scroll-arbitration** — 流式滚动抖动与跟随失锁修复

状态：`done`

---

## Checklist 执行进度

| #   | Action                                                  | Verify                                                 | Status |
| --- | ------------------------------------------------------- | ------------------------------------------------------ | ------ |
| 1   | 抽出纯函数滚动意图判定 + 单测                           | `node --test tests/thread-scroll-intent.test.ts`       | done   |
| 2   | viewport 接线：`overflow-anchor: none` + 程序化滚动抑制 | `node --test tests/thread-autoscroll.test.ts`          | done   |
| 3   | 尾部高度稳定 + 流式 message 关闭 `content-visibility`   | `node tests/thread-scroll-stability-electron.test.mjs` | done   |
| 4   | 滚动行为矩阵 e2e（抖动/上滚/回底/结束）                 | `node tests/thread-scroll-stability-electron.test.mjs` | done   |
| 5   | 交付 gate + `docs/architecture.md` 同步                 | lint / typecheck / build / 冒烟 / clean-state          | done   |

---

## 执行记录

### 激活

- 前一个 feature `fix-streaming-persistence-storm` 已 `done`，选取首个依赖满足的 `not-started`：`fix-thread-scroll-arbitration`。
- Contract 校验：5 项 checklist 均具备 `action`/`coverage`/`verify`/`status`；`unit`/`e2e` 项都有可执行 `test`；两项 `static` 都有 `coverage_reason`。
- 约束：本 feature 只改 renderer 的 viewport 跟随与尾部几何，不改主进程；`fix-thread-autoscroll-follow-tail`（已归档）确立的「跟随尾部 / 上滚暂停 / 点回底部恢复」语义必须保留。

### Checklist #1 — 滚动意图判定抽成纯函数

- **执行内容**：新增 `src/renderer/src/components/assistant-ui/utils/scrollFollow.ts`（无 DOM 依赖的状态机：`initialScrollFollow` / `isViewportAtBottom` / `nextScrollFollow`，事件为 wheel、pin-control、scroll）。
  - 关键规则：程序化滚动事件不参与意图判定；上移只有在「滚动高度不变且超过 2px」时才算用户上滚，因此滚动锚定或尾部以上布局变化不再暂停跟随；`paused` 独立于「当前是否在底部」，程序化滚到底部不会恢复跟随；事件无变化时返回原对象以便跳过重渲染。
- **TDD evidence**：Red 为 10 项全部失败（`需要实现滚动跟随初始状态 initialScrollFollow`，模块不存在）；Green 为 10/10 通过。期间修正两处测试预期本身的问题：①「无变化」用例原用了会改变 metrics 的事件，不可能返回同一对象，改为同 metrics 事件；②亚像素回弹用例原构造了「跟随中却远离底部」的不可能状态，改为「内容刚增长、偏移尚未跟上」的真实前置。
- **验证结果**：`verify-feature.mjs --item 1` PASS。
- **状态**：done
- **时间**：2026-09-29T20:06:00+08:00

### Checklist #2 — viewport 接线：关闭滚动锚定 + 程序化滚动抑制

- **执行内容**：`thread.aui.tsx` 的 ThreadRoot 改为把 wheel / pin-control / scroll 三类观察转发给纯函数，用 `follow` ref + `autoScroll` state 驱动 `ThreadPrimitive.Viewport`；新增 `programmaticScroll` ref，在回底控件的 pointerdown/click 时置位、在随后的 scroll 事件中被消费，使该事件不参与「用户上滚」判定。viewport className 增加 `[overflow-anchor:none]`，Sailor deviation 注释更新为说明「跟随判定在 `utils/scrollFollow.ts`，且关闭浏览器锚定避免两方争抢 scrollTop」。
- **TDD evidence**：接线时发现纯函数漏了一种情况——用户点击回底控件产生的**程序化**滚动应当恢复跟随（只禁止它暂停，不禁止它恢复）。先补测试 `回底控件触发的程序化滚动同样恢复跟随`（Red：following 未恢复），再在 reducer 的程序化分支加入「贴底且有 downward/pin 意图则恢复」，thread-scroll-intent 12/12 通过。此项修正使 checklist #1 的产物在 #2 中被加强，已重跑 #1 的 gate 确认仍绿。
- **验证结果**：`verify-feature.mjs --item 2` PASS；`thread-autoscroll.test.ts` 3/3（原两条断言更新为新的接线事实 + 新增「判定交给纯模块」一条）；`pnpm run typecheck` 通过。
- **状态**：done
- **时间**：2026-09-29T20:20:00+08:00

### Checklist #3 — 尾部高度稳定 + 流式 message 关闭 content-visibility

- **执行内容**：
  - `AssistantMessage` 增加 `isTail`（`s.message.index === s.thread.messages.length - 1`），只有非尾部消息保留 `[contain-intrinsic-size:auto_200px] [content-visibility:auto]`，正在增长的最后一条不再因跳过渲染而让占位高度替换真实高度。
  - RuntimeEventStatus 移入 message group 底边距内的绝对定位槽位（`absolute inset-x-0 top-full`），挂载/清除不再改变滚动盒高度。
- **TDD evidence**：新增 `tests/thread-scroll-stability-electron.test.mjs` + fixture（真实 Thread + 真实 `PiRuntimeEventStatus` / `TurnFileChangeCard` / `PlanTodoListView` + 脚本化流式 runtime + 假 `window.sailor` bridge）。Red 实测：事件行切换让尾部几何移动 **64px**、流式尾部消息 computed `content-visibility` 为 `auto`；Green 后两者均通过（事件行切换 0px 漂移）。
- **验证结果**：`verify-feature.mjs --item 3` PASS（冒烟 12/12）。
- **状态**：done
- **时间**：2026-09-29T21:05:00+08:00

### Checklist #4 — 滚动行为矩阵 e2e

- **执行内容**：同一冒烟内断言 7 项行为：`overflow-anchor: none` 生效；跟随时逐帧采样（rAF）视口不丢失跟随；尾部以上块塌缩后仍贴底（该用例自带 stimulus 有效性断言：塌缩必须让滚动盒缩小 >8px）；用户滚轮上滚后 400ms 内位置不被拉回；点击回底控件后 2 帧内回到并保持底部；run 结束后 400ms 内不自动滚动；深色 + 480px 窄窗口重复几何断言。fixture 里同时产出浅色宽窗与深色窄窗截图。
- **TDD evidence**：修 fixture 期间发现并修正三处测量缺陷（①锚点段落随每个 chunk 重建导致假漂移；②`useSmooth` 补间在「暂停」后仍继续，必须等布局稳定再测；③按 `scrollHeight` 判定的塌缩 stimulus 被同帧增长抵消）。最终实测：跟随窗口 752 帧内最长连续偏离 7 帧、最大落后 64.5px；把 `scrollFollow` 的滚动高度守卫去掉后同一断言报 `follow was lost: worst 3776px / longest 165 frames`（无守卫生效时跟随彻底丢失），单元层也有 2 项用例转红。
- **验证结果**：`verify-feature.mjs --item 4` PASS（冒烟连跑两次，另单独连跑 3 次均 12/12、exit 0）。
- **状态**：done
- **时间**：2026-09-29T21:12:00+08:00

### Checklist #5 — 交付 gate + 文档同步

- **执行内容**：`docs/architecture.md` 新增「Thread viewport 跟随仲裁」小节，记录跟随/暂停/恢复判据、`overflow-anchor: none`、程序化滚动不参与判定、尾部事件行槽位与流式消息的 `content-visibility` 处理，以及三项验证入口；同时明确「仍在流内的尾部块（turn 卡片、composer 计划/审批行）只保证视口保持贴底、跟随不丢，不保证几何冻结」。
- **验证结果**：`verify-feature.mjs --item 5` PASS，依次通过 `lint:js`、`lint:css`、`typecheck`、`build`、专用 Electron 冒烟、`clean-state-check.mjs`。
- **视觉验收**：实际查看 `.agent-harness/evidence/thread-scroll-stability/wide-light.png`（1100×760，跟随中：尾部文本完整、计划面板与 composer 上下排列、无重叠）与 `narrow-dark.png`（480px 深色）；期间发现并修正 fixture 未约束 stage 高度导致截图失真，改后几何正常。
- **状态**：done
- **时间**：2026-09-29T21:20:00+08:00

---

## Feature 完成

**fix-thread-scroll-arbitration** 所有 checklist 项已完成（5/5，feature 状态由 verifier 更新为 `done`）。

改动面：

- 新增 `src/renderer/src/components/assistant-ui/utils/scrollFollow.ts`、`tests/thread-scroll-intent.test.ts`、`tests/thread-scroll-stability-electron.test.mjs`、`tests/fixtures/thread-scroll-stability.{html,tsx}`、`tests/fixtures/thread-scroll-stability-preload.cjs`、`tests/fixtures/thread-scroll-stability-electron.cjs`
- 修改 `src/renderer/src/components/assistant-ui/elements/thread.aui.tsx`、`tests/thread-autoscroll.test.ts`、`docs/architecture.md`

## Blockers / Risks

- **既有问题（非本 feature 引入，未修）**：viewport 贴底时，处于正常流的尾部块（尤其 turn 文件变更卡）会落在 sticky footer 之后被遮住 —— 窄窗截图里可见卡片与 composer 重叠。本 feature 只保证「视口保持贴底、跟随不丢」，未改变 footer/card 的布局模型。建议单独立项（例如给 viewport 设置与 footer 等高的 content inset，或让卡片改为不参与流）。
- 冒烟依赖 rAF 与定时采样，机器负载极高时阈值（最长连续偏离 ≤15 帧、最大落后 ≤160px）可能触及；失败时先看 detail 里的实测值判断是「追赶延迟」还是「跟随丢失」。
