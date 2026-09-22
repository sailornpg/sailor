# Session Progress Log

## Current State

**Last Updated:** 2026-09-22T08:45:00.000Z
**Session ID:** panel-dock-skeleton
**Active Feature:** [feat-panel-dock-skeleton]

## Status

### 已完成

- [x] feat-panel-dock-skeleton — 面板宿主骨架（Codex 风格 dock 与 tab）

### 进行中

- [ ] 无。等待用户选择下一个 feature（候选：审查面板、只读文件树、侧边聊天、终端只读输出）

### 下一步

1. 从 `.agent-harness/feature_list.json` 选择下一个未完成 feature（当前仅剩 feat-context-breakdown-card，已由另一会话转 done）。
2. 若继续面板路线，建议顺序：审查（会话内改动聚合）→ 文件（只读树，需新窄 IPC）→ 侧边聊天（复用 WorkspaceChats）→ 终端只读输出。
3. 终端真 PTY 与完整浏览器面板需要新依赖/新安全边界，必须先与用户确认。

## Checklist

| # | item | status |
| --- | --- | --- |
| 1 | 面板布局状态机与版本化持久化 | done |
| 2 | 统一快捷键表与面板可用性解析 | done |
| 3 | PanelDock / PanelTabStrip / PanelPickerMenu / PanelHost | done |
| 4 | 五个面板注册项与 web-preview 迁移 | done |
| 5 | offscreen Electron 视觉验收 | done |

## 验证

- `node .agent-harness/scripts/verify-feature.mjs --all --feature-id feat-panel-dock-skeleton` → 5/5 PASS
- `node --test tests/panel-layout.test.ts tests/panel-shortcuts.test.ts tests/panel-dock.test.ts tests/panel-registry.test.ts` → 23 项通过
- `node --test tests/*.test.ts` → 181 项，168 通过，13 失败（全部为 `pi-agent` / `read-document` 环境失败，见 Blockers）
- `pnpm run build`（含 typecheck）→ 通过；面板均产出独立懒加载 chunk
- `node .agent-harness/evidence/panel-dock-preview/capture-all.mjs` → 4 张截图 + report.json，failures 为空

## Blockers / Risks

- [ ] `pi-agent.test.ts`（10 项）与 `read-document.test.ts`（3 项）在本机失败：npm cache 归属 root 导致 `npm EPERM`，本地 provider stub 起不来，流以 `Connection closed` 结束。与本次改动无关（这些测试不 import 任何本次修改的文件），属环境既有问题；修复需 `sudo chown -R 501:20 ~/.npm`。
- [ ] 审查面板的 Git diff、文件树的只读 IPC、终端 PTY、浏览器 `webviewTag`/`WebContentsView` 都涉及新增依赖或公共契约，需用户批准后才能开工。

## Decisions Made

- **面板骨架分阶段落地**：P0 只做注册表 + dock + tab strip + 持久化 + 快捷键，四个能力面板先给真实不可用原因，不引新依赖、不改 IPC 契约、不改持久化格式。
- **布局持久化放 renderer localStorage**（`sailor.panels.v1`），沿用 `appearancePreferences` 的版本化 key + 校验降级模式，避免动 `workspaces.json` 格式。
- **面板打开改为类型化通道**：退役 `sailor:web-preview` 全局 DOM 事件，改走 `requestPanelOpen` + `subscribePanelRequests`，并在边界校验工具输出。
- **可用性与未实现分离**：`scope` 决定上下文门槛（无会话/无工作区则置灰并给出原因）；面板内部用真实文案说明“尚未接入”，不用假数据占位。
- **激活项失效回退**：dock 在 `activeInstanceId` 无法解析时回退第一个 tab（首轮视觉验收发现的空白缺陷）。

## Files Modified This Session

- `docs/panels.md` — 新增面板宿主设计文档
- `src/renderer/src/lib/panels/{layout,shortcuts,registry,descriptors,panelData,usePanelLayout}.ts` — 新增纯逻辑层与注册表
- `src/renderer/src/components/layout/{PanelDock,PanelTabStrip,PanelHost,PanelPickerMenu,PanelAddButton,PanelToolbar}.tsx` — 新增 dock 组件层
- `src/renderer/src/components/panels/*` — 五个面板实现（浏览器为真实只读预览，其余为真实原因占位）
- `src/renderer/src/components/layout/AppShell.tsx`、`components/chat/ChatWorkspace.tsx`、`components/chat/tools/StructuredToolFallback.tsx` — 接入与迁移
- `src/renderer/src/components/layout/InspectorPanel.tsx` — 删除（被 PanelDock 取代）
- `src/renderer/src/styles/globals.css` — dock 样式，清理已无引用的 inspector/change-summary/file-row 规则
- `tests/panel-{layout,shortcuts,dock,registry}.test.ts` — 新增 23 项测试
- `.agent-harness/evidence/panel-dock-preview/` — 视觉验收预览页、截图、report.json、README
- `.agent-harness/feature_list.json`、`.agent-harness/progress.md`

