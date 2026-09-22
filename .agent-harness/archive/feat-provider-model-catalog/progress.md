# Archived Feature Progress

## Archived Metadata

**Archived At:** 2026-09-20T02:15:24.654Z
**Feature ID:** feat-provider-model-catalog
**Feature Name:** Provider Model Catalog and Chinese UI
**Archived Status:** done
**Archive Source:** `.agent-harness/feature_list.json`
**Active Feature At Archive Time:** feat-model-picker-dialog

## Archive Note

This feature was not the active progress panel at archive time.
This archive progress file is a structured summary synthesized from `.agent-harness/feature_list.json`.

## Feature Summary

从当前 OpenAI-compatible 提供商获取模型目录，允许逐模型配置上下文窗口等能力，并将应用可见界面统一为中文。

## Dependencies

- feat-model-provider-settings

## Evidence

Verified by .agent-harness/feature_list.json checklist at 2026-09-18T11:51:46.980Z

## Additional Fields Snapshot

```json
{
  "trd_spec": "docs/architecture.md",
  "checklist": [
    {
      "action": "将提供商模型从字符串升级为包含显示名、上下文窗口、最大输出 token、推理等级和视觉能力的配置，并兼容迁移现有 version 1 设置",
      "coverage": "unit",
      "test": "node --test tests/settings-config.test.ts",
      "verify": [
        "node --test tests/settings-config.test.ts",
        "pnpm run typecheck"
      ],
      "tdd": true,
      "status": "done",
      "testEvidence": {
        "command": "node --test tests/settings-config.test.ts",
        "verifiedAt": "2026-09-18T11:27:33.122Z",
        "exitCode": 0,
        "stdout": "✔ starts with editable OpenAI and DeepSeek provider presets (2.739208ms)\n✔ persists only encrypted credentials and never returns a saved API key (1.537625ms)\n✔ blank credentials preserve the stored key and active model resolution decrypts it (1.983458ms)\n✔ migrates version 1 string models without losing credentials or active selection (1.17575ms)\n✔ rejects non-positive model limits (0.542083ms)\n✔ rejects invalid provider IDs and active models outside the provider catalog (0.337375ms)\nℹ tests 6\nℹ suites 0\nℹ pass 6\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 73.684125",
        "stderr": ""
      },
      "verifyEvidenceList": [
        {
          "command": "node --test tests/settings-config.test.ts",
          "verifiedAt": "2026-09-18T11:27:33.221Z",
          "exitCode": 0,
          "stdout": "✔ starts with editable OpenAI and DeepSeek provider presets (2.714291ms)\n✔ persists only encrypted credentials and never returns a saved API key (1.697417ms)\n✔ blank credentials preserve the stored key and active model resolution decrypts it (2.1255ms)\n✔ migrates version 1 string models without losing credentials or active selection (1.075959ms)\n✔ rejects non-positive model limits (0.507334ms)\n✔ rejects invalid provider IDs and active models outside the provider catalog (0.2805ms)\nℹ tests 6\nℹ suites 0\nℹ pass 6\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 71.495458",
          "stderr": ""
        },
        {
          "command": "pnpm run typecheck",
          "verifiedAt": "2026-09-18T11:27:33.928Z",
          "exitCode": 0,
          "stdout": "",
          "stderr": "$ tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json"
        }
      ],
      "evidence": {
        "command": "node --test tests/settings-config.test.ts && pnpm run typecheck",
        "verifiedAt": "2026-09-18T11:27:33.928Z",
        "exitCode": 0,
        "stdout": "✔ starts with editable OpenAI and DeepSeek provider presets (2.714291ms)\n✔ persists only encrypted credentials and never returns a saved API key (1.697417ms)\n✔ blank credentials preserve the stored key and active model resolution decrypts it (2.1255ms)\n✔ migrates version 1 string models without losing credentials or active selection (1.075959ms)\n✔ rejects non-positive model limits (0.507334ms)\n✔ rejects invalid provider IDs and active models outside the provider catalog (0.2805ms)\nℹ tests 6\nℹ suites 0\nℹ pass 6\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 71.495458",
        "stderr": "$ tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json"
      }
    },
    {
      "action": "实现主进程 OpenAI-compatible 模型目录获取服务，使用当前或已保存凭据请求 /models，并规范化、排序和校验响应",
      "coverage": "unit",
      "test": "node --test tests/provider-model-catalog.test.ts",
      "verify": [
        "node --test tests/provider-model-catalog.test.ts",
        "pnpm run typecheck"
      ],
      "tdd": true,
      "status": "done",
      "testEvidence": {
        "command": "node --test tests/provider-model-catalog.test.ts",
        "verifiedAt": "2026-09-18T11:31:04.482Z",
        "exitCode": 0,
        "stdout": "✔ fetches, normalizes, deduplicates and sorts an OpenAI-compatible model catalog (19.93425ms)\n✔ uses an unsaved API key for a new provider (1.374917ms)\n✔ reports provider errors and malformed catalogs in Chinese (0.794833ms)\n✔ requires a key when neither the form nor saved settings provide one (0.355625ms)\nℹ tests 4\nℹ suites 0\nℹ pass 4\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 88.08925",
        "stderr": ""
      },
      "verifyEvidenceList": [
        {
          "command": "node --test tests/provider-model-catalog.test.ts",
          "verifiedAt": "2026-09-18T11:31:04.656Z",
          "exitCode": 0,
          "stdout": "✔ fetches, normalizes, deduplicates and sorts an OpenAI-compatible model catalog (20.810166ms)\n✔ uses an unsaved API key for a new provider (1.29825ms)\n✔ reports provider errors and malformed catalogs in Chinese (0.675083ms)\n✔ requires a key when neither the form nor saved settings provide one (0.335416ms)\nℹ tests 4\nℹ suites 0\nℹ pass 4\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 87.545542",
          "stderr": ""
        },
        {
          "command": "pnpm run typecheck",
          "verifiedAt": "2026-09-18T11:31:05.183Z",
          "exitCode": 0,
          "stdout": "",
          "stderr": "$ tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json"
        }
      ],
      "evidence": {
        "command": "node --test tests/provider-model-catalog.test.ts && pnpm run typecheck",
        "verifiedAt": "2026-09-18T11:31:05.183Z",
        "exitCode": 0,
        "stdout": "✔ fetches, normalizes, deduplicates and sorts an OpenAI-compatible model catalog (20.810166ms)\n✔ uses an unsaved API key for a new provider (1.29825ms)\n✔ reports provider errors and malformed catalogs in Chinese (0.675083ms)\n✔ requires a key when neither the form nor saved settings provide one (0.335416ms)\nℹ tests 4\nℹ suites 0\nℹ pass 4\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 87.545542",
        "stderr": "$ tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json"
      }
    },
    {
      "action": "扩展类型化 IPC/preload 模型目录接口，并让 AgentService 使用模型配置中的最大输出 token",
      "coverage": "static",
      "verify": [
        "pnpm run typecheck",
        "rg \"settings:fetch-models|maxOutputTokens\" src/main src/preload src/shared"
      ],
      "tdd": false,
      "coverage_reason": "该项是已测试服务与 AI SDK ToolLoopAgent 的跨进程静态接线，分支逻辑已由相邻单元测试覆盖。",
      "status": "done",
      "verifyEvidenceList": [
        {
          "command": "pnpm run typecheck",
          "verifiedAt": "2026-09-18T11:33:26.874Z",
          "exitCode": 0,
          "stdout": "",
          "stderr": "$ tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json"
        },
        {
          "command": "rg \"settings:fetch-models|maxOutputTokens\" src/main src/preload src/shared",
          "verifiedAt": "2026-09-18T11:33:26.893Z",
          "exitCode": 0,
          "stdout": "src/shared/contracts.ts:  maxOutputTokens: number | null\nsrc/shared/contracts.ts:  maxOutputTokens?: number\nsrc/shared/contracts.ts:  settingsFetchModels: 'settings:fetch-models',\nsrc/main/ipc/registerIpc.ts:    maxOutputTokens: z.number().int().positive().nullable(),\nsrc/main/settings/SettingsService.ts:      ...(model.maxOutputTokens ? { maxOutputTokens: model.maxOutputTokens } : {}),\nsrc/main/settings/SettingsService.ts:    maxOutputTokens: null,\nsrc/main/settings/SettingsService.ts:  const maxOutputTokens = normalizeLimit(model.maxOutputTokens, '最大输出 token')\nsrc/main/settings/SettingsService.ts:    maxOutputTokens,\nsrc/main/agent/AgentService.ts:      maxOutputTokens: configuredModel.maxOutputTokens,",
          "stderr": ""
        }
      ],
      "evidence": {
        "command": "pnpm run typecheck && rg \"settings:fetch-models|maxOutputTokens\" src/main src/preload src/shared",
        "verifiedAt": "2026-09-18T11:33:26.893Z",
        "exitCode": 0,
        "stdout": "src/shared/contracts.ts:  maxOutputTokens: number | null\nsrc/shared/contracts.ts:  maxOutputTokens?: number\nsrc/shared/contracts.ts:  settingsFetchModels: 'settings:fetch-models',\nsrc/main/ipc/registerIpc.ts:    maxOutputTokens: z.number().int().positive().nullable(),\nsrc/main/settings/SettingsService.ts:      ...(model.maxOutputTokens ? { maxOutputTokens: model.maxOutputTokens } : {}),\nsrc/main/settings/SettingsService.ts:    maxOutputTokens: null,\nsrc/main/settings/SettingsService.ts:  const maxOutputTokens = normalizeLimit(model.maxOutputTokens, '最大输出 token')\nsrc/main/settings/SettingsService.ts:    maxOutputTokens,\nsrc/main/agent/AgentService.ts:      maxOutputTokens: configuredModel.maxOutputTokens,",
        "stderr": "$ tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json"
      }
    },
    {
      "action": "将设置模型区改为可刷新、搜索、选择和展开编辑的模型目录，并把应用可见文案统一为中文后完成桌面与窄视口验收",
      "coverage": "static",
      "verify": [
        "pnpm run typecheck",
        "rg \"获取可用模型|上下文窗口|最大输出 token|API 协议\" src/renderer/src",
        "pnpm run build"
      ],
      "tdd": false,
      "coverage_reason": "该项的主要验收标准是模型目录交互、中文文案和响应式视觉表现，需通过构建及真实 Electron 窗口检查。",
      "status": "done",
      "verifyEvidenceList": [
        {
          "command": "pnpm run typecheck",
          "verifiedAt": "2026-09-18T11:42:20.008Z",
          "exitCode": 0,
          "stdout": "",
          "stderr": "$ tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json"
        },
        {
          "command": "rg \"获取可用模型|上下文窗口|最大输出 token|API 协议\" src/renderer/src",
          "verifiedAt": "2026-09-18T11:42:20.026Z",
          "exitCode": 0,
          "stdout": "src/renderer/src/components/settings/ProviderSettingsDialog.tsx:                <span>API 协议</span>\nsrc/renderer/src/components/settings/ProviderSettingsDialog.tsx:                  {fetchingModels ? '正在获取' : '获取可用模型'}\nsrc/renderer/src/components/settings/ProviderSettingsDialog.tsx:                              <span>上下文窗口</span>\nsrc/renderer/src/components/settings/ProviderSettingsDialog.tsx:                              <span>最大输出 token</span>\nsrc/renderer/src/components/settings/ProviderSettingsDialog.tsx:                    {availableModels.length > 0 ? '没有匹配的已选模型。' : '请先获取可用模型，再将需要的模型加入目录。'}",
          "stderr": ""
        },
        {
          "command": "pnpm run build",
          "verifiedAt": "2026-09-18T11:42:28.915Z",
          "exitCode": 0,
          "stdout": "vite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 9 modules transformed.\nrendering chunks...\nout/main/index.js  17.25 kB\n✓ built in 70ms\nvite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 2 modules transformed.\nrendering chunks...\nout/preload/index.cjs  1.49 kB\n✓ built in 7ms\nvite v7.3.6 building client environment for production...\ntransforming...\n✓ 5719 modules transformed.\nrendering chunks...\n../../out/renderer/index.html                                           0.46 kB\n../../out/renderer/assets/index-Dk2RmgnW.css                           77.11 kB\n../../out/renderer/assets/channel-s1bYEye3.js                           0.19 kB\n../../out/renderer/assets/init-ZxktEp_H.js                              0.26 kB\n../../out/renderer/assets/chunk-JWPE2WC7-gTZgUhj1.js                    0.36 kB\n../../out/renderer/assets/chunk-2Q5K7J3B-jKM7aN2U.js                    0.37 kB\n../../out/renderer/assets/chunk-5VM5RSS4-CySRFF5x.js                    0.43 kB\n../../out/renderer/assets/chunk-XXDRQBXY-DOPbdTaE.js                    0.48 kB\n../../out/renderer/assets/codeowners-awy7PWCD.js                        0.59 kB\n../../out/renderer/assets/codeowners-Gyog2tLO.js                        0.59 kB\n../../out/renderer/assets/stateDiagram-v2-MP3YSRHH-0p0y-C1v.js          0.67 kB\n../../out/renderer/assets/highlighted-body-KPVGNVTW-DGyARlFf.js         0.70 kB\n../../out/renderer/assets/classDiagram-ZZMXUADV-DnW8-Tqk.js             0.71 kB\n../../out/renderer/assets/classDiagram-v2-VYDZK3BY-DnW8-Tqk.js          0.71 kB\n../../out/renderer/assets/swimlanesDiagram-VR7AAH4N-RqrrNqqs.js         0.72 kB\n../../out/renderer/assets/tsv-ChRVFvMy.js                               0.77 kB\n../../out/renderer/assets/tsv-D5Ia16T4.js                               0.77 kB\n../../out/renderer/assets/shellsession-CkeTp4M1.js                      0.79 kB\n../../out/renderer/assets/shellsession-DF07J-v0.js                      0.79 kB\n../../out/renderer/assets/infoDiagram-27XIBGKW-CemloEjD.js              0.95 kB\n../../out/renderer/assets/html-derivative-HU9p64q4.js                   0.97 kB\n../../out/renderer/assets/html-derivative-hBF5i0yR.js                   0.97 kB\n../../out/renderer/assets/qmldir-DuMSk0Oz.js                            1.04 kB\n../../out/renderer/assets/qmldir-CkkEh37r.js                            1.04 kB\n../../out/renderer/assets/git-rebase-D-XQSvDj.js                        1.05 kB\n../../out/renderer/assets/git-rebase-CBPs_8pF.js                        1.05 kB\n../../out/renderer/assets/chunk-POPQ4Y6H-Ck_5XEiZ.js                    1.06 kB\n../../out/renderer/assets/csv-Ba84L8e5.js                               1.17 kB\n../../out/renderer/assets/csv-D9W9MoyR.js                               1.17 kB\n../../out/renderer/assets/git-commit-PP9xCApN.js                        1.28 kB\n../../out/renderer/assets/git-commit-Dv4XKH0P.js                        1.29 kB\n../../out/renderer/assets/xsl-CnwVr_6q.js                               1.43 kB\n../../out/renderer/assets/xsl-DDzizk_a.js                               1.43 kB\n../../out/renderer/assets/dotenv-Bb4iNxXK.js                            1.46 kB\n../../out/renderer/assets/dotenv-C36DH-Tt.js                            1.46 kB\n../../out/renderer/assets/sparql-DswowMAp.js                            1.53 kB\n../../out/renderer/assets/sparql-B6gmlPDA.js                            1.53 kB\n../../out/renderer/assets/ini-B84Ha1bx.js                               1.56 kB\n../../out/renderer/assets/ini-CE4isUWa.js                               1.56 kB\n../../out/renderer/assets/sizeCapture-INFHLROL-CZT_dsqv.js              1.74 kB\n../../out/renderer/assets/fortran-fixed-form-CpmOyvS5.js                1.76 kB\n../../out/renderer/assets/fortran-fixed-form-CiZ197_F.js                1.76 kB\n../../out/renderer/assets/docker-CUaLOm2I.js                            1.78 kB\n../../out/renderer/assets/docker-CPCU3osI.js                            1.78 kB\n../../out/renderer/assets/hxml-Jle7o\n... output truncated ...",
          "stderr": "$ pnpm run typecheck && electron-vite build\n$ tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js (74:0): A comment\n\n\"/** Anchors a pattern source. The interpolation lives here rather than at the call site because\n * esbuild will not drop a `@__PURE__` call whose own argument interpolates a variable, but it\n * will drop `anchor(dateSource)`. Keeping it inline pinned `date` into every bundle. */\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js (400:0): A comment\n\n\"// Wrapped in a `@__PURE__` IIFE: esbuild never tree-shakes a top-level initializer that contains a member access on `Number`, so the bare object literal survived into every bundle.\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues."
        }
      ],
      "evidence": {
        "command": "pnpm run typecheck && rg \"获取可用模型|上下文窗口|最大输出 token|API 协议\" src/renderer/src && pnpm run build",
        "verifiedAt": "2026-09-18T11:42:28.915Z",
        "exitCode": 0,
        "stdout": "src/renderer/src/components/settings/ProviderSettingsDialog.tsx:                <span>API 协议</span>\nsrc/renderer/src/components/settings/ProviderSettingsDialog.tsx:                  {fetchingModels ? '正在获取' : '获取可用模型'}\nsrc/renderer/src/components/settings/ProviderSettingsDialog.tsx:                              <span>上下文窗口</span>\nsrc/renderer/src/components/settings/ProviderSettingsDialog.tsx:                              <span>最大输出 token</span>\nsrc/renderer/src/components/settings/ProviderSettingsDialog.tsx:                    {availableModels.length > 0 ? '没有匹配的已选模型。' : '请先获取可用模型，再将需要的模型加入目录。'}\nvite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 9 modules transformed.\nrendering chunks...\nout/main/index.js  17.25 kB\n✓ built in 70ms\nvite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 2 modules transformed.\nrendering chunks...\nout/preload/index.cjs  1.49 kB\n✓ built in 7ms\nvite v7.3.6 building client environment for production...\ntransforming...\n✓ 5719 modules transformed.\nrendering chunks...\n../../out/renderer/index.html                                           0.46 kB\n../../out/renderer/assets/index-Dk2RmgnW.css                           77.11 kB\n../../out/renderer/assets/channel-s1bYEye3.js                           0.19 kB\n../../out/renderer/assets/init-ZxktEp_H.js                              0.26 kB\n../../out/renderer/assets/chunk-JWPE2WC7-gTZgUhj1.js                    0.36 kB\n../../out/renderer/assets/chunk-2Q5K7J3B-jKM7aN2U.js                    0.37 kB\n../../out/renderer/assets/chunk-5VM5RSS4-CySRFF5x.js                    0.43 kB\n../../out/renderer/assets/chunk-XXDRQBXY-DOPbdTaE.js                    0.48 kB\n../../out/renderer/assets/codeowners-awy7PWCD.js                        0.59 kB\n../../out/renderer/assets/codeowners-Gyog2tLO.js                        0.59 kB\n../../out/renderer/assets/stateDiagram-v2-MP3YSRHH-0p0y-C1v.js          0.67 kB\n../../out/renderer/assets/highlighted-body-KPVGNVTW-DGyARlFf.js         0.70 kB\n../../out/renderer/assets/classDiagram-ZZMXUADV-DnW8-Tqk.js             0.71 kB\n../../out/renderer/assets/classDiagram-v2-VYDZK3BY-DnW8-Tqk.js          0.71 kB\n../../out/renderer/assets/swimlanesDiagram-VR7AAH4N-RqrrNqqs.js         0.72 kB\n../../out/renderer/assets/tsv-ChRVFvMy.js                               0.77 kB\n../../out/renderer/assets/tsv-D5Ia16T4.js                               0.77 kB\n../../out/renderer/assets/shellsession-CkeTp4M1.js                      0.79 kB\n../../out/renderer/assets/shellsession-DF07J-v0.js                      0.79 kB\n../../out/renderer/assets/infoDiagram-27XIBGKW-CemloEjD.js              0.95 kB\n../../out/renderer/assets/html-derivative-HU9p64q4.js                   0.97 kB\n../../out/renderer/assets/html-derivative-hBF5i0yR.js                   0.97 kB\n../../out/renderer/assets/qmldir-DuMSk0Oz.js                            1.04 kB\n../../out/renderer/assets/qmldir-CkkEh37r.js                            1.04 kB\n../../out/renderer/assets/git-rebase-D-XQSvDj.js                        1.05 kB\n../../out/renderer/assets/git-rebase-CBPs_8pF.js                        1.05 kB\n../../out/renderer/assets/chunk-POPQ4Y6H-Ck_5XEiZ.js                    1.06 kB\n../../out/renderer/assets/csv-Ba84L8e5.js                               1.17 kB\n../../out/renderer/assets/csv-D9W9MoyR.js                               1.17 kB\n../../out/renderer/assets/git-commit-PP9xCApN.js                        1.28 kB\n../../out/renderer/assets/git-commit-Dv4XKH0P.js                        1.29 kB\n../../out/renderer/assets/xsl-CnwVr_6q.js                               1.43 kB\n../../out/renderer/assets/xsl-DDzizk_a.js                               1.43 kB\n../../out/renderer/assets/dotenv-Bb4iNxXK.js                            1.46 kB\n../../out/renderer/assets/dotenv-C36DH-Tt.js                            1.46 kB\n../../out/renderer/assets/sparql-DswowMAp.js                            1.53 kB\n../../out/renderer/assets/sparql-B6gmlPDA.js                            \n... output truncated ...",
        "stderr": "$ tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json\n$ pnpm run typecheck && electron-vite build\n$ tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js (74:0): A comment\n\n\"/** Anchors a pattern source. The interpolation lives here rather than at the call site because\n * esbuild will not drop a `@__PURE__` call whose own argument interpolates a variable, but it\n * will drop `anchor(dateSource)`. Keeping it inline pinned `date` into every bundle. */\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js (400:0): A comment\n\n\"// Wrapped in a `@__PURE__` IIFE: esbuild never tree-shakes a top-level initializer that contains a member access on `Number`, so the bare object literal survived into every bundle.\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues."
      }
    }
  ]
}
```
