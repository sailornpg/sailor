# Archived Feature Progress

## Archived Metadata

**Archived At:** 2026-09-21T02:12:34.598Z
**Feature ID:** feat-assistant-ui-composer
**Feature Name:** 使用 assistant-ui Composer 重做任务输入区
**Archived Status:** done
**Archive Source:** `.agent-harness/feature_list.json`
**Active Feature At Archive Time:** feat-web-search-tool

## Archive Note

This feature was not the active progress panel at archive time.
This archive progress file is a structured summary synthesized from `.agent-harness/feature_list.json`.

## Feature Summary

直接复用已安装的 assistant-ui Thread Composer 源组件与视觉结构，保留 Sailor 的模型、推理、保存错误和按会话停止语义，使桌面与窄窗口输入区统一遵循 assistant-ui 的简洁设计。

## Dependencies

- feat-assistant-ui-migration

## Evidence

Verified by .agent-harness/feature_list.json checklist at 2026-09-20T09:12:30.519Z

## Additional Fields Snapshot

```json
{
  "checklist": [
    {
      "action": "将官方 thread.aui Composer 导出为可复用元素，并增加仅用于组合业务控件的 leading/trailing 插槽；保持官方 shell、输入区、附件区域、拖拽容器和基础按钮样式。",
      "coverage": "static",
      "verify": [
        "rg -n 'export const Composer|ComposerAttachments|AttachmentDropzone' src/renderer/src/components/assistant-ui/elements/thread.aui.tsx",
        "pnpm run typecheck"
      ],
      "tdd": false,
      "coverage_reason": "这是对已复制 assistant-ui source component 的静态组合接口与样式接线，类型检查能直接验证插槽契约。",
      "status": "done",
      "verifyEvidenceList": [
        {
          "command": "rg -n 'export const Composer|ComposerAttachments|AttachmentDropzone' src/renderer/src/components/assistant-ui/elements/thread.aui.tsx",
          "verifiedAt": "2026-09-20T07:42:46.120Z",
          "exitCode": 0,
          "stdout": "5:  ComposerAttachments,\n431:export const Composer: FC<ComposerProps> = ({\n440:      <ComposerPrimitive.AttachmentDropzone asChild>\n445:          <ComposerAttachments />\n457:      </ComposerPrimitive.AttachmentDropzone>",
          "stderr": ""
        },
        {
          "command": "pnpm run typecheck",
          "verifiedAt": "2026-09-20T07:42:46.915Z",
          "exitCode": 0,
          "stdout": "",
          "stderr": "$ tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json"
        }
      ],
      "evidence": {
        "command": "rg -n 'export const Composer|ComposerAttachments|AttachmentDropzone' src/renderer/src/components/assistant-ui/elements/thread.aui.tsx && pnpm run typecheck",
        "verifiedAt": "2026-09-20T07:42:46.915Z",
        "exitCode": 0,
        "stdout": "5:  ComposerAttachments,\n431:export const Composer: FC<ComposerProps> = ({\n440:      <ComposerPrimitive.AttachmentDropzone asChild>\n445:          <ComposerAttachments />\n457:      </ComposerPrimitive.AttachmentDropzone>",
        "stderr": "$ tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json"
      }
    },
    {
      "action": "让 SailorComposer 直接组合官方 Composer，接回模型及推理选择、无模型设置入口、发送保护、保存错误重试和按 runId 停止；移除旧自绘 composer CSS。",
      "coverage": "integration",
      "test": "node --test tests/assistant-ui-runtime.test.ts tests/assistant-ui-boundaries.test.ts",
      "verify": [
        "node --test tests/assistant-ui-runtime.test.ts tests/assistant-ui-boundaries.test.ts",
        "pnpm run build"
      ],
      "tdd": true,
      "status": "done",
      "testEvidence": {
        "command": "node --test tests/assistant-ui-runtime.test.ts tests/assistant-ui-boundaries.test.ts",
        "verifiedAt": "2026-09-20T07:47:24.533Z",
        "exitCode": 0,
        "stdout": "✔ legacy AI Elements sources and imports are absent (25.288459ms)\n✔ generic assistant-ui elements do not reach into Sailor business boundaries (6.312459ms)\n✔ Sailor composer composes the official assistant-ui elements without a parallel shell (1.335666ms)\n✔ composer policy blocks invalid submissions and clears a recoverable error (43.894875ms)\n✔ stop targets the persisted run and otherwise delegates to the active chat (14.210667ms)\n✔ workspace registry keeps stable isolated Chat instances while selection changes (83.380334ms)\nℹ tests 6\nℹ suites 0\nℹ pass 6\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 350.993291",
        "stderr": ""
      },
      "verifyEvidenceList": [
        {
          "command": "node --test tests/assistant-ui-runtime.test.ts tests/assistant-ui-boundaries.test.ts",
          "verifiedAt": "2026-09-20T07:47:24.853Z",
          "exitCode": 0,
          "stdout": "✔ legacy AI Elements sources and imports are absent (9.49225ms)\n✔ generic assistant-ui elements do not reach into Sailor business boundaries (2.237208ms)\n✔ Sailor composer composes the official assistant-ui elements without a parallel shell (0.985083ms)\n✔ composer policy blocks invalid submissions and clears a recoverable error (38.265084ms)\n✔ stop targets the persisted run and otherwise delegates to the active chat (13.348833ms)\n✔ workspace registry keeps stable isolated Chat instances while selection changes (61.175125ms)\nℹ tests 6\nℹ suites 0\nℹ pass 6\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 292.782875",
          "stderr": ""
        },
        {
          "command": "pnpm run build",
          "verifiedAt": "2026-09-20T07:47:28.637Z",
          "exitCode": 0,
          "stdout": "vite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 16 modules transformed.\nrendering chunks...\nout/main/index.js  35.08 kB\n✓ built in 71ms\nvite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 2 modules transformed.\nrendering chunks...\nout/preload/index.cjs  2.52 kB\n✓ built in 7ms\nvite v7.3.6 building client environment for production...\ntransforming...\n✓ 3081 modules transformed.\nrendering chunks...\n../../out/renderer/index.html                     1.43 kB\n../../out/renderer/assets/index-B5BhCTQf.css    131.98 kB\n../../out/renderer/assets/index-jOy0Z1ub.js   2,779.79 kB\n✓ built in 2.54s",
          "stderr": "$ pnpm run typecheck && electron-vite build\n$ tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js (400:0): A comment\n\n\"// Wrapped in a `@__PURE__` IIFE: esbuild never tree-shakes a top-level initializer that contains a member access on `Number`, so the bare object literal survived into every bundle.\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js (74:0): A comment\n\n\"/** Anchors a pattern source. The interpolation lives here rather than at the call site because\n * esbuild will not drop a `@__PURE__` call whose own argument interpolates a variable, but it\n * will drop `anchor(dateSource)`. Keeping it inline pinned `date` into every bundle. */\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues."
        }
      ],
      "evidence": {
        "command": "node --test tests/assistant-ui-runtime.test.ts tests/assistant-ui-boundaries.test.ts && pnpm run build",
        "verifiedAt": "2026-09-20T07:47:28.637Z",
        "exitCode": 0,
        "stdout": "✔ legacy AI Elements sources and imports are absent (9.49225ms)\n✔ generic assistant-ui elements do not reach into Sailor business boundaries (2.237208ms)\n✔ Sailor composer composes the official assistant-ui elements without a parallel shell (0.985083ms)\n✔ composer policy blocks invalid submissions and clears a recoverable error (38.265084ms)\n✔ stop targets the persisted run and otherwise delegates to the active chat (13.348833ms)\n✔ workspace registry keeps stable isolated Chat instances while selection changes (61.175125ms)\nℹ tests 6\nℹ suites 0\nℹ pass 6\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 292.782875\nvite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 16 modules transformed.\nrendering chunks...\nout/main/index.js  35.08 kB\n✓ built in 71ms\nvite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 2 modules transformed.\nrendering chunks...\nout/preload/index.cjs  2.52 kB\n✓ built in 7ms\nvite v7.3.6 building client environment for production...\ntransforming...\n✓ 3081 modules transformed.\nrendering chunks...\n../../out/renderer/index.html                     1.43 kB\n../../out/renderer/assets/index-B5BhCTQf.css    131.98 kB\n../../out/renderer/assets/index-jOy0Z1ub.js   2,779.79 kB\n✓ built in 2.54s",
        "stderr": "$ pnpm run typecheck && electron-vite build\n$ tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js (400:0): A comment\n\n\"// Wrapped in a `@__PURE__` IIFE: esbuild never tree-shakes a top-level initializer that contains a member access on `Number`, so the bare object literal survived into every bundle.\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js (74:0): A comment\n\n\"/** Anchors a pattern source. The interpolation lives here rather than at the call site because\n * esbuild will not drop a `@__PURE__` call whose own argument interpolates a variable, but it\n * will drop `anchor(dateSource)`. Keeping it inline pinned `date` into every bundle. */\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues."
      }
    },
    {
      "action": "通过 assistant-ui registry 安装 elements-composer standalone source 和共享 surface tokens；使用 Composer、ComposerBar、ComposerToolbar、ComposerActions、ComposerModelTrigger 与 ComposerSend 重构 SailorComposer 外观，并以 ComposerPrimitive 保留 runtime 输入、提交和附件状态。",
      "coverage": "integration",
      "test": "node --test tests/assistant-ui-boundaries.test.ts tests/assistant-ui-runtime.test.ts",
      "verify": [
        "test -s src/renderer/src/components/assistant-ui/elements/composer.tsx",
        "rg -n 'ComposerBar|ComposerModelTrigger|ComposerSend' src/renderer/src/components/chat/composer/SailorComposer.tsx",
        "node --test tests/assistant-ui-boundaries.test.ts tests/assistant-ui-runtime.test.ts",
        "pnpm run build"
      ],
      "tdd": true,
      "status": "done",
      "testEvidence": {
        "command": "node --test tests/assistant-ui-boundaries.test.ts tests/assistant-ui-runtime.test.ts",
        "verifiedAt": "2026-09-20T08:17:53.128Z",
        "exitCode": 0,
        "stdout": "✔ legacy AI Elements sources and imports are absent (24.570875ms)\n✔ generic assistant-ui elements do not reach into Sailor business boundaries (6.20225ms)\n✔ Sailor composer uses the standalone elements-composer surface with runtime primitives (1.091ms)\n✔ composer policy blocks invalid submissions and clears a recoverable error (59.765958ms)\n✔ stop targets the persisted run and otherwise delegates to the active chat (91.069042ms)\n✔ workspace registry keeps stable isolated Chat instances while selection changes (177.532833ms)\nℹ tests 6\nℹ suites 0\nℹ pass 6\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 495.460625",
        "stderr": ""
      },
      "verifyEvidenceList": [
        {
          "command": "test -s src/renderer/src/components/assistant-ui/elements/composer.tsx",
          "verifiedAt": "2026-09-20T08:17:53.134Z",
          "exitCode": 0,
          "stdout": "",
          "stderr": ""
        },
        {
          "command": "rg -n 'ComposerBar|ComposerModelTrigger|ComposerSend' src/renderer/src/components/chat/composer/SailorComposer.tsx",
          "verifiedAt": "2026-09-20T08:17:53.148Z",
          "exitCode": 0,
          "stdout": "21:  ComposerBar,\n22:  ComposerModelTrigger,\n23:  ComposerSend,\n167:            <ComposerBar>\n209:                        <ComposerModelTrigger\n223:                  <ComposerSend\n231:                    <ComposerSend\n241:            </ComposerBar>",
          "stderr": ""
        },
        {
          "command": "node --test tests/assistant-ui-boundaries.test.ts tests/assistant-ui-runtime.test.ts",
          "verifiedAt": "2026-09-20T08:17:53.591Z",
          "exitCode": 0,
          "stdout": "✔ legacy AI Elements sources and imports are absent (9.974625ms)\n✔ generic assistant-ui elements do not reach into Sailor business boundaries (3.73175ms)\n✔ Sailor composer uses the standalone elements-composer surface with runtime primitives (0.592959ms)\n✔ composer policy blocks invalid submissions and clears a recoverable error (49.484584ms)\n✔ stop targets the persisted run and otherwise delegates to the active chat (86.914917ms)\n✔ workspace registry keeps stable isolated Chat instances while selection changes (148.206125ms)\nℹ tests 6\nℹ suites 0\nℹ pass 6\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 417.630875",
          "stderr": ""
        },
        {
          "command": "pnpm run build",
          "verifiedAt": "2026-09-20T08:17:57.756Z",
          "exitCode": 0,
          "stdout": "vite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 16 modules transformed.\nrendering chunks...\nout/main/index.js  35.08 kB\n✓ built in 81ms\nvite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 2 modules transformed.\nrendering chunks...\nout/preload/index.cjs  2.52 kB\n✓ built in 9ms\nvite v7.3.6 building client environment for production...\ntransforming...\n✓ 3084 modules transformed.\nrendering chunks...\n../../out/renderer/index.html                     1.43 kB\n../../out/renderer/assets/index-CKvFO62D.css    148.60 kB\n../../out/renderer/assets/index-BWIjl-Oe.js   2,791.16 kB\n✓ built in 2.90s",
          "stderr": "$ pnpm run typecheck && electron-vite build\n$ tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js (400:0): A comment\n\n\"// Wrapped in a `@__PURE__` IIFE: esbuild never tree-shakes a top-level initializer that contains a member access on `Number`, so the bare object literal survived into every bundle.\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js (74:0): A comment\n\n\"/** Anchors a pattern source. The interpolation lives here rather than at the call site because\n * esbuild will not drop a `@__PURE__` call whose own argument interpolates a variable, but it\n * will drop `anchor(dateSource)`. Keeping it inline pinned `date` into every bundle. */\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues."
        }
      ],
      "evidence": {
        "command": "test -s src/renderer/src/components/assistant-ui/elements/composer.tsx && rg -n 'ComposerBar|ComposerModelTrigger|ComposerSend' src/renderer/src/components/chat/composer/SailorComposer.tsx && node --test tests/assistant-ui-boundaries.test.ts tests/assistant-ui-runtime.test.ts && pnpm run build",
        "verifiedAt": "2026-09-20T08:17:57.756Z",
        "exitCode": 0,
        "stdout": "21:  ComposerBar,\n22:  ComposerModelTrigger,\n23:  ComposerSend,\n167:            <ComposerBar>\n209:                        <ComposerModelTrigger\n223:                  <ComposerSend\n231:                    <ComposerSend\n241:            </ComposerBar>\n✔ legacy AI Elements sources and imports are absent (9.974625ms)\n✔ generic assistant-ui elements do not reach into Sailor business boundaries (3.73175ms)\n✔ Sailor composer uses the standalone elements-composer surface with runtime primitives (0.592959ms)\n✔ composer policy blocks invalid submissions and clears a recoverable error (49.484584ms)\n✔ stop targets the persisted run and otherwise delegates to the active chat (86.914917ms)\n✔ workspace registry keeps stable isolated Chat instances while selection changes (148.206125ms)\nℹ tests 6\nℹ suites 0\nℹ pass 6\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 417.630875\nvite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 16 modules transformed.\nrendering chunks...\nout/main/index.js  35.08 kB\n✓ built in 81ms\nvite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 2 modules transformed.\nrendering chunks...\nout/preload/index.cjs  2.52 kB\n✓ built in 9ms\nvite v7.3.6 building client environment for production...\ntransforming...\n✓ 3084 modules transformed.\nrendering chunks...\n../../out/renderer/index.html                     1.43 kB\n../../out/renderer/assets/index-CKvFO62D.css    148.60 kB\n../../out/renderer/assets/index-BWIjl-Oe.js   2,791.16 kB\n✓ built in 2.90s",
        "stderr": "$ pnpm run typecheck && electron-vite build\n$ tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js (400:0): A comment\n\n\"// Wrapped in a `@__PURE__` IIFE: esbuild never tree-shakes a top-level initializer that contains a member access on `Number`, so the bare object literal survived into every bundle.\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js (74:0): A comment\n\n\"/** Anchors a pattern source. The interpolation lives here rather than at the call site because\n * esbuild will not drop a `@__PURE__` call whose own argument interpolates a variable, but it\n * will drop `anchor(dateSource)`. Keeping it inline pinned `date` into every bundle. */\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues."
      }
    },
    {
      "action": "在真实 Electron 中验收空会话与已有消息下的 Composer，覆盖桌面和窄窗口、输入发送、停止、模型/推理选择、保存错误展示及无横向溢出；记录视觉证据并完成全量回归与 clean-state。",
      "coverage": "manual-exception",
      "verify": [
        "test -s .agent-harness/evidence/assistant-ui-composer-acceptance.md",
        "rg -n '^Acceptance: PASS$' .agent-harness/evidence/assistant-ui-composer-acceptance.md",
        "node --test tests/*.test.ts",
        "node .agent-harness/scripts/clean-state-check.mjs --skip-verification"
      ],
      "tdd": false,
      "coverage_reason": "输入区的层级、间距、响应式布局和官方设计一致性主要依赖真实 Electron 交互与截图判断；自动测试和构建覆盖功能回归。",
      "status": "done",
      "verifyEvidenceList": [
        {
          "command": "test -s .agent-harness/evidence/assistant-ui-composer-acceptance.md",
          "verifiedAt": "2026-09-20T09:12:27.523Z",
          "exitCode": 0,
          "stdout": "",
          "stderr": ""
        },
        {
          "command": "rg -n '^Acceptance: PASS$' .agent-harness/evidence/assistant-ui-composer-acceptance.md",
          "verifiedAt": "2026-09-20T09:12:27.538Z",
          "exitCode": 0,
          "stdout": "41:Acceptance: PASS",
          "stderr": ""
        },
        {
          "command": "node --test tests/*.test.ts",
          "verifiedAt": "2026-09-20T09:12:30.482Z",
          "exitCode": 0,
          "stdout": "✔ splits a coarse Chinese provider delta into incremental UI chunks before end (761.599541ms)\n✔ aborting an active stream stops later chunks and emits one end event (306.5395ms)\n✔ does not advertise the retired tool and still streams an answer (634.444208ms)\n✔ reads valid preferences and falls back on invalid persisted values (4.239417ms)\n✔ persists preferences and reports storage failures without throwing (0.192917ms)\n✔ applies the saved appearance before consumers read runtime state (391.930334ms)\n✔ system mode follows OS changes while explicit themes ignore them (305.147208ms)\n✔ disposes exactly one system listener and supports repeated StrictMode setup (240.52425ms)\n✔ legacy AI Elements sources and imports are absent (97.766375ms)\n✔ generic assistant-ui elements do not reach into Sailor business boundaries (7.470792ms)\n✔ Sailor composer uses the standalone elements-composer surface with runtime primitives (1.0265ms)\n✔ official tool UI renders structured results and errors without a custom plan view (1656.982833ms)\n✔ composer policy blocks invalid submissions and clears a recoverable error (116.901917ms)\n✔ model selector slots a custom trigger when its built-in chevron is hidden (796.347834ms)\n✔ stop targets the persisted run and otherwise delegates to the active chat (307.093291ms)\n✔ workspace registry keeps stable isolated Chat instances while selection changes (221.474708ms)\n✔ consolidates multiple reasoning parts into one presentation block (186.926708ms)\n✔ stops the reasoning indicator when answer text has started (333.251291ms)\n✔ filters the provider catalog and excludes configured models (6.123125ms)\n✔ toggles an individual model selection without duplicates (0.160291ms)\n✔ selects or clears all visible models while preserving hidden selections (0.112666ms)\n✔ appends selected models with default capabilities and skips existing IDs (0.198167ms)\n✔ uses the provider default model factory for the Responses protocol (0.811375ms)\n✔ uses chat completions for custom OpenAI-compatible providers (0.095875ms)\n✔ fetches, normalizes, deduplicates and sorts an OpenAI-compatible model catalog (36.784709ms)\n✔ uses an unsaved API key for a new provider (4.772917ms)\n✔ reports provider errors and malformed catalogs in Chinese (4.118542ms)\n✔ requires a key when neither the form nor saved settings provide one (4.188875ms)\n✔ uses the dedicated DeepSeek provider factory for the built-in provider (1.300958ms)\n✔ enables OpenAI Responses reasoning summaries only for that protocol (0.134292ms)\n✔ passes supported reasoning to the model and falls back for unsupported levels (356.09125ms)\n✔ exposes only supported reasoning efforts in stable UI order (1.2245ms)\n✔ creates an agent request carrying the selected reasoning effort (0.734958ms)\n✔ starts with editable OpenAI and DeepSeek provider presets (6.991666ms)\n✔ persists only encrypted credentials and never returns a saved API key (5.533291ms)\n✔ blank credentials preserve the stored key and active model resolution decrypts it (6.612375ms)\n✔ migrates version 1 string models without losing credentials or active selection (11.446708ms)\n✔ rejects non-positive model limits (1.497875ms)\n✔ rejects invalid provider IDs and active models outside the provider catalog (0.907ms)\n✔ 同/跨工作区并行，切换不终止，后台保存完整输出和未读状态 (552.400125ms)\n✔ 同会话重复提交被拒绝；停止一个不会停止另一个并保留部分输出 (220.046792ms)\n✔ 保存失败保留内存消息与错误，可重试且不影响另一会话 (43.232167ms)\n✔ renderer 实例跨视图保留，快速切换只采用最后一次选择 (65.0885ms)\n✔ 取消后的未完成工具 parts 保留历史且可安全续聊 (153.159708ms)\n✔ 恢复中断运行不自动调用模型，运行前异常仍释放会话锁 (147.04875ms)\n✔ 切换视图不等待偏好写盘，偏好失败不会阻止访问其他会话 (42.124709ms)\n✔ 已删除工具的成功历史可恢复且不会重新执行 (144.734625ms)\n✔ 取消目录选择无记录，选择后可创建并读取会话 (433.969084ms)\n✔ 根据 chatId 解析真实目录，拒绝非法消息和不存在会话 (158.840833ms)\n✔ 目录失效可读历史，但禁止运行；恢复消息用 SDK 验证 (127.538666ms)\n✔ 真实目录去重，包括符号链接；取消外的无效目录不能注册 (315.550792ms)\n✔ 会话外键、首条标题限长、完整 parts 和偏好在重启后恢复 (165.320291ms)\n✔ 并发写入不丢会话，旧 run 不能覆盖新 run (125.294125ms)\n✔ 损坏和非法外键文件不被覆盖 (124.156792ms)\nℹ tests 54\nℹ suites 0\nℹ pass 54\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 2917.503042",
          "stderr": ""
        },
        {
          "command": "node .agent-harness/scripts/clean-state-check.mjs --skip-verification",
          "verifiedAt": "2026-09-20T09:12:30.518Z",
          "exitCode": 0,
          "stdout": "=== Clean-state passed ===",
          "stderr": ""
        }
      ],
      "evidence": {
        "command": "test -s .agent-harness/evidence/assistant-ui-composer-acceptance.md && rg -n '^Acceptance: PASS$' .agent-harness/evidence/assistant-ui-composer-acceptance.md && node --test tests/*.test.ts && node .agent-harness/scripts/clean-state-check.mjs --skip-verification",
        "verifiedAt": "2026-09-20T09:12:30.518Z",
        "exitCode": 0,
        "stdout": "41:Acceptance: PASS\n✔ splits a coarse Chinese provider delta into incremental UI chunks before end (761.599541ms)\n✔ aborting an active stream stops later chunks and emits one end event (306.5395ms)\n✔ does not advertise the retired tool and still streams an answer (634.444208ms)\n✔ reads valid preferences and falls back on invalid persisted values (4.239417ms)\n✔ persists preferences and reports storage failures without throwing (0.192917ms)\n✔ applies the saved appearance before consumers read runtime state (391.930334ms)\n✔ system mode follows OS changes while explicit themes ignore them (305.147208ms)\n✔ disposes exactly one system listener and supports repeated StrictMode setup (240.52425ms)\n✔ legacy AI Elements sources and imports are absent (97.766375ms)\n✔ generic assistant-ui elements do not reach into Sailor business boundaries (7.470792ms)\n✔ Sailor composer uses the standalone elements-composer surface with runtime primitives (1.0265ms)\n✔ official tool UI renders structured results and errors without a custom plan view (1656.982833ms)\n✔ composer policy blocks invalid submissions and clears a recoverable error (116.901917ms)\n✔ model selector slots a custom trigger when its built-in chevron is hidden (796.347834ms)\n✔ stop targets the persisted run and otherwise delegates to the active chat (307.093291ms)\n✔ workspace registry keeps stable isolated Chat instances while selection changes (221.474708ms)\n✔ consolidates multiple reasoning parts into one presentation block (186.926708ms)\n✔ stops the reasoning indicator when answer text has started (333.251291ms)\n✔ filters the provider catalog and excludes configured models (6.123125ms)\n✔ toggles an individual model selection without duplicates (0.160291ms)\n✔ selects or clears all visible models while preserving hidden selections (0.112666ms)\n✔ appends selected models with default capabilities and skips existing IDs (0.198167ms)\n✔ uses the provider default model factory for the Responses protocol (0.811375ms)\n✔ uses chat completions for custom OpenAI-compatible providers (0.095875ms)\n✔ fetches, normalizes, deduplicates and sorts an OpenAI-compatible model catalog (36.784709ms)\n✔ uses an unsaved API key for a new provider (4.772917ms)\n✔ reports provider errors and malformed catalogs in Chinese (4.118542ms)\n✔ requires a key when neither the form nor saved settings provide one (4.188875ms)\n✔ uses the dedicated DeepSeek provider factory for the built-in provider (1.300958ms)\n✔ enables OpenAI Responses reasoning summaries only for that protocol (0.134292ms)\n✔ passes supported reasoning to the model and falls back for unsupported levels (356.09125ms)\n✔ exposes only supported reasoning efforts in stable UI order (1.2245ms)\n✔ creates an agent request carrying the selected reasoning effort (0.734958ms)\n✔ starts with editable OpenAI and DeepSeek provider presets (6.991666ms)\n✔ persists only encrypted credentials and never returns a saved API key (5.533291ms)\n✔ blank credentials preserve the stored key and active model resolution decrypts it (6.612375ms)\n✔ migrates version 1 string models without losing credentials or active selection (11.446708ms)\n✔ rejects non-positive model limits (1.497875ms)\n✔ rejects invalid provider IDs and active models outside the provider catalog (0.907ms)\n✔ 同/跨工作区并行，切换不终止，后台保存完整输出和未读状态 (552.400125ms)\n✔ 同会话重复提交被拒绝；停止一个不会停止另一个并保留部分输出 (220.046792ms)\n✔ 保存失败保留内存消息与错误，可重试且不影响另一会话 (43.232167ms)\n✔ renderer 实例跨视图保留，快速切换只采用最后一次选择 (65.0885ms)\n✔ 取消后的未完成工具 parts 保留历史且可安全续聊 (153.159708ms)\n✔ 恢复中断运行不自动调用模型，运行前异常仍释放会话锁 (147.04875ms)\n✔ 切换视图不等待偏好写盘，偏好失败不会阻止访问其他会话 (42.124709ms)\n✔ 已删除工具的成功历史可恢复且不会重新执行 (144.734625ms)\n✔ 取消目录选择无记录，选择后可创建并读取会话 (433.969084ms)\n✔ 根据 chatId 解析真实目录，拒绝非法消息和不存在会话 (158.840833ms)\n✔ 目录失效可读历史，但禁止运行；恢复消息用 SDK 验证 (127.538666ms)\n✔ 真实目录去重，包括符号链接；取消外的无效目录不能注册 (315.550792ms)\n✔ 会话外键、首条标题限长、完整 parts 和偏好在重启后恢复 (165.320291ms)\n✔ 并发写入不丢会话，旧 run 不能覆盖新 run (125.294125ms)\n✔ 损坏和非法外键文件不被覆盖 (124.156792ms)\nℹ tests 54\nℹ suites 0\nℹ pass 54\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ dura\n... output truncated ...",
        "stderr": ""
      }
    }
  ]
}
```