## Evidence of Completion

- `verify-feature.mjs --all` 输出 5/5 PASS，checklist 全部 done。
- 视觉验收：`dock-light.png`、`dock-dark.png`、`dock-narrow.png`、`dock-picker.png`；结论与发现记录在 `.agent-harness/evidence/panel-dock-preview/README.md`。
- 构建产物中 `ReviewPanel` / `FilesPanel` / `TerminalPanel` / `BrowserPreviewPanel` / `SideChatPanel` 均为独立 chunk，证明懒加载生效。

## Notes for Next Session

- 面板的扩展入口只有两处：`lib/panels/descriptors.ts` 追加描述符，`components/panels/<id>/` 实现组件。新增面板不需要改 dock。
- 新增面板若需要主进程能力，先补窄 IPC 与其校验，再让 `availability` 依据真实能力返回可用性。
- `docs/panels.md` 是面板能力的单一设计来源；改动 scope/multiplicity/持久化格式时同步更新它。

## 2026-09-22 — 上下文卡片换成官方 Context Breakdown（精确统计）

- 用户诉求：composer 里的 context 卡片换成 `npx shadcn@latest add "@assistant-ui/elements-context-breakdown"`，且统计要精确。
- 先摆事实再定方案：官方 element 是纯 props 驱动（`segments + limit`，自己算 `used/limit` 与 Headroom），provider 只报告整次调用的 `inputTokens`、**不提供**按系统/工具/会话的分类。用户选择方案 A（折算到 provider 精确总量）+ 四行（系统/工具/会话/Headroom）。
- 改动：
  - 新增 `src/main/agent/pi/contextPayload.ts`：按本轮真实 payload 精确测字符 —— 系统桶 = 提示词 + 技能 `name/description`（`content` 是模型按需加载，不进 prompt，所以不算）；工具桶 = 工具名 + 描述 + provider 形态 JSON Schema（`z.toJSONSchema`，非 zod 时退回序列化，失败按 0）；会话桶 = 文本/推理/工具入参与结果；图片只计数、绝不计 base64 字节。
  - `PiRunner.ts`：抽出 `SAILOR_INSTRUCTIONS` 常量（agent 与测量共用一份，防漂移），在 prompt 定稿后测量并随 `contextUsage.payload` 下发（每轮重测，审批续跑也重测）。
  - `contextUsage.ts`：新增 `buildContextBreakdown`（权重 `ceil(chars/4)` 与 Pi 同口径 + 最大余数法，**分类和严格等于 provider 总量**）与 `contextNote`（三种状态文案的唯一来源）。
  - `composer.tsx` 的 `ComposerContext`：弹层内容换成官方 `ContextBreakdown`；圆环保留（分类缺失时仍按 `used/limit` 反映真实占用）；压平 element 自带 paper 表面避免双层边框。
- 测试：新增 `tests/pi-context-payload.test.ts`（4 例）；`tests/composer-context.test.ts` 扩到 8 例（折算、最大余数、缺测量不编造、三种空态文案、接线）；`tests/pi-agent.test.ts` 的用量契约断言加严 —— `systemChars` 等于 `SAILOR_INSTRUCTIONS.length` 且该字符串确实出现在 provider 实收请求里，`conversationChars` 精确等于本轮用户文本长度。
- Verification：`verify-feature.mjs --feature-id feat-context-breakdown-card` 四项全 PASS（含 typecheck、build、pi-agent 用量用例、证据 gate）。相关回归 21 项（composer-context / pi-context-payload / assistant-ui-boundaries / message-rendering / composer-attachments）全绿。
- 视觉与行为验收：`.agent-harness/evidence/context-breakdown-preview/`，offscreen Electron 挂载**真实 ComposerContext + 真实 buildContextBreakdown**，11 项检查（卡片文本与纯函数结果逐项相等、总量=provider 输入、Headroom 数值、图片标注、弹层不遮挡圆环、完整在视口内、420px 不溢出、旧消息降级、无用量空态），5 张截图（浅/深/窄/旧消息/空态）。
- 未纳入覆盖：弹层用 DOM `focus()` 触发而非真实鼠标 hover；未在真实应用窗口跑 provider 完整链路。
- 既有失败（与本次无关）：`tests/pi-agent.test.ts` 的「模型只看到 Pi 原生工具」仍因 `webSearchMcp` 把 MCP `search` 映射为 `web_search` 而断言失败，与上一轮记录一致。
- 环境踩坑（可复用）：
  - `npx shadcn@latest add` 在本沙箱有两处障碍：`~/.npm` 不可写（EPERM）→ 把 `npm_config_cache` 指进工作区；bundled CLI 从 `process.argv[1]` 读命令（slice 1 而非 2）→ 用 `.agent-harness/scripts/shadcn-add.mjs` 归一化 argv 后直接 import bin。安装结果经核对只新增 `context-breakdown.tsx`，`surfaces.tsx`/`range.ts` 均 skip，`globals.css` 与 `package.json` 无变化。
  - 跑 Pi 测试会经 `npx -y ai-search-mcp` 在工作区留下 `.npm-cache/`（186MB，且未被 gitignore），跑完必须删除。
  - `.artifacts/full-tests.log` 不是本次产生的（工作区另有 panels 会话的未提交改动），但它是 `.gitignore` 明确忽略的临时产物且会让 clean-state 永久失败，已按项目定义清理。

