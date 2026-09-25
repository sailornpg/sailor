# Harness Feature

在 `.agent-harness/feature_list.json` 中创建新的 feature 条目。每次只添加一个 feature。

## 触发条件

- 用户说 `/harness-feature`
- 用户说"添加一个新 feature"、"创建任务"、"新增需求"
- 用户提供了一个需求描述，希望作为 feature 跟踪

## 单一信源原则

`.agent-harness/feature_list.json` 是"该做什么"的**唯一权威来源**。

- agent 在会话中的所有工作决策必须从 feature 的 `checklist` 派生。
- 不允许出现 checklist 里没有、但对话中"口头约定"的工作项。
- 如果对话中发现需要新增工作，必须**先更新 checklist 再开始实现**。
- feature 完成的判定标准 = checklist 中所有 item 的 status 都为 `done`。

## 创建时的 Electron 冒烟门槛

凡是会改变运行时行为、页面交互、IPC、持久化、模型流或桌面能力的 feature，创建条目时就必须登记一个专用 Electron 冒烟 checklist：

- `coverage: "e2e"`；
- `test` 写明专用测试路径，例如 `node tests/<feature>-electron.test.mjs`；
- `verify` 包含该冒烟命令或等价可执行 gate；
- `action` 写清真实 Electron 场景和用户可观察断言。

不能先创建一个没有冒烟测试的实现 feature，再在实现结束时补测试。纯文档/设计/static harness feature 可以不做 Electron smoke，但必须在 `coverage_reason` 里明确说明没有可运行功能。

## Schema

每个 feature 条目必须符合以下结构：

| 字段             | 类型               | 必填 | 说明                                                             |
| ---------------- | ------------------ | ---- | ---------------------------------------------------------------- |
| `id`             | string             | 是   | 唯一标识，格式 `以当前任务的摘要英文来作为表示`，不重复          |
| `name`           | string             | 是   | 简短名称                                                         |
| `description`    | string             | 是   | 这个 feature 做什么                                              |
| `status`         | enum               | 是   | `not-started` / `in-progress` / `blocked` / `done` / `cancelled` |
| `checklist`      | array              | 是   | 可验证的交付清单（见下方）                                       |
| `dependencies`   | string[]           | 否   | 必须先完成的 feature IDs                                         |
| `prd_spec`       | string 或 string[] | 否   | 产品需求文档路径，可传多个                                       |
| `trd_spec`       | string 或 string[] | 否   | 技术文档路径，可传多个                                           |
| `interface_spec` | string 或 string[] | 否   | 接口文档路径，可传多个                                           |
| `test_case_spec` | string 或 string[] | 否   | 测试 case / 测试说明文档路径，可传多个                           |

上述四个文档字段既可以是单个路径字符串，也可以是路径数组（一个 feature 关联多篇 PRD/接口文档时用数组）。单篇时两种写法都接受，不强制包成数组。

### Checklist Item 结构

每个 checklist item 必须描述工作、测试覆盖和最终验证 gate：

| 字段              | 类型               | 必填                      | 说明                                                           |
| ----------------- | ------------------ | ------------------------- | -------------------------------------------------------------- |
| `action`          | string             | 是                        | **行为描述**：告诉 agent 做什么                                |
| `coverage`        | enum               | 是                        | `unit` / `integration` / `e2e` / `static` / `manual-exception` |
| `test`            | string             | `coverage: "unit"` 时必填 | 聚焦测试命令；TDD Red/Green 阶段使用                           |
| `verify`          | string 或 string[] | 是                        | 最终验证 gate；可组合 grep、lint、build、全量测试等            |
| `tdd`             | boolean            | 否                        | 按下方「TDD 判定」评估后填写；不填默认 `true`                  |
| `coverage_reason` | string             | 条件必填                  | `static`、`manual-exception` 或 `tdd: false` 时说明原因        |
| `status`          | enum               | 是                        | **当前状态**：`not-started` / `done`                           |

缺少必要字段时，这个 checklist item 不完整，不允许创建。

### TDD 判定（逐项评估，不要一刀切）

`tdd` 不是默认开、随便关，而是**每个 checklist item 单独评估**。判据只有一条：

> **能否在动手实现前，先写出一个「聚焦、确定性、当前必然失败」的自动化测试？**
>
> - 能 → `tdd: true`：先红灯（写测试并看它失败）→ 再绿灯（实现到通过）→ 重构。
> - 不能 → `tdd: false`，并在 `coverage_reason` 里写清**为什么先写不出会失败的测试**（不是"懒得写测试"，是"这类行为无法用廉价的前置断言捕获"）。

**倾向 `tdd: true`（行为可先被断言表达）：**

