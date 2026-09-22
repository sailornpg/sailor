# Session Progress Log

## Current State

**Last Updated:** 2026-09-21
**Active Feature:** feat-official-timeline-parity

## Checklist

- 已安装官方 elements-thinking-indicator 与 elements-tool-timeline，复用已有依赖。
- 等待提示接入 ThinkingIndicator；Sailor ToolGroup slot 接入 ToolTimeline。
- 时间线保留工具详情和审批；审批/失败自动展开；重复路径以 call ID 区分，长路径截断并提供 title。
- 适配本项目 Radix 折叠、键盘焦点和减少动画偏好。

## 验证

- Startup `./.agent-harness/init.sh` 通过。
- Feature verifier 运行类型检查、生产构建、工具显示与状态投影回归；完整 evidence 见 feature_list.json。
- 本轮未进行 Electron 视觉验收。

## Blockers / Risks

- 既有 tests/assistant-ui-boundaries.test.ts 中 composer 源码断言只接受单引号；现有 SailorComposer.tsx 使用双引号，故该无关测试失败。本次未修改 composer 或该测试，边界回归只运行 legacy/generic 两项。
- 当前目录不是 Git 仓库，无法提供 diff/commit evidence；未创建 commit。

## Files Modified This Session

- assistant-ui/elements: thinking-indicator.tsx、tool-timeline.tsx、thread.aui.tsx。
- chat: tools/SailorToolTimeline.tsx、thread/SailorThread.tsx。
- styles/globals.css: registry 添加 Radix data-open/data-closed variant。
- tests/tool-timeline.test.ts、docs/architecture.md、feature_list.json、本记录。

## 模型选择样式调整

- 按用户提供的官方 Composer 示例复用 ghostButton/floating surface tokens。
- 模型入口改为 32px 高圆角轻量按钮，统一悬停、按压、焦点和展开状态；长模型名截断，title/aria-label 保留完整内容。
- 选择面板优先在输入框上方展开，使用圆角面板和视口宽度上限。模型与推理等级选择逻辑保持原样。
- Checklist 验证：model-catalog-selection/reasoning-selection 回归、typecheck 与 build 由 verifier 记录。
- 未新增依赖；本轮未做 Electron 视觉验收。

## 官方时间线一致性修正

- 根因：时间线下重复挂载原 ToolFallback children；只适配 path 没有适配 Pi 的 file_path；unlayered button reset 覆盖官方字号与灰度。
- 采用官方 session recipe：在消息 parts 前渲染一个时间线，正常工具/推理不再逐条重复输出。审批与错误只保留一处可操作回退入口。
- 恢复官方 max-w-sm，去掉底部重复详情和边线；显示步骤/变更文件数，真实写入结果提供文件标签，缺少结构化 diff 时不伪造行数。
- tests/tool-timeline.test.ts 先复现 file_path 回退成 read，再验证修复；新增实际 Thread 夹具确认一个时间线且无正常工具卡片。
- 类型检查、构建、相关回归由 feat-official-timeline-parity verifier 记录。
- 视觉阻塞：iab ERR_BLOCKED_BY_CLIENT；Chrome connector unsupported Codex auth method: apikey；native app 控制请求超时。未宣称像素级一致。临时预览服务已停止。
- 保留上一节记录的既有 composer 单引号源码断言失败，与本次无关。
