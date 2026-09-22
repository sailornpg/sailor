# Agent Progress

## 当前 Active Feature

**feat-web-search-tool** — 可追溯 Web 搜索

状态：`done`

---

## Checklist 执行进度

| # | Action | Verify | Status |
|---|--------|--------|--------|
| 1 | Tavily API 契约、main 适配器与安全凭据配置 | provider tests、typecheck | done |
| 2 | web_search schema、来源归一化与错误处理 | web-search tests、typecheck | done |
| 3 | WebSearch/Sources/ToolFallback 展示与引用 | feedback tests、typecheck | done |
| 4 | 真实 Electron 验收、文档与全量回归 | acceptance、tests、build、clean-state | done |

---

## 执行记录

- 2026-09-20：切换到 `feat-web-search-tool`；checklist contract 校验通过，依赖 `feat-workspace-read-tools` 已完成。Baseline `./.agent-harness/init.sh` 通过；目录不是 Git 仓库。
- 2026-09-20：核验 Tavily 官方契约：`POST https://api.tavily.com/search`，Bearer API key；basic 搜索 1 credit，官方当前提供每月 1000 免费 credits 且无需信用卡。按 feature 默认建议选择 Tavily，凭据与聊天模型独立保存并仅在 main process 解密。

### Checklist #1 — Tavily API 契约、main 适配器与安全凭据配置

- **执行内容**：设置文件升级至 version 3，支持 v1/v2 迁移、Tavily 密钥加密保存、空值保留与无明文快照；新增 Tavily basic 搜索适配器和本地 HTTP fixture 验证。
- **TDD evidence**：Red 因 `TavilySearchProvider.ts` 缺失而失败；Green 的 4 个 provider 测试通过。期间修正 Node strip-only 不支持 TypeScript 参数属性的问题；未执行清单外重构。
- **验证结果**：`verify-feature.mjs --feature-id feat-web-search-tool --item 1` 输出 `PASS`，provider tests 与 `pnpm run typecheck` 均通过。
- **状态**：done
- **时间**：2026-09-20T23:19:14+08:00

### Checklist #2 — web_search schema、来源归一化与错误处理

- **执行内容**：新增 `web_search` 输入及来源 schema、稳定 URL hash sourceId、10 条结果/500 字查询/2 MiB 响应/10 秒超时上限；接入 agent 工具注册；分类未配置、空结果、认证、限流、上游、无效响应、超时和取消，并限制 `retryAfterMs` 至 60 秒。
- **TDD evidence**：Red 因 `WebSearchTool.ts` 缺失而失败；Green 的 6 个边界与集成测试通过。测试加载改用项目 Vite 转换链以匹配既有 TypeScript 运行方式；未执行清单外重构。
- **验证结果**：`verify-feature.mjs --feature-id feat-web-search-tool --item 2` 输出 `PASS`，web-search tests 与 `pnpm run typecheck` 均通过。
- **状态**：done
- **时间**：2026-09-20T23:42:26+08:00

### Checklist #3 — WebSearch/Sources/ToolFallback 展示与引用

- **执行内容**：从 assistant-ui 官方 registry 引入 WebSearch 与 Sources，组合现有 ToolFallback；成功结果追加经 schema 验证的原生 `source-url` chunks，真实 sourceId/URL 随历史持久化，无效引用不生成链接；搜索摘要不作为系统权限指令。
- **TDD evidence**：Red 由缺少 `webSearchFeedback.ts`、source stream 映射和专用工具展示产生；Green 的 4 个反馈/引用/渲染测试通过。仅对官方组件做动态中文计数与本地组合，不做清单外 UI 重构。
- **验证结果**：`verify-feature.mjs --feature-id feat-web-search-tool --item 3` 输出 `PASS`，feedback tests 与 `pnpm run typecheck` 均通过。
- **状态**：done
- **时间**：2026-09-20T23:50:43+08:00

### Checklist #4 — 真实 Electron 验收、文档与全量回归

- **执行内容**：新增 Web 搜索设置页与窄 IPC；真实 Electron 使用隔离 profile 和本地模型/Tavily fixture 验收桌面/720×900、成功、认证错误、超时、停止、后台未读与重启历史；同步 README、architecture 和权限边界，截图及步骤记录于 `web-search-acceptance.md`。
- **TDD evidence**：本项按 checklist 标记为 manual-exception；状态行为由前 3 项自动测试覆盖，视觉和端到端行为使用真实 Electron 验收。验收发现并修正自动化的窄窗口截图方式和多轮 fixture 路由，不改变生产行为。
- **验证结果**：`verify-feature.mjs --feature-id feat-web-search-tool --item 4` 输出 `PASS`；119/119 tests、生产 build、acceptance evidence 与 clean-state 全部通过。
- **状态**：done
- **时间**：2026-09-21T00:53:32+08:00

---

## Feature 完成

**feat-web-search-tool** 所有 checklist 项已完成。
状态已更新为 `done`。

下一步：用户可选择归档（`/harness-archive`）。