- 纯逻辑 / 纯函数：给定输入得确定输出（解析、计算、格式转换、状态机)。
- 金额、权限、安全、边界条件等**错了代价高**的路径。
- 修 bug：先写一个能**复现该 bug 的失败用例**,再修到它变绿——这是 bug 修复的默认姿势。
- 契约类改动:入参/出参/字段名可先用断言钉死。

**倾向 `tdd: false`（先写不出有意义的失败测试，或成本远大于收益）：**

- 产出主要靠人眼判断:UI 布局/视觉/文案微调,自动断言写不出真正的验收标准。
- 纯静态接线 / 配置:改 config、注册路由、加依赖注入,没有分支逻辑可断言(通常 `coverage: "static"`)。
- 探索性 spike:目标本身没定,测试无从谈起(定稿后应拆出可 TDD 的正式 item)。
- 一次性胶水 / 一行改动,且已被上层 `verify`(build/lint/全量测试)覆盖。

**判定与 `coverage` 的一致性检查:**

- `coverage: "unit"` 几乎总是 `tdd: true`;若写 `unit` 又 `tdd: false`,基本是矛盾,要么改 coverage,要么给出很强的 `coverage_reason`。
- `coverage: "static"` / `"manual-exception"` 天然 `tdd: false`,`coverage_reason` 已覆盖原因。
- 拿不准时默认 `tdd: true`——先写测试的成本几乎总低于漏测的返工。

示例：

```json
{
  "action": "verify-feature 支持 verify 命令数组并逐条记录 evidence",
  "coverage": "unit",
  "test": "node --test scripts/claude-agents-template.test.mjs --test-name-pattern \"verify array\"",
  "verify": [
    "node scripts/claude-agents-template.test.mjs",
    "rg \"verifyEvidenceList\" templates/verify-feature.mjs"
  ],
  "tdd": true,
  "status": "not-started"
}
```

`verify` 可以是单条命令，也可以是命令数组。推荐数组，因为 verifier 能逐条记录 evidence 并精确指出失败步骤。

## 粒度控制

每个 feature 的范围应当是"一次会话能完成"的大小。

- **建议** checklist 控制在 **3-7 项**。
- 如果用户给的需求包含多个独立模块或页面，agent 必须**主动识别并建议拆分**成多个 feature，给出拆分方案让用户确认后逐个创建。
- 如果 checklist 超过 7 项，agent 必须提醒用户粒度可能太粗，建议拆分。
- 太细也不好（如"添加一个 import"单独成项），每项应该是一个有意义的行为单元。

## 执行步骤

1. 读取 `.agent-harness/feature_list.json`，确认当前已有的 feature 条目和最大 ID。
2. 分析用户的需求描述：
   - 如果需求涉及多个独立模块/页面，主动建议拆分成多个 feature，给出拆分方案让用户确认。
   - 如果需求范围合适，继续下一步。
3. 与用户确认以下信息（无法安全推断时才询问）：
   - `name`：简短名称
   - `description`：feature 描述
   - `checklist`：逐项确认 action、coverage、test、verify、coverage_reason，status 一律设为 `not-started`；`tdd` 按「TDD 判定」**逐项评估**后填写，不要整份 checklist 一个值套到底
   - `dependencies`：是否依赖其他 feature
   - `prd_spec` / `trd_spec` / `interface_spec` / `test_case_spec`：是否有相关文档（一个字段有多篇文档时用数组）
   - Electron 冒烟：运行时 feature 必须提供专用测试路径和核心交互断言；纯文档/设计 feature 记录不适用原因
4. 自动生成下一个 `id`（根据当前feature进行简要命名，如 `feat-add-upload-dialog`）。
5. `status` 默认设为 `not-started`。
6. 将新条目追加到 `.agent-harness/feature_list.json` 的 `features` 数组末尾。
7. 向用户回报创建结果，包含完整的 feature 条目内容。

## 约束

- 不要修改已有 feature 条目。
- `id` 不能与已有条目重复。
- 新 feature 的 `status` 只能是 `not-started`，不允许创建时就标记为其他状态。
- `checklist` 不能为空，至少包含一项。
- 有运行时行为的 feature 必须至少包含一个 `coverage: "e2e"` 的 Electron 冒烟 checklist 项，并提供明确的 `test` 与 `verify` 命令。
- 纯文档/设计 feature 不适用 Electron 冒烟时，必须在 `coverage_reason` 中说明原因。
- 每个 checklist item 的 `action`、`coverage`、`verify`、`status` 字段全部必填。
- `coverage: "unit"` 必须提供可执行 `test`。
- `tdd: false`、`coverage: "static"` 或 `coverage: "manual-exception"` 必须提供 `coverage_reason`。
- `verify` 必须是可执行的验证方式或命令数组（如 `pnpm test`、`pnpm run build`、`rg <pattern> <file>`），不接受模糊描述（如"确认功能正常"）。
- 如果 `.agent-harness/feature_list.json` 不存在或格式异常，告诉用户并停止，不要手工创建文件。
