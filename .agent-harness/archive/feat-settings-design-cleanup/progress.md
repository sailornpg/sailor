# Archived Feature Progress

## Archived Metadata

**Archived At:** 2026-09-21T08:40:39.872Z
**Feature ID:** feat-settings-design-cleanup
**Feature Name:** 统一设置设计并移除旧搜索与本机执行
**Archived Status:** done
**Archive Source:** `.agent-harness/feature_list.json`
**Active Feature At Archive Time:** feat-sidebar-active-highlight

## Archive Note

This feature was not the active progress panel at archive time.
This archive progress file is a structured summary synthesized from `.agent-harness/feature_list.json`.

## Feature Summary

按 assistant-ui 设计规范重构模型与外观设置，移除 Web 搜索和旧原生本机执行的配置、接口及实现；保留 Pi 工作区工具与历史记录兼容。

## Dependencies

- none

## Evidence

Verified by .agent-harness/feature_list.json checklist at 2026-09-21T08:22:19.074Z

## Additional Fields Snapshot

```json
{
  "checklist": [
    {
      "action": "移除已退役能力的设置、IPC 和执行端，旧配置可读且不再暴露能力",
      "coverage": "integration",
      "test": "node --test tests/retired-settings.test.ts",
      "verify": "node --test tests/retired-settings.test.ts tests/settings-config.test.ts tests/workspace-store.test.ts tests/workspace-ipc.test.ts",
      "tdd": true,
      "status": "done",
      "testEvidence": {
        "command": "node --test tests/retired-settings.test.ts",
        "verifiedAt": "2026-09-21T08:08:11.521Z",
        "exitCode": 0,
        "stdout": "✔ 旧搜索配置不再暴露或解密，模型配置仍可加载 (2.879375ms)\n✔ 旧工作区执行开关被忽略且不可重新启用 (3.6585ms)\nℹ tests 2\nℹ suites 0\nℹ pass 2\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 106.730584",
        "stderr": ""
      },
      "verifyEvidence": {
        "command": "node --test tests/retired-settings.test.ts tests/settings-config.test.ts tests/workspace-store.test.ts tests/workspace-ipc.test.ts",
        "verifiedAt": "2026-09-21T08:08:13.083Z",
        "exitCode": 0,
        "stdout": "✔ 旧搜索配置不再暴露或解密，模型配置仍可加载 (6.469166ms)\n✔ 旧工作区执行开关被忽略且不可重新启用 (8.631167ms)\n✔ starts with editable OpenAI and DeepSeek provider presets (3.5865ms)\n✔ persists only encrypted credentials and never returns a saved API key (4.974709ms)\n✔ blank credentials preserve the stored key and active model resolution decrypts it (5.514625ms)\n✔ migrates version 1 string models without losing credentials or active selection (5.324917ms)\n✔ rejects non-positive model limits (1.35575ms)\n✔ rejects invalid provider IDs and active models outside the provider catalog (1.159ms)\n✔ 取消目录选择无记录，选择后可创建并读取会话 (1151.199417ms)\n✔ 根据 chatId 解析真实目录，拒绝非法消息和不存在会话 (102.404959ms)\n✔ 目录失效可读历史，但禁止运行；恢复消息用 SDK 验证 (103.727958ms)\n✔ 真实目录去重，包括符号链接；取消外的无效目录不能注册 (199.6655ms)\n✔ 会话外键、首条标题限长、完整 parts 和偏好在重启后恢复 (113.260959ms)\n✔ 并发写入不丢会话，旧 run 不能覆盖新 run (151.177875ms)\n✔ 损坏和非法外键文件不被覆盖 (126.588916ms)\n✔ 手动重命名不被后续消息覆盖，归档恢复与删除在重启后保留 (122.273125ms)\nℹ tests 16\nℹ suites 0\nℹ pass 16\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 1534.643416",
        "stderr": ""
      },
      "evidence": {
        "command": "node --test tests/retired-settings.test.ts tests/settings-config.test.ts tests/workspace-store.test.ts tests/workspace-ipc.test.ts",
        "verifiedAt": "2026-09-21T08:08:13.083Z",
        "exitCode": 0,
        "stdout": "✔ 旧搜索配置不再暴露或解密，模型配置仍可加载 (6.469166ms)\n✔ 旧工作区执行开关被忽略且不可重新启用 (8.631167ms)\n✔ starts with editable OpenAI and DeepSeek provider presets (3.5865ms)\n✔ persists only encrypted credentials and never returns a saved API key (4.974709ms)\n✔ blank credentials preserve the stored key and active model resolution decrypts it (5.514625ms)\n✔ migrates version 1 string models without losing credentials or active selection (5.324917ms)\n✔ rejects non-positive model limits (1.35575ms)\n✔ rejects invalid provider IDs and active models outside the provider catalog (1.159ms)\n✔ 取消目录选择无记录，选择后可创建并读取会话 (1151.199417ms)\n✔ 根据 chatId 解析真实目录，拒绝非法消息和不存在会话 (102.404959ms)\n✔ 目录失效可读历史，但禁止运行；恢复消息用 SDK 验证 (103.727958ms)\n✔ 真实目录去重，包括符号链接；取消外的无效目录不能注册 (199.6655ms)\n✔ 会话外键、首条标题限长、完整 parts 和偏好在重启后恢复 (113.260959ms)\n✔ 并发写入不丢会话，旧 run 不能覆盖新 run (151.177875ms)\n✔ 损坏和非法外键文件不被覆盖 (126.588916ms)\n✔ 手动重命名不被后续消息覆盖，归档恢复与删除在重启后保留 (122.273125ms)\nℹ tests 16\nℹ suites 0\nℹ pass 16\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 1534.643416",
        "stderr": ""
      }
    },
    {
      "action": "复用官方控件重构设置、提供商表单、模型选择与外观；验证浅深色、窄窗、焦点和关键操作并同步文档",
      "coverage": "manual-exception",
      "verify": [
        "pnpm run typecheck",
        "pnpm run build"
      ],
      "tdd": false,
      "coverage_reason": "布局和视觉层级需实际渲染判断；已有配置与选择测试覆盖业务逻辑，另记录截图及交互验收。",
      "status": "done",
      "verifyEvidenceList": [
        {
          "command": "pnpm run typecheck",
          "verifiedAt": "2026-09-21T08:21:23.653Z",
          "exitCode": 0,
          "stdout": "",
          "stderr": "$ tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json"
        },
        {
          "command": "pnpm run build",
          "verifiedAt": "2026-09-21T08:21:28.999Z",
          "exitCode": 0,
          "stdout": "vite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 19 modules transformed.\nrendering chunks...\nout/main/index.js  63.64 kB\n✓ built in 100ms\nvite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 2 modules transformed.\nrendering chunks...\nout/preload/index.cjs  2.97 kB\n✓ built in 8ms\nvite v7.3.6 building client environment for production...\ntransforming...\n✓ 3245 modules transformed.\nrendering chunks...\n../../out/renderer/index.html                     1.43 kB\n../../out/renderer/assets/index-Tlz_tD-o.css    163.30 kB\n../../out/renderer/assets/index-B2NX1tZr.js   3,119.67 kB\n✓ built in 3.93s",
          "stderr": "$ pnpm run typecheck && electron-vite build\n$ tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js (400:0): A comment\n\n\"// Wrapped in a `@__PURE__` IIFE: esbuild never tree-shakes a top-level initializer that contains a member access on `Number`, so the bare object literal survived into every bundle.\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js (74:0): A comment\n\n\"/** Anchors a pattern source. The interpolation lives here rather than at the call site because\n * esbuild will not drop a `@__PURE__` call whose own argument interpolates a variable, but it\n * will drop `anchor(dateSource)`. Keeping it inline pinned `date` into every bundle. */\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues."
        }
      ],
      "evidence": {
        "command": "pnpm run typecheck && pnpm run build",
        "verifiedAt": "2026-09-21T08:21:28.999Z",
        "exitCode": 0,
        "stdout": "vite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 19 modules transformed.\nrendering chunks...\nout/main/index.js  63.64 kB\n✓ built in 100ms\nvite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 2 modules transformed.\nrendering chunks...\nout/preload/index.cjs  2.97 kB\n✓ built in 8ms\nvite v7.3.6 building client environment for production...\ntransforming...\n✓ 3245 modules transformed.\nrendering chunks...\n../../out/renderer/index.html                     1.43 kB\n../../out/renderer/assets/index-Tlz_tD-o.css    163.30 kB\n../../out/renderer/assets/index-B2NX1tZr.js   3,119.67 kB\n✓ built in 3.93s",
        "stderr": "$ tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json\n$ pnpm run typecheck && electron-vite build\n$ tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js (400:0): A comment\n\n\"// Wrapped in a `@__PURE__` IIFE: esbuild never tree-shakes a top-level initializer that contains a member access on `Number`, so the bare object literal survived into every bundle.\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js (74:0): A comment\n\n\"/** Anchors a pattern source. The interpolation lives here rather than at the call site because\n * esbuild will not drop a `@__PURE__` call whose own argument interpolates a variable, but it\n * will drop `anchor(dateSource)`. Keeping it inline pinned `date` into every bundle. */\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues."
      },
      "visualEvidence": ".agent-harness/evidence/settings-design-acceptance.md"
    }
  ]
}
```
