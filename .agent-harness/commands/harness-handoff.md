# Harness Handoff

用于在当前会话结束、上下文过长、需要换 agent / 换会话继续时，生成可恢复的转交摘要。

## 触发条件

- 用户说 `/harness-handoff`
- 用户说“转交当前会话”“生成 handoff”“总结给下一轮 Claude”
- 当前任务未完全结束，但需要让下一会话快速恢复

## 目标

更新 `.agent-harness/session-handoff.md`，让下一轮 agent 只读 `CLAUDE.md` + `.agent-harness/session-handoff.md` + 当前 state，就能知道：

- 当前目标是什么
- 已完成什么
- 验证证据在哪里
- 改过哪些文件
- 做过哪些关键决策
- 还有哪些风险 / blockers
- 下一步应该做什么

## 输入

在写 handoff 前，先读取：

1. `.agent-harness/feature_list.json`
2. `.agent-harness/progress.md`
3. `.agent-harness/lessons.md`
4. `.agent-harness/session-handoff.md`（如果存在）
5. 当前会话中实际修改的文件和已运行的 verification commands

## 执行步骤

1. 确认当前 active feature、状态和 checklist 进度。
2. 汇总本会话完成项，只写和当前任务相关的内容。
3. 记录 verification evidence：命令、结果、失败原因或 baseline blocker。
4. 记录 files changed：路径 + 一句话说明。
5. 记录 decisions made：为什么这么做，替代方案如有则简写。
6. 记录 blockers / risks：未解决问题、需要用户确认的问题、不能声称完成的原因。
7. 写入或覆盖 `.agent-harness/session-handoff.md`。
8. 向用户回报 handoff 已更新，并点出下一会话推荐第一步。

## 输出模板

```markdown
# Session Handoff

## Current Objective

- Goal:
- Current status:
- Branch / commit:

## Completed This Session

- [ ]

## Verification Evidence

| Check | Command | Result | Notes |
|---|---|---|---|
|  |  |  |  |

## Files Changed

-

## Decisions Made

-

## Blockers / Risks

-

## Next Session Startup

1. 阅读 `CLAUDE.md`。
2. 阅读 `.agent-harness/session-handoff.md`。
3. 阅读 `.agent-harness/feature_list.json`、`.agent-harness/progress.md` 和 `.agent-harness/lessons.md`。
4. 根据 Recommended Next Step 继续。

## Recommended Next Step

-
```

## 约束

- handoff 是当前会话的恢复摘要，不是完整历史归档。
- 不把整个 progress.md 复制进去，只提炼下一会话必须知道的信息。
- 不声称未验证的工作已完成；verification 失败要如实记录。
- 如果用户只是要结束已完成 feature，优先提醒可选择 `/harness-archive`。
