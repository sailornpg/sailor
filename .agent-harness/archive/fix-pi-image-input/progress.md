# Session Progress Log

## Current State

**Last Updated:** 2026-09-22
**Active Feature:** fix-thread-autoscroll-follow-tail — 聊天区改为跟随尾部滚动（3/3 done，待归档）

## Status

### 已完成

- [x] fix-thread-autoscroll-follow-tail Checklist #1：viewport 改 bottom anchor 的静态接线回归；verifier PASS（含 build）。
- [x] fix-thread-autoscroll-follow-tail Checklist #2：offscreen Electron 真实 Thread 场景验收滚动行为；verifier PASS。
- [x] fix-thread-autoscroll-follow-tail Checklist #3：回到底部控件 `behavior="instant"`；verifier PASS（含 20 次高频采样零漂移的证据 gate）。
- [x] fix-pi-image-input Checklist #1–#3：已在 2026-09-22 全部 done（详见下方 dated 段落）。

### 进行中

- 无。两个 feature 均 3/3 done，正在归档。

### 下一步

1. 归档 `fix-thread-autoscroll-follow-tail` 与 `fix-pi-image-input`（本次执行）。
2. 若要让高频生成下的回底更稳，可评估「点击回底时取消进行中的上滚意图」；当前未做，行为已记录在验收 README。

## Blockers / Risks

- 无阻塞。
- 更正一条过期记录：本目录是 Git 仓库（`git log/diff` 可用），此前「不是 Git 仓库」的说法有误。

## Decisions Made

- 滚动行为改动未新增自定义滚动代码，全部复用 assistant-ui 内建路径；对上游 element 的偏离已就地注释，防止 `assistant-ui add thread` 覆盖后无声回退。
- 人工核查类 checklist item 需补 `tdd: false` 和 coverage_reason，才能通过 checklist contract 校验。

## Files Modified This Session

- `src/renderer/src/components/assistant-ui/elements/thread.aui.tsx`：viewport 改 bottom anchor，回底控件传 `behavior="instant"`。
- `tests/thread-autoscroll.test.ts`：新增静态接线回归测试。
- `.agent-harness/evidence/thread-autoscroll-preview/`：新增验收场景（脚本、截图、README、scroll-report.json）。
- `.agent-harness/feature_list.json`、`.agent-harness/progress.md`：feature 状态与 session 记录。

## Evidence of Completion

- 2026-09-22 `verify-feature.mjs --feature-id fix-thread-autoscroll-follow-tail --all` 与 `--item 3` PASS（含 `pnpm run typecheck`、`pnpm run build`）。
- 2026-09-22 相关回归 14 项（thread-autoscroll / conversation-map / assistant-ui-boundaries / assistant-ui-message-rendering / thread-list / assistant-ui-runtime）全绿。
- 2026-09-22 `clean-state-check.mjs` 通过；`.electron-userdata` 临时 profile 已清理。

## Notes for Next Session

两个 feature 已 3/3 done，本次归档后 root `progress.md` 会被重置为空白模板；历史快照见 `.agent-harness/archive/<feature-id>/`。

## 2026-09-22 — 停止后会话管理竞态修复

- 根因：renderer 的停止 IPC 只触发 AbortController 即返回；AgentService 的 `finishRun` 尚未完成持久化时，删除/归档请求仍看到 `status: running`。
- 修复：AgentService 为每个 run 保存 completion promise；`abort` 现在等待运行 finally 完成（包括 `finishRun` 保存）后才返回，避免停止后立即管理会话的竞态。
- 回归：新增“停止等待运行落盘后即可立即管理会话”测试；相关工作区生命周期、管理、IPC、composer policy 测试通过。
- Verification：`pnpm run typecheck`、14 项定向测试、`pnpm run build`、`node .agent-harness/scripts/clean-state-check.mjs --skip-verification` 均通过。

## 2026-09-21 — Pi 图片与模型切换诊断
- Red: `node --test --test-name-pattern='切换视觉模型' tests/pi-agent.test.ts` reproduced generic agent failure; underlying error was `only text user-message parts are supported; got file`.
- Fix: main validates local image data and forwards it using Pi native input extension; explicit nonvision error. UI messages keep original file parts.
- Green: switching model, image reaching HTTP provider, restart retaining image, and nonvision rejection passed.
- Preview remains unresolved: user adds local files; CUA Electron app access timed out. No frontend visual fix or visual acceptance claimed.

