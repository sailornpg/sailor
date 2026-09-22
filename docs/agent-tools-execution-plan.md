> 历史执行计划：2026-09-21 已删除 Web 搜索与旧本机执行功能及其配置/IPC/执行端。当前工具链以 docs/architecture.md 的 Pi 原生工具为准，本文不再是待执行 scope。

# Agent 基础工具执行计划（已登记）

日期：2026-09-20。用户已确认批量登记，4 个 feature 均已加入 feature_list.json，状态为 not-started；工具尚未实现。 `.agent-harness/feature_list.json` 是唯一执行 scope；本文解释契约，不单独授权额外工作。原有 Composer feature 保持不变。本次按用户明确指令一次登记全部 4 个 feature；实施仍逐个进行。

## 目标与顺序

以“失败后模型和用户知道发生了什么、是否改动、下一步做什么”为首要目标。按只读及反馈基座 → 写入/补丁 → Shell → Web 搜索实施；Web 搜索只依赖第一阶段，可调整实施顺序。每阶段包含真实工具调用、模型反馈、UI 与历史验证，不先堆一批无界面的工具。所有新条目默认 not-started。

不恢复 updatePlan。第一版不含 PTY、常驻开发服务器、容器沙盒、多文件事务补丁、自动回滚、Git 工作区 diff 聚合或 fetch_page。list_files/search_files 是只读定位辅助工具。工具执行、凭据和权限决策留在 main；复用 WorkspaceChats、IpcChatTransport 和原生 UIMessage parts。

## 建议权限边界（随对应 feature 登记确认）

- 文件工具使用主进程解析的工作区根目录；首次启用只读能力后，范围内只读可自动执行。写入授权独立，默认逐调用批准，已明确授予的会话范围不重复询问。越界与敏感路径拒绝；路径验证不等于 OS 沙盒，不承诺抵御恶意宿主并发替换。
- Shell MVP 为用户明确启用的本机非交互执行。cwd 不限制进程访问范围，UI 必须说明本机权限；默认逐调用批准，不按“看起来安全”自动分类任意 Shell 字符串。平台限制由实现及真实终止测试决定。
- 写文件必须明确是创建或覆盖；覆盖和 patch 携带 expectedHash。应用内同路径写入串行化，外部编辑导致版本变化应冲突返回；不宣称消除所有宿主文件系统竞态。
- 搜索服务独立于聊天提供商，建议首接 Tavily（未配置前不发请求）；真实账号/API 选择在搜索阶段定稿，fixture 测试不需要用户密钥。

## 统一结果契约

采用判别联合：`ok: true` 含各工具类型化 data；`ok: false` 含 error。共同字段为 schemaVersion、toolCallId、tool、summary、durationMs、effects、truncated 与可选 artifactRefs。effects.kind 为 none/applied/partial/unknown；只读失败通常 none，Shell 超时不能声称没有副作用。产物 ID 由 main 解析，不接受 renderer 传入任意文件路径。

错误至少包含 code、message、retryable、recovery（结构化建议动作）和安全的 details。稳定 code 供模型决策，中文 message 供 UI 阅读。retryable=false 表示原参数直接重试无意义，不代表修改参数后永远无法恢复。预期领域失败返回结构化结果；未知异常脱敏映射 INTERNAL_ERROR；参数 schema 错误和 SDK 执行异常也需转换为清晰可见的反馈，不能只有“失败”。

```json
{
  "schemaVersion": 1,
  "toolCallId": "call-123",
  "tool": "write_file",
  "ok": false,
  "summary": "未写入 src/app.ts：文件在读取后发生变化",
  "durationMs": 8,
  "effects": { "kind": "none" },
  "truncated": false,
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "当前版本与 expectedHash 不一致，已保留现有文件。",
    "retryable": false,
    "details": { "path": "src/app.ts", "expectedHash": "old-hash", "actualHash": "new-hash" },
    "recovery": [{ "action": "read_file", "path": "src/app.ts", "reason": "读取最新内容后重新生成修改" }]
  }
}
```

成功也不能只返回“成功”：write_file 返回 path/operation/bytesWritten/beforeHash/afterHash；patch 返回 diff 与增删统计；Shell 返回退出码和终止原因；搜索返回来源和获取时间。恢复建议不自动授予执行权限。

