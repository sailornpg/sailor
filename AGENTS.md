# AGENTS.md — Agent 协作入口

任何 AI 协作工具进入本项目工作时，请：

1. **先读 [`CLAUDE.md`](./CLAUDE.md)** —— 项目级 AI 协作约定、harness workflow、verification gate 和 scope 规则。
2. **再读项目文档** —— 先读 `README.md` 与 `docs/architecture.md`，其他文档按 `CLAUDE.md` 的 startup workflow 加载。
3. **再读 [`.agent-harness/feature_list.json`](./.agent-harness/feature_list.json)** —— 当前 feature state 和 scope source of truth。
4. **不确定时停下来问** —— 详见 `CLAUDE.md` 的 Escalation / Stop-and-ask 规则。

本文件保留供 Codex / OpenCode 等期望读取 `AGENTS.md` 的工具使用。所有项目级协作规则以 `CLAUDE.md` 为单一信息源，本文件不重复其内容。
