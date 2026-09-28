# Archived Feature Progress

## Archived Metadata

**Archived At:** 2026-09-28T07:31:18.531Z
**Feature ID:** fix-composer-chinese-ime
**Feature Name:** 修复 Composer 中文输入法
**Archived Status:** done
**Archive Source:** `.agent-harness/feature_list.json`
**Active Feature At Archive Time:** feat-pi-runtime-event-ui

## Archive Note

This feature was not the active progress panel at archive time.
This archive progress file is a structured summary synthesized from `.agent-harness/feature_list.json`.

## Feature Summary

恢复 Composer 中拼音预编辑、候选提交和连续中文输入，保留 slash command 与 Skill 高亮的 literal 语义。

## Dependencies

- none

## Evidence

Verified by .agent-harness/feature_list.json checklist at 2026-09-28T03:01:44.401Z

## Additional Fields Snapshot

```json
{
  "checklist": [
    {
      "action": "在真实 Electron Composer 中验证普通文本与已选 Skill 后的拼音组合输入、候选提交、连续输入及发送内容。",
      "coverage": "e2e",
      "test": "node tests/composer-input-directive-highlight-electron.test.mjs",
      "verify": "node tests/composer-input-directive-highlight-electron.test.mjs",
      "tdd": true,
      "status": "done",
      "testEvidence": {
        "command": "node tests/composer-input-directive-highlight-electron.test.mjs",
        "verifiedAt": "2026-09-28T02:36:06.833Z",
        "exitCode": 0,
        "stdout": "PASS composer input directive highlight Electron smoke",
        "stderr": ""
      },
      "verifyEvidence": {
        "command": "node tests/composer-input-directive-highlight-electron.test.mjs",
        "verifiedAt": "2026-09-28T02:36:10.535Z",
        "exitCode": 0,
        "stdout": "PASS composer input directive highlight Electron smoke",
        "stderr": ""
      },
      "evidence": {
        "command": "node tests/composer-input-directive-highlight-electron.test.mjs",
        "verifiedAt": "2026-09-28T02:36:10.535Z",
        "exitCode": 0,
        "stdout": "PASS composer input directive highlight Electron smoke",
        "stderr": ""
      }
    },
    {
      "action": "定位并修复输入法回归，同时保留 slash 命令键盘操作与现有发送行为。",
      "coverage": "static",
      "test": "node --test tests/composer-input-directive-highlight.test.ts tests/composer-slash-commands.test.ts",
      "verify": [
        "node --test tests/composer-input-directive-highlight.test.ts tests/composer-slash-commands.test.ts",
        "pnpm run typecheck",
        "pnpm run build"
      ],
      "tdd": false,
      "coverage_reason": "输入法组合区的行为由浏览器事件决定，专用 Electron e2e 是回归断言；此项检查组件接线与构建。",
      "status": "done",
      "testEvidence": {
        "command": "node --test tests/composer-input-directive-highlight.test.ts tests/composer-slash-commands.test.ts",
        "verifiedAt": "2026-09-28T02:36:10.782Z",
        "exitCode": 0,
        "stdout": "✔ directive helpers preserve literal text and invalidate edited commands (54.837666ms)\n✔ Composer keeps the literal command while rendering a selected directive token (0.624667ms)\n✔ manual edits invalidate the selected token without changing the outgoing literal formatter (0.276125ms)\n✔ Composer uses the official assistant-ui slash trigger primitives (2.118792ms)\nℹ tests 4\nℹ suites 0\nℹ pass 4\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 213.9415",
        "stderr": ""
      },
      "verifyEvidenceList": [
        {
          "command": "node --test tests/composer-input-directive-highlight.test.ts tests/composer-slash-commands.test.ts",
          "verifiedAt": "2026-09-28T02:36:11.006Z",
          "exitCode": 0,
          "stdout": "✔ directive helpers preserve literal text and invalidate edited commands (48.209667ms)\n✔ Composer keeps the literal command while rendering a selected directive token (0.611459ms)\n✔ manual edits invalidate the selected token without changing the outgoing literal formatter (0.275ms)\n✔ Composer uses the official assistant-ui slash trigger primitives (1.973166ms)\nℹ tests 4\nℹ suites 0\nℹ pass 4\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 201.513292",
          "stderr": ""
        },
        {
          "command": "pnpm run typecheck",
          "verifiedAt": "2026-09-28T02:36:11.634Z",
          "exitCode": 0,
          "stdout": "",
          "stderr": "$ tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json"
        },
        {
          "command": "pnpm run build",
          "verifiedAt": "2026-09-28T02:36:20.670Z",
          "exitCode": 0,
          "stdout": "vite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 47 modules transformed.\nrendering chunks...\nout/main/index-DuZ9XxME.js   16.24 kB\nout/main/index.js           167.16 kB\n✓ built in 161ms\nvite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 98 modules transformed.\nrendering chunks...\nout/preload/index.cjs  173.64 kB\n✓ built in 189ms\nvite v7.3.6 building client environment for production...\ntransforming...\n✓ 3376 modules transformed.\nrendering chunks...\n../../out/renderer/index.html                                    1.43 kB\n../../out/renderer/assets/index-fJOEgz8u.css                   209.94 kB\n../../out/renderer/assets/ReviewPanel-CFeETYnN.js                0.62 kB\n../../out/renderer/assets/PanelPlaceholder-1YGE-40O.js           0.73 kB\n../../out/renderer/assets/BrowserPreviewPanel-jZUkFZPx.js        1.40 kB\n../../out/renderer/assets/addon-fit-D89xfLfG.js                  1.42 kB\n../../out/renderer/assets/SideChatPanel-DVS3qqgA.js              4.39 kB\n../../out/renderer/assets/ParticleSailboatScene-BEQ-Si7K.js      5.28 kB\n../../out/renderer/assets/ChatParticleScene-Cf7jFTzj.js          7.21 kB\n../../out/renderer/assets/TerminalPanel-D5rj3yE3.js             21.70 kB\n../../out/renderer/assets/xterm-R4LLEgbX.js                    411.70 kB\n../../out/renderer/assets/react-three-fiber.esm-CI8p1UDL.js  2,017.80 kB\n../../out/renderer/assets/FilesPanel-D9MV0iAX.js             4,725.90 kB\n../../out/renderer/assets/index-iZndZvz6.js                  6,861.79 kB\n✓ built in 7.62s",
          "stderr": "$ pnpm run typecheck && electron-vite build\n$ tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js (74:0): A comment\n\n\"/** Anchors a pattern source. The interpolation lives here rather than at the call site because\n * esbuild will not drop a `@__PURE__` call whose own argument interpolates a variable, but it\n * will drop `anchor(dateSource)`. Keeping it inline pinned `date` into every bundle. */\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js (400:0): A comment\n\n\"// Wrapped in a `@__PURE__` IIFE: esbuild never tree-shakes a top-level initializer that contains a member access on `Number`, so the bare object literal survived into every bundle.\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js (400:0): A comment\n\n\"// Wrapped in a `@__PURE__` IIFE: esbuild never tree-shakes a top-level initializer that contains a member access on `Number`, so the bare object literal survived into every bundle.\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js (74:0): A comment\n\n\"/** Anchors a pattern source. The interpolation lives here rather than at the call site because\n * esbuild will not drop a `@__PURE__` call whose own argument interpolates a variable, but it\n * will drop `anchor(dateSource)`. Keeping it inline pinned `date` into every bundle. */\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues."
        }
      ],
      "evidence": {
        "command": "node --test tests/composer-input-directive-highlight.test.ts tests/composer-slash-commands.test.ts && pnpm run typecheck && pnpm run build",
        "verifiedAt": "2026-09-28T02:36:20.670Z",
        "exitCode": 0,
        "stdout": "✔ directive helpers preserve literal text and invalidate edited commands (48.209667ms)\n✔ Composer keeps the literal command while rendering a selected directive token (0.611459ms)\n✔ manual edits invalidate the selected token without changing the outgoing literal formatter (0.275ms)\n✔ Composer uses the official assistant-ui slash trigger primitives (1.973166ms)\nℹ tests 4\nℹ suites 0\nℹ pass 4\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 201.513292\nvite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 47 modules transformed.\nrendering chunks...\nout/main/index-DuZ9XxME.js   16.24 kB\nout/main/index.js           167.16 kB\n✓ built in 161ms\nvite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 98 modules transformed.\nrendering chunks...\nout/preload/index.cjs  173.64 kB\n✓ built in 189ms\nvite v7.3.6 building client environment for production...\ntransforming...\n✓ 3376 modules transformed.\nrendering chunks...\n../../out/renderer/index.html                                    1.43 kB\n../../out/renderer/assets/index-fJOEgz8u.css                   209.94 kB\n../../out/renderer/assets/ReviewPanel-CFeETYnN.js                0.62 kB\n../../out/renderer/assets/PanelPlaceholder-1YGE-40O.js           0.73 kB\n../../out/renderer/assets/BrowserPreviewPanel-jZUkFZPx.js        1.40 kB\n../../out/renderer/assets/addon-fit-D89xfLfG.js                  1.42 kB\n../../out/renderer/assets/SideChatPanel-DVS3qqgA.js              4.39 kB\n../../out/renderer/assets/ParticleSailboatScene-BEQ-Si7K.js      5.28 kB\n../../out/renderer/assets/ChatParticleScene-Cf7jFTzj.js          7.21 kB\n../../out/renderer/assets/TerminalPanel-D5rj3yE3.js             21.70 kB\n../../out/renderer/assets/xterm-R4LLEgbX.js                    411.70 kB\n../../out/renderer/assets/react-three-fiber.esm-CI8p1UDL.js  2,017.80 kB\n../../out/renderer/assets/FilesPanel-D9MV0iAX.js             4,725.90 kB\n../../out/renderer/assets/index-iZndZvz6.js                  6,861.79 kB\n✓ built in 7.62s",
        "stderr": "$ tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json\n$ pnpm run typecheck && electron-vite build\n$ tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js (74:0): A comment\n\n\"/** Anchors a pattern source. The interpolation lives here rather than at the call site because\n * esbuild will not drop a `@__PURE__` call whose own argument interpolates a variable, but it\n * will drop `anchor(dateSource)`. Keeping it inline pinned `date` into every bundle. */\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js (400:0): A comment\n\n\"// Wrapped in a `@__PURE__` IIFE: esbuild never tree-shakes a top-level initializer that contains a member access on `Number`, so the bare object literal survived into every bundle.\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js (400:0): A comment\n\n\"// Wrapped in a `@__PURE__` IIFE: esbuild never tree-shakes a top-level initializer that contains a member access on `Number`, so the bare object literal survived into every bundle.\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js (74:0): A comment\n\n\"/** Anchors a pattern source. The interpolation lives here rather than at the call site because\n * esbuild will not drop a `@__PURE__` call whose own argument interpolates a variable, but it\n * will drop `anchor(dateSource)`. Keeping it inline pinned `date` into every bundle. */\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues."
      }
    },
    {
      "action": "拼音组合输入期间继续显示已选 Skill 高亮标记和拼音，不回退显示原始 /skill:* 文本；保持候选上屏和发送内容正确。",
      "coverage": "e2e",
      "test": "node tests/composer-input-directive-highlight-electron.test.mjs",
      "verify": [
        "node tests/composer-input-directive-highlight-electron.test.mjs",
        "node --test tests/composer-input-directive-highlight.test.ts tests/composer-slash-commands.test.ts",
        "pnpm run typecheck",
        "pnpm run build"
      ],
      "tdd": true,
      "status": "done",
      "testEvidence": {
        "command": "node tests/composer-input-directive-highlight-electron.test.mjs",
        "verifiedAt": "2026-09-28T02:48:48.910Z",
        "exitCode": 0,
        "stdout": "PASS composer input directive highlight Electron smoke",
        "stderr": ""
      },
      "verifyEvidenceList": [
        {
          "command": "node tests/composer-input-directive-highlight-electron.test.mjs",
          "verifiedAt": "2026-09-28T02:48:53.093Z",
          "exitCode": 0,
          "stdout": "PASS composer input directive highlight Electron smoke",
          "stderr": ""
        },
        {
          "command": "node --test tests/composer-input-directive-highlight.test.ts tests/composer-slash-commands.test.ts",
          "verifiedAt": "2026-09-28T02:48:53.355Z",
          "exitCode": 0,
          "stdout": "✔ directive helpers preserve literal text and invalidate edited commands (65.787ms)\n✔ Composer keeps the literal command while rendering a selected directive token (0.879292ms)\n✔ manual edits invalidate the selected token without changing the outgoing literal formatter (0.392375ms)\n✔ Composer uses the official assistant-ui slash trigger primitives (2.447833ms)\nℹ tests 4\nℹ suites 0\nℹ pass 4\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 233.165083",
          "stderr": ""
        },
        {
          "command": "pnpm run typecheck",
          "verifiedAt": "2026-09-28T02:48:54.123Z",
          "exitCode": 0,
          "stdout": "",
          "stderr": "$ tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json"
        },
        {
          "command": "pnpm run build",
          "verifiedAt": "2026-09-28T02:49:03.483Z",
          "exitCode": 0,
          "stdout": "vite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 47 modules transformed.\nrendering chunks...\nout/main/index-DuZ9XxME.js   16.24 kB\nout/main/index.js           167.16 kB\n✓ built in 167ms\nvite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 98 modules transformed.\nrendering chunks...\nout/preload/index.cjs  173.64 kB\n✓ built in 182ms\nvite v7.3.6 building client environment for production...\ntransforming...\n✓ 3376 modules transformed.\nrendering chunks...\n../../out/renderer/index.html                                    1.43 kB\n../../out/renderer/assets/index-fJOEgz8u.css                   209.94 kB\n../../out/renderer/assets/ReviewPanel-DxptVxky.js                0.62 kB\n../../out/renderer/assets/PanelPlaceholder-CHYGw7cp.js           0.73 kB\n../../out/renderer/assets/BrowserPreviewPanel-C45v6pcK.js        1.40 kB\n../../out/renderer/assets/addon-fit-D89xfLfG.js                  1.42 kB\n../../out/renderer/assets/SideChatPanel-BYJQJS_i.js              4.39 kB\n../../out/renderer/assets/ParticleSailboatScene-Dw8WL_yl.js      5.28 kB\n../../out/renderer/assets/ChatParticleScene-C7CvdVXV.js          7.21 kB\n../../out/renderer/assets/TerminalPanel-CmAwJUWh.js             21.70 kB\n../../out/renderer/assets/xterm-R4LLEgbX.js                    411.70 kB\n../../out/renderer/assets/react-three-fiber.esm--UcCu5we.js  2,017.80 kB\n../../out/renderer/assets/FilesPanel-CqdbPL6B.js             4,725.90 kB\n../../out/renderer/assets/index-Bn02a0hz.js                  6,861.83 kB\n✓ built in 7.92s",
          "stderr": "$ pnpm run typecheck && electron-vite build\n$ tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js (400:0): A comment\n\n\"// Wrapped in a `@__PURE__` IIFE: esbuild never tree-shakes a top-level initializer that contains a member access on `Number`, so the bare object literal survived into every bundle.\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js (74:0): A comment\n\n\"/** Anchors a pattern source. The interpolation lives here rather than at the call site because\n * esbuild will not drop a `@__PURE__` call whose own argument interpolates a variable, but it\n * will drop `anchor(dateSource)`. Keeping it inline pinned `date` into every bundle. */\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js (74:0): A comment\n\n\"/** Anchors a pattern source. The interpolation lives here rather than at the call site because\n * esbuild will not drop a `@__PURE__` call whose own argument interpolates a variable, but it\n * will drop `anchor(dateSource)`. Keeping it inline pinned `date` into every bundle. */\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js (400:0): A comment\n\n\"// Wrapped in a `@__PURE__` IIFE: esbuild never tree-shakes a top-level initializer that contains a member access on `Number`, so the bare object literal survived into every bundle.\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues."
        }
      ],
      "evidence": {
        "command": "node tests/composer-input-directive-highlight-electron.test.mjs && node --test tests/composer-input-directive-highlight.test.ts tests/composer-slash-commands.test.ts && pnpm run typecheck && pnpm run build",
        "verifiedAt": "2026-09-28T02:49:03.483Z",
        "exitCode": 0,
        "stdout": "PASS composer input directive highlight Electron smoke\n✔ directive helpers preserve literal text and invalidate edited commands (65.787ms)\n✔ Composer keeps the literal command while rendering a selected directive token (0.879292ms)\n✔ manual edits invalidate the selected token without changing the outgoing literal formatter (0.392375ms)\n✔ Composer uses the official assistant-ui slash trigger primitives (2.447833ms)\nℹ tests 4\nℹ suites 0\nℹ pass 4\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 233.165083\nvite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 47 modules transformed.\nrendering chunks...\nout/main/index-DuZ9XxME.js   16.24 kB\nout/main/index.js           167.16 kB\n✓ built in 167ms\nvite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 98 modules transformed.\nrendering chunks...\nout/preload/index.cjs  173.64 kB\n✓ built in 182ms\nvite v7.3.6 building client environment for production...\ntransforming...\n✓ 3376 modules transformed.\nrendering chunks...\n../../out/renderer/index.html                                    1.43 kB\n../../out/renderer/assets/index-fJOEgz8u.css                   209.94 kB\n../../out/renderer/assets/ReviewPanel-DxptVxky.js                0.62 kB\n../../out/renderer/assets/PanelPlaceholder-CHYGw7cp.js           0.73 kB\n../../out/renderer/assets/BrowserPreviewPanel-C45v6pcK.js        1.40 kB\n../../out/renderer/assets/addon-fit-D89xfLfG.js                  1.42 kB\n../../out/renderer/assets/SideChatPanel-BYJQJS_i.js              4.39 kB\n../../out/renderer/assets/ParticleSailboatScene-Dw8WL_yl.js      5.28 kB\n../../out/renderer/assets/ChatParticleScene-C7CvdVXV.js          7.21 kB\n../../out/renderer/assets/TerminalPanel-CmAwJUWh.js             21.70 kB\n../../out/renderer/assets/xterm-R4LLEgbX.js                    411.70 kB\n../../out/renderer/assets/react-three-fiber.esm--UcCu5we.js  2,017.80 kB\n../../out/renderer/assets/FilesPanel-CqdbPL6B.js             4,725.90 kB\n../../out/renderer/assets/index-Bn02a0hz.js                  6,861.83 kB\n✓ built in 7.92s",
        "stderr": "$ tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json\n$ pnpm run typecheck && electron-vite build\n$ tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js (400:0): A comment\n\n\"// Wrapped in a `@__PURE__` IIFE: esbuild never tree-shakes a top-level initializer that contains a member access on `Number`, so the bare object literal survived into every bundle.\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js (74:0): A comment\n\n\"/** Anchors a pattern source. The interpolation lives here rather than at the call site because\n * esbuild will not drop a `@__PURE__` call whose own argument interpolates a variable, but it\n * will drop `anchor(dateSource)`. Keeping it inline pinned `date` into every bundle. */\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js (74:0): A comment\n\n\"/** Anchors a pattern source. The interpolation lives here rather than at the call site because\n * esbuild will not drop a `@__PURE__` call whose own argument interpolates a variable, but it\n * will drop `anchor(dateSource)`. Keeping it inline pinned `date` into every bundle. */\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js (400:0): A comment\n\n\"// Wrapped in a `@__PURE__` IIFE: esbuild never tree-shakes a top-level initializer that contains a member access on `Number`, so the bare object literal survived into every bundle.\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues."
      }
    },
    {
      "action": "移除透明 textarea 的拼写检查红色虚线，并使 Skill 标记文字与相邻正文处于同一行高位置。",
      "coverage": "e2e",
      "test": "node tests/composer-input-directive-highlight-electron.test.mjs",
      "verify": [
        "node tests/composer-input-directive-highlight-electron.test.mjs",
        "node --test tests/composer-input-directive-highlight.test.ts",
        "pnpm run typecheck",
        "pnpm run build"
      ],
      "tdd": true,
      "status": "done",
      "testEvidence": {
        "command": "node tests/composer-input-directive-highlight-electron.test.mjs",
        "verifiedAt": "2026-09-28T03:01:29.121Z",
        "exitCode": 0,
        "stdout": "PASS composer input directive highlight Electron smoke",
        "stderr": ""
      },
      "verifyEvidenceList": [
        {
          "command": "node tests/composer-input-directive-highlight-electron.test.mjs",
          "verifiedAt": "2026-09-28T03:01:33.220Z",
          "exitCode": 0,
          "stdout": "PASS composer input directive highlight Electron smoke",
          "stderr": ""
        },
        {
          "command": "node --test tests/composer-input-directive-highlight.test.ts",
          "verifiedAt": "2026-09-28T03:01:33.486Z",
          "exitCode": 0,
          "stdout": "✔ directive helpers preserve literal text and invalidate edited commands (58.3605ms)\n✔ Composer keeps the literal command while rendering a selected directive token (0.631083ms)\n✔ manual edits invalidate the selected token without changing the outgoing literal formatter (0.2515ms)\nℹ tests 3\nℹ suites 0\nℹ pass 3\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 225.041542",
          "stderr": ""
        },
        {
          "command": "pnpm run typecheck",
          "verifiedAt": "2026-09-28T03:01:34.257Z",
          "exitCode": 0,
          "stdout": "",
          "stderr": "$ tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json"
        },
        {
          "command": "pnpm run build",
          "verifiedAt": "2026-09-28T03:01:44.401Z",
          "exitCode": 0,
          "stdout": "vite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 47 modules transformed.\nrendering chunks...\nout/main/index-DuZ9XxME.js   16.24 kB\nout/main/index.js           167.16 kB\n✓ built in 193ms\nvite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 98 modules transformed.\nrendering chunks...\nout/preload/index.cjs  173.64 kB\n✓ built in 188ms\nvite v7.3.6 building client environment for production...\ntransforming...\n✓ 3376 modules transformed.\nrendering chunks...\n../../out/renderer/index.html                                    1.43 kB\n../../out/renderer/assets/index-cY3Wx8VX.css                   209.94 kB\n../../out/renderer/assets/ReviewPanel-Bn_6vPG0.js                0.62 kB\n../../out/renderer/assets/PanelPlaceholder-8I0N74wu.js           0.73 kB\n../../out/renderer/assets/BrowserPreviewPanel-DvAEHcPr.js        1.40 kB\n../../out/renderer/assets/addon-fit-D89xfLfG.js                  1.42 kB\n../../out/renderer/assets/SideChatPanel-CCJsLZkR.js              4.39 kB\n../../out/renderer/assets/ParticleSailboatScene-Dc_NF9Jr.js      5.28 kB\n../../out/renderer/assets/ChatParticleScene-JFPajFdL.js          7.21 kB\n../../out/renderer/assets/TerminalPanel-BMDQVpJD.js             21.70 kB\n../../out/renderer/assets/xterm-R4LLEgbX.js                    411.70 kB\n../../out/renderer/assets/react-three-fiber.esm-CAT-CPvU.js  2,017.80 kB\n../../out/renderer/assets/FilesPanel-49SJTtTS.js             4,725.90 kB\n../../out/renderer/assets/index-FQ71DWIw.js                  6,861.86 kB\n✓ built in 8.60s",
          "stderr": "$ pnpm run typecheck && electron-vite build\n$ tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js (400:0): A comment\n\n\"// Wrapped in a `@__PURE__` IIFE: esbuild never tree-shakes a top-level initializer that contains a member access on `Number`, so the bare object literal survived into every bundle.\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js (74:0): A comment\n\n\"/** Anchors a pattern source. The interpolation lives here rather than at the call site because\n * esbuild will not drop a `@__PURE__` call whose own argument interpolates a variable, but it\n * will drop `anchor(dateSource)`. Keeping it inline pinned `date` into every bundle. */\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js (74:0): A comment\n\n\"/** Anchors a pattern source. The interpolation lives here rather than at the call site because\n * esbuild will not drop a `@__PURE__` call whose own argument interpolates a variable, but it\n * will drop `anchor(dateSource)`. Keeping it inline pinned `date` into every bundle. */\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js (400:0): A comment\n\n\"// Wrapped in a `@__PURE__` IIFE: esbuild never tree-shakes a top-level initializer that contains a member access on `Number`, so the bare object literal survived into every bundle.\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues."
        }
      ],
      "evidence": {
        "command": "node tests/composer-input-directive-highlight-electron.test.mjs && node --test tests/composer-input-directive-highlight.test.ts && pnpm run typecheck && pnpm run build",
        "verifiedAt": "2026-09-28T03:01:44.401Z",
        "exitCode": 0,
        "stdout": "PASS composer input directive highlight Electron smoke\n✔ directive helpers preserve literal text and invalidate edited commands (58.3605ms)\n✔ Composer keeps the literal command while rendering a selected directive token (0.631083ms)\n✔ manual edits invalidate the selected token without changing the outgoing literal formatter (0.2515ms)\nℹ tests 3\nℹ suites 0\nℹ pass 3\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 225.041542\nvite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 47 modules transformed.\nrendering chunks...\nout/main/index-DuZ9XxME.js   16.24 kB\nout/main/index.js           167.16 kB\n✓ built in 193ms\nvite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 98 modules transformed.\nrendering chunks...\nout/preload/index.cjs  173.64 kB\n✓ built in 188ms\nvite v7.3.6 building client environment for production...\ntransforming...\n✓ 3376 modules transformed.\nrendering chunks...\n../../out/renderer/index.html                                    1.43 kB\n../../out/renderer/assets/index-cY3Wx8VX.css                   209.94 kB\n../../out/renderer/assets/ReviewPanel-Bn_6vPG0.js                0.62 kB\n../../out/renderer/assets/PanelPlaceholder-8I0N74wu.js           0.73 kB\n../../out/renderer/assets/BrowserPreviewPanel-DvAEHcPr.js        1.40 kB\n../../out/renderer/assets/addon-fit-D89xfLfG.js                  1.42 kB\n../../out/renderer/assets/SideChatPanel-CCJsLZkR.js              4.39 kB\n../../out/renderer/assets/ParticleSailboatScene-Dc_NF9Jr.js      5.28 kB\n../../out/renderer/assets/ChatParticleScene-JFPajFdL.js          7.21 kB\n../../out/renderer/assets/TerminalPanel-BMDQVpJD.js             21.70 kB\n../../out/renderer/assets/xterm-R4LLEgbX.js                    411.70 kB\n../../out/renderer/assets/react-three-fiber.esm-CAT-CPvU.js  2,017.80 kB\n../../out/renderer/assets/FilesPanel-49SJTtTS.js             4,725.90 kB\n../../out/renderer/assets/index-FQ71DWIw.js                  6,861.86 kB\n✓ built in 8.60s",
        "stderr": "$ tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json\n$ pnpm run typecheck && electron-vite build\n$ tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js (400:0): A comment\n\n\"// Wrapped in a `@__PURE__` IIFE: esbuild never tree-shakes a top-level initializer that contains a member access on `Number`, so the bare object literal survived into every bundle.\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js (74:0): A comment\n\n\"/** Anchors a pattern source. The interpolation lives here rather than at the call site because\n * esbuild will not drop a `@__PURE__` call whose own argument interpolates a variable, but it\n * will drop `anchor(dateSource)`. Keeping it inline pinned `date` into every bundle. */\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js (74:0): A comment\n\n\"/** Anchors a pattern source. The interpolation lives here rather than at the call site because\n * esbuild will not drop a `@__PURE__` call whose own argument interpolates a variable, but it\n * will drop `anchor(dateSource)`. Keeping it inline pinned `date` into every bundle. */\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js (400:0): A comment\n\n\"// Wrapped in a `@__PURE__` IIFE: esbuild never tree-shakes a top-level initializer that contains a member access on `Number`, so the bare object literal survived into every bundle.\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues."
      }
    }
  ]
}
```
