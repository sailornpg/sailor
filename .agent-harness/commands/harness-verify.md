# Harness Verify

通过外部 verifier 执行 feature checklist 的 `test` 和 `verify` gate，并由脚本更新 `.agent-harness/feature_list.json` 状态。不要手工把 checklist item 或 feature 改成 done。

## 触发条件

- 用户说 `/harness-verify`
- 用户要求“验证这个 feature / checklist item”
- checklist action 已完成，需要把状态从 `not-started` 推进到 `done`

## 执行步骤

1. 读取 `.agent-harness/feature_list.json`，确认 feature 和 checklist item。
2. 如果用户没有指定 feature，选择当前 `in-progress` feature。
3. 如果用户没有指定 item，选择第一个未 done 的 checklist item。
4. 运行：

```bash
node ./.agent-harness/scripts/verify-feature.mjs --feature-id <feature-id> --item <1-based-index>
```

或验证当前 feature 所有未完成项：

```bash
node ./.agent-harness/scripts/verify-feature.mjs --feature-id <feature-id> --all
```

5. 脚本通过时，回报：
   - checklist item 已标记为 `done`
   - `testEvidence`、`verifyEvidence` 或 `verifyEvidenceList` 已写入 item
   - 如果所有 checklist item 都 done，feature 已标记为 `done`
6. 脚本失败时，不要手工改状态；根据 stderr/stdout 修复问题后重新运行 verifier。

## 约束

- 状态转移只能通过 `.agent-harness/scripts/verify-feature.mjs` 完成。
- `coverage: "unit"` 或 `tdd` 非 `false` 的 item 必须有可执行 `test`。
- `verify` 可以是单条命令或命令数组；数组会按顺序逐条执行。
- test / verify 命令必须靠退出码表达成功/失败，不能依赖“无匹配”“看起来正常”等口头解释。
- `|| true` 这类掩盖失败的 verify 不可接受。
- verifier 失败时保留 `lastFailure`，但不把 item 标记为 done。