## 2026-09-22 — 本地图片预览核查

- CUA 应用清单可访问，browser inventory 报 `unsupported Codex auth method: apikey`。
- Electron bundle ID 对应多个应用；使用本项目 electron@44.4.2 完整应用路径仍超时。已确认本项目 Electron 与 renderer 进程正在运行。
- 未获得 AX 树或截图，未完成文件选择、拖入或发送后的视觉核查。
- 源码发现：SailorComposer.tsx 的 RuntimeAttachmentChip 使用 ComposerAttachmentChip；该组件只渲染 FileImageIcon、名称、状态，没有图片元素或图片 URL。
- 已有 attachment.aui.tsx 和 use-attachment-src.ts 支持图片预览，但当前 composer 未使用这条路径。
- 本轮未修改生产代码。

## 2026-09-22 — 继续完成缩略图接入

- 用户确认继续修复，新增 checklist #2；原人工视觉核查移为 #3。
- Red：`node --test tests/composer-attachments.test.ts` 因 composer 未接入官方 runtime 附件组件而失败。
- Green：SailorComposer 改用 attachment.aui.tsx 导出的 ComposerAttachments，删除局部图标 chip 适配；沿用已有文件 URL 生命周期、缩略图、预览弹窗和移除逻辑。不新增依赖或 IPC。
- `node .agent-harness/scripts/verify-feature.mjs --feature-id fix-pi-image-input --item 2` 通过，执行回归检查及 build（包含 typecheck），由 verifier 标记 #2 done。
- 再次尝试 CUA 完整路径连接，20 秒后 `js execution timed out; kernel reset`。仍未取得截图，不声称实际视觉验收通过。
- 当前修改还包括 `src/renderer/src/components/chat/composer/SailorComposer.tsx` 和 `tests/composer-attachments.test.ts`。

## 2026-09-22 — 附件类型收窄与错误语义修正（新 feature 已完成）

- 用户报告：附件里同时放 PNG 与 `.log` 时收到「图片附件格式无效，请重新上传 PNG、JPEG、WebP 或 GIF 图片。」
- 根因（两层都只认图片）：
  1. `src/main/agent/pi/PiRunner.ts` 的附件循环把每个 `file` part 都当图片校验，`text/plain` 之类的 data URL 过不了 `image/(png|jpeg|webp|gif)` 正则，于是抛出只谈图片的错误；
  2. `patches/@ai-sdk__harness-pi@1.0.119.patch` 的 `extractUserPrompt` 只接受 text 与 `image/*` file part，其他类型仍会抛 `only text user-message parts are supported`；Pi 原生输入扩展本身也只有 `text` + `images`。
- 结论：AI SDK 只做 file part 传输，不提供任何文件解析；harness-pi 链路连 provider 原生 PDF 都用不上，所以「其他文件解析」必须在 Sailor 侧自行抽取文本或落盘。
- 本次范围（用户选择的最小改动）：`fix-attachment-type-rejection`
  - 新增 `src/shared/attachments.ts`：四种受支持图片类型、`accept` 串、`image/jpg → image/jpeg` 归一化、图片/非图片判定，main 与 renderer 共用。
  - `PiRunner.ts` 按类型分流：非图片附件、不支持的图片子类型、非法图片数据分别给出点名附件的错误；`image/jpg` 归一化后再比较。
  - 新增 `sailorAttachmentAdapter`（继承官方 `SimpleImageAttachmentAdapter`，`accept` 收窄为四种类型），在 `SailorChatProvider.tsx` 通过 `adapters.attachments` 接入，替换默认全类型 adapter。
  - `SailorComposer.tsx` 订阅官方 `composer.attachmentAddError`，把拒绝原因渲染进既有 `runtime-error` 提示；成功添加附件或发送时清除。
- Red→Green：新增 3 个 main 侧集成用例（复现了原报错文案）、`tests/attachment-policy.test.ts`、以及 `tests/composer-attachments.test.ts` 的两个接线断言。
- Verification：`verify-feature.mjs --feature-id fix-attachment-type-rejection --all` 三项 PASS；`clean-state-check.mjs` 通过（含 typecheck + build）。
- 全量 `node --test tests/*.test.ts`：133 项，131 通过，2 项既有失败（与本 feature 无关，已用还原改动的方式确认）：
  - `真实 Pi runtime 多轮与重建恢复原生上下文，模型只看到 Pi 原生工具`：`webSearchMcp.ts` 会把 MCP `search` 映射成公开名 `web_search`，而用例断言该名称不存在；沙箱下 MCP 连不上时该断言才会「通过」。
  - `structured tool fallback renders ok:false as an expanded failure with recovery`：断言 `SailorToolCall.tsx` 含 `ToolFallback.Result`，该文件本次未改动。
