# Harness Clean

运行 clean-state gate，确认当前会话可以安全结束或交接。清洁状态是完成定义的一部分，不是可选善后。

## 触发条件

- 用户说 `/harness-clean`
- 用户要求“收尾”“结束 session”“确认可以交接”
- feature 已完成，需要证明下一个 session 能恢复

## 执行步骤

1. 阅读 `.agent-harness/clean-state-checklist.md`。
2. 确认 `.agent-harness/feature_list.json`、`.agent-harness/progress.md`、`.agent-harness/session-handoff.md` 是否反映当前状态。
3. 运行：

```bash
node ./.agent-harness/scripts/clean-state-check.mjs
```

如果只想先做结构检查、不跑标准 verification：

```bash
node ./.agent-harness/scripts/clean-state-check.mjs --skip-verification
```

4. 如果 clean check 失败：
   - 不要声称 session clean。
   - 修复失败项或记录 blocker。
   - 重新运行 clean check。
5. 通过后，向用户回报 clean-state evidence。

## 约束

- clean check 失败时，feature 可以保持 done，但 session 不能称为 clean handoff。
- 不要用删除 evidence、削弱 verify 或跳过 state 更新的方式让 clean check 通过。
- 如果标准 verification 因既有 baseline blocker 失败，要在 `.agent-harness/progress.md` 和 handoff 中明确记录。
