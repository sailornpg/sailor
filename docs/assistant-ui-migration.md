# assistant-ui 聊天 UI 迁移设计

状态：待实现。范围和完成状态以 `.agent-harness/feature_list.json` 中 `feat-assistant-ui-migration` 为准；本文解释该 feature 的目录和验收设计，不独立扩展 scope。

## 目标与边界

将现有 AI Elements 聊天界面完整迁移到 assistant-ui，保留中文文案、主题、模型配置、多会话并发、定向停止和历史恢复。后续 AI 消息、工具和交互展示统一使用 assistant-ui primitives/elements。

本次不新增附件上传、编辑/重新生成/分支、审批、搜索、语音、云端存储、文件执行或终端能力。现有附件消息仍能展示。设置、工作区分组侧栏和检查器属于应用布局，继续使用通用 UI；不为迁移强行引入第二套会话目录管理。

## 文件组织

```text
src/renderer/src/
├── components/
│   ├── assistant-ui/
│   │   └── elements/               # CLI 源组件，沿用 registry 的 *.aui.tsx 命名
│   │       ├── thread.aui.tsx       # 通用 Thread/消息/Composer 骨架
│   │       ├── markdown-text.aui.tsx
│   │       ├── reasoning.aui.tsx
│   │       ├── tool-fallback.aui.tsx
│   │       └── …                   # 只引入实际使用的 registry 组件
│   ├── chat/
│   │   ├── ChatWorkspace.tsx       # 页面组合、标题和工作区上下文
│   │   ├── runtime/
│   │   │   └── SailorChatProvider.tsx # useChat({ chat }) → useAISDKRuntime
│   │   ├── thread/
│   │   │   └── SailorThread.tsx    # 接入消息渲染、空状态和 Composer
│   │   ├── composer/
│   │   │   ├── SailorComposer.tsx  # 发送/停止、模型、推理等级、禁用逻辑
│   │   │   └── ModelSelector.tsx  # 现有设置契约接入新库展示
│   │   ├── messages/
│   │   │   ├── SailorMessage.tsx  # 正文、附件、推理摘要和过程组合
│   │   │   └── MessageProcess.tsx # 可审计工具过程，不混为模型推理
│   │   └── tools/
│   │       └── （按需）           # 优先复用官方 ToolFallback / ToolGroup；专用展示按需注册
│   ├── layout/                    # 工作区分组/窗口/检查器，不迁移其业务状态
│   ├── settings/                  # 提供商和外观设置
│   └── ui/                        # 通用 shadcn/Radix 基础组件
└── lib/
    ├── WorkspaceChats.ts          # 按 chatId 保有 Chat 实例，跨视图挂载存活
    ├── IpcChatTransport.ts         # 原有 AI SDK stream ↔ preload 窄接口
    ├── messageProjection.ts       # 推理摘要纯投影逻辑
    └── processProjection.ts       # 工具过程纯投影逻辑
```

目录表达职责；仅在有实际实现时创建文件，不创建空层、不将现有 lib 全盘搬家。registry 下载的真实文件名以选定版本为准。通用 assistant-ui 源组件不导入 `window.sailor`、主进程、WorkspaceChats 或 Sailor 设置服务；业务适配留在 `chat/`。避免逐组件无意义包裹，只在组合或业务契约不同处增加 Sailor 组件。

## Runtime 与数据所有权

- 保持 `WorkspaceChats → Chat<UIMessage> → IpcChatTransport → window.sailor → main` 链路；以 `useAISDKRuntime(useChat({ chat }))` 为首选集成方式。安装后依据实际导出和类型验证，不照搬默认 HTTP 示例。
- Provider 生命周期可以跟随当前视图，Chat/流生命周期必须独立；实测卸载是否触发取消，若 adapter 有清理行为则调整 provider 挂载策略。
- 不建立镜像 messages store，不引入 Assistant Cloud，不改变 `workspaces.json` 和共享 IPC 契约。assistant-ui 消息结构仅为展示适配。
- 提交前保留 runBusy、saveError 和空输入保护；停止只能针对选定 chat/run；主进程仍固定每次调用的模型及推理参数。
- 将 SDK 状态到 assistant-ui 的投影、相邻消息合并、未知工具、部分工具输入和错误状态列为兼容性检查；保留稳定消息 ID 与 toolCallId。
- 核验 `@assistant-ui/react`、`@assistant-ui/ai-sdk`、Markdown 组件依赖的 peer 范围后用 pnpm 安装。执行前说明实际新增依赖用途。CLI 只引入所需组件，审查覆盖和全局样式变化。
- 工具执行继续放在 `src/main/agent/tools/`，契约继续放在 `src/shared/`；renderer registry 只注册展示，不引入前端执行能力。

## 完成标准与测试组织

1. `tests/assistant-ui-runtime.test.ts`：通过实际适配层验证消息订阅、切换时后台生成不断、两个会话并发互不污染、停止定向、saveError 禁止发送和恢复后继续。不能仅复制 WorkspaceChats 既有测试或断言源码字符串。
2. `tests/assistant-ui-message-rendering.test.ts`：以真实消息 fixtures 验证流式文本、中文、代码块、附件、推理摘要、工具 partial input/成功/错误/拒绝、未知及已移除工具的通用 fallback；检查摘要与过程语义分离。合理复用现有 projection 测试。
3. `tests/assistant-ui-boundaries.test.ts`：禁止 renderer 导入 ai-elements；确认旧目录移除；检查通用 assistant-ui 组件无业务 IPC/主进程依赖，避免仅替换目录名。
4. 以上为计划新增测试路径，由对应 checklist 实现时先创建测试并执行 Red，再实现。采用当前 Node test + 项目实际 TS/TSX 构建链；仅当需要挂载 React 才选择必要测试依赖并说明用途。
5. 真实 Electron 在 1440×900 和 720×900 验收，使用隔离 profile/可控模型 fixture：发送、停止、切换/双会话后台生成、重启恢复、保存失败重试、模型/推理选择、主题、Markdown/历史工具/未知工具/错误及滚动和键盘。不读取用户密钥、不污染用户历史。
6. 人工验收证据写入 `.agent-harness/evidence/assistant-ui-migration-acceptance.md`，包含环境、步骤、期望/实际结果、截图路径、失败项及清理记录。只有全部场景通过才写独立一行 `Acceptance: PASS`；文件存在或该标记本身不能代替真实验收。
7. 移除旧目录前全局检查引用；只移除旧 UI 独占依赖，按实际引用保留 shiki/motion 等共享依赖。更新 README、architecture、package 描述和 CLAUDE 的当前 UI 规则；历史 archive/evidence 不改写。

注册 feature 时不视为已实现，不执行未来测试 gate，不产生完成 evidence。实现结束使用 verifier 逐项记录 gate，再运行 clean-state。
