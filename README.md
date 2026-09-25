# Sailor

Sailor 是一个本地优先的 AI 编程工作区。它用 Electron 提供桌面能力，用 React 和 assistant-ui 渲染聊天界面，用 Vercel AI SDK + Harness Pi 驱动模型、工具和会话恢复。

Sailor 的核心边界是：**模型执行和文件访问只在 Electron main 进程中发生，renderer 只能通过 preload 暴露的类型化 API 访问能力。**

## 能力概览

- 按本地目录组织工作区和会话，支持后台运行、取消、归档、恢复、重命名和删除。
- 配置 DeepSeek 或自定义模型提供商，支持 OpenAI Completions、OpenAI Responses 和 Anthropic Messages。
- 通过 `/models` 获取模型目录，并维护上下文窗口、最大输出 token、推理等级和视觉能力。
- 使用 Pi 原生 `read`、`write`、`edit`、`bash`、`grep`、`glob`、`ls` 工具操作当前工作区。
- 计划 TodoList、`ask_user` 人机协作、工具审批、推理摘要、来源引用和结构化错误反馈。
- 读取图片及 `xlsx`、`docx`、`pdf`、`csv/tsv`、文本附件。
- 通过本地 MCP 搜索公共网页，并在消息中展示来源。
- 右侧面板提供文件浏览、浏览器预览、改动审查、侧边聊天和用户驱动的真实终端。
- 首页和新会话使用粒子小船动画，并在 WebGL 不可用或用户减少动态效果时回退到静态图形。

## 架构

```text
React renderer
  AppShell / workspace sidebar / chat / panels / settings
        │ typed window.sailor API
        ▼
Preload (contextBridge, no Node access)
        │ validated Electron IPC
        ▼
Electron main
  WorkspaceService + WorkspaceStore
  SettingsService + safeStorage
  AgentService + PiRunner
  TerminalService (node-pty)
        │
        ├─ HarnessAgent + AI SDK + Pi
        │    ├─ Pi native tools + just-bash workspace mount
        │    ├─ host tools: update_plan / ask_user / read_document
        │    └─ MCP tools: web_search / fetch_page / research
        └─ UIMessageChunk stream → renderer
```

### 进程职责

| 层             | 职责                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------- |
| `src/main`     | 窗口生命周期、IPC 注册、模型调用、凭据、工作区持久化、文件工具、MCP、PTY。               |
| `src/preload`  | 通过 `contextBridge` 暴露最小的 `window.sailor` API；不暴露通用 filesystem 或 Node API。 |
| `src/renderer` | React 页面、assistant-ui 组件、聊天状态、面板布局、设置和本地 UI 偏好。                  |
| `src/shared`   | IPC channel、Zod schema、UIMessage、工作区、计划、审批、终端和附件等跨进程契约。         |

### 一次聊天请求

1. `WorkspaceChats` 为每个打开的 `chatId` 保留一个 AI SDK `Chat` 实例。
2. `IpcChatTransport` 将发送动作转成 preload IPC，并接收 `UIMessageChunk` 流。
3. `AgentService` 校验 `chatId/runId`、锁定本次模型配置，并协调运行、取消和持久化。
4. `PiRunner` 创建 Harness Pi 会话，恢复 Pi checkpoint，加载 Skills，并运行原生工具和 host/MCP 工具。
5. 工具结果和模型输出一边回传 renderer，一边由 main 重建为 `UIMessage` 保存到工作区。

### 目录结构

```text
src/
├── main/
│   ├── agent/       # AgentService、PiRunner、工具、附件和 MCP
│   ├── ipc/         # IPC handler、输入校验和生命周期清理
│   ├── settings/    # 提供商设置、模型目录和 safeStorage
│   ├── terminal/    # node-pty、会话限制、输出缓冲和终端 IPC
│   └── workspaces/  # 工作区/会话 store、路径策略和文件面板服务
├── preload/         # window.sailor 类型化桥接
├── renderer/src/
│   ├── components/
│   │   ├── assistant-ui/elements/  # 官方 assistant-ui source components
│   │   ├── chat/                   # Sailor 聊天 runtime、composer、thread、工具适配
│   │   ├── layout/                 # 三栏 shell、侧栏和 panel dock
│   │   ├── panels/                 # 文件、终端、浏览器、审查、侧聊
│   │   └── settings/               # 模型和外观设置
│   └── lib/                        # IPC、Chat registry、面板和 UI 状态适配
└── shared/                         # 跨进程类型和结构化契约

tests/                              # 契约、服务、IPC、runtime 和 UI 测试
docs/                               # 架构及专项设计文档
```

