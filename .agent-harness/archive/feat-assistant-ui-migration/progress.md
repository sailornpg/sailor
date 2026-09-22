# Archived Feature Progress

## Archived Metadata

**Archived At:** 2026-09-20T08:49:09.554Z
**Feature ID:** feat-assistant-ui-migration
**Feature Name:** 聊天 UI 全量迁移至 assistant-ui
**Archived Status:** done
**Archive Source:** `.agent-harness/feature_list.json`
**Active Feature At Archive Time:** feat-assistant-ui-composer

## Archive Note

This feature was not the active progress panel at archive time.
This archive progress file is a structured summary synthesized from `.agent-harness/feature_list.json`.

## Feature Summary

按 docs/assistant-ui-migration.md 的目录与边界迁移全部现有 AI Elements 聊天展示，保留 Electron IPC、UIMessage 持久化和多会话后台运行，并确立后续 AI 展示统一使用 assistant-ui 的规则。

## Dependencies

- none

## Evidence

Verified by .agent-harness/feature_list.json checklist at 2026-09-20T07:32:03.173Z

## Additional Fields Snapshot

```json
{
  "checklist": [
    {
      "action": "按迁移设计核验并安装兼容依赖，建立 assistant-ui/elements 与 chat 分层；用 useAISDKRuntime 接入既有 Chat 和 IPC，保留数据及安全契约。",
      "coverage": "static",
      "verify": "pnpm run typecheck",
      "tdd": false,
      "coverage_reason": "依赖选型和 provider 接线无独立分支行为；类型检查负责接线，下一项验证实际生命周期。",
      "status": "done",
      "verifyEvidence": {
        "command": "pnpm run typecheck",
        "verifiedAt": "2026-09-20T06:54:02.005Z",
        "exitCode": 0,
        "stdout": "",
        "stderr": "$ tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json"
      },
      "evidence": {
        "command": "pnpm run typecheck",
        "verifiedAt": "2026-09-20T06:54:02.005Z",
        "exitCode": 0,
        "stdout": "",
        "stderr": "$ tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json"
      }
    },
    {
      "action": "实现并测试 runtime/composer 业务适配：会话切换与卸载不取消后台生成、双会话隔离、定向停止、空输入及运行中/保存失败发送保护、错误恢复；保留模型和推理参数语义。",
      "coverage": "integration",
      "test": "node --test tests/assistant-ui-runtime.test.ts",
      "verify": [
        "node --test tests/assistant-ui-runtime.test.ts",
        "node --test tests/workspace-chat-lifecycle.test.ts tests/workspace-ipc.test.ts tests/workspace-store.test.ts tests/reasoning-selection.test.ts"
      ],
      "tdd": true,
      "status": "done",
      "testEvidence": {
        "command": "node --test tests/assistant-ui-runtime.test.ts",
        "verifiedAt": "2026-09-20T06:56:22.410Z",
        "exitCode": 0,
        "stdout": "✔ composer policy blocks invalid submissions and clears a recoverable error (61.268334ms)\n✔ stop targets the persisted run and otherwise delegates to the active chat (14.389416ms)\n✔ workspace registry keeps stable isolated Chat instances while selection changes (3550.289166ms)\nℹ tests 3\nℹ suites 0\nℹ pass 3\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 3770.368625",
        "stderr": ""
      },
      "verifyEvidenceList": [
        {
          "command": "node --test tests/assistant-ui-runtime.test.ts",
          "verifiedAt": "2026-09-20T06:56:29.793Z",
          "exitCode": 0,
          "stdout": "✔ composer policy blocks invalid submissions and clears a recoverable error (58.444833ms)\n✔ stop targets the persisted run and otherwise delegates to the active chat (3570.499583ms)\n✔ workspace registry keeps stable isolated Chat instances while selection changes (3601.487ms)\nℹ tests 3\nℹ suites 0\nℹ pass 3\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 7357.704541",
          "stderr": ""
        },
        {
          "command": "node --test tests/workspace-chat-lifecycle.test.ts tests/workspace-ipc.test.ts tests/workspace-store.test.ts tests/reasoning-selection.test.ts",
          "verifiedAt": "2026-09-20T06:56:50.484Z",
          "exitCode": 0,
          "stdout": "✔ exposes only supported reasoning efforts in stable UI order (0.802125ms)\n✔ creates an agent request carrying the selected reasoning effort (0.201375ms)\n✔ 同/跨工作区并行，切换不终止，后台保存完整输出和未读状态 (575.347583ms)\n✔ 同会话重复提交被拒绝；停止一个不会停止另一个并保留部分输出 (2780.996333ms)\n✔ 保存失败保留内存消息与错误，可重试且不影响另一会话 (3980.828167ms)\n✔ renderer 实例跨视图保留，快速切换只采用最后一次选择 (3974.0985ms)\n✔ 取消后的未完成工具 parts 保留历史且可安全续聊 (2174.18525ms)\n✔ 恢复中断运行不自动调用模型，运行前异常仍释放会话锁 (3255.769167ms)\n✔ 切换视图不等待偏好写盘，偏好失败不会阻止访问其他会话 (3721.37725ms)\n✔ 取消目录选择无记录，选择后可创建并读取会话 (4216.725041ms)\n✔ 根据 chatId 解析真实目录，拒绝非法消息和不存在会话 (3932.70575ms)\n✔ 目录失效可读历史，但禁止运行；恢复消息用 SDK 验证 (3969.379209ms)\n✔ 真实目录去重，包括符号链接；取消外的无效目录不能注册 (4197.259417ms)\n✔ 会话外键、首条标题限长、完整 parts 和偏好在重启后恢复 (3939.85225ms)\n✔ 并发写入不丢会话，旧 run 不能覆盖新 run (3999.6895ms)\n✔ 损坏和非法外键文件不被覆盖 (3832.731292ms)\nℹ tests 16\nℹ suites 0\nℹ pass 16\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 20661.930125",
          "stderr": ""
        }
      ],
      "evidence": {
        "command": "node --test tests/assistant-ui-runtime.test.ts && node --test tests/workspace-chat-lifecycle.test.ts tests/workspace-ipc.test.ts tests/workspace-store.test.ts tests/reasoning-selection.test.ts",
        "verifiedAt": "2026-09-20T06:56:50.484Z",
        "exitCode": 0,
        "stdout": "✔ composer policy blocks invalid submissions and clears a recoverable error (58.444833ms)\n✔ stop targets the persisted run and otherwise delegates to the active chat (3570.499583ms)\n✔ workspace registry keeps stable isolated Chat instances while selection changes (3601.487ms)\nℹ tests 3\nℹ suites 0\nℹ pass 3\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 7357.704541\n✔ exposes only supported reasoning efforts in stable UI order (0.802125ms)\n✔ creates an agent request carrying the selected reasoning effort (0.201375ms)\n✔ 同/跨工作区并行，切换不终止，后台保存完整输出和未读状态 (575.347583ms)\n✔ 同会话重复提交被拒绝；停止一个不会停止另一个并保留部分输出 (2780.996333ms)\n✔ 保存失败保留内存消息与错误，可重试且不影响另一会话 (3980.828167ms)\n✔ renderer 实例跨视图保留，快速切换只采用最后一次选择 (3974.0985ms)\n✔ 取消后的未完成工具 parts 保留历史且可安全续聊 (2174.18525ms)\n✔ 恢复中断运行不自动调用模型，运行前异常仍释放会话锁 (3255.769167ms)\n✔ 切换视图不等待偏好写盘，偏好失败不会阻止访问其他会话 (3721.37725ms)\n✔ 取消目录选择无记录，选择后可创建并读取会话 (4216.725041ms)\n✔ 根据 chatId 解析真实目录，拒绝非法消息和不存在会话 (3932.70575ms)\n✔ 目录失效可读历史，但禁止运行；恢复消息用 SDK 验证 (3969.379209ms)\n✔ 真实目录去重，包括符号链接；取消外的无效目录不能注册 (4197.259417ms)\n✔ 会话外键、首条标题限长、完整 parts 和偏好在重启后恢复 (3939.85225ms)\n✔ 并发写入不丢会话，旧 run 不能覆盖新 run (3999.6895ms)\n✔ 损坏和非法外键文件不被覆盖 (3832.731292ms)\nℹ tests 16\nℹ suites 0\nℹ pass 16\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 20661.930125",
        "stderr": ""
      }
    },
    {
      "action": "按设计拆分 Thread、Composer 和消息组件，用 assistant-ui 替换会话、滚动、输入、发送/停止、模型选择、正文/附件与推理摘要展示；保持中文和主题，隐藏未获后端支持的编辑/重新生成/分支等入口。",
      "coverage": "static",
      "verify": "pnpm run build",
      "tdd": false,
      "coverage_reason": "组件布局与视觉组合无法用廉价的前置失败断言完整表达；构建验证接线，消息行为和真实交互由后续项验收。",
      "status": "done",
      "verifyEvidence": {
        "command": "pnpm run build",
        "verifiedAt": "2026-09-20T07:03:43.572Z",
        "exitCode": 0,
        "stdout": "vite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 16 modules transformed.\nrendering chunks...\nout/main/index.js  35.08 kB\n✓ built in 71ms\nvite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 2 modules transformed.\nrendering chunks...\nout/preload/index.cjs  2.52 kB\n✓ built in 6ms\nvite v7.3.6 building client environment for production...\ntransforming...\n✓ 3076 modules transformed.\nrendering chunks...\n../../out/renderer/index.html                     1.43 kB\n../../out/renderer/assets/index-DJ8_xtRi.css    143.69 kB\n../../out/renderer/assets/index-CfbLGeod.js   2,775.56 kB\n✓ built in 2.52s",
        "stderr": "$ pnpm run typecheck && electron-vite build\n$ tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js (74:0): A comment\n\n\"/** Anchors a pattern source. The interpolation lives here rather than at the call site because\n * esbuild will not drop a `@__PURE__` call whose own argument interpolates a variable, but it\n * will drop `anchor(dateSource)`. Keeping it inline pinned `date` into every bundle. */\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js (400:0): A comment\n\n\"// Wrapped in a `@__PURE__` IIFE: esbuild never tree-shakes a top-level initializer that contains a member access on `Number`, so the bare object literal survived into every bundle.\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues."
      },
      "evidence": {
        "command": "pnpm run build",
        "verifiedAt": "2026-09-20T07:03:43.572Z",
        "exitCode": 0,
        "stdout": "vite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 16 modules transformed.\nrendering chunks...\nout/main/index.js  35.08 kB\n✓ built in 71ms\nvite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 2 modules transformed.\nrendering chunks...\nout/preload/index.cjs  2.52 kB\n✓ built in 6ms\nvite v7.3.6 building client environment for production...\ntransforming...\n✓ 3076 modules transformed.\nrendering chunks...\n../../out/renderer/index.html                     1.43 kB\n../../out/renderer/assets/index-DJ8_xtRi.css    143.69 kB\n../../out/renderer/assets/index-CfbLGeod.js   2,775.56 kB\n✓ built in 2.52s",
        "stderr": "$ pnpm run typecheck && electron-vite build\n$ tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js (74:0): A comment\n\n\"/** Anchors a pattern source. The interpolation lives here rather than at the call site because\n * esbuild will not drop a `@__PURE__` call whose own argument interpolates a variable, but it\n * will drop `anchor(dateSource)`. Keeping it inline pinned `date` into every bundle. */\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js (400:0): A comment\n\n\"// Wrapped in a `@__PURE__` IIFE: esbuild never tree-shakes a top-level initializer that contains a member access on `Number`, so the bare object literal survived into every bundle.\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues."
      }
    },
    {
      "action": "建立 chat/tools 展示注册入口，迁移过程、updatePlan 和未知工具 fallback；通过真实适配/渲染测试覆盖流式正文、Markdown、附件、推理与过程分离、工具部分输入/成功/错误/拒绝和稳定 ID，保持主进程工具执行。",
      "coverage": "integration",
      "test": "node --test tests/assistant-ui-message-rendering.test.ts",
      "verify": [
        "node --test tests/assistant-ui-message-rendering.test.ts",
        "node --test tests/message-parts.test.ts tests/agent-tools.test.ts tests/agent-streaming.test.ts"
      ],
      "tdd": true,
      "status": "done",
      "testEvidence": {
        "command": "node --test tests/assistant-ui-message-rendering.test.ts",
        "verifiedAt": "2026-09-20T07:06:52.990Z",
        "exitCode": 0,
        "stdout": "✔ projects updatePlan streaming and completed values without losing stable ids (155.809958ms)\n✔ keeps unknown tools and error or denied states in the generic fallback (88.860541ms)\n✔ recognizes native message parts required by the assistant-ui thread (114.830666ms)\nℹ tests 3\nℹ suites 0\nℹ pass 3\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 506.3455",
        "stderr": ""
      },
      "verifyEvidenceList": [
        {
          "command": "node --test tests/assistant-ui-message-rendering.test.ts",
          "verifiedAt": "2026-09-20T07:06:53.475Z",
          "exitCode": 0,
          "stdout": "✔ projects updatePlan streaming and completed values without losing stable ids (147.206541ms)\n✔ keeps unknown tools and error or denied states in the generic fallback (89.340125ms)\n✔ recognizes native message parts required by the assistant-ui thread (90.628791ms)\nℹ tests 3\nℹ suites 0\nℹ pass 3\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 453.603",
          "stderr": ""
        },
        {
          "command": "node --test tests/message-parts.test.ts tests/agent-tools.test.ts tests/agent-streaming.test.ts",
          "verifiedAt": "2026-09-20T07:06:55.126Z",
          "exitCode": 0,
          "stdout": "✔ splits a coarse Chinese provider delta into incremental UI chunks before end (381.118542ms)\n✔ aborting an active stream stops later chunks and emits one end event (187.827542ms)\n✔ executes updatePlan and continues to a second model step with UI tool parts (340.299416ms)\n✔ rejects an empty updatePlan and exposes the failure as a UI tool error (224.208833ms)\n✔ consolidates multiple reasoning parts into one presentation block (1309.868917ms)\n✔ stops the reasoning indicator when answer text has started (87.81675ms)\nℹ tests 6\nℹ suites 0\nℹ pass 6\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 1625.698084",
          "stderr": ""
        }
      ],
      "evidence": {
        "command": "node --test tests/assistant-ui-message-rendering.test.ts && node --test tests/message-parts.test.ts tests/agent-tools.test.ts tests/agent-streaming.test.ts",
        "verifiedAt": "2026-09-20T07:06:55.126Z",
        "exitCode": 0,
        "stdout": "✔ projects updatePlan streaming and completed values without losing stable ids (147.206541ms)\n✔ keeps unknown tools and error or denied states in the generic fallback (89.340125ms)\n✔ recognizes native message parts required by the assistant-ui thread (90.628791ms)\nℹ tests 3\nℹ suites 0\nℹ pass 3\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 453.603\n✔ splits a coarse Chinese provider delta into incremental UI chunks before end (381.118542ms)\n✔ aborting an active stream stops later chunks and emits one end event (187.827542ms)\n✔ executes updatePlan and continues to a second model step with UI tool parts (340.299416ms)\n✔ rejects an empty updatePlan and exposes the failure as a UI tool error (224.208833ms)\n✔ consolidates multiple reasoning parts into one presentation block (1309.868917ms)\n✔ stops the reasoning indicator when answer text has started (87.81675ms)\nℹ tests 6\nℹ suites 0\nℹ pass 6\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 1625.698084",
        "stderr": ""
      }
    },
    {
      "action": "确认全局引用后删除旧 ai-elements 目录，清理其独占依赖及失效样式；新增边界检查禁止旧库导入和通用 assistant-ui 组件依赖业务 IPC/主进程。",
      "coverage": "unit",
      "test": "node --test tests/assistant-ui-boundaries.test.ts",
      "verify": [
        "node --test tests/assistant-ui-boundaries.test.ts",
        "pnpm run build"
      ],
      "tdd": true,
      "status": "done",
      "testEvidence": {
        "command": "node --test tests/assistant-ui-boundaries.test.ts",
        "verifiedAt": "2026-09-20T07:09:26.761Z",
        "exitCode": 0,
        "stdout": "✔ legacy AI Elements sources and imports are absent (16.362292ms)\n✔ generic assistant-ui elements do not reach into Sailor business boundaries (2.831333ms)\nℹ tests 2\nℹ suites 0\nℹ pass 2\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 77.19625",
        "stderr": ""
      },
      "verifyEvidenceList": [
        {
          "command": "node --test tests/assistant-ui-boundaries.test.ts",
          "verifiedAt": "2026-09-20T07:09:26.862Z",
          "exitCode": 0,
          "stdout": "✔ legacy AI Elements sources and imports are absent (9.054208ms)\n✔ generic assistant-ui elements do not reach into Sailor business boundaries (2.245791ms)\nℹ tests 2\nℹ suites 0\nℹ pass 2\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 69.210458",
          "stderr": ""
        },
        {
          "command": "pnpm run build",
          "verifiedAt": "2026-09-20T07:09:30.716Z",
          "exitCode": 0,
          "stdout": "vite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 16 modules transformed.\nrendering chunks...\nout/main/index.js  35.08 kB\n✓ built in 73ms\nvite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 2 modules transformed.\nrendering chunks...\nout/preload/index.cjs  2.52 kB\n✓ built in 7ms\nvite v7.3.6 building client environment for production...\ntransforming...\n✓ 3081 modules transformed.\nrendering chunks...\n../../out/renderer/index.html                     1.43 kB\n../../out/renderer/assets/index-BbEyYM_m.css    132.71 kB\n../../out/renderer/assets/index-B-PUq7EZ.js   2,779.46 kB\n✓ built in 2.69s",
          "stderr": "$ pnpm run typecheck && electron-vite build\n$ tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js (400:0): A comment\n\n\"// Wrapped in a `@__PURE__` IIFE: esbuild never tree-shakes a top-level initializer that contains a member access on `Number`, so the bare object literal survived into every bundle.\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js (74:0): A comment\n\n\"/** Anchors a pattern source. The interpolation lives here rather than at the call site because\n * esbuild will not drop a `@__PURE__` call whose own argument interpolates a variable, but it\n * will drop `anchor(dateSource)`. Keeping it inline pinned `date` into every bundle. */\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues."
        }
      ],
      "evidence": {
        "command": "node --test tests/assistant-ui-boundaries.test.ts && pnpm run build",
        "verifiedAt": "2026-09-20T07:09:30.716Z",
        "exitCode": 0,
        "stdout": "✔ legacy AI Elements sources and imports are absent (9.054208ms)\n✔ generic assistant-ui elements do not reach into Sailor business boundaries (2.245791ms)\nℹ tests 2\nℹ suites 0\nℹ pass 2\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 69.210458\nvite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 16 modules transformed.\nrendering chunks...\nout/main/index.js  35.08 kB\n✓ built in 73ms\nvite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 2 modules transformed.\nrendering chunks...\nout/preload/index.cjs  2.52 kB\n✓ built in 7ms\nvite v7.3.6 building client environment for production...\ntransforming...\n✓ 3081 modules transformed.\nrendering chunks...\n../../out/renderer/index.html                     1.43 kB\n../../out/renderer/assets/index-BbEyYM_m.css    132.71 kB\n../../out/renderer/assets/index-B-PUq7EZ.js   2,779.46 kB\n✓ built in 2.69s",
        "stderr": "$ pnpm run typecheck && electron-vite build\n$ tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js (400:0): A comment\n\n\"// Wrapped in a `@__PURE__` IIFE: esbuild never tree-shakes a top-level initializer that contains a member access on `Number`, so the bare object literal survived into every bundle.\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js (74:0): A comment\n\n\"/** Anchors a pattern source. The interpolation lives here rather than at the call site because\n * esbuild will not drop a `@__PURE__` call whose own argument interpolates a variable, but it\n * will drop `anchor(dateSource)`. Keeping it inline pinned `date` into every bundle. */\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues."
      }
    },
    {
      "action": "按迁移设计使用隔离 profile/fixture 完成 Electron 桌面与窄窗口验收，覆盖双会话、停止、重启历史、保存失败重试、模型/推理选择、主题、消息/工具、滚动和键盘；记录真实结果、截图及清理证据，仅全部通过才标记 Acceptance: PASS。",
      "coverage": "manual-exception",
      "verify": [
        "test -s .agent-harness/evidence/assistant-ui-migration-acceptance.md",
        "rg -n '^Acceptance: PASS$' .agent-harness/evidence/assistant-ui-migration-acceptance.md"
      ],
      "tdd": false,
      "coverage_reason": "真实 Electron 布局、原生生命周期和视觉质量需人工交互与截图验收；命令只核验已完成验收的记录，不替代执行场景。",
      "status": "done",
      "verifyEvidenceList": [
        {
          "command": "test -s .agent-harness/evidence/assistant-ui-migration-acceptance.md",
          "verifiedAt": "2026-09-20T07:27:39.644Z",
          "exitCode": 0,
          "stdout": "",
          "stderr": ""
        },
        {
          "command": "rg -n '^Acceptance: PASS$' .agent-harness/evidence/assistant-ui-migration-acceptance.md",
          "verifiedAt": "2026-09-20T07:27:39.659Z",
          "exitCode": 0,
          "stdout": "40:Acceptance: PASS",
          "stderr": ""
        }
      ],
      "evidence": {
        "command": "test -s .agent-harness/evidence/assistant-ui-migration-acceptance.md && rg -n '^Acceptance: PASS$' .agent-harness/evidence/assistant-ui-migration-acceptance.md",
        "verifiedAt": "2026-09-20T07:27:39.659Z",
        "exitCode": 0,
        "stdout": "40:Acceptance: PASS",
        "stderr": ""
      }
    },
    {
      "action": "同步 README、architecture、package 描述和 CLAUDE 中相互冲突的 UI 规则，落实迁移设计的目录/后续工具接入规范；运行全量回归和 clean-state，通过 verifier 记录各项 evidence，更新 progress。",
      "coverage": "static",
      "verify": [
        "node --test tests/*.test.ts",
        "pnpm run build",
        "node .agent-harness/scripts/clean-state-check.mjs --skip-verification"
      ],
      "tdd": false,
      "coverage_reason": "文档与项目约定同步不具备运行时失败断言；由文档审阅、前述边界测试和全量回归共同验证。",
      "status": "done",
      "verifyEvidenceList": [
        {
          "command": "node --test tests/*.test.ts",
          "verifiedAt": "2026-09-20T07:31:59.083Z",
          "exitCode": 0,
          "stdout": "✔ splits a coarse Chinese provider delta into incremental UI chunks before end (697.433875ms)\n✔ aborting an active stream stops later chunks and emits one end event (155.896625ms)\n✔ executes updatePlan and continues to a second model step with UI tool parts (713.049292ms)\n✔ rejects an empty updatePlan and exposes the failure as a UI tool error (207.385375ms)\n✔ reads valid preferences and falls back on invalid persisted values (3.887375ms)\n✔ persists preferences and reports storage failures without throwing (0.446334ms)\n✔ applies the saved appearance before consumers read runtime state (295.984625ms)\n✔ system mode follows OS changes while explicit themes ignore them (244.701084ms)\n✔ disposes exactly one system listener and supports repeated StrictMode setup (190.781584ms)\n✔ legacy AI Elements sources and imports are absent (328.485667ms)\n✔ generic assistant-ui elements do not reach into Sailor business boundaries (5.858417ms)\n✔ projects updatePlan streaming and completed values without losing stable ids (270.999208ms)\n✔ keeps unknown tools and error or denied states in the generic fallback (266.551333ms)\n✔ recognizes native message parts required by the assistant-ui thread (193.75275ms)\n✔ composer policy blocks invalid submissions and clears a recoverable error (150.176458ms)\n✔ stop targets the persisted run and otherwise delegates to the active chat (84.010833ms)\n✔ workspace registry keeps stable isolated Chat instances while selection changes (526.741334ms)\n✔ consolidates multiple reasoning parts into one presentation block (145.112375ms)\n✔ stops the reasoning indicator when answer text has started (287.229458ms)\n✔ filters the provider catalog and excludes configured models (3.517458ms)\n✔ toggles an individual model selection without duplicates (0.151791ms)\n✔ selects or clears all visible models while preserving hidden selections (0.111833ms)\n✔ appends selected models with default capabilities and skips existing IDs (0.133875ms)\n✔ uses the provider default model factory for the Responses protocol (0.653959ms)\n✔ uses chat completions for custom OpenAI-compatible providers (0.083417ms)\n✔ fetches, normalizes, deduplicates and sorts an OpenAI-compatible model catalog (35.792458ms)\n✔ uses an unsaved API key for a new provider (1.257708ms)\n✔ reports provider errors and malformed catalogs in Chinese (1.487208ms)\n✔ requires a key when neither the form nor saved settings provide one (0.967583ms)\n✔ uses the dedicated DeepSeek provider factory for the built-in provider (0.958625ms)\n✔ enables OpenAI Responses reasoning summaries only for that protocol (0.120459ms)\n✔ passes supported reasoning to the model and falls back for unsupported levels (210.924416ms)\n✔ exposes only supported reasoning efforts in stable UI order (0.640666ms)\n✔ creates an agent request carrying the selected reasoning effort (0.077041ms)\n✔ starts with editable OpenAI and DeepSeek provider presets (7.051834ms)\n✔ persists only encrypted credentials and never returns a saved API key (7.145958ms)\n✔ blank credentials preserve the stored key and active model resolution decrypts it (10.330875ms)\n✔ migrates version 1 string models without losing credentials or active selection (6.646292ms)\n✔ rejects non-positive model limits (2.800417ms)\n✔ rejects invalid provider IDs and active models outside the provider catalog (0.970084ms)\n✔ 同/跨工作区并行，切换不终止，后台保存完整输出和未读状态 (375.596625ms)\n✔ 同会话重复提交被拒绝；停止一个不会停止另一个并保留部分输出 (211.916333ms)\n✔ 保存失败保留内存消息与错误，可重试且不影响另一会话 (46.405709ms)\n✔ renderer 实例跨视图保留，快速切换只采用最后一次选择 (46.622459ms)\n✔ 取消后的未完成工具 parts 保留历史且可安全续聊 (150.07275ms)\n✔ 恢复中断运行不自动调用模型，运行前异常仍释放会话锁 (160.506958ms)\n✔ 切换视图不等待偏好写盘，偏好失败不会阻止访问其他会话 (64.381041ms)\n✔ 取消目录选择无记录，选择后可创建并读取会话 (174.994667ms)\n✔ 根据 chatId 解析真实目录，拒绝非法消息和不存在会话 (135.53925ms)\n✔ 目录失效可读历史，但禁止运行；恢复消息用 SDK 验证 (125.507667ms)\n✔ 真实目录去重，包括符号链接；取消外的无效目录不能注册 (115.108208ms)\n✔ 会话外键、首条标题限长、完整 parts 和偏好在重启后恢复 (145.38075ms)\n✔ 并发写入不丢会话，旧 run 不能覆盖新 run (111.005333ms)\n✔ 损坏和非法外键文件不被覆盖 (125.825041ms)\nℹ tests 54\nℹ suites 0\nℹ pass 54\nℹ fail 0\nℹ cancelled 0\n\n... output truncated ...",
          "stderr": ""
        },
        {
          "command": "pnpm run build",
          "verifiedAt": "2026-09-20T07:32:03.134Z",
          "exitCode": 0,
          "stdout": "vite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 16 modules transformed.\nrendering chunks...\nout/main/index.js  35.08 kB\n✓ built in 78ms\nvite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 2 modules transformed.\nrendering chunks...\nout/preload/index.cjs  2.52 kB\n✓ built in 8ms\nvite v7.3.6 building client environment for production...\ntransforming...\n✓ 3081 modules transformed.\nrendering chunks...\n../../out/renderer/index.html                     1.43 kB\n../../out/renderer/assets/index-BbEyYM_m.css    132.71 kB\n../../out/renderer/assets/index-bPZY2tRw.js   2,779.45 kB\n✓ built in 2.82s",
          "stderr": "$ pnpm run typecheck && electron-vite build\n$ tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js (400:0): A comment\n\n\"// Wrapped in a `@__PURE__` IIFE: esbuild never tree-shakes a top-level initializer that contains a member access on `Number`, so the bare object literal survived into every bundle.\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js (74:0): A comment\n\n\"/** Anchors a pattern source. The interpolation lives here rather than at the call site because\n * esbuild will not drop a `@__PURE__` call whose own argument interpolates a variable, but it\n * will drop `anchor(dateSource)`. Keeping it inline pinned `date` into every bundle. */\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues."
        },
        {
          "command": "node .agent-harness/scripts/clean-state-check.mjs --skip-verification",
          "verifiedAt": "2026-09-20T07:32:03.173Z",
          "exitCode": 0,
          "stdout": "=== Clean-state passed ===",
          "stderr": ""
        }
      ],
      "evidence": {
        "command": "node --test tests/*.test.ts && pnpm run build && node .agent-harness/scripts/clean-state-check.mjs --skip-verification",
        "verifiedAt": "2026-09-20T07:32:03.173Z",
        "exitCode": 0,
        "stdout": "✔ splits a coarse Chinese provider delta into incremental UI chunks before end (697.433875ms)\n✔ aborting an active stream stops later chunks and emits one end event (155.896625ms)\n✔ executes updatePlan and continues to a second model step with UI tool parts (713.049292ms)\n✔ rejects an empty updatePlan and exposes the failure as a UI tool error (207.385375ms)\n✔ reads valid preferences and falls back on invalid persisted values (3.887375ms)\n✔ persists preferences and reports storage failures without throwing (0.446334ms)\n✔ applies the saved appearance before consumers read runtime state (295.984625ms)\n✔ system mode follows OS changes while explicit themes ignore them (244.701084ms)\n✔ disposes exactly one system listener and supports repeated StrictMode setup (190.781584ms)\n✔ legacy AI Elements sources and imports are absent (328.485667ms)\n✔ generic assistant-ui elements do not reach into Sailor business boundaries (5.858417ms)\n✔ projects updatePlan streaming and completed values without losing stable ids (270.999208ms)\n✔ keeps unknown tools and error or denied states in the generic fallback (266.551333ms)\n✔ recognizes native message parts required by the assistant-ui thread (193.75275ms)\n✔ composer policy blocks invalid submissions and clears a recoverable error (150.176458ms)\n✔ stop targets the persisted run and otherwise delegates to the active chat (84.010833ms)\n✔ workspace registry keeps stable isolated Chat instances while selection changes (526.741334ms)\n✔ consolidates multiple reasoning parts into one presentation block (145.112375ms)\n✔ stops the reasoning indicator when answer text has started (287.229458ms)\n✔ filters the provider catalog and excludes configured models (3.517458ms)\n✔ toggles an individual model selection without duplicates (0.151791ms)\n✔ selects or clears all visible models while preserving hidden selections (0.111833ms)\n✔ appends selected models with default capabilities and skips existing IDs (0.133875ms)\n✔ uses the provider default model factory for the Responses protocol (0.653959ms)\n✔ uses chat completions for custom OpenAI-compatible providers (0.083417ms)\n✔ fetches, normalizes, deduplicates and sorts an OpenAI-compatible model catalog (35.792458ms)\n✔ uses an unsaved API key for a new provider (1.257708ms)\n✔ reports provider errors and malformed catalogs in Chinese (1.487208ms)\n✔ requires a key when neither the form nor saved settings provide one (0.967583ms)\n✔ uses the dedicated DeepSeek provider factory for the built-in provider (0.958625ms)\n✔ enables OpenAI Responses reasoning summaries only for that protocol (0.120459ms)\n✔ passes supported reasoning to the model and falls back for unsupported levels (210.924416ms)\n✔ exposes only supported reasoning efforts in stable UI order (0.640666ms)\n✔ creates an agent request carrying the selected reasoning effort (0.077041ms)\n✔ starts with editable OpenAI and DeepSeek provider presets (7.051834ms)\n✔ persists only encrypted credentials and never returns a saved API key (7.145958ms)\n✔ blank credentials preserve the stored key and active model resolution decrypts it (10.330875ms)\n✔ migrates version 1 string models without losing credentials or active selection (6.646292ms)\n✔ rejects non-positive model limits (2.800417ms)\n✔ rejects invalid provider IDs and active models outside the provider catalog (0.970084ms)\n✔ 同/跨工作区并行，切换不终止，后台保存完整输出和未读状态 (375.596625ms)\n✔ 同会话重复提交被拒绝；停止一个不会停止另一个并保留部分输出 (211.916333ms)\n✔ 保存失败保留内存消息与错误，可重试且不影响另一会话 (46.405709ms)\n✔ renderer 实例跨视图保留，快速切换只采用最后一次选择 (46.622459ms)\n✔ 取消后的未完成工具 parts 保留历史且可安全续聊 (150.07275ms)\n✔ 恢复中断运行不自动调用模型，运行前异常仍释放会话锁 (160.506958ms)\n✔ 切换视图不等待偏好写盘，偏好失败不会阻止访问其他会话 (64.381041ms)\n✔ 取消目录选择无记录，选择后可创建并读取会话 (174.994667ms)\n✔ 根据 chatId 解析真实目录，拒绝非法消息和不存在会话 (135.53925ms)\n✔ 目录失效可读历史，但禁止运行；恢复消息用 SDK 验证 (125.507667ms)\n✔ 真实目录去重，包括符号链接；取消外的无效目录不能注册 (115.108208ms)\n✔ 会话外键、首条标题限长、完整 parts 和偏好在重启后恢复 (145.38075ms)\n✔ 并发写入不丢会话，旧 run 不能覆盖新 run (111.005333ms)\n✔ 损坏和非法外键文件不被覆盖 (125.825041ms)\nℹ tests 54\nℹ suites 0\nℹ pass 54\nℹ fail 0\nℹ cancelled 0\n\n... output truncated ...",
        "stderr": "$ pnpm run typecheck && electron-vite build\n$ tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js (400:0): A comment\n\n\"// Wrapped in a `@__PURE__` IIFE: esbuild never tree-shakes a top-level initializer that contains a member access on `Number`, so the bare object literal survived into every bundle.\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js (74:0): A comment\n\n\"/** Anchors a pattern source. The interpolation lives here rather than at the call site because\n * esbuild will not drop a `@__PURE__` call whose own argument interpolates a variable, but it\n * will drop `anchor(dateSource)`. Keeping it inline pinned `date` into every bundle. */\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues."
      }
    }
  ],
  "trd_spec": "docs/assistant-ui-migration.md"
}
```
