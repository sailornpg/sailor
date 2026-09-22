# Archived Feature Progress

## Archived Metadata

**Archived At:** 2026-09-21T07:58:45.978Z
**Feature ID:** docs-assistant-ui-design-rules
**Feature Name:** 强制 assistant-ui 页面设计约束
**Archived Status:** done
**Archive Source:** `.agent-harness/feature_list.json`
**Active Feature At Archive Time:** none

## Archive Note

This feature was not the active progress panel at archive time.
This archive progress file is a structured summary synthesized from `.agent-harness/feature_list.json`.

## Feature Summary

在 CLAUDE.md 中记录官方设计来源、页面设计规则、项目例外和视觉验收要求。

## Dependencies

- none

## Evidence

Verified by .agent-harness/feature_list.json checklist at 2026-09-21T07:51:41.214Z

## Additional Fields Snapshot

```json
{
  "checklist": [
    {
      "action": "补充设计约束与完成前自检，校验文档关键入口",
      "coverage": "static",
      "tdd": false,
      "coverage_reason": "仅修改协作规范，不影响运行代码；检查文档入口及约束存在。",
      "verify": "node -e \"const s=require('node:fs').readFileSync('CLAUDE.md','utf8'); for(const text of ['### 3.1 页面与组件设计（强制）','https://www.assistant-ui.com/design.md','UI 变更符合 §3.1']) if(!s.includes(text)) throw new Error('Missing: '+text)\"",
      "status": "done",
      "verifyEvidence": {
        "command": "node -e \"const s=require('node:fs').readFileSync('CLAUDE.md','utf8'); for(const text of ['### 3.1 页面与组件设计（强制）','https://www.assistant-ui.com/design.md','UI 变更符合 §3.1']) if(!s.includes(text)) throw new Error('Missing: '+text)\"",
        "verifiedAt": "2026-09-21T07:51:41.211Z",
        "exitCode": 0,
        "stdout": "",
        "stderr": ""
      },
      "evidence": {
        "command": "node -e \"const s=require('node:fs').readFileSync('CLAUDE.md','utf8'); for(const text of ['### 3.1 页面与组件设计（强制）','https://www.assistant-ui.com/design.md','UI 变更符合 §3.1']) if(!s.includes(text)) throw new Error('Missing: '+text)\"",
        "verifiedAt": "2026-09-21T07:51:41.211Z",
        "exitCode": 0,
        "stdout": "",
        "stderr": ""
      }
    }
  ]
}
```