初始预算建议：文件单次读取 64 KiB、最多 500 行；搜索最多 100 处命中；文件列表每页 200 项；Shell 默认 30 秒、上限 120 秒、模型输出尾部最多 32 KiB；Web 最多 10 个结果。限制集中配置，在边界测试中固定，不静默截断。完整日志单独保存并设大小/保留策略；产物保存失败必须显式提示，不能返回无效引用。

## UI 与持久化

优先使用 assistant-ui 已提供的 ToolFallback、ToolGroup、工具 render/renderText、审批和 registry 展示组件；缺少业务内容时仅组合薄适配。不开辟另一套工具状态机。区分参数生成、等待授权、执行中、成功、失败、拒绝、停止；进度不可伪装最终成功。尤其 `ok:false` 即使 SDK 将其作为已返回的工具结果，也必须在 UI 显示失败，不能显示绿色“完成”。

默认一行展示动作、目标和结果；展开后显示输入、错误 code、原因、下一步和详细结果。审批/错误保持可见。文件修改区分待应用和已应用；Shell 显示退出码及截断；Web 展示真实来源。原生 UIMessage 保存调用与结果，重启只恢复记录，不重放写入或命令。toModelOutput（若使用）保留错误码、修复动作、引用和截断信息，避免模型只看到无信息摘要。

## 验证策略

每项行为测试先 Red 再 Green；主进程使用临时工作区、本地 HTTP 服务和可控子进程。模拟模型验证“读取 → 写入冲突 → 读取新版本 → 修正写入”，且每步 UI/模型/磁盘结果一致。重点覆盖无副作用失败、部分副作用、取消、审批重放、并发会话、磁盘失败、限流和旧历史。UI 用官方组件组合并进行真实 Electron 桌面/窄窗口验收。

下列测试路径是实施时必须创建的交付物，目前不宣称存在或通过。登记时只校验 checklist schema；实施时逐项通过 verifier 记录 evidence，不能执行不存在的测试后声称已验证。

## 登记时的完整 feature 条目快照

### 结构化反馈与工作区只读工具

```json
{
  "id": "feat-workspace-read-tools",
  "name": "结构化反馈与工作区只读工具",
  "description": "建立工具结果及生命周期契约，打通 list_files、search_files、read_file 与官方 assistant-ui 工具展示。",
  "status": "not-started",
  "dependencies": [],
  "trd_spec": "docs/agent-tools-execution-plan.md",
  "interface_spec": "docs/agent-tools-execution-plan.md",
  "test_case_spec": "docs/agent-tools-execution-plan.md",
  "checklist": [
    {
      "action": "定义并实现结果 schema、错误码、恢复指引、截断信息与副作用状态；覆盖参数无效、未知异常脱敏、失败不伪装成功、模型输出与 UI 摘要一致及预算限制。",
      "coverage": "unit",
      "test": "node --test tests/tool-feedback-contract.test.ts",
      "verify": [
        "node --test tests/tool-feedback-contract.test.ts",
        "pnpm run typecheck"
      ],
      "tdd": true,
      "status": "not-started"
    },
    {
      "action": "按 chatId 在 main 解析并注入 workspace 上下文；实现工作区只读授权及路径验证，覆盖绝对路径、../、目录失效、符号链接越界、敏感文件拒绝、取消及会话隔离；不得向 renderer 暴露通用 fs。",
      "coverage": "integration",
      "test": "node --test tests/workspace-tool-scope.test.ts",
      "verify": [
        "node --test tests/workspace-tool-scope.test.ts",
        "pnpm run typecheck"
      ],
      "tdd": true,
      "status": "not-started"
    },
    {
      "action": "实现 list_files/search_files/read_file：限制文件数/深度/字节数，文本搜索默认按字面量，返回路径/行号/完整文件 hash、分页或截断信息；覆盖空结果、二进制、不存在和权限错误。",
      "coverage": "integration",
      "test": "node --test tests/workspace-read-tools.test.ts",
      "verify": [
        "node --test tests/workspace-read-tools.test.ts",
        "pnpm run typecheck"
      ],
      "tdd": true,
      "status": "not-started"
    },
    {
      "action": "接入 ToolLoopAgent 和原生 UIMessageChunk；优先直接组合官方 ToolFallback/ToolGroup/render/renderText，用最薄适配把结构化失败显示为失败且保留模型恢复信息；覆盖工具失败后模型修正、稳定 toolCallId、历史往返和取消，不恢复 updatePlan。",
      "coverage": "integration",
      "test": "node --test tests/tool-feedback-ui.test.ts",
      "verify": [
        "node --test tests/tool-feedback-ui.test.ts",
        "pnpm run typecheck"
      ],
      "tdd": true,
      "status": "not-started"
    },
    {
      "action": "在真实 Electron 中验收 workspace-read-tools：桌面与窄窗口、运行/成功/错误/停止、后台会话及重启历史；检查错误原因和修复建议可见，清理隔离 fixture，记录截图和实际步骤到 .agent-harness/evidence/workspace-read-tools-acceptance.md；同步 README、architecture 和权限约定后执行全量回归及 clean-state。",
      "coverage": "manual-exception",
      "verify": [
        "test -s .agent-harness/evidence/workspace-read-tools-acceptance.md",
        "rg -n '^Acceptance: PASS$' .agent-harness/evidence/workspace-read-tools-acceptance.md",
        "node --test tests/*.test.ts",
        "pnpm run build",
        "node .agent-harness/scripts/clean-state-check.mjs --skip-verification"
      ],
      "tdd": false,
      "coverage_reason": "视觉清晰度、折叠层级和窄窗口可读性不能用廉价的前置自动断言替代；状态与执行行为由前面各项确定性测试覆盖。证据文件只能在实际验收通过后写 PASS。",
      "status": "not-started"
    }
  ]
}
```