- 环境说明：Pi 每轮都会 `npx -y ai-search-mcp@0.4.1`；文件沙箱会拦 `~/.npm` 写入，导致所有真正发起模型请求的用例报 `Connection closed`。切到 full access 后恢复正常，属环境限制而非代码问题。
- 未验收项：composer 附件拒绝提示的**真实窗口视觉验收未完成**（无辅助功能/录屏权限，未做全屏截图）。该提示复用既有 `runtime-error` + `role="alert"` 样式，已通过静态接线断言与 typecheck/build，但不得声称视觉已通过。

## 2026-09-22 — 通用 read_document 文档读取工具（新 feature 已完成）

- 用户诉求：能上传 Excel 之类的文档，而不只是图片。
- 关键核实（纠正了上一轮我自己的不准确说法）：
  - just-bash 的 `python3`/`js-exec` 默认关闭，且 **Sailor 用的 `Sandbox` 抽象层根本没有 `python`/`javascript` 选项**；实测 `Sandbox.create({python:true,javascript:true})` 被静默忽略（python3 → 127）。只有底层 `Bash` 类认这个开关，实测可用（CPython 3.13.2 emscripten，自带 worker.js，能看到并写 shell 的 VFS）。要用它必须自写 `HarnessV1SandboxProvider`，属架构变更，本次未采用。
  - 该开关不触碰 `docs/architecture.md:144` 的“不能执行本机程序”边界（它是沙箱内 WASM），安全不是这里的决定因素。
  - 当前沙箱里 `xan`/`sqlite3 3.49.1`/`jq` 已可用，CSV 分析无需新能力。
- 采纳用户提出的设计：**通用 `read_document` 工具 + 按类型分发 + 统一结果**。
- 实现：
  - 新增依赖（用户已批准）：`read-excel-file@9.3.10`（MIT）、`mammoth@1.12.3`（BSD-2）、`unpdf@1.8.1`（MIT）。
  - `src/main/agent/documents/extractDocument.ts`：扩展名优先 + magic bytes 兜底（`%PDF-`；OOXML 靠 ZIP 目录区分）→ xlsx/docx/pdf/csv/text；`DOCUMENT_BUDGETS` 限制源文件 16MiB / 20 sheet / 500 行 / 60 列 / 默认 16KiB 字符，截断全部显式标注；解析器异常替换为不含宿主路径与堆栈的可读信息。
  - `src/main/agent/documents/createReadDocumentTool.ts`：host tool，经 `HarnessAgent` 的 `tools` 注册（与 web_search 同通道），只读免审批；结果复用 `src/shared/toolFeedback.ts` 的 `createToolSuccess`/`createToolFailure` + `toToolModelOutput`。
  - `src/main/agent/documents/stageAttachment.ts` + `attachmentPaths.ts`：非图片附件写入会话 VFS `/home/sailor/attachments/<chatId>/<name>`（内存层，**不写用户项目目录**），并把文档 file part 换成路径清单文本 —— 这同时解决了 harness-pi 只接受 text/image 的限制。
  - `src/shared/attachments.ts`：扩展名表成为单一事实源，`SUPPORTED_ATTACHMENT_ACCEPT` 供 composer 的 `accept` 使用；`sailorAttachmentAdapter` 改为自写适配器（文档必须是 `type:'file'`，不能沿用 `SimpleImageAttachmentAdapter` 的 `type:'image'`，否则会走缩略图与图片 part 转换路径）。
  - `src/shared/toolFeedback.ts`：新增 `UNSUPPORTED_TYPE` / `PARSE_FAILED` 两个错误码（附加式、仅展示用，renderer 无 switch 穷尽分支）。
  - `docs/architecture.md`：新增 “Document attachments and the read_document tool” 一节。