## 关键数据和安全边界

- 工作区历史：`app.getPath('userData')/workspaces.json`，包含项目、会话摘要、完整 `UIMessage` parts、计划和运行状态。
- 模型配置：`app.getPath('userData')/model-providers.json`。API key 使用 Electron `safeStorage` 加密，renderer 只看到 `hasApiKey`。
- Pi checkpoint：`app.getPath('userData')/pi-sessions/`。它保存 Pi 的恢复元数据和私有虚拟文件，不保存项目文件。
- 外观、侧栏和面板尺寸等非敏感偏好保存在 renderer 的 versioned `localStorage` 中。
- 工作区路径由 main 根据持久化的 `chatId → projectId → rootPath` 解析；renderer 不能提交任意执行路径。
- 文件工具在挂载边界拒绝绝对路径、越界路径、越界符号链接和敏感凭据文件，并限制扫描、搜索、读取和附件大小。
- Pi 的写入、编辑和 just-bash 每次都需要一次性审批；审批绑定 chat、run、tool call 和原始参数，过期、重复或伪造响应会失败。
- 右侧终端是用户主动打开的真实本机 PTY。它不向模型暴露，也不把输出写入聊天或磁盘；项目目录只是工作目录，不是沙盒。
- renderer 使用 `contextIsolation: true`、`nodeIntegration: false` 和 `sandbox: true`。

## 当前范围

已实现：本地工作区和持久化会话、独立后台运行、模型提供商设置、Pi 原生工具、工具审批、计划与 `ask_user`、文件浏览、附件读取、公共网页搜索、侧边聊天、真实终端和可扩展右侧面板。

暂不实现：云端沙盒、远程工作区同步、自动发现项目目录、全局聊天搜索、聊天跨工作区移动、Git diff 收集，以及应用重启后自动续接正在生成的流。

更完整的进程边界、持久化契约、面板 scope 和运行时细节见 [`docs/architecture.md`](docs/architecture.md)。

## 本地开发

项目使用 `pnpm`（`pnpm@11.1.2`）。

```bash
pnpm install
pnpm dev
```

第一次启动后：

1. 侧栏点击“添加工作区”，选择一个本地项目目录。
2. 打开“设置 → 模型”，填写提供商地址和密钥。
3. 点击“获取可用模型”，选择模型并保存。
4. 在工作区中新建会话即可开始对话。

### 常用命令

```bash
pnpm dev          # Electron 开发模式
pnpm build        # typecheck + electron-vite production build
pnpm preview      # 预览生产构建
pnpm typecheck    # 主进程、preload、renderer 类型检查
pnpm lint         # ESLint + Stylelint
pnpm lint:js      # 只检查 JS/TS
pnpm lint:css     # 只检查 CSS
```

标准启动和验证入口是：

```bash
./.agent-harness/init.sh
```

测试文件使用 Node test runner，可按模块运行，例如：

```bash
node --test tests/workspace-store.test.ts tests/pi-agent.test.ts
```

本地调试 AI SDK telemetry：

```bash
pnpm devtools                 # http://localhost:4983
SAILOR_DEVTOOLS=1 pnpm dev   # 启用 Harness telemetry
```

telemetry 默认关闭，记录写入 `.devtools/`；不要在共享环境或生产环境开启。

## 相关文档

- [`docs/architecture.md`](docs/architecture.md)：完整架构、数据契约和运行时边界。
- [`docs/panels.md`](docs/panels.md)：右侧面板宿主、scope 和布局模型。
- [`docs/file-system-panel.md`](docs/file-system-panel.md)：文件树和只读预览。
- [`docs/side-chat.md`](docs/side-chat.md)：侧边聊天生命周期和上下文继承。
- [`CLAUDE.md`](CLAUDE.md)：项目级协作、验证和安全约定。