### 可靠文件写入与补丁

```json
{
  "id": "feat-workspace-write-tools",
  "name": "可靠文件写入与补丁",
  "description": "实现 write_file/apply_patch；提供明确副作用、版本冲突和修改结果，避免盲目覆盖。",
  "status": "not-started",
  "dependencies": [
    "feat-workspace-read-tools"
  ],
  "trd_spec": "docs/agent-tools-execution-plan.md",
  "interface_spec": "docs/agent-tools-execution-plan.md",
  "test_case_spec": "docs/agent-tools-execution-plan.md",
  "checklist": [
    {
      "action": "实现工作区写授权和审批恢复，复用 AI SDK toolApproval 与 assistant-ui 现有审批 UI；主进程绑定 chat/run/call、参数摘要及授权范围，覆盖拒绝、过期、重复响应、重启不重放和撤销；授权失效时零写入。",
      "coverage": "integration",
      "test": "node --test tests/tool-write-approval.test.ts",
      "verify": [
        "node --test tests/tool-write-approval.test.ts",
        "pnpm run typecheck"
      ],
      "tdd": true,
      "status": "not-started"
    },
    {
      "action": "实现 write_file：默认只创建，覆盖必须显式模式、授权及 expectedHash；工作区内原子替换、同路径串行化、写前版本复核；覆盖文件已存在、父目录缺失、权限错误、磁盘满、取消与部分/未知副作用，失败不宣称未改动。",
      "coverage": "integration",
      "test": "node --test tests/write-file.test.ts",
      "verify": [
        "node --test tests/write-file.test.ts",
        "pnpm run typecheck"
      ],
      "tdd": true,
      "status": "not-started"
    },
    {
      "action": "实现单文件 apply_patch：使用确定性的补丁解析和完整上下文匹配，拒绝歧义、多文件补丁及版本冲突；成功返回 beforeHash/afterHash、增删行数和 diff 引用；验证解析失败/匹配失败不写文件、并发冲突和重试不会重复应用。",
      "coverage": "integration",
      "test": "node --test tests/apply-patch.test.ts",
      "verify": [
        "node --test tests/apply-patch.test.ts",
        "pnpm run typecheck"
      ],
      "tdd": true,
      "status": "not-started"
    },
    {
      "action": "复用官方工具、代码及 diff 展示能力呈现待应用/已应用/失败、路径和修复动作；有界预览与按需读取完整产物；完整正文不重复注入模型，历史显示保留真实副作用；覆盖结果截断、错误状态与历史恢复。",
      "coverage": "integration",
      "test": "node --test tests/file-change-feedback.test.ts",
      "verify": [
        "node --test tests/file-change-feedback.test.ts",
        "pnpm run typecheck"
      ],
      "tdd": true,
      "status": "not-started"
    },
    {
      "action": "在真实 Electron 中验收 workspace-write-tools：桌面与窄窗口、运行/成功/错误/停止、后台会话及重启历史；检查错误原因和修复建议可见，清理隔离 fixture，记录截图和实际步骤到 .agent-harness/evidence/workspace-write-tools-acceptance.md；同步 README、architecture 和权限约定后执行全量回归及 clean-state。",
      "coverage": "manual-exception",
      "verify": [
        "test -s .agent-harness/evidence/workspace-write-tools-acceptance.md",
        "rg -n '^Acceptance: PASS$' .agent-harness/evidence/workspace-write-tools-acceptance.md",
        "node --test tests/*.test.ts",
        "pnpm run build",
        "node .agent-harness/scripts/clean-state-check.mjs --skip-verification"
      ],
      "tdd": false,
      "coverage_reason": "视觉清晰度、折叠层级和窄窗口可读性不能用廉价的前置自动断言替代；状态与执行行为由前面各项确定性测试覆盖。证据文件只能在实际验收通过后写 PASS。",
      "status": "not-started"
    }
  ]
}
```