- TDD：新增 `tests/read-document.test.ts`（6 例）与 `tests/helpers/document-fixtures.ts`（纯 Node 生成最小 xlsx/docx/pdf，不提交二进制 blob；含日期单元格 `45000 → 2023-03-15`）；`tests/pi-agent.test.ts` 新增 2 个端到端用例（附件落 VFS + prompt 清单；模型调 read_document 拿到 sheet 内容）。
- Verification：`verify-feature.mjs --feature-id feat-read-document-tool --all` **7/7 PASS**；`clean-state-check.mjs` 通过。
- 全量 `node --test tests/*.test.ts`：141 项 **139 通过**，2 项既有失败（与本次无关，改动前后一致）：
  - `真实 Pi runtime 多轮与重建恢复原生上下文`：`webSearchMcp.ts` 把 MCP `search` 映射成公开名 `web_search`，用例却断言其不存在。
  - `structured tool fallback renders ok:false…`：断言 `SailorToolCall.tsx` 含 `ToolFallback.Result`，该文件未改动。
- 环境注意：跑 Pi 测试会经 `npx -y ai-search-mcp@0.4.1` 在仓库根生成 `.npm-cache/`（约 300MB，含 `.log`），会让 clean-state 报临时产物；清理后通过。下次跑完 Pi 套件需重新清理。
- 未验收项：composer 放宽 accept 后的**真实窗口视觉验收未完成**（无辅助功能/录屏权限），文档附件在 composer 中仍显示为文档图标。

## 2026-09-22 — 生成中指示器改用官方 loading-state 矩阵

- 用户请求：`npx shadcn@latest add "@assistant-ui/elements-loading-state"`，并把当前「生成中」指示器换成该样式。
- 安装：新增 `src/renderer/src/components/assistant-ui/elements/loading-state.tsx`。registry 依赖 `elements-surfaces` 已存在且内容一致，CLI 报 skip；`globals.css` / `package.json` / `pnpm-lock.yaml` 哈希前后一致，无附带改动，未新增依赖。
- 接线：`thread.aui.tsx` 的 `case "indicator"` 由 `ThinkingIndicator`（蓝点 + 单行文案）改为本地 `GeneratingIndicator`；`label="正在思考"` 不变。
- 布局（用户第二轮明确要求，属登记的局部例外）：官方 element 默认是「矩阵在上、文案在下」的居中竖排空态。用户反馈整体过大并要求左右布局，因此在**我们的 element 副本**里把根改为 `flex-row items-center gap-2`、单元格外层改 `grid-cols-3 gap-0.5`、单元格 `size-2 → size-1`（矩阵 32px → 16px，正好一半）、矩阵加 `shrink-0`。文案保持 `text-sm`：它是要读的状态文字，压到 7px 不可读，整体缩小由矩阵承担。
- tick：`GenerationLoader` 只消费 `tick`、不自己推进，本地 `useGenerationTick` 每 120ms 推进一步；`prefers-reduced-motion: reduce` 下不启动定时器，矩阵保持静态（元素自身的 transition 与 shimmer 已由 `motion-reduce:*` 关闭）。
- `thinking-indicator.tsx` 保留（仍是官方 element，当前未被引用）。
- 测试：`tests/assistant-ui-message-rendering.test.ts` 新增 2 例 —— indicator part 的接线断言，以及真实渲染 `GenerationLoader` 断言「左右布局 `flex-row` + 半尺寸 `size-1` + 三个亮起单元格 + 随 tick 移动 + shimmer 文案」。
- Verification：`pnpm run typecheck` 通过；`pnpm run build` 通过（renderer CSS 167.22 kB → 167.58 kB）；`node --test tests/assistant-ui-message-rendering.test.ts` 3/3 通过。
- 视觉验收：已用 offscreen Electron 真实渲染，浅色 / 深色 / 420px 窄屏 / tick=3 与 tick=12 两帧 / 3× 放大帧均已核对（单行不换行、无溢出、左右布局、亮起单元格随 tick 移动、深色下对比正常）。证据与复现步骤见 `.agent-harness/evidence/loading-state-preview/`。
- 未验收项：真实应用窗口内「运行中且尚无任何 part」的完整链路未截图（需要可用 provider 凭据才能跑出该状态）。该 part 由 assistant-ui 触发，本次只替换其视觉，slot 行为未改动。
- 环境踩坑（可复用）：
  - `npx shadcn@latest add …` 先因 `~/.npm` 不可写失败（EPERM，文件沙箱）；把 `npm_config_cache` 指到工作区后，bundled CLI 又把 `process.argv[1]`（bin 路径）当成 command 报 `unknown command`，需用一个归一化 argv 的 launcher 直接 `import` bin 才可用。
  - Chrome headless 在本沙箱内 SIGTRAP 或挂死；改用项目自带 Electron 的 `offscreen` + `capturePage()` 成功截图。必须 `env -u ELECTRON_RUN_AS_NODE`（环境中该变量已设为 1）、脚本内 `app.setPath("userData", …)` 并把 `--no-sandbox` 交给 `app.commandLine`，否则 Chromium sandbox 与默认 profile 路径都会被文件沙箱拒绝。

