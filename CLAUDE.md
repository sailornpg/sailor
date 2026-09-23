# CLAUDE.md — AI 协作主文档

> 这是本项目的「项目级 AI 协作约定」。任何 AI 协作工具进入本项目工作时，必须先读本文档，再开始任务。
>
> `CLAUDE.md` 定规则：怎么启动、怎么保持 scope、怎么验证、什么时候停下来问。项目事实、架构细节和业务背景应放在 README、`docs/`、OpenSpec 或等价文档中，本文只负责路由和 invariants。

---

## 1. 项目背景

用于 Sailor 桌面应用中可靠 agent-assisted development 的 project harness。Sailor 基于 Electron、React、Vercel AI SDK 与 assistant-ui。

新会话快速上手：

1. 先读本文档。
2. 再读 `README.md` 与 `docs/architecture.md`，然后按任务读取其他 specs 或 docs。
3. 若项目已有 overview / product / architecture 文档，以这些文档作为项目事实来源，不要把项目事实硬编码进本文件。

---

## 2. 技术栈与约定

初始化检测结果：

- 项目类型：TypeScript + React。
- 包管理器：pnpm。
- Agent runtime：AI SDK `HarnessAgent` + `@ai-sdk/harness-pi`；本地工作区使用 Pi 默认工具，just-bash ReadWriteFs 挂载项目；原生写入、编辑和 bash 逐次审批。
- Package manifest：`package.json`（sailor）。
- 会话导航浮层：官方 Conversation Map 使用 `@base-ui/react` PreviewCard。
- 关键依赖：`react@19.3.0`、`vite@7.3.6`、`typescript@7.0.2`、`tailwindcss@4.3.3`。
- 可用 scripts：`dev`、`build`、`preview`、`typecheck`。
- Verification entrypoint 会运行：`pnpm run typecheck`、`pnpm run build`。

协作约定：

- 以上技术栈信息由 `harness-creator` 初始化时写入；后续依赖、框架或运行时变化时，同步更新本节。
- 依赖管理遵循已检测到的 package manager，不要混用 npm / pnpm / yarn / bun。
- 新增依赖前必须确认确实需要，并向用户说明原因。
- 框架、SDK 或运行时版本可能和模型训练数据不同；写代码前优先查本仓库已有代码、依赖文档和本地类型定义。

---

## 3. 架构核心原则

- 模型、provider credentials 和未来执行能力只能位于 Electron main process；renderer 不得获得 Node 权限。
- renderer 只通过 sandboxed preload 暴露的 `window.sailor` 窄接口跨进程通信。
- AI SDK 和 assistant-ui API 必须依据当前安装版本的本地类型及官方 `llms.txt` 核验；所有 AI 对话、消息、推理和工具展示统一使用 `components/assistant-ui/elements/` 的 source components/primitives，业务适配放在 `components/chat/`。
- 工作区只能在 main process 按 chatId 解析 canonical root 后挂载；renderer 不得获得通用 fs。Pi 原生 write/edit/bash 每次需明确审批，main 绑定真实 approval ID、chat/call/tool，拒绝过期、伪造和重复响应。使用 Pi 原生覆盖/精确替换语义，不再要求旧工具的 expectedHash/原子补丁契约。历史恢复不得重放写入。just-bash 不运行任意本机程序，当前 agent 不注册 execute_shell。敏感路径与符号链接在挂载边界拒绝。
- 尊重现有分层和模块边界；不要让 UI、API、store、persistence、tooling 等层随意互相调用。
- 修改公共接口、持久化数据、schema、配置契约或跨模块类型时，同步更新对应文档或 state artifact。
- Structured data 用结构化 parser / schema / type 处理，不用脆弱的字符串拼接和正则猜测。
- 不为“将来可能用到”添加抽象；只有它能减少真实复杂度、重复或风险时才抽象。
- 不做与当前 feature 无关的整理、重命名、格式 churn 或重构。

---

### 3.1 页面与组件设计（强制）

