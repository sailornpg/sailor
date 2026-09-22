# Archived Feature Progress

## Archived Metadata

**Archived At:** 2026-09-22T08:02:28.067Z
**Feature ID:** fix-thread-autoscroll-follow-tail
**Feature Name:** 聊天区改为跟随尾部滚动
**Archived Status:** done
**Archive Source:** `.agent-harness/feature_list.json`
**Active Feature At Archive Time:** fix-pi-image-input

## Archive Note

This feature was not the active progress panel at archive time.
This archive progress file is a structured summary synthesized from `.agent-harness/feature_list.json`.

## Feature Summary

把 Thread viewport 从 turnAnchor="top" 改为 bottom anchor：生成中跟随尾部，用户上滚暂停跟随，点击回到底部按钮后回底并恢复跟随。

## Dependencies

- none

## Evidence

Verified by .agent-harness/feature_list.json checklist at 2026-09-22T07:58:03.432Z

## Additional Fields Snapshot

```json
{
  "checklist": [
    {
      "action": "Thread viewport 使用 bottom anchor，并保留回到底部控件的接线",
      "coverage": "static",
      "coverage_reason": "滚动结果依赖真实布局与滚动容器几何，Node 侧无布局引擎，因此源码接线由静态回归测试守护，真实滚动行为另由 offscreen Electron 场景验收。",
      "test": "node --test tests/thread-autoscroll.test.ts",
      "verify": [
        "node --test tests/thread-autoscroll.test.ts",
        "pnpm run build"
      ],
      "status": "done",
      "testEvidence": {
        "command": "node --test tests/thread-autoscroll.test.ts",
        "verifiedAt": "2026-09-22T07:52:36.517Z",
        "exitCode": 0,
        "stdout": "✔ Thread viewport anchors the turn at the bottom so streaming follows the tail (2.246458ms)\n✔ bottom anchoring keeps the follow, pause and re-pin affordances wired (1.269333ms)\nℹ tests 2\nℹ suites 0\nℹ pass 2\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 125.73925",
        "stderr": ""
      },
      "verifyEvidenceList": [
        {
          "command": "node --test tests/thread-autoscroll.test.ts",
          "verifiedAt": "2026-09-22T07:52:36.738Z",
          "exitCode": 0,
          "stdout": "✔ Thread viewport anchors the turn at the bottom so streaming follows the tail (1.864167ms)\n✔ bottom anchoring keeps the follow, pause and re-pin affordances wired (0.826083ms)\nℹ tests 2\nℹ suites 0\nℹ pass 2\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 125.837333",
          "stderr": ""
        },
        {
          "command": "pnpm run build",
          "verifiedAt": "2026-09-22T07:52:46.127Z",
          "exitCode": 0,
          "stdout": "vite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 27 modules transformed.\nrendering chunks...\nout/main/index-DuZ9XxME.js  16.24 kB\nout/main/index.js           89.54 kB\n✓ built in 111ms\nvite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 2 modules transformed.\nrendering chunks...\nout/preload/index.cjs  2.97 kB\n✓ built in 7ms\nvite v7.3.6 building client environment for production...\ntransforming...\n✓ 3269 modules transformed.\nrendering chunks...\n../../out/renderer/index.html                     1.43 kB\n../../out/renderer/assets/index-C8oz2mWz.css    167.58 kB\n../../out/renderer/assets/index-C_kLahze.js   6,623.38 kB\n✓ built in 7.13s",
          "stderr": "$ pnpm run typecheck && electron-vite build\n$ tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js (74:0): A comment\n\n\"/** Anchors a pattern source. The interpolation lives here rather than at the call site because\n * esbuild will not drop a `@__PURE__` call whose own argument interpolates a variable, but it\n * will drop `anchor(dateSource)`. Keeping it inline pinned `date` into every bundle. */\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js (400:0): A comment\n\n\"// Wrapped in a `@__PURE__` IIFE: esbuild never tree-shakes a top-level initializer that contains a member access on `Number`, so the bare object literal survived into every bundle.\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues."
        }
      ],
      "evidence": {
        "command": "node --test tests/thread-autoscroll.test.ts && pnpm run build",
        "verifiedAt": "2026-09-22T07:52:46.127Z",
        "exitCode": 0,
        "stdout": "✔ Thread viewport anchors the turn at the bottom so streaming follows the tail (1.864167ms)\n✔ bottom anchoring keeps the follow, pause and re-pin affordances wired (0.826083ms)\nℹ tests 2\nℹ suites 0\nℹ pass 2\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 125.837333\nvite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 27 modules transformed.\nrendering chunks...\nout/main/index-DuZ9XxME.js  16.24 kB\nout/main/index.js           89.54 kB\n✓ built in 111ms\nvite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 2 modules transformed.\nrendering chunks...\nout/preload/index.cjs  2.97 kB\n✓ built in 7ms\nvite v7.3.6 building client environment for production...\ntransforming...\n✓ 3269 modules transformed.\nrendering chunks...\n../../out/renderer/index.html                     1.43 kB\n../../out/renderer/assets/index-C8oz2mWz.css    167.58 kB\n../../out/renderer/assets/index-C_kLahze.js   6,623.38 kB\n✓ built in 7.13s",
        "stderr": "$ pnpm run typecheck && electron-vite build\n$ tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js (74:0): A comment\n\n\"/** Anchors a pattern source. The interpolation lives here rather than at the call site because\n * esbuild will not drop a `@__PURE__` call whose own argument interpolates a variable, but it\n * will drop `anchor(dateSource)`. Keeping it inline pinned `date` into every bundle. */\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js (400:0): A comment\n\n\"// Wrapped in a `@__PURE__` IIFE: esbuild never tree-shakes a top-level initializer that contains a member access on `Number`, so the bare object literal survived into every bundle.\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues."
      }
    },
    {
      "action": "offscreen Electron 驱动真实 Thread 验收跟随尾部、上滚暂停、点击回底三个滚动行为",
      "coverage": "manual-exception",
      "tdd": false,
      "coverage_reason": "滚动与平滑动画时序只能在真实浏览器布局下观察，无法在 node --test 中断言；证据为 offscreen Electron 场景的截图与 scroll-report.json。",
      "verify": "node -e \"const r=require(\\\"./.agent-harness/evidence/thread-autoscroll-preview/scroll-report.json\\\");if(r.failures.length!==0)throw new Error(JSON.stringify(r.failures));if(r.steps.length<6)throw new Error(\\\"scenario steps \\\"+r.steps.length);\"",
      "status": "done",
      "verifyEvidence": {
        "command": "node -e \"const r=require(\\\"./.agent-harness/evidence/thread-autoscroll-preview/scroll-report.json\\\");if(r.failures.length!==0)throw new Error(JSON.stringify(r.failures));if(r.steps.length!==6)throw new Error(\\\"scenario steps \\\"+r.steps.length);\"",
        "verifiedAt": "2026-09-22T07:52:46.230Z",
        "exitCode": 0,
        "stdout": "",
        "stderr": ""
      },
      "evidence": {
        "command": "node -e \"const r=require(\\\"./.agent-harness/evidence/thread-autoscroll-preview/scroll-report.json\\\");if(r.failures.length!==0)throw new Error(JSON.stringify(r.failures));if(r.steps.length!==6)throw new Error(\\\"scenario steps \\\"+r.steps.length);\"",
        "verifiedAt": "2026-09-22T07:52:46.230Z",
        "exitCode": 0,
        "stdout": "",
        "stderr": ""
      }
    },
    {
      "action": "回到底部控件改用 behavior=\"instant\"，消除平滑追赶造成的滞后",
      "coverage": "static",
      "coverage_reason": "该行为差异只在高频内容增长下的平滑动画时序中可见，Node 侧无法断言；静态测试锁定 behavior 接线，真实差异由 offscreen Electron 的高频场景与连续采样证据记录。",
      "test": "node --test tests/thread-autoscroll.test.ts",
      "verify": [
        "node --test tests/thread-autoscroll.test.ts",
        "node -e \"const r=require(\\\"./.agent-harness/evidence/thread-autoscroll-preview/scroll-report.json\\\");if(r.failures.length!==0)throw new Error(JSON.stringify(r.failures));if(r.fastFollowSeries.length!==20)throw new Error(\\\"series \\\"+r.fastFollowSeries.length);if(r.fastFollowSeries.some((s)=>s.distanceFromBottom!==0))throw new Error(\\\"drift \\\"+JSON.stringify(r.fastFollowSeries));\"",
        "pnpm run build"
      ],
      "status": "done",
      "testEvidence": {
        "command": "node --test tests/thread-autoscroll.test.ts",
        "verifiedAt": "2026-09-22T07:57:54.531Z",
        "exitCode": 0,
        "stdout": "✔ Thread viewport anchors the turn at the bottom so streaming follows the tail (1.82575ms)\n✔ bottom anchoring keeps the follow, pause and re-pin affordances wired (1.665625ms)\nℹ tests 2\nℹ suites 0\nℹ pass 2\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 135.656542",
        "stderr": ""
      },
      "verifyEvidenceList": [
        {
          "command": "node --test tests/thread-autoscroll.test.ts",
          "verifiedAt": "2026-09-22T07:57:54.751Z",
          "exitCode": 0,
          "stdout": "✔ Thread viewport anchors the turn at the bottom so streaming follows the tail (1.866917ms)\n✔ bottom anchoring keeps the follow, pause and re-pin affordances wired (0.815416ms)\nℹ tests 2\nℹ suites 0\nℹ pass 2\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 126.380042",
          "stderr": ""
        },
        {
          "command": "node -e \"const r=require(\\\"./.agent-harness/evidence/thread-autoscroll-preview/scroll-report.json\\\");if(r.failures.length!==0)throw new Error(JSON.stringify(r.failures));if(r.fastFollowSeries.length!==20)throw new Error(\\\"series \\\"+r.fastFollowSeries.length);if(r.fastFollowSeries.some((s)=>s.distanceFromBottom!==0))throw new Error(\\\"drift \\\"+JSON.stringify(r.fastFollowSeries));\"",
          "verifiedAt": "2026-09-22T07:57:54.843Z",
          "exitCode": 0,
          "stdout": "",
          "stderr": ""
        },
        {
          "command": "pnpm run build",
          "verifiedAt": "2026-09-22T07:58:03.432Z",
          "exitCode": 0,
          "stdout": "vite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 27 modules transformed.\nrendering chunks...\nout/main/index-DuZ9XxME.js  16.24 kB\nout/main/index.js           89.54 kB\n✓ built in 133ms\nvite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 2 modules transformed.\nrendering chunks...\nout/preload/index.cjs  2.97 kB\n✓ built in 8ms\nvite v7.3.6 building client environment for production...\ntransforming...\n✓ 3269 modules transformed.\nrendering chunks...\n../../out/renderer/index.html                     1.43 kB\n../../out/renderer/assets/index-C8oz2mWz.css    167.58 kB\n../../out/renderer/assets/index-BYJ4DO6w.js   6,624.28 kB\n✓ built in 6.55s",
          "stderr": "$ pnpm run typecheck && electron-vite build\n$ tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js (74:0): A comment\n\n\"/** Anchors a pattern source. The interpolation lives here rather than at the call site because\n * esbuild will not drop a `@__PURE__` call whose own argument interpolates a variable, but it\n * will drop `anchor(dateSource)`. Keeping it inline pinned `date` into every bundle. */\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js (400:0): A comment\n\n\"// Wrapped in a `@__PURE__` IIFE: esbuild never tree-shakes a top-level initializer that contains a member access on `Number`, so the bare object literal survived into every bundle.\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues."
        }
      ],
      "evidence": {
        "command": "node --test tests/thread-autoscroll.test.ts && node -e \"const r=require(\\\"./.agent-harness/evidence/thread-autoscroll-preview/scroll-report.json\\\");if(r.failures.length!==0)throw new Error(JSON.stringify(r.failures));if(r.fastFollowSeries.length!==20)throw new Error(\\\"series \\\"+r.fastFollowSeries.length);if(r.fastFollowSeries.some((s)=>s.distanceFromBottom!==0))throw new Error(\\\"drift \\\"+JSON.stringify(r.fastFollowSeries));\" && pnpm run build",
        "verifiedAt": "2026-09-22T07:58:03.432Z",
        "exitCode": 0,
        "stdout": "✔ Thread viewport anchors the turn at the bottom so streaming follows the tail (1.866917ms)\n✔ bottom anchoring keeps the follow, pause and re-pin affordances wired (0.815416ms)\nℹ tests 2\nℹ suites 0\nℹ pass 2\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 126.380042\nvite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 27 modules transformed.\nrendering chunks...\nout/main/index-DuZ9XxME.js  16.24 kB\nout/main/index.js           89.54 kB\n✓ built in 133ms\nvite v7.3.6 building ssr environment for production...\ntransforming...\n✓ 2 modules transformed.\nrendering chunks...\nout/preload/index.cjs  2.97 kB\n✓ built in 8ms\nvite v7.3.6 building client environment for production...\ntransforming...\n✓ 3269 modules transformed.\nrendering chunks...\n../../out/renderer/index.html                     1.43 kB\n../../out/renderer/assets/index-C8oz2mWz.css    167.58 kB\n../../out/renderer/assets/index-BYJ4DO6w.js   6,624.28 kB\n✓ built in 6.55s",
        "stderr": "$ pnpm run typecheck && electron-vite build\n$ tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js (74:0): A comment\n\n\"/** Anchors a pattern source. The interpolation lives here rather than at the call site because\n * esbuild will not drop a `@__PURE__` call whose own argument interpolates a variable, but it\n * will drop `anchor(dateSource)`. Keeping it inline pinned `date` into every bundle. */\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/regexes.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.\nnode_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js (400:0): A comment\n\n\"// Wrapped in a `@__PURE__` IIFE: esbuild never tree-shakes a top-level initializer that contains a member access on `Number`, so the bare object literal survived into every bundle.\"\n\nin \"node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js\" contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues."
      }
    }
  ]
}
```