## 2026-09-22 — 助手正文改用内联引用（inline citation）

- 用户诉求：正文里每个来源独占一行裸 URL，希望改成 `elements-inline-citation` 那种编号引用效果。
- 核实：`elements-inline-citation` 早已安装且**已被本项目改过**（我们的副本接受 `children`；registry 当前版本把 demo 句子硬编码在组件里），因此**不能对这条跑 `add --overwrite`**，否则演示文案会进入正文。它目前已在 web_search 工具卡使用，但只支持固定 2 个引用位置。
- 实现（未新增依赖）：
  - `src/renderer/src/lib/webCitationSources.ts`：从消息的 web_search 工具结果收集来源，按页面去重、按首次出现编号；`citationUrlKey` 容忍 `www.`、协议、末尾斜杠、query、hash，并拒绝非 http(s) 与相对路径；`isBareUrlText` 判定「链接文案就是它自己的 URL」。
  - `inline-citation.tsx`（我们的副本）：`Source` 增加可选 `url`，弹层标题在有条 URL 时渲染为链接（替掉裸 URL 后不丢跳转）；chip 增加 `aria-label`（原来只有数字）；新增导出 `CitationMarker`，自管开关状态，供正文逐链接使用。
  - `markdown-text.tsx`：新增 `citations` prop，仅在有时覆盖 `a` —— 命中来源的链接渲染 chip，裸 URL 由 chip 替换，未命中的链接样式与行为完全不变；抽出共用的 `MarkdownLink` 避免样式漂移。
  - `thread.aui.tsx`：新增 `AssistantAnswerText`，只让答案正文经 `s.message.content` 收集 citations；reasoning 仍是 `<MarkdownText />`，不受影响。
- 测试：新增 `tests/web-citations.test.ts`（5 例：收集/去重/编号、忽略非搜索与未完成搜索、URL 归一化与裸 URL 判定、真实 markdown 渲染断言、接线断言）。其中渲染用例还断言 registry 的演示文案不出现在正文里。
- 踩坑：测试 fixture 的 `sourceId` 必须满足真实契约 `^src_[a-f0-9]{16}$`，占位值会被 schema 拒绝导致投影返回 null（表现为「收集为空」）。
- Verification：`pnpm run typecheck` 通过；`pnpm run build` 通过（JS 6,619.25 → 6,623.37 kB）；`tests/web-citations.test.ts` 5/5，加上 web-search-feedback / assistant-ui-message-rendering / message-parts / tool-call / assistant-ui-runtime / assistant-ui-boundaries / reasoning-selection 共 24 项相关回归全部通过。
- 视觉验收：offscreen Electron 真实渲染 `MarkdownText`，浅色 / 深色 / 420px 窄屏 / 弹层外观均已核对（裸 URL → 编号、文字链接保留文案加编号、未命中链接不加编号、窄屏不溢出）。证据见 `.agent-harness/evidence/web-citation-preview/`。
- 未验收项：
  - 真实应用窗口内「模型实际输出 → 正文」的完整链路未截图（需要可用 provider 凭据）。
  - hover / 键盘焦点打开弹层的**交互**未验证：offscreen 会丢弃合成输入事件，Base UI PreviewCard 的 open 状态无法被驱动；`citations-popover.png` 是用受控模式 `InlineCitation openIndex={0}` 强制渲染的外观，不代表 hover 已验证。
  - 编号按来源列表顺序（与 web_search 工具卡一致），正文因此可能出现 1、3 这样不连续的编号。
- 环境补充：offscreen 帧投递非确定性，同一 URL 会拍到空白帧；capture 脚本已改为连拍取最大帧。`zoomFactor` 在 offscreen 下无效。

## 2026-09-22 — 聊天区改为跟随尾部滚动（bottom anchor）