**所有新增或修改的页面与组件必须遵循 assistant-ui 的设计语言。使用官方组件只是起点，最终呈现也必须一致。** 此约束覆盖聊天、侧栏、设置、表单、菜单、弹窗及空态。

设计依据：[官方 Design](https://www.assistant-ui.com/design)、[供 Agent 阅读的完整规范](https://www.assistant-ui.com/design.md)、[组件示例](https://www.assistant-ui.com/design/components)。实现 UI 前必须阅读规范及相关组件示例，并检查本地 `components/assistant-ui/elements/surfaces.tsx`、主题 tokens 和已有组件。在线资料不可用时说明限制，依据本地官方 source components 实现，不凭空推测 API。

- **复用优先**：已有官方 Elements / primitives 能满足需求时必须复用；业务适配留在 `components/chat/`。通用控件复用项目现有 `components/ui/` 并遵循官方设计，不能因新增页面另建一套视觉体系。官网内部的 `PageFrame`、type roles 等不是本项目现成 API，使用前先确认本地存在。
- **布局与形状**：页面和全宽区块不包成浮动卡片；通过间距、排版、浅色底和必要的分区细线组织内容，避免层层套框。遵循官方语义圆角：文档内容 6px、按钮和输入 8px、菜单及 popover 10px、dialog 和 toast 12px、composer 和用户气泡 16px；胶囊形仅用于开关、头像和状态点等合适对象，不能作为通用装饰。
- **颜色与文字**：使用项目语义 tokens 和官方 surface helpers，保持低彩度、中性底色及清晰的文字层级；不得逐组件硬编码另一套灰阶或品牌色。强调色表达运行、连接、选中等真实状态，红色表达破坏性操作或错误；代码高亮、图表等数据颜色保留语义。正文使用易读字体和字号，等宽字体用于代码、命令、路径等机器文本，不通过缩小正文解决布局拥挤。
- **边框与阴影**：列表优先用间距和 hover 底色区分行，避免逐行分隔及三层嵌套边框。边框必须显式指定语义颜色（如 `border-border/60`），不能只写 `border` 让 Tailwind 4 回退到深色 currentColor。同一边缘不能堆叠 border、ring 和 shadow；阴影只用于浮层或明确约定的抬升控件，并保持轻微。不能为去掉黑框而全局移除键盘焦点反馈。
- **交互与动效**：保留官方控件的键盘导航、焦点、禁用和可访问名称；动效只解释状态变化或确认操作，不阻碍阅读，并支持 `prefers-reduced-motion`。禁止装饰性渐变、光晕、玻璃效果和彩色图标底块。
- **真实状态**：展示的数据和能力必须有真实来源；loading、空态、失败和未知用量分别表达，不用占位数据伪装成功或制造指标。
- **项目适配与例外**：以上是 Sailor 对官方设计语言的应用，不照搬官网营销布局、字体依赖或全站沙色。保留既有主题与强调色设置；用户已明确指定的白色 composer 加轻阴影、官方上下文用量圆环是有效项目约定。后续用户明确要求的视觉差异应记录为局部例外，不能扩散为全局风格偏移，也不能借规范更新顺手重做无关页面。
- **视觉验收**：UI 变更完成前，必须实际渲染并检查相关页面首屏、完整内容、浅色/深色、窄窗口及关键交互状态；核查溢出、遮挡、边框、焦点和浮层。必要时检查 computed styles，不能只看 class 字符串。类型检查和构建通过不能代替视觉验收；工具不可用时明确记录未验收项，不能声称视觉已通过。

## 4. 代码风格

- 遵循本仓库已有命名、目录结构、组件拆分和测试风格。
- 错误信息要有上下文，不要只写 `failed`、`error` 这类不可定位的信息。
- 不留下无 owner 的 `TODO`、注释掉的废代码、临时 `console.log` 或调试残留。
- 函数注释只解释非显而易见的 why；能从代码直接看出的 what 不写注释。
- 涉及表格列、schema、配置数组等稳定顺序时，默认只追加，不重排已有顺序。

---

## 5. 安全与工具

- LLM 输出、外部 API 响应、用户输入、文件内容都视为不可信输入；跨边界时做类型收窄或 schema 校验。
- 不读取、打印、提交 secrets、token、cookie、`.env`、私钥或凭据文件。
- 工作区读取必须拒绝绝对路径、`..`、越界符号链接和敏感凭据路径，并对返回字节、行数、匹配数与目录页大小设置显式上限；路径校验不等于 OS 沙盒。
- 不运行破坏性 git / shell 命令，除非用户明确要求并且 scope 精确。
- 覆盖已有文件必须得到明确许可；没有 `--force` 的脚本应该默认跳过已有文件。
- 脚本不能隐藏 destructive behavior；会写文件、删文件、迁移数据时必须在命令或文档中明确。

---

## 6. AI 协作规则

### 6.1 Startup Workflow

写代码前：

1. 用 `pwd` 确认 working directory。
2. 完整阅读 `CLAUDE.md`。
3. 如存在项目文档，阅读 `docs/ARCHITECTURE.md`、`docs/PRODUCT.md`、README、OpenSpec、`specs/` 或等价文档。
4. 运行 `./.agent-harness/init.sh`，确认环境健康。
5. 阅读 `.agent-harness/feature_list.json`，了解当前 feature state。
6. ⚠️ **必读** `.agent-harness/lessons.md`：前几轮 session 踩过的坑和被否决的错误决策都沉淀在这里。**跳过 = 大概率重犯已归档错误、重提已被否决的方案。** 动手前必须吸收与当前任务相关的教训；若决定采用与教训不同的方案，先说明原因。读不到该文件时，先告知用户，不得假设已读。
7. 如存在上一轮转交内容，阅读 `.agent-harness/session-handoff.md`。
8. 如果目录是 Git 仓库，用 `git log --oneline -5` 查看最近 commits；否则在 progress/handoff 中记录该限制。

如果 baseline verification 失败，先确认它是否是既有问题。不要把既有失败说成由本次改动修复或引入，除非有证据。

### 6.2 工作模式

| 模式      | 何时进入                           | 行为                                             |
| --------- | ---------------------------------- | ------------------------------------------------ |
| Spec 驱动 | 实现新能力、改业务流程、改公共契约 | 先读已有 spec / docs；缺失时先补设计或向用户确认 |
| 修复驱动  | bug、测试失败、行为异常            | 先定位根因，再写最小修复；不要只修症状           |
| 探索驱动  | 研究、审计、方案比较               | 不写实现代码，输出发现、风险和建议               |

### 6.3 必须停下来问的情形

- 需要新增依赖。
- 需要修改公共接口、数据结构、持久化格式或安全约束。
- 需要删除或重命名多处引用的符号。
- 用户请求和项目文档、spec、feature scope 冲突。
- 看不懂现有代码为什么这样设计，且继续改会有破坏风险。
- baseline verification 重复失败且无法判断是否既有问题。

### 6.4 不要做

- 不顺手做无关优化、整理或大规模格式化。
- 不删除看起来“没用”的代码，除非验证引用和运行路径。
- 不在未确认的情况下改 `.env.example`、CI、部署配置或安全策略。
- 不把多个独立 feature 混在一次修改里。

### 6.5 输出代码时

- 小步修改：一次只解决一个 feature / task / bug。
- 可解释：每段非平凡逻辑都能说明为什么这样写。
- 可测试：纯逻辑优先写成可独立验证的函数；副作用集中在边界。
- 遵守现有模式：优先照着本仓库已有写法扩展，不另起一套风格。

### 6.6 完成任务前自检

- [ ] 修改的代码已按本项目要求运行 verification。
- [ ] UI 变更符合 §3.1 assistant-ui 设计约束，并记录实际视觉验收结果或未验收限制。
- [ ] 涉及 docs / spec / schema / public contract 的修改已同步文档。
- [ ] 没有遗留临时调试、无 owner TODO 或注释掉的废代码。
- [ ] `.agent-harness/feature_list.json` / `.agent-harness/progress.md` 已记录状态和 evidence。

---

## 7. 提交规范

只有用户明确要求时才创建 commit。提交前先确认 working tree，只提交本次 scope 相关文件。

推荐格式：

```text
<type>(<scope>): <subject>

<body, optional>
```

`type` 建议使用：

- `feat`：新增能力
- `fix`：修复 bug
- `refactor`：不改变行为的重构
- `docs`：文档
- `test`：测试
- `chore`：工具、配置、维护

一个 commit 只做一件事，不把无关 feature、spec 和格式化混在一起。

---

## 8. Specs 与 Skills 索引

如果目标仓库存在以下目录，按需读取：

- `openspec/`：能力契约和变更规格。
- `specs/`：详细设计、数据结构、接口、平台约束。
- `docs/`：产品、架构、技术方案、接口说明。
- `.cursor/rules/`：Cursor 项目规则。
- `.cursor/skills/`、`.claude/skills/` 或 `.agents/skills/`：可复用 agent workflow。
- `.agent-harness/commands/`（由本 harness 生成时存在）：通用 feature/action/archive command docs。
- `.agent-harness/lessons.md`：已归档 feature 沉淀出的经验教训。

新增或修改上述文档约束时，要让代码、spec 和 instruction 保持一致。

---

## 9. Harness Workflow

### Working Rules

- **One feature at a time**：从 `.agent-harness/feature_list.json` 中只选择一个未完成 feature。
- **Verification required**：没有通过 `/harness-verify` 或 `.agent-harness/scripts/verify-feature.mjs` 记录 evidence，不要声称完成。
- **Update artifacts**：结束 session 前，更新 `.agent-harness/progress.md` 和 `.agent-harness/feature_list.json`。
- **External state transition**：不要手工把 checklist item 或 feature 改成 done；状态转移由 `.agent-harness/scripts/verify-feature.mjs` 根据 verify 退出码完成。
- **Keep root state light**：`.agent-harness/feature_list.json` 和 `.agent-harness/progress.md` 只保留当前/未归档状态，不把完整历史持续堆在根文件里。
- **Archive only on request**：只有用户明确要求时，才运行 `node ./.agent-harness/scripts/archive-feature.mjs --feature-id <id>`，把历史移到 `.agent-harness/archive/index.json`。
- **Stay in scope**：不要修改与当前 feature 无关的文件。
- **Leave clean state**：下一个 session 必须能立即运行 `./.agent-harness/init.sh`。

### Required Artifacts

- `.agent-harness/feature_list.json` - feature state tracker 和 scope source of truth。
- `.agent-harness/progress.md` - session continuity log。
- `.agent-harness/lessons.md` - archived lessons learned，供后续 session 冷启动参考。
- `.agent-harness/archive/index.json` - archived feature index；单个 feature 的历史快照存放在 `.agent-harness/archive/<feature-id>/`。
- `.agent-harness/init.sh` - 标准 startup 和 verification path。
- `.agent-harness/scripts/verify-feature.mjs` - checklist verify gate 和 feature 状态转移脚本。
- `.agent-harness/scripts/clean-state-check.mjs` - session clean-state gate。
- `.agent-harness/clean-state-checklist.md` - clean-state checklist。
- `.agent-harness/evaluator-rubric.md` - 单轮 agent 输出评估表。
- `.agent-harness/quality-document.md` - 长期代码库/harness 质量快照。
- `.agent-harness/session-handoff.md` - 大型 session 可选 handoff。

### Definition of Done

只有同时满足以下条件，feature 才算 done：

- [ ] 目标行为已实现。
- [ ] 必要 verification 已由 `.agent-harness/scripts/verify-feature.mjs` 实际运行并通过。
- [ ] Evidence 已记录到 `.agent-harness/feature_list.json` 或 `.agent-harness/progress.md`。
- [ ] `/harness-clean` 或 `.agent-harness/scripts/clean-state-check.mjs` 已通过，或 baseline blocker 已记录清楚。
- [ ] Repository 仍可通过标准 startup path 恢复。

### End of Session

结束 session 前：

1. 在 `.agent-harness/progress.md` 中更新当前状态。
2. 在 `.agent-harness/feature_list.json` 中更新 feature status。
3. 记录未解决的 risks 或 blockers。
4. 只有用户明确要求且工作处于安全状态时才 commit。
5. 如果当前会话需要转交或稍后继续，运行 `/harness-handoff` 更新 `.agent-harness/session-handoff.md`。
6. 运行 `/harness-clean`；如果失败，修复或记录 baseline blocker。
7. 保持 repo 足够干净，让下一个 session 能立即运行 `./.agent-harness/init.sh`。

### Verification Commands

```bash
# Full verification
./.agent-harness/init.sh
```

Required checks:

- `pnpm run typecheck`
- `pnpm run build`

### Available Commands

当用户提到以下操作时，阅读对应的 command 文件获取详细执行流程：

| Command            | 文件                                         | 用途                         |
| ------------------ | -------------------------------------------- | ---------------------------- |
| `/harness-feature` | `.agent-harness/commands/harness-feature.md` | 创建新 feature 条目          |
| `/harness-action`  | `.agent-harness/commands/harness-action.md`  | 执行 feature checklist       |
| `/harness-verify`  | `.agent-harness/commands/harness-verify.md`  | 执行 verify 并由脚本更新状态 |
| `/harness-clean`   | `.agent-harness/commands/harness-clean.md`   | 运行 clean-state gate        |
| `/harness-archive` | `.agent-harness/commands/harness-archive.md` | 归档已完成的 feature         |
| `/harness-handoff` | `.agent-harness/commands/harness-handoff.md` | 生成当前会话转交摘要         |

---

## 10. 文档维护

- docs 与代码冲突时，先判断哪个是 source of truth；无法判断就停下来问。
- 修改架构原则、安全约束、公共契约时，要同步更新文档。
- 本文件不堆砌历史决策；过时规则直接删除，历史交给 git。

## assistant-ui

This project uses assistant-ui for chat interfaces.

Documentation: https://www.assistant-ui.com/llms-full.txt

Key patterns:

- Use AssistantRuntimeProvider at the app root
- Preserve the existing WorkspaceChats and IpcChatTransport ownership; adapt each selected Chat through useAISDKRuntime
- Thread component for the chat interface, with Sailor business slots under components/chat/
- Prefer assistant-ui ToolFallback, ToolGroup and built-in approval/tool UI capabilities. Add views under components/chat/tools/ only when domain-specific content requires them; compose existing elements and keep ToolFallback for unknown or retired tools.
- AssistantModal for floating chat widget
- useChatRuntime hook with AI SDK transport

### 首页粒子小船局部约定

- 用户已确认首页采用 R3F（@react-three/fiber 9.8.0）管理 React 场景，Three.js 0.186.0 的单个 Points 绘制粒子；@types/three 0.186.0 为开发依赖。R3F peers 支持当前 React 19.3.0。
- 首页及新会话欢迎区粒子船是用户明确要求的局部视觉例外：鼠标附近粒子向外撑开并复位，采用中性色、规则等距点阵；帆内部波纹从左侧进入并持续向右传播，边缘固定，页面可见时持续请求帧，隐藏时暂停，不扩散为全局装饰动效。
- 减少动态效果或 WebGL 失败时静态回退；隐藏页面暂停、卸载清理资源。相关代码位于 components/home/，不修改模型执行或工作区 IPC 契约。

- 本次规则点阵与默认风帆波纹修订：用户明确指定由其自行视觉验收，agent 仅运行逻辑测试、类型检查和构建，无需截图或视觉验证。
