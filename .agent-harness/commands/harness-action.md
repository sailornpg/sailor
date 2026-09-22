# Harness Action

从 `.agent-harness/feature_list.json` 中选取一个 feature，逐项执行其 checklist，并将过程实时记录到 `.agent-harness/progress.md`。

## 触发条件

- 用户说 `/harness-action`
- 用户说"开始做"、"继续做"、"执行任务"、"开始开发"
- 用户指定了某个 feature 要求开始实现

## 单一信源原则

- `.agent-harness/feature_list.json` 的 `checklist` 是工作内容的唯一权威来源。
- 不执行 checklist 里没有的工作。如果发现需要额外工作，先更新 checklist 再实现。
- `.agent-harness/progress.md` 是执行过程的实时记录，不能替代 checklist 作为工作定义。

## 执行流程

### 1. 选取 Feature

1. 读取 `.agent-harness/feature_list.json`。
2. 如果用户指定了 feature ID，使用该 feature。
3. 否则，选取第一个 status 为 `in-progress` 的 feature（断点续做）。
4. 如果没有 `in-progress`，选取第一个 status 为 `not-started` 且 dependencies 已满足的 feature。
5. 如果没有可执行的 feature，告知用户并停止。

### 2. 激活 Feature

1. 在改代码前校验 checklist contract：
   - 每个未 done item 必须有 `action`、`coverage`、`verify` 和 `status`。
   - `coverage: "unit"` 必须有可执行 `test`。
   - `verify` 可以是单条命令或命令数组；数组必须逐条可执行。
   - `tdd: false`、`coverage: "static"` 或 `coverage: "manual-exception"` 必须提供 `coverage_reason`。
   - 如果校验失败，停止执行并先修正 `.agent-harness/feature_list.json`，不要进入实现。
2. 将该 feature 的 `status` 更新为 `in-progress`。
3. 更新 `.agent-harness/progress.md`，写入：

```markdown
# Agent Progress

## 当前 Active Feature

**<feature-id>** — <feature-name>

状态：`in-progress`

---

## Checklist 执行进度

| # | Action | Verify | Status |
|---|--------|--------|--------|
| 1 | <action> | <verify> | not-started |
| 2 | <action> | <verify> | not-started |
...

---

## 执行记录

（以下逐项追加）
```

### 3. 逐项执行 Checklist

对每个 status 为 `not-started` 的 checklist item，按顺序执行：

1. **执行 action**：在写生产代码前，先读取 `references/test-driven-development.md`，按其中 TDD 约束执行当前 item；然后按照 `action` 描述完成实现工作。
   - 除非当前 item 显式 `tdd: false` 且提供 `coverage_reason`，否则先进入 Red-Green-Verify-Refactor。
   - **Red**：先写或补测试，运行 `test`，确认它因目标行为缺失而失败。
   - **Green**：写最小实现，重新运行 `test`，确认通过。
   - **Verify**：运行 item 的 `verify` gate；如果是数组，按顺序逐条运行。
   - **Refactor**：只允许当前 checklist item 和当前 feature scope 内的最小整理。公共接口变更、跨模块重构、顺手清理、结构性整理或 checklist 外工作都必须先问用户。
   - 如果无法得到有意义的 Red 失败，停止并请求用户确认，或先把 item 改成 `tdd: false` 并补充 `coverage_reason`。
2. **提交 verifier**：不要手工运行 verify 后直接改状态；统一运行外部 verifier：

```bash
node ./.agent-harness/scripts/verify-feature.mjs --feature-id <feature-id> --item <1-based-index>
```

3. **由脚本更新 checklist status**：verifier 通过时会在 `.agent-harness/feature_list.json` 中将该 item 的 `status` 改为 `done`，并写入 evidence；失败时不会标记 done。
4. **追加执行记录到 `.agent-harness/progress.md`**：

```markdown
### Checklist #N — <action 简述>

- **执行内容**：具体做了什么（改了哪些文件、关键实现细节）
- **TDD evidence**：Red 失败摘要、Green 通过摘要、Refactor 是否执行及其 scope 边界
- **验证结果**：`.agent-harness/scripts/verify-feature.mjs` 的输出摘要
- **状态**：done
- **时间**：<ISO timestamp>
```

5. 同步更新 progress 顶部的 Checklist 表格中对应行的 Status。

### 4. 完成 Feature

当 verifier 已将所有 checklist item 的 status 都更新为 `done` 时：

1. 确认 `.agent-harness/feature_list.json` 中该 feature 的 `status` 已由 verifier 更新为 `done`。
2. 在 `.agent-harness/progress.md` 末尾追加：

```markdown
---

## Feature 完成

**<feature-id>** 所有 checklist 项已完成。
状态已更新为 `done`。

下一步：用户可选择归档（`/harness-archive`）或开始下一个 feature。
```

3. 向用户回报完成情况。

## 约束

- 一次只处理一个 active feature，不要跨 feature 工作。
- 严格按 checklist 顺序执行，除非某项被 block 需要跳过（需告知用户）。
- 每完成一个 checklist item 就立即更新 `.agent-harness/feature_list.json` 和 `.agent-harness/progress.md`，不要攒到最后批量更新。
- 如果某个 checklist item 的 verifier 失败，不要手工标记为 done。修复后重新运行 `/harness-verify`，或告知用户 block 原因。
- 如果执行过程中发现需要额外工作（checklist 没有覆盖的），先暂停实现，提议新增 checklist item 给用户确认，确认后再继续。
- Refactor 阶段不是自由重构许可；任何脱离当前 feature / checklist scope 的整理都必须先问用户。
- 不要修改其他 feature 的内容。
- `.agent-harness/progress.md` 只记录当前 active feature 的执行过程，不追加历史 feature 的内容。