- 用户诉求：生成中要跟随尾部，但允许用户滚上去查看，点回到底部按钮后再滚到底并继续跟随。
- 根因：官方 `thread` element 的 viewport 写死 `turnAnchor="top"`。该模式下 assistant-ui 会把 `autoScroll` 默认置为 false（`useThreadViewportAutoScroll` 里 `autoScroll = turnAnchor !== "top"`）、在 `thread.runStart` 直接 return，并改用 top-anchor reserve 把用户消息钉在顶部；回答高于视口后就不再跟随。新会话首轮还有 `message.index > 0` 的限制，连 reserve 都不生效。
- 改动：`thread.aui.tsx` 的 `ThreadPrimitive.Viewport` 由 `turnAnchor="top"` 改为 `turnAnchor="bottom"`，并加注释说明这是对上游 element 的有意偏离（`assistant-ui add thread` 会覆盖回去）。`autoScroll` 保持不传，由 turnAnchor 派生为 true。
- 三个行为都由 assistant-ui 内建路径提供，未新增自定义滚动代码：跟随尾部走 `useOnResizeContent` + `followBottomRef`；上滚暂停走 `handleScroll` 的 `isUserScrollUp`；回底与恢复跟随走 `ThreadPrimitive.ScrollToBottom` → `useOnScrollToBottom`。回到底部控件本来就已接线（`thread.aui.tsx` 的 footer），未改 UI。
- 测试：新增 `tests/thread-autoscroll.test.ts`（2 例，静态接线回归：不得出现 `turnAnchor="top"`、必须保留偏离注释与回到底部控件、并锁定所依赖的 assistant-ui 版本行为字符串）。
- Verification：`node .agent-harness/scripts/verify-feature.mjs --feature-id fix-thread-autoscroll-follow-tail --all` 两项 PASS（含 `pnpm run typecheck` 与 `pnpm run build`）。
- 视觉与行为验收：新建 `.agent-harness/evidence/thread-autoscroll-preview/`，offscreen Electron 挂载**真实 Thread element**（`useExternalStoreRuntime` + 受控消息模拟流式增长），驱动并量化六个检查——跟随尾部、继续生成仍贴底、上滚后不贴底且按钮可见、上滚位置上内容继续增长而视口不被拉回、点击回底贴底、回底后恢复跟随——全部 PASS，截图三张 + `scroll-report.json`。
- 追加改动（用户确认后）：`ThreadScrollToBottom` 的 `ThreadPrimitive.ScrollToBottom` 传 `behavior="instant"`。原先走 store 默认 `"auto"`，而 viewport 带 `scroll-smooth`，回底是平滑动画；高频增长（60ms/40 字符）下动画被反复重定向，实测 600ms 后仍落后尾部 712px 且按钮不消失。改后同一场景立即精确贴底，`fastFollowSeries` 连续 20 次采样 `distanceFromBottom` 全程为 0（height 2584 → 3390）。
- 验收场景扩到 8 项检查（新增“高频生成时点击回底也立即贴底”“高频生成下回底后继续贴底”），feature 增加第 3 项 checklist（static 测试 + 证据 gate + `pnpm run build`），`--item 3` PASS，三项全部 done。
- 未纳入断言的观察（已写进该目录 README）：
  - assistant-ui 的 `isUserScrollUp` 要求 `scrollHeight` 前后完全相等，上滚与内容增长同帧时可能不被识别为“用户上滚”。
  - 若滚动手势仍在产生 scroll 事件（惯性滚动未结束），点击之后的这次回底会被随后的上滚事件重新暂停，与“用户上滚优先”一致。
  - 脚本若在同一个任务里连续执行 `scrollUp` 与点击，会稳定复现跟随被关闭；真实输入不可能这样排序，因此高频步骤在两者之间加了 320ms 等待。
- 局限：上滚用 `scrollTop` 赋值模拟、回底按钮用 DOM `.click()`（offscreen 丢弃合成指针事件），真实滚轮/鼠标手势层未覆盖；未在真实应用窗口跑完整 provider 流式链路。
- 环境踩坑（可复用）：预览 vite config 必须同时 alias `@` 与 `@shared`（`thread.aui.tsx` 间接依赖 shared schema），否则 overlay 报 `Failed to resolve import "@shared/toolFeedback"`；Electron profile 目录（`.electron-userdata`）要加进 `server.watch.ignored`，否则缓存写入会触发无休止 HMR 重载。

