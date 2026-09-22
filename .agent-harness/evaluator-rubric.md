# Evaluator Rubric

用于评估一次 agent 输出是否可接受。评分前先读取 `.agent-harness/feature_list.json`、`.agent-harness/progress.md` 和本次变更。

| 维度 | 0 分 | 1 分 | 2 分 |
|---|---|---|---|
| Correctness | 未实现目标行为 | 部分实现或边界不清 | 目标行为已实现 |
| Verification | 未运行 verify | 只运行部分检查或 evidence 不完整 | verify 由 `.agent-harness/scripts/verify-feature.mjs` 通过并记录 evidence |
| Scope Discipline | 明显越界 | 有少量无关改动 | 严格围绕 active feature |
| Reliability | 重启/重跑路径不清 | 有已记录风险 | 标准启动和恢复路径明确 |
| Maintainability | 难以接手 | 基本可读但说明不足 | 下一轮 agent 可直接接手 |
| Handoff Readiness | 没有更新 state | state 部分更新 | progress/handoff/clean evidence 完整 |

## 结论

- **Accept**：总分 >= 10 且 Verification = 2。
- **Revise**：总分 7-9，或 Verification = 1。
- **Block**：总分 < 7，或 Verification = 0，或 clean-state check 失败且无 baseline blocker 说明。

## 使用约束

- 不要让实现同一个任务的 agent 只凭自评通过；复杂任务应由 reviewer 或下一轮 agent 使用本 rubric。
- 发现缺失 verify 时，优先补 verify，不要只补说明。
