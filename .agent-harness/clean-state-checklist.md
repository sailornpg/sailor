# Clean State Checklist

会话结束前运行 `/harness-clean`，并确认以下条件。缺任何一项，都只能说“已记录 blocker”，不能说 clean handoff。

## 必须满足

- [ ] 标准 verification 已运行：`./.agent-harness/init.sh`
- [ ] `.agent-harness/feature_list.json` 真实反映当前 feature 状态
- [ ] 所有 done checklist item 都有 verifier evidence
- [ ] `.agent-harness/progress.md` 已记录本轮完成项、验证结果、风险和下一步
- [ ] 长会话或换 agent 前已更新 `.agent-harness/session-handoff.md`
- [ ] 没有临时调试文件、日志、补丁残留或注释掉的废代码
- [ ] 下一个 session 可以从 `CLAUDE.md` / Cursor rule + `.agent-harness` state 恢复

## 允许的例外

- 标准 verification 因既有 baseline blocker 失败：必须记录命令、失败摘要、影响范围和下一步。
- 用户明确要求暂停未完成 feature：feature 保持 `in-progress` 或 `blocked`，handoff 写清楚恢复步骤。

## Evidence 模板

```markdown
## Clean State Evidence

- Verification:
- Feature state:
- Progress updated:
- Handoff updated:
- Temporary artifacts:
- Remaining blockers:
```