### 可取消的本机命令执行

```json
{
  "id": "feat-shell-execution-tool",
  "name": "可取消的本机命令执行",
  "description": "实现 execute_shell 的非交互本机 MVP，明确其不具备沙盒隔离，提供流式反馈和可靠终止。",
  "status": "not-started",
  "dependencies": [
    "feat-workspace-read-tools"
  ],
  "trd_spec": "docs/agent-tools-execution-plan.md",
  "interface_spec": "docs/agent-tools-execution-plan.md",
  "test_case_spec": "docs/agent-tools-execution-plan.md",
  "checklist": [
    {
      "action": "实现显式本机执行模式及默认逐调用批准：展示 command/cwd/timeout，main 绑定审批与参数，不用命令前缀白名单假装沙盒；cwd 必须由工作区解析，环境变量最小化且不传模型凭据；未启用模式不注册执行能力。",
      "coverage": "integration",
      "test": "node --test tests/shell-execution-policy.test.ts",
      "verify": [
        "node --test tests/shell-execution-policy.test.ts",
        "pnpm run typecheck"
      ],
      "tdd": true,
      "status": "not-started"
    },
    {
      "action": "在 ExecutionBackend 使用子进程异步执行，返回 stdout/stderr、exitCode/signal、duration、进程身份和终止原因；覆盖成功、非零退出、spawn 失败、cwd 失效和非交互限制，声明已验证平台，其他平台明确返回 UNSUPPORTED_PLATFORM。",
      "coverage": "integration",
      "test": "node --test tests/shell-execution.test.ts",
      "verify": [
        "node --test tests/shell-execution.test.ts",
        "pnpm run typecheck"
      ],
      "tdd": true,
      "status": "not-started"
    },
    {
      "action": "实现 abort/timeout/退出清理与进程树终止；隔离进程身份并处理退出竞态，停止后不得报告成功；stdout/stderr 有界缓存和日志产物，日志按稳定调用 ID 关联；覆盖大量输出、子进程、两个会话独立停止及重启不自动续跑。",
      "coverage": "integration",
      "test": "node --test tests/shell-lifecycle.test.ts",
      "verify": [
        "node --test tests/shell-lifecycle.test.ts",
        "pnpm run typecheck"
      ],
      "tdd": true,
      "status": "not-started"
    },
    {
      "action": "核验安装版本的工具中间结果到 IPC/assistant-ui 链路，复用官方 Terminal/ToolGroup/ToolFallback 能力；节流显示实时日志、截断提示、退出码及终止原因，非零退出映射结构化失败；模型获得尾部摘要和日志引用。",
      "coverage": "integration",
      "test": "node --test tests/shell-feedback-ui.test.ts",
      "verify": [
        "node --test tests/shell-feedback-ui.test.ts",
        "pnpm run typecheck"
      ],
      "tdd": true,
      "status": "not-started"
    },
    {
      "action": "在真实 Electron 中验收 shell-execution：桌面与窄窗口、运行/成功/错误/停止、后台会话及重启历史；检查错误原因和修复建议可见，清理隔离 fixture，记录截图和实际步骤到 .agent-harness/evidence/shell-execution-acceptance.md；同步 README、architecture 和权限约定后执行全量回归及 clean-state。",
      "coverage": "manual-exception",
      "verify": [
        "test -s .agent-harness/evidence/shell-execution-acceptance.md",
        "rg -n '^Acceptance: PASS$' .agent-harness/evidence/shell-execution-acceptance.md",
        "node --test tests/*.test.ts",
        "pnpm run build",
        "node .agent-harness/scripts/clean-state-check.mjs --skip-verification"
      ],
      "tdd": false,
      "coverage_reason": "视觉清晰度、折叠层级和窄窗口可读性不能用廉价的前置自动断言替代；状态与执行行为由前面各项确定性测试覆盖。证据文件只能在实际验收通过后写 PASS。",
      "status": "not-started"
    }
  ]
}
```