## 2026-09-22 — Tool call 失败态统一到官方 ToolError

- 用户反馈：同一会话里 tool call 有两种外观（`工具: bash` + 原始参数 JSON，对比 `> web_search [query]`），要求统一，并指定参考官方 `elements-tool-error` / `elements-approval-card`。
- 核实（用真实渲染逐个状态跑，非推断）：`SailorToolCall.tsx:20-43` 按状态分流——running/成功走官方 `ToolCall`；待批准走 `ApprovalCard`；**失败 / 被拒 / 取消 / interrupt** 走 `StructuredToolFallback`，其兜底是通用 `ToolFallback`，会打印原始 `argsText` JSON（即用户截图上面那种）。所以那是状态差异，不是随机两种样式。
- 元素核对（用户要求参考官方实现）：
  - `elements-tool-error`：本地与 registry **byte-identical**（2679B），`add` 只会 skip。
  - `elements-approval-card`：本地 **4010B** vs 官方 **3657B**，是**故意定制**（中文按钮/状态、`disabled` 与 `actions` 两个新 prop、焦点环与禁用态、命令块 `max-h-72 overflow-auto break-all`）。`SailorApprovalCard.tsx:66` 正在用 `actions=`，**`--overwrite` 会编译失败并回退中文化**，因此没有执行覆盖。
- 改动（只动 `src/renderer/src/components/chat/tools/StructuredToolFallback.tsx`，未改任何 element 文件）：新增 `ToolFailureResult`，失败/被拒/取消/interrupt 一律渲染官方 `ToolError` 卡片；`target` 从原始 `argsText` JSON 改为 `file_path/path/command/pattern/query` 里的可读值；有包络的失败把 `error.recovery` 保留进 message（如 `NOT_FOUND：文件不存在。；建议：list_files（确认文件名）`）。
- 测试：`tests/tool-call.test.ts` 与 `tests/tool-feedback-ui.test.ts` 按新契约更新（原断言要求 `tool-fallback` / `ToolFallback.Result`）。**注意**：`tool-feedback-ui.test.ts` 那条本来就是既有失败（要求失败态展示 recovery），它是**因为契约被重定义**才转绿，不是修掉了它原本的问题。
- Verification：`pnpm run typecheck`、`pnpm run build` 通过；`tool-feedback-ui` / `tool-call` / `shell-feedback-ui` / `file-change-feedback` / `web-search-feedback` / `assistant-ui-message-rendering` / `web-citations` / `message-parts` 共 **31/31** 通过。
- 视觉验收：offscreen Electron 真实渲染 `SailorToolCall`，一张图覆盖五种状态（成功 / 原生无包络失败 / 有包络+恢复建议失败 / 待批准 / 已取消），浅色 + 深色 + 400px 窄屏，确认任何状态都不再出现原始参数 JSON。证据见 `.agent-harness/evidence/tool-call-preview/`。
- 未修缺陷：官方 `ToolError` 的 **Retry 按钮在无 handler 时仍可点但无反应**（Skip 无 handler 会 disabled，Retry 只在 `retrying` 时禁用）。按「保持官方实现」未改该文件，已在该目录 README 记录。
- 另一个既有问题（本次未动，需单独决定）：`apply_patch` / `execute_shell` 是**已退役工具名**（`validateChatMessages.ts:4` 的 `retiredTools`），但 `StructuredToolFallback.tsx`、`fileChangeFeedback.ts:48`、`shellExecutionFeedback.ts:25` 及对应测试仍按旧名过滤，导致 `FileChangeToolFallback` / `ShellExecutionToolFallback` 对当前 `write`/`edit`/`bash` **不可达**。接新名要重做 args/结果投影（原生 `edit` 是 `old_string`/`new_string`、`write` 是 `content`，结果也不是 `toolResultSchema` 包络），属另一个 feature。
- 环境踩坑（修正我自己上一轮的结论）：offscreen 截图偶发空白帧的真正原因是 **Electron userData 放在预览的 Vite root 内**，Chromium 缓存写入触发 dev server 重载风暴，页面在截图途中被刷掉。把 userData 移到 root 之外（`.agent-harness/evidence/.electron-userdata`）即稳定；`server.watch.ignored` 是另一种等效解法。`zoomFactor` 在 offscreen 下无效。
