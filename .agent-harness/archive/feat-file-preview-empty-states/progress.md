# Session Progress Log

## Current State

**Active Feature:** [feat-file-preview-empty-states]

## Checklist

- 居中预览状态：图标、标题、说明，使用主题文字与中性色。
- 覆盖未选文件、空文件、不支持预览、加载中、读取失败；保留实际不可预览原因。
- 文件读取错误独立存储，不再回落到未选择提示；失败可点击重新加载。

## 验证

- typecheck 通过；文件面板/文件读取测试和 build 由 verifier 记录。
- 原生窗口视觉验收未完成，先前桌面控制接口超时；不能将构建成功当作视觉验收。

## Risks

- 既有 tests/pane-resizer.test.ts 两项旧样式断言失败，本轮未修改相关文件。

## 修复文件预览行号重叠

- Feature: `fix-file-preview-gutter-overlap`。
- CodeMirror 固定行号栏使用透明背景，横向滚动时正文从其下方透出。改用不透明的 `--surface-workspace` 主题背景，保留原有 sticky 定位、宽度及滚动行为。
- 验证：build/typecheck 由 verifier 记录，`git diff --check` 通过；原生窗口横向滚动视觉未验收。

## 移除文件树顶部筛选框

- Feature: `remove-file-tree-filter`。
- 移除输入控件、筛选状态、递归参数与专用样式，文件树直接展示目录和文件；同步文档和现有测试调用。
- typecheck、文件树渲染测试通过；构建通过 verifier 记录。未做原生窗口视觉验收。