### 可追溯 Web 搜索

```json
{
  "id": "feat-web-search-tool",
  "name": "可追溯 Web 搜索",
  "description": "实现跨聊天模型的 web_search，提供真实来源、明确配置与网络错误，避免空成功。",
  "status": "not-started",
  "dependencies": [
    "feat-workspace-read-tools"
  ],
  "trd_spec": "docs/agent-tools-execution-plan.md",
  "interface_spec": "docs/agent-tools-execution-plan.md",
  "test_case_spec": "docs/agent-tools-execution-plan.md",
  "checklist": [
    {
      "action": "确定并记录首个搜索服务 API 契约和配置项后，实现 main 搜索适配器与安全凭据存储；默认建议 Tavily，实施前核验官方 API、费用与用户配置选择；未配置返回 NOT_CONFIGURED，不能伪造搜索结果；测试使用本地 HTTP fixture。",
      "coverage": "integration",
      "test": "node --test tests/web-search-provider.test.ts",
      "verify": [
        "node --test tests/web-search-provider.test.ts",
        "pnpm run typecheck"
      ],
      "tdd": true,
      "status": "not-started"
    },
    {
      "action": "实现 web_search 的输入、结果 schema 与来源归一化：稳定 sourceId、title/url/snippet/retrievedAt、publishedAt 可选；校验 URL、限制结果数/响应体、超时和取消；区分空结果、认证失败、限流、上游错误与响应无效，提供有限 retryAfterMs。",
      "coverage": "integration",
      "test": "node --test tests/web-search.test.ts",
      "verify": [
        "node --test tests/web-search.test.ts",
        "pnpm run typecheck"
      ],
      "tdd": true,
      "status": "not-started"
    },
    {
      "action": "复用官方 WebSearch/Sources/ToolFallback 能力展示查询与来源；将真实 sourceId 映射至引用，保留历史来源；把检索摘要与网页全文区分，外部内容不进入系统权限指令；验证错误/空结果/正常结果及引用不存在时不生成假链接。",
      "coverage": "integration",
      "test": "node --test tests/web-search-feedback.test.ts",
      "verify": [
        "node --test tests/web-search-feedback.test.ts",
        "pnpm run typecheck"
      ],
      "tdd": true,
      "status": "not-started"
    },
    {
      "action": "在真实 Electron 中验收 web-search：桌面与窄窗口、运行/成功/错误/停止、后台会话及重启历史；检查错误原因和修复建议可见，清理隔离 fixture，记录截图和实际步骤到 .agent-harness/evidence/web-search-acceptance.md；同步 README、architecture 和权限约定后执行全量回归及 clean-state。",
      "coverage": "manual-exception",
      "verify": [
        "test -s .agent-harness/evidence/web-search-acceptance.md",
        "rg -n '^Acceptance: PASS$' .agent-harness/evidence/web-search-acceptance.md",
        "node --test tests/*.test.ts",
        "pnpm run build",
        "node .agent-harness/scripts/clean-state-check.mjs --skip-verification"
      ],
      "tdd": false,
      "coverage_reason": "视觉清晰度、折叠层级和窄窗口可读性不能用廉价的前置自动断言替代；状态与执行行为由前面各项确定性测试覆盖。证据文件只能在实际验收通过后写 PASS。",
      "status": "not-started"
    }
  ]
}
```
