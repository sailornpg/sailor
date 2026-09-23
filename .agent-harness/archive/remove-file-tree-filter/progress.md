# Archived Feature Progress

## Archived Metadata

**Archived At:** 2026-09-23T07:28:33.224Z
**Feature ID:** remove-file-tree-filter
**Feature Name:** 移除文件树筛选输入框
**Archived Status:** done
**Archive Source:** `.agent-harness/feature_list.json`
**Active Feature At Archive Time:** none

## Archive Note

This feature was not the active progress panel at archive time.
This archive progress file is a structured summary synthesized from `.agent-harness/feature_list.json`.

## Feature Summary

No description recorded.

## Dependencies

- none

## Evidence

Verified by .agent-harness/feature_list.json checklist at 2026-09-23T07:21:20.334Z

## Additional Fields Snapshot

```json
{
  "checklist": [
    {
      "action": "移除顶部文件筛选框及专用状态和样式，文件树直接展示目录列表",
      "coverage": "static",
      "coverage_reason": "局部控件移除，复用文件树渲染测试与构建验证。",
      "tdd": false,
      "status": "done",
      "verify": [
        "node --test tests/files-panel.test.ts",
        "pnpm run build"
      ],
      "verifyEvidenceList": [
        {
          "command": "node --test tests/files-panel.test.ts",
          "verifiedAt": "2026-09-23T07:21:10.183Z",
          "exitCode": 0,
          "stdout": "✔ 文件树展示嵌套目录、选中态和离线 SVG 图标 (660.060708ms)\nℹ tests 1\nℹ suites 0\nℹ pass 1\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 883.645208",
          "stderr": ""
        },
        {
          "command": "pnpm run build",
          "verifiedAt": "2026-09-23T07:21:20.334Z",
          "exitCode": 0,
          "stdout": "vite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 31 modules transformed.\nrendering chunks...\nout/main/index-DuZ9XxME.js   16.24 kB\nout/main/index.js           105.17 kB\n✓ built in 147ms\nvite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 2 modules transformed.\nrendering chunks...\nout/preload/index.cjs  3.24 kB\n✓ built in 8ms\nvite v7.3.6 building client environment for production...\ntransforming...\n✓ 3329 modules transformed.\nrendering chunks...\n../../out/renderer/index.html                                  1.43 kB\n../../out/renderer/assets/index-BtlGDg3R.css                 183.80 kB\n../../out/renderer/assets/SideChatPanel-CEboQkD-.js            0.58 kB\n../../out/renderer/assets/ReviewPanel-C4Cb09w4.js              0.62 kB\n../../out/renderer/assets/TerminalPanel-C2ATCPc7.js            0.65 kB\n../../out/renderer/assets/PanelPlaceholder-C0Wg0XPQ.js         0.73 kB\n../../out/renderer/assets/BrowserPreviewPanel-hTUpmqDF.js      1.40 kB\n../../out/renderer/assets/FilesPanel-OcrcjIbL.js           4,725.87 kB\n../../out/renderer/assets/index-BiDCe9Tt.js                6,706.62 kB\n✓ built in 8.61s",
          "stderr": "$ pnpm run typecheck && electron-vite build\n$ tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js (400:0): A comment\n\n\"// Wrapped in a `@__PURE__` IIFE: esbuild never tree-shakes a top-level initializer that contains a member access on `Number`, so the bare object literal survived into every bundle.\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js (74:0): A comment\n\n\"/** Anchors a pattern source. The interpolation lives here rather than at the call site because\n * esbuild will not drop a `@__PURE__` call whose own argument interpolates a variable, but it\n * will drop `anchor(dateSource)`. Keeping it inline pinned `date` into every bundle. */\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues."
        }
      ],
      "evidence": {
        "command": "node --test tests/files-panel.test.ts && pnpm run build",
        "verifiedAt": "2026-09-23T07:21:20.334Z",
        "exitCode": 0,
        "stdout": "✔ 文件树展示嵌套目录、选中态和离线 SVG 图标 (660.060708ms)\nℹ tests 1\nℹ suites 0\nℹ pass 1\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 883.645208\nvite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 31 modules transformed.\nrendering chunks...\nout/main/index-DuZ9XxME.js   16.24 kB\nout/main/index.js           105.17 kB\n✓ built in 147ms\nvite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 2 modules transformed.\nrendering chunks...\nout/preload/index.cjs  3.24 kB\n✓ built in 8ms\nvite v7.3.6 building client environment for production...\ntransforming...\n✓ 3329 modules transformed.\nrendering chunks...\n../../out/renderer/index.html                                  1.43 kB\n../../out/renderer/assets/index-BtlGDg3R.css                 183.80 kB\n../../out/renderer/assets/SideChatPanel-CEboQkD-.js            0.58 kB\n../../out/renderer/assets/ReviewPanel-C4Cb09w4.js              0.62 kB\n../../out/renderer/assets/TerminalPanel-C2ATCPc7.js            0.65 kB\n../../out/renderer/assets/PanelPlaceholder-C0Wg0XPQ.js         0.73 kB\n../../out/renderer/assets/BrowserPreviewPanel-hTUpmqDF.js      1.40 kB\n../../out/renderer/assets/FilesPanel-OcrcjIbL.js           4,725.87 kB\n../../out/renderer/assets/index-BiDCe9Tt.js                6,706.62 kB\n✓ built in 8.61s",
        "stderr": "$ pnpm run typecheck && electron-vite build\n$ tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js (400:0): A comment\n\n\"// Wrapped in a `@__PURE__` IIFE: esbuild never tree-shakes a top-level initializer that contains a member access on `Number`, so the bare object literal survived into every bundle.\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js (74:0): A comment\n\n\"/** Anchors a pattern source. The interpolation lives here rather than at the call site because\n * esbuild will not drop a `@__PURE__` call whose own argument interpolates a variable, but it\n * will drop `anchor(dateSource)`. Keeping it inline pinned `date` into every bundle. */\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues."
      }
    }
  ]
}
```
