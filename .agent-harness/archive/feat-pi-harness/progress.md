# Session Progress Log

## Current State

**Last Updated:** 2026-09-21T02:12:34.706Z
**Session ID:** [optional]
**Active Feature:** feat-pi-harness

## Pi Harness Checklist

1. Provider 映射与依赖：done（verifier #1 通过）。
2. 本地内部存储、Skills 与工作区权限边界：done（verifier #2 通过）。
3. 原生会话、流式运行、审批与取消：done。
4. 回归、构建与文档：done。

## 迁移决策与验证

- 用户已选择 Pi + 本地目录执行与审批；不使用 Vercel 云沙盒。
- 使用现有主进程文件与命令工具承接工作区副作用，Pi 原生工作区工具禁用以保留 hash/原子写入约束。
- Harness 内部会话和 Skills 存储与用户工作区隔离；不是 OS 沙盒。
- 基线 init.sh 类型检查与构建通过；当前目录不是 Git 仓库。
- 依赖 @ai-sdk/harness 与 @ai-sdk/harness-pi 用于运行用户选择的 Pi runtime。
- #1 Red：Pi 映射缺失；Green：协议、认证隔离、能力与推理映射测试通过，typecheck 通过。pnpm 11 自动生成的 allowBuilds 待决项已显式禁用。
- #2 引入 sandbox-just-bash/just-bash 仅存放内部状态；yaml 用于正确解析 Skills frontmatter，不执行 Skills 附件脚本。
- #2 Red：存储/Skills 加载缺失；Green：虚拟状态恢复、主机文件隔离、越界符号链接和敏感附件测试通过。just-bash 固定为 sandbox adapter 匹配的 2.14.5，typecheck 通过。
- #3 真实 Pi + 本地 HTTP SSE fixture 已验证原生多轮恢复，以及写入审批后只执行一次；其余回归进行中。

## Status

### 已完成

- [ ] No active feature selected

### 进行中

- [ ] Waiting for the next unarchived feature
  - Details: Select the next unarchived feature from `.agent-harness/feature_list.json`
  - Blockers: none

### 下一步

1. Select the next unarchived feature from `.agent-harness/feature_list.json`
2. Update this file when the next active feature starts

## Blockers / Risks

- [ ] None currently

## Decisions Made

- **Active feature archived**: Reset the root progress panel after archiving the current feature
  - Context: Historical detail now lives under `.agent-harness/archive/index.json`
  - Alternatives considered: Keep all historical detail in the root progress file

## Files Modified This Session

- `.agent-harness/progress.md` - reset after archiving the active feature
- `.agent-harness/archive/index.json` - archive index updated

## Evidence of Completion

- [ ] Archive command executed successfully

## Notes for Next Session

Start the next active feature and replace this placeholder state with real progress notes.

- #3 Red：原生多轮、审批、取消与压缩链路缺失；Green：真实 HTTP SSE fixture 通过 Chat/Responses、模型切换、批准/拒绝、重启失效、命令审批、取消、Skills 和自动压缩；typecheck 通过。
- #4 Red：回归前未完成；Green：126 个测试通过，pnpm build 通过，架构与 README 已同步。

## Feature 完成

**feat-pi-harness** 所有 checklist 项已完成，状态由 verifier 更新为 `done`。

下一步：可按需归档。

## Follow-up 修正

- Pi 缺失上下文窗口/最大输出 token 时使用 128000 / 8192 默认值，不再要求用户先填写。
- Harness、Pi、Sandbox 和 just-bash 内部错误统一转换为 `agent 运行失败。`，保留普通 provider 错误与工具输入错误。
- 回归测试：`tests/pi-provider.test.ts`、`tests/agent-errors.test.ts`、typecheck 通过。

## Pi 原生工具与本地挂载（2026-09-21）

- 用户要求先只用 Pi 默认工具，移除生产 tools 封装；不使用付费云沙盒。
- 生产 tools 目录已移除，工作区 scope 移至 workspaces。旧工具仅作为 tests/fixtures/legacy-tools 下的历史回归夹具，生产无引用。
- ReadWriteFs 挂载真实项目，私有会话文件留在内存并独立 checkpoint；默认工具读写直接落盘。保留敏感路径与符号链接限制，拒绝绕过逐文件过滤的目录批量修改。
- 原生 write/edit/bash 使用 allow-reads 审批，main 绑定 approval/chat/run/call/tool、5 分钟有效期和一次性响应；取消、新提示、重启不能续用旧审批。
- 根因：旧工具名白名单拒绝原生 write 审批，复现了“Pi 返回了无法绑定的审批请求。”；IPC 白名单、历史 schema、审批续跑均已切换原生工具。
- 旧 expectedHash/原子 patch 不再是原生工具契约；write 覆盖、edit 精确替换。execute_shell/web_search 暂不注册。just-bash 不能运行任意本机可执行程序。
- verifier checklist #5 通过：12 项 Pi runtime/storage 测试及 workspace IPC、类型检查、构建。
- 全量回归 129 项：128 通过，1 项既有失败。tests/assistant-ui-boundaries.test.ts:46 只匹配单引号 import，而当前 SailorComposer 使用双引号；在此次目录移动和审批修改前的首次全量回归已出现，同一错误保持不变。本次不修改无关 Composer 源码。
- 当前目录无 .git；未提交。未使用真实外部 Provider 或运行云端沙盒。