## 2026-09-22 — 上下文卡片对齐官方 demo（第二轮）

- 用户反馈：卡片效果与官方 demo 差很多，怀疑没有严格用官方 element。
- 核查结论：element 与 registry **逐字一致**（安装后比对过 content）。差异来自三处，其中两处是我的自主选择：(1) 旧消息走了我写的降级态（只剩一段文字），(2) 我用了项目前景色深浅而非官方 demo 配色，(3) 我按上一轮确认做了 3 类，官方 demo 是 4 类。另外确认 `out/` 里 main 与 renderer 都含本次改动，所以用户看到的那条应是早于分类口径落库的消息（或运行中的实例 main 未重启）。
- 改动（用户确认"完全对齐"）：
  - `contextPayload.ts` 新增 `attachmentChars`：附件路径提示原文（按注入文本精确匹配）+ `read_document` 工具结果正文单独成类；非法/未知 part 仍不抛错。
  - `PiRunner.ts` 把 `renderAttachmentNotice(documents)` 作为匹配锚点传给测量，避免提示文本被算进会话。
  - `contextUsage.ts`：分类改为官方四类（系统/工具/附件/会话）；**没有分类测量时不再退化成散文**，改用 provider 精确总量渲染单行 `input` + Headroom，保持官方卡片形状且不编造分类。
  - `SailorComposerContext.tsx`：配色换成官方 demo 原值 `bg-foreground/45`、`bg-foreground/25`、`bg-blue-500/60 dark:bg-blue-400/60`、`bg-blue-500 dark:bg-blue-400`（数据可视化色，已在注释里说明来源）。标签保留中文。
- 测试：`tests/pi-context-payload.test.ts` 增至 5 例（附件分桶不混入会话）；`tests/composer-context.test.ts` 增至 8 例（四类折算、附件参与折算、旧消息单行不编造分类、官方配色类名接线）。
- Verification：feature 增至 6 项 checklist，新增 #5（对齐改动，unit）与 #6（重新验收，manual-exception）；`--item 5` `--item 6` 全 PASS。相关回归 22 项全绿；pi-agent 用量契约用例通过。
- 视觉与行为验收：预览扩到 16 项检查 / 5 张截图，新增**配色一致性断言**（拿 `[role="meter"]` 的 className 与官方 tint 逐段比对，实测完全一致）与**旧消息卡片形状断言**。实测四类数字 1,325 / 4,921 / 25,869 / 30,285，总量 62,400 / 128,000，Headroom 65,600。
- 未覆盖同上一轮：真实鼠标 hover、真实应用窗口的 provider 完整链路。

## 2026-09-22 — 修复分类测量字段增补导致的兼容性丢弃（第三轮）

- 用户反馈：卡片又只剩一行"输入（最近一次调用）"，系统/工具/附件/会话都没了。
- 根因（自查确认，不是用户环境问题）：第二轮我给 payload 加了 `attachmentChars`，同时把它写进了**必填**校验（`PAYLOAD_FIELDS.every(...)`）。第一轮主进程写入的消息没有该字段 → 新渲染端把**整个 payload 判为非法丢弃** → 只剩 provider 精确总量，于是渲染单行"输入" + 降级说明。用户两张截图的 input 从 9,661 涨到 10,854，正是"旧版主进程写入的新消息"这一形态。
- 修复：
  - `readPayload` 改为**缺失字段按 0、非法值才整体丢弃**（增补字段不再让旧数据失效）。
  - `buildContextBreakdown` 改为**按测量到的字符数过滤分类**：字符数为 0 的分类不再传给 element（官方 element 只对 0 占比的色条跳过，行列表不过滤，所以过滤必须在调用方），否则每个无附件的回合都会挂一行"附件 0"。
