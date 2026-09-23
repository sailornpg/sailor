# Session Progress Log

## Current State

**Last Updated:** 2026-09-23T05:51:08.533Z
**Session ID:** [optional]
**Active Feature:** Composer attachments and workspace selection bubble follow-up

## Status

### 已完成

- [x] Restored the official assistant-ui composer attachment renderer and kept staged attachments outside the input surface.
- [x] Rendered workspace context parts in a sibling group instead of the user text bubble.
- [x] Dismissed the selection bubble and cleared the external selection callback after adding a reference.
- [x] Verification: `pnpm run typecheck`, `pnpm run build`, `node --test tests/composer-attachments.test.ts tests/workspace-context.test.ts tests/file-split-pane.test.ts` passed. Visual Electron inspection was attempted but the desktop control request timed out.

### 进行中

- [ ] No further implementation work for this follow-up
  - Details: Keep the existing uncommitted workspace changes intact.
  - Blockers: Visual inspection could not complete because the native app control request timed out.

### 下一步

1. Re-run the Electron visual check when desktop control is available.
2. Select the next unarchived feature from `.agent-harness/feature_list.json`.

## Blockers / Risks

- [ ] None currently

## Decisions Made

- **Active feature archived**: Reset the root progress panel after archiving the current feature
  - Context: Historical detail now lives under `.agent-harness/archive/index.json`
  - Alternatives considered: Keep all historical detail in the root progress file

## Files Modified This Session

- `.agent-harness/progress.md` - reset after archiving the active feature
- `.agent-harness/archive/index.json` - archive index updated

## Evidence of Completion

- [ ] Archive command executed successfully

## Notes for Next Session

Start the next active feature and replace this placeholder state with real progress notes.

## 2026-09-23 引用提交与附件行修复

- Checklist: `fix-workspace-context-submission-layout`。
- 原因：`sendMessage` 的 Promise 覆盖整次生成；assistant-ui 将 `data-workspace-context` 转换为 `type: data / name: workspace-context`，原分组条件永远不匹配。
- 修复：提交调用后立即消费该次引用；图片与引用共用气泡外附件行；正文分组显式排除引用。
- 验证：真实 assistant-ui SSR 附件行与正文隔离测试、未完成生成 Promise 下立即清空及新草稿保留测试通过；typecheck、build、clean-state 通过。未重新完成原生 Electron 视觉检查，上轮桌面接口超时限制仍在。

### Composer 内部附件布局调整
- 按用户要求将 `.sailor-composer-attachments` 整体移入 `ComposerBar`，位于输入文字上方，引用和上传附件共享输入框表面。
- 已有附件测试 4 项、typecheck 通过；构建通过 verifier 记录。未进行原生窗口视觉验收。

### Composer 附件底部对齐
- 附件行改为 `align-items: flex-end`，同时覆盖引用标签的 `align-self: flex-start` 为 `flex-end`，使引用标签与图片底边对齐。
- `git diff --check` 通过；构建验证由 checklist #3 记录。未做原生窗口视觉验收。

### 已发送附件纵向排列与气泡自适应宽度
- 按最新要求，已发送图片和引用从同排改为上下排列，统一靠右；文字气泡使用 `w-fit max-w-full justify-self-end`，短文字收缩，长文字受容器约束换行。
- 复用消息渲染和引用提交时序测试；构建证据由 checklist #4 记录。原生窗口视觉未验收。

## 文件分栏拖拽与工具栏路径
- Feature: `fix-files-resize-toolbar`。
- 修复水平分隔条纵向 delta 符号；方向回归先红（200 !== 280）后绿。FileSplitPane 通过 ResizeObserver 获取真实宽/高，将拖拽像素映射到树区域比例。
- 当前文件路径移至左上工具栏，删除“文件”标题和预览区重复路径栏，长路径省略且保留 title。
- 验证：分隔条方向、文件树比例和文件树渲染测试；build/typecheck 由 verifier 记录。
- Baseline blocker：`tests/pane-resizer.test.ts` 两项仍断言旧 data-side 与完整 class 字符串，临时恢复修改前的拖拽公式后确认同样失败，本轮未更改这些断言。
- 未完成原生窗口视觉验收。
