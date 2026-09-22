# Archived Feature Progress

## Archived Metadata

**Archived At:** 2026-09-21T07:58:46.065Z
**Feature ID:** feat-unified-approval-card
**Feature Name:** 统一权限提示卡片
**Archived Status:** done
**Archive Source:** `.agent-harness/feature_list.json`
**Active Feature At Archive Time:** none

## Archive Note

This feature was not the active progress panel at archive time.
This archive progress file is a structured summary synthesized from `.agent-harness/feature_list.json`.

## Feature Summary

所有有效待审批工具使用第二种 ApprovalCard 外观，保留原有 boolean/interrupt/option 响应与失效校验。

## Dependencies

- none

## Evidence

Verified by .agent-harness/feature_list.json checklist at 2026-09-21T06:49:46.063Z

## Additional Fields Snapshot

```json
{
  "checklist": [
    {
      "action": "统一原生与旧式工具审批入口，验证卡片渲染及已有工具回归",
      "coverage": "unit",
      "test": "node --test tests/tool-call.test.ts",
      "verify": "node --test tests/tool-call.test.ts",
      "tdd": true,
      "status": "done",
      "testEvidence": {
        "command": "node --test tests/tool-call.test.ts",
        "verifiedAt": "2026-09-21T06:49:40.220Z",
        "exitCode": 0,
        "stdout": "✔ actual Thread renders each tool call once with Pi file paths, without a timeline or extra group (914.354625ms)\n✔ approval, cancellation and failures keep actionable fallback instead of a success checkmark (84.2735ms)\n✔ official expanded ToolCall includes both request and result (27.2905ms)\n✔ pending edit renders one official approval card with readable changes and only one-time actions (74.316208ms)\n✔ 没有 approval metadata 的 read 权限请求也使用同一种卡片 (144.397917ms)\n✔ 统一卡片保留 approval、interrupt、旧式结果的响应协议及失效保护 (33.847792ms)\nReact does not recognize the `toolName` prop on a DOM element. If you intentionally want it to appear in the DOM as a custom attribute, spell it as lowercase `toolname` instead. If you accidentally passed it from a parent component, remove it from the DOM element.\nReact does not recognize the `toolCallId` prop on a DOM element. If you intentionally want it to appear in the DOM as a custom attribute, spell it as lowercase `toolcallid` instead. If you accidentally passed it from a parent component, remove it from the DOM element.\nReact does not recognize the `argsText` prop on a DOM element. If you intentionally want it to appear in the DOM as a custom attribute, spell it as lowercase `argstext` instead. If you accidentally passed it from a parent component, remove it from the DOM element.\n✔ 自定义审批与问答仍使用同一卡片外壳并保留声明的选项 (136.3155ms)\nℹ tests 7\nℹ suites 0\nℹ pass 7\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 1636.34525",
        "stderr": ""
      },
      "verifyEvidence": {
        "command": "node --test tests/tool-call.test.ts",
        "verifiedAt": "2026-09-21T06:49:41.637Z",
        "exitCode": 0,
        "stdout": "✔ actual Thread renders each tool call once with Pi file paths, without a timeline or extra group (721.138541ms)\n✔ approval, cancellation and failures keep actionable fallback instead of a success checkmark (75.830583ms)\n✔ official expanded ToolCall includes both request and result (24.118583ms)\n✔ pending edit renders one official approval card with readable changes and only one-time actions (66.325792ms)\n✔ 没有 approval metadata 的 read 权限请求也使用同一种卡片 (134.386ms)\n✔ 统一卡片保留 approval、interrupt、旧式结果的响应协议及失效保护 (31.743542ms)\nReact does not recognize the `toolName` prop on a DOM element. If you intentionally want it to appear in the DOM as a custom attribute, spell it as lowercase `toolname` instead. If you accidentally passed it from a parent component, remove it from the DOM element.\nReact does not recognize the `toolCallId` prop on a DOM element. If you intentionally want it to appear in the DOM as a custom attribute, spell it as lowercase `toolcallid` instead. If you accidentally passed it from a parent component, remove it from the DOM element.\nReact does not recognize the `argsText` prop on a DOM element. If you intentionally want it to appear in the DOM as a custom attribute, spell it as lowercase `argstext` instead. If you accidentally passed it from a parent component, remove it from the DOM element.\n✔ 自定义审批与问答仍使用同一卡片外壳并保留声明的选项 (133.465958ms)\nℹ tests 7\nℹ suites 0\nℹ pass 7\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 1387.164",
        "stderr": ""
      },
      "evidence": {
        "command": "node --test tests/tool-call.test.ts",
        "verifiedAt": "2026-09-21T06:49:41.637Z",
        "exitCode": 0,
        "stdout": "✔ actual Thread renders each tool call once with Pi file paths, without a timeline or extra group (721.138541ms)\n✔ approval, cancellation and failures keep actionable fallback instead of a success checkmark (75.830583ms)\n✔ official expanded ToolCall includes both request and result (24.118583ms)\n✔ pending edit renders one official approval card with readable changes and only one-time actions (66.325792ms)\n✔ 没有 approval metadata 的 read 权限请求也使用同一种卡片 (134.386ms)\n✔ 统一卡片保留 approval、interrupt、旧式结果的响应协议及失效保护 (31.743542ms)\nReact does not recognize the `toolName` prop on a DOM element. If you intentionally want it to appear in the DOM as a custom attribute, spell it as lowercase `toolname` instead. If you accidentally passed it from a parent component, remove it from the DOM element.\nReact does not recognize the `toolCallId` prop on a DOM element. If you intentionally want it to appear in the DOM as a custom attribute, spell it as lowercase `toolcallid` instead. If you accidentally passed it from a parent component, remove it from the DOM element.\nReact does not recognize the `argsText` prop on a DOM element. If you intentionally want it to appear in the DOM as a custom attribute, spell it as lowercase `argstext` instead. If you accidentally passed it from a parent component, remove it from the DOM element.\n✔ 自定义审批与问答仍使用同一卡片外壳并保留声明的选项 (133.465958ms)\nℹ tests 7\nℹ suites 0\nℹ pass 7\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 1387.164",
        "stderr": ""
      }
    },
    {
      "action": "通过类型与生产构建检查并记录视觉限制",
      "coverage": "static",
      "tdd": false,
      "coverage_reason": "视觉组件接线用生产构建检查，复用已确认的第二种组件样式。",
      "verify": "pnpm run build",
      "status": "done",
      "verifyEvidence": {
        "command": "pnpm run build",
        "verifiedAt": "2026-09-21T06:49:46.063Z",
        "exitCode": 0,
        "stdout": "vite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 22 modules transformed.\nrendering chunks...\nout/main/index.js  66.23 kB\n✓ built in 103ms\nvite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 2 modules transformed.\nrendering chunks...\nout/preload/index.cjs  3.00 kB\n✓ built in 7ms\nvite v7.3.6 building client environment for production...\ntransforming...\n✓ 3118 modules transformed.\nrendering chunks...\n../../out/renderer/index.html                     1.43 kB\n../../out/renderer/assets/index-D1PogUl8.css    159.21 kB\n../../out/renderer/assets/index-CWG2qLVd.js   2,854.68 kB\n✓ built in 2.96s",
        "stderr": "$ pnpm run typecheck && electron-vite build\n$ tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js (400:0): A comment\n\n\"// Wrapped in a `@__PURE__` IIFE: esbuild never tree-shakes a top-level initializer that contains a member access on `Number`, so the bare object literal survived into every bundle.\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js (74:0): A comment\n\n\"/** Anchors a pattern source. The interpolation lives here rather than at the call site because\n * esbuild will not drop a `@__PURE__` call whose own argument interpolates a variable, but it\n * will drop `anchor(dateSource)`. Keeping it inline pinned `date` into every bundle. */\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues."
      },
      "evidence": {
        "command": "pnpm run build",
        "verifiedAt": "2026-09-21T06:49:46.063Z",
        "exitCode": 0,
        "stdout": "vite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 22 modules transformed.\nrendering chunks...\nout/main/index.js  66.23 kB\n✓ built in 103ms\nvite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 2 modules transformed.\nrendering chunks...\nout/preload/index.cjs  3.00 kB\n✓ built in 7ms\nvite v7.3.6 building client environment for production...\ntransforming...\n✓ 3118 modules transformed.\nrendering chunks...\n../../out/renderer/index.html                     1.43 kB\n../../out/renderer/assets/index-D1PogUl8.css    159.21 kB\n../../out/renderer/assets/index-CWG2qLVd.js   2,854.68 kB\n✓ built in 2.96s",
        "stderr": "$ pnpm run typecheck && electron-vite build\n$ tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js (400:0): A comment\n\n\"// Wrapped in a `@__PURE__` IIFE: esbuild never tree-shakes a top-level initializer that contains a member access on `Number`, so the bare object literal survived into every bundle.\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js (74:0): A comment\n\n\"/** Anchors a pattern source. The interpolation lives here rather than at the call site because\n * esbuild will not drop a `@__PURE__` call whose own argument interpolates a variable, but it\n * will drop `anchor(dateSource)`. Keeping it inline pinned `date` into every bundle. */\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues."
      }
    }
  ]
}
```
