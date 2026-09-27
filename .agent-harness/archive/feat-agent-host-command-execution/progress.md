# Agent Progress

## 当前 Active Feature

**feat-agent-host-command-execution** — Agent 宿主命令执行

状态：`done`

---

## Checklist 执行进度

| #   | Action                                         | Verify                                                                                                                  | Status   |
| --- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | 新增 HostCommandExecutor，执行受限真实宿主命令 | `node --test tests/host-command-executor.test.ts`；`pnpm run typecheck`                                                 | done     |
| 2   | 注册 host_exec 并复用工作区权限审批映射        | `node --test --test-name-pattern='host_exec' tests/host-exec-tool.test.ts tests/pi-agent.test.ts`；`pnpm run typecheck` | done     |
| 3   | 扩展审批契约与 assistant-ui 工具注册           | `node --test tests/host-exec-tool-ui.test.ts`；`pnpm run typecheck`                                                     | done     |
| 4   | 真实 Electron 验证 node/npm 与权限模式         | `node tests/host-exec-electron-smoke.mjs`；`pnpm run build`                                                             | done     |
| 5   | 同步架构与 README 文档                         | `rg -n "host_exec                                                                                                       | 宿主命令 | allow-all | allow-edits | allow-reads" docs/architecture.md README.md` | done |

## 执行记录

- 用户确认：宿主命令沿用现有工作区权限选择；`allow-all` 不逐次审批，其他模式沿用 bash 级别审批。
- 用户确认：不把 Agent 接入用户正在使用的终端 tab；保留 main 进程、用户终端和 Pi 虚拟 bash 的边界。
- 收尾修复：`sh`/`dash` 使用 login + `-c`，`zsh`/`bash`/`fish` 使用 login + `-i -c`，避免 POSIX shell 的 `logout` 噪声并保留 nvm 等交互配置加载。

### Checklist #1 — 新增 HostCommandExecutor

- **执行内容**：新增 `src/main/agent/host/HostCommandExecutor.ts`，通过主进程 login shell 在工作区内执行宿主命令，限制命令/输出大小，支持 cwd 越界拒绝、超时、AbortSignal 和进程组终止。
- **TDD evidence**：先运行缺失模块的 Red 测试；实现后 3 个执行器测试 Green，覆盖真实 stdout/stderr/退出码、cwd/取消和输出截断。
- **验证结果**：`node ./.agent-harness/scripts/verify-feature.mjs --feature-id feat-agent-host-command-execution --item 1` 通过。
- **状态**：done
- **时间**：2026-09-27T05:17:20Z（shell 参数修复后重新验证）

### Checklist #2 — 注册 host_exec 并复用权限审批

- **执行内容**：新增 `hostExecTool`，在完整会话中绑定 canonical workspace root；`PiRunner` 将 `allow-all` 映射为自动允许，将 `allow-edits`/`allow-reads` 映射为现有用户审批，侧聊不注册宿主工具；审批续跑继续使用现有 approval ID 和 Harness continuation。
- **TDD evidence**：先验证 host_exec 模块缺失；实现后工具单测与真实 Pi fixture 覆盖默认执行、请求批准和侧聊禁用。
- **验证结果**：`node ./.agent-harness/scripts/verify-feature.mjs --feature-id feat-agent-host-command-execution --item 2` 通过。
- **状态**：done
- **时间**：2026-09-27T04:39:00Z

### Checklist #3 — 扩展审批契约与 assistant-ui 工具注册

- **执行内容**：主进程审批 schema 接受 `host_exec`；assistant-ui toolkit 注册同名工具；审批卡片显示命令和相对工作目录，复用现有一次性允许/拒绝交互。
- **TDD evidence**：先验证新工具显示 JSON fallback 且 IPC 枚举拒绝 `host_exec`；实现后 renderer SSR 和静态契约测试通过。
- **验证结果**：`node ./.agent-harness/scripts/verify-feature.mjs --feature-id feat-agent-host-command-execution --item 3` 通过。
- **状态**：done
- **时间**：2026-09-27T04:40:00Z

### Checklist #4 — 真实 Electron 验证 node/npm 与权限模式

- **执行内容**：新增 Electron main smoke，在真实 Electron 中加载 host_exec，执行宿主 `node` 和 `npm run`，验证工作区 cwd、退出码和三档权限映射。
- **验证结果**：`node ./.agent-harness/scripts/verify-feature.mjs --feature-id feat-agent-host-command-execution --item 4` 通过；构建产物生成成功。
- **状态**：done
- **时间**：2026-09-27T05:18:00Z（shell 参数修复后重新验证）

### Checklist #5 — 同步架构与 README 文档

- **执行内容**：补充 `host_exec` 的主进程边界、真实宿主命令、三档权限映射、输出/超时上限、侧聊禁用，以及它与用户右侧 PTY 的隔离关系；修正 IPC 审批契约和 Skill backend 的过时描述。
- **验证结果**：`node ./.agent-harness/scripts/verify-feature.mjs --feature-id feat-agent-host-command-execution --item 5` 通过。
- **状态**：done
- **时间**：2026-09-27T05:16:00Z

---

## Feature 完成

**feat-agent-host-command-execution** 所有 checklist 项已完成。
状态已由 verifier 更新为 `done`。
