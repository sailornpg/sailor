# Session Progress Log

## Current State

**Last Updated:** 2026-09-22
**Active Feature:** fix-pi-image-input — Pi 图片输入与模型切换诊断

## Status

### 已完成

- [x] Checklist #1：模型切换、图片送达、日志恢复及非视觉模型报错；verifier evidence 已记录。
- [x] Checklist #2：接入官方附件缩略图与预览组件；回归检查与构建通过，verifier 已记录。

### 进行中

- [ ] Checklist #3：复现并核查本地图片缩略图显示。
  - 当前阻塞：指定本项目 Electron.app 后，CUA 仍在 120 秒后返回 `Sky Computer Use request timed out`。

### 下一步

1. 恢复 Electron 窗口访问后，验证文件选择和拖入本地图片。
2. 核查输入框中的缩略图、点击放大、移除，浅深色及窄窗口；当前已接入官方组件。
3. 实际视觉验证通过后才创建验收 evidence，并运行 item #3 verifier。

## Blockers / Risks

- 视觉检查未完成，没有创建 pi-image-preview-pass.md，也未将待办标记通过。
- 当前目录不是 Git 仓库，无法提供 Git diff 或 commit。

## Decisions Made

- 当前项为人工核查且未修改生产代码，补充 `tdd: false` 和 coverage_reason，修正 checklist contract。

## Files Modified This Session

- `.agent-harness/progress.md`：更新真实进度、发现及阻塞。
- `.agent-harness/feature_list.json`：补充人工核查例外理由，保留未完成状态。

## Evidence of Completion

- 2026-09-22 `./.agent-harness/init.sh` 通过：typecheck 和 build 成功，仅有 zod 既有 Rollup 注释警告。
- `node .agent-harness/scripts/clean-state-check.mjs --skip-verification` 通过；标准 verification 已在本轮单独运行通过。

## Notes for Next Session

继续当前 feature，不归档。完成源码修复并不能替代真实窗口验收。

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
