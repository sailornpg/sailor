# Session Progress Log

## Current State

**Last Updated:** 2026-09-21
**Active Feature:** [feat-approval-card-style]

## Checklist

- 安装官方 elements-tool-call，复用现有依赖，保持注册表组件默认样式。
- 正常调用逐条显示，使用原工具名；展开请求和格式化结果，Pi file_path 映射到目标标签。
- 移除 ToolTimeline 组件、业务适配、Process slot 和专属测试夹具；替换为 ToolCall 夹具与回归。
- 去掉外层工具组折叠；恢复官方 Reasoning 展示。审批、失败、取消仍通过原状态组件显示一次。

## 验证

- Startup init.sh 已通过。
- verifier 执行实际 Thread 单次展示、路径映射、请求结果、异常分流及既有反馈回归；typecheck/build evidence 记录于 feature_list.json。
- 本轮未完成浏览器视觉验收；此前浏览器工具连接失败，不能以构建通过宣称像素一致。

## Blockers / Risks

- 既有 composer 源码单引号断言问题未改动。
- 当前目录无 Git 仓库，未创建 commit。

## Files Modified This Session

- components/assistant-ui/elements/tool-call.tsx、thread.aui.tsx；删除 tool-timeline.tsx。
- components/chat/tools/SailorToolCall.tsx、thread/SailorThread.tsx；删除 SailorToolTimeline.tsx。
- tests/tool-call.test.ts、tests/fixtures/ToolCallPreview.tsx；删除对应旧时间线测试与夹具。
- docs/architecture.md、feature_list.json、progress.md。

## 审批卡片与紧凑展示

- 推理摘要切换官方 ghost 无边框样式，收紧上下间距。
- ToolCall 目标单行省略、title 保留全文；展开请求/结果保留换行并限制滚动高度。
- 安装官方 approval-card source component，保留默认卡片布局，增加中文文案、提交禁用态与长内容滚动。
- SailorApprovalCard 使用现有 respondToApproval({ approved })，仅接管未处理的简单布尔审批；一次性 ref 锁阻止重复提交，失败后恢复按钮。自定义选项/问答及失效/取消仍使用原状态视图。
- edit 显示路径、原内容与替换内容；write 显示路径与内容；bash 显示命令；无新增依赖与 main/preload/持久化契约变更。
- 验证：真实卡片 SSR、失效分流、禁用按钮、工具反馈回归，类型检查、构建和 Pi 审批回归由 verifier 记录。
- 本轮未做浏览器视觉截图验收；不宣称已完成截图比对。