- 测试：`tests/composer-context.test.ts` 增至 9 例，新增"旧版本主进程写入的 payload 缺字段时仍渲染已有分类，不整体丢弃"（Red → Green）；空分类不占行的期望同步更新。
- Verification：feature 增至 7 项 checklist，新增 #7（兼容性修复，unit）；`--item 7` PASS。视觉验收扩到 6 个场景 / 19 项检查，新增 `card-partial-payload-light.png`（缺字段 payload → 三类照常渲染、无附件行、不触发降级文案）。
- 复盘：把"持久化契约加字段"当成纯内部改动是我的错。**给跨进程/持久化的结构加字段时，读取端必须把缺字段视为合法默认值**，是否新增字段与是否必填是两件事。

## 2026-09-22 — 总量改用官方 API（第四轮）

- 用户质疑：`useAuiState` 里能不能直接取用量？并明确原则：**优先用官方 API，官方没有再自己实现**。
- 核查结论（都有代码证据）：
  - 官方确实提供：`@assistant-ui/ai-sdk` 导出 `useThreadTokenUsage()`（`useAuiState` 实现）与 `getThreadMessageTokenUsage(message)`，读取优先级 `metadata.usage` → `metadata.custom.usage` → 求和 `metadata.steps[].usage`，并认识 `inputTokenDetails.cacheReadTokens`。
  - 但本项目的 `messageMetadata` 原先只写私有 `contextUsage`，官方字段一个都没写 → 用户的 `useTurnUsage`（读 `metadata.steps`）必然拿到 0。
  - 附带发现：assistant-ui 的消息转换器 `convertMessage.js` 的 `toThreadMetadata` 只保留 9 个白名单键，其余挪进 `metadata.custom`——所以从线程态读到的私有字段在 `custom.contextUsage`，而卡片此前读的是 AI SDK 原始消息（`useSailorChat().messages`），顶层有效。
- 改动：
  - `PiRunner.ts`：`usageState` 记下 `cacheReadTokens`；`messageMetadata` 改为写**官方形状** `usage: {inputTokens, outputTokens, totalTokens, inputTokenDetails.cacheReadTokens}`，私有 `contextUsage` 只保留官方给不出的 `{contextWindow, modelId, payload}`。
  - `contextUsage.ts` 重构为"官方优先"：新增 `readContextExtras`（认 `contextUsage` 与 `custom.contextUsage` 两条路径；窗口官方不给，缺失即不渲染卡片）、`composeContextUsage`（总量取官方，官方缺失时回退到早期写在 `contextUsage` 的历史总量）、`latestContextUsage(messages, readTokens)`（官方提取器由调用方注入，保持模块与运行时解耦）。
  - `SailorComposerContext.tsx`：`latestContextUsage(messages, getThreadMessageTokenUsage)` —— 官方 API 取总量，同一个消息上的 extras 提供窗口与分类测量。
- 测试：`tests/composer-context.test.ts` 重写为 11 例，新增"官方提取器直接消费主进程写入的 usage（原始与经 custom 两条路径）""总量官方优先，官方缺失时回退""官方与 extras 必须来自同一条消息"；`tests/pi-agent.test.ts` 的契约断言改为对着 `getThreadMessageTokenUsage` 校验主进程写出的 metadata。
- Verification：feature 增至 8 项，新增 #8（官方优先，unit）；`--item 8` PASS。相关回归 25 项全绿；pi-agent 用量用例通过。视觉验收 20 项检查（新增"总量取自官方提取器"），6 张截图。
- 未采用 `useThreadTokenUsage()` hook 的原因（已在代码注释说明）：它只返回总量、不告诉你是哪条消息，而分类测量必须与总量来自**同一条消息**，否则占比会配错；因此用官方导出的 per-message 提取器 + 自己选消息，取数逻辑仍全部来自官方。

## 2026-09-22 — 去掉卡片下方的说明文案（第五轮）

- 用户要求：去掉 context 卡片下方那段文案备注（截图里框出的"分类按本轮 payload 字符占比折算…"）。
- 改动：
  - `contextUsage.ts`：删除 `note` 概念（`ContextBreakdownView.note`、两处 note 文案、`contextNote`，以及只服务它的 `format`）。旧消息的回退分支不再附带解释文案。
  - `composer.tsx` 的 `ComposerContext`：去掉 `note` prop 与该段落；只在**完全没有用量**时保留一行空态"暂无用量"（否则弹层里会什么都没有）。
  - `SailorComposerContext.tsx`：不再传 `note`。
- 连带影响（已记录，非缺陷）：图片数量（"含 N 张图片，视觉 token 未单独计量"）原先只在这段文案里出现，现在 UI 不再展示；折算口径同样不再在 UI 里交代，只留在代码注释与验收 README。
- 测试：`tests/composer-context.test.ts` 删除说明文案用例、改为 10 例，并新增静态断言"卡片下方不渲染说明文案（防止再长回来）"；视觉验收新增"卡片不带说明文案"检查（20 项）。
- Verification：feature 增至 9 项，新增 #9（静态 + build）；`--item 9` PASS。截图已重出（卡片现在与官方 demo 一致：四类 + Headroom，无附加文字）。
