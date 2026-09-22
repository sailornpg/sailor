---
name: harness-archive
description: >-
  Use when the user explicitly asks to archive a blocked, done, or cancelled feature from .agent-harness/feature_list.json into .agent-harness/archive/.
disable-model-invocation: true
---

# Harness Archive

这个 command 只在用户明确要求"归档 feature"时使用。不要自动归档，也不要在结束 session 时默认调用。

## 触发条件

- 用户说 `/harness-archive`
- 用户明确说"归档这个 feature"
- 用户要求把 root harness 状态收瘦，把历史移到 archive

## 约束

- 先读 `.agent-harness/feature_list.json` 和 `.agent-harness/progress.md`
- 只归档 `blocked`、`done`、`cancelled`
- root `.agent-harness/feature_list.json` 和 `.agent-harness/progress.md` 只保留当前/未归档状态
- 历史快照统一落到 `.agent-harness/archive/<feature-id>/`
- 不手工修改归档结果；统一调用脚本

## 执行步骤

1. 如果用户没有给 `feature-id`，先从 `.agent-harness/feature_list.json` 中确认要归档的条目。
2. 说明将执行归档脚本，并提醒归档后该 feature 会从 root `feature_list.json` 移除；如果归档的是当前 active feature，root `progress.md` 也会被重置为空白工作面板。
3. 运行：

```bash
node ./.agent-harness/scripts/archive-feature.mjs --feature-id <feature-id>
```

4. 完成后向用户回报：
   - `.agent-harness/archive/index.json` 已更新
   - `.agent-harness/archive/<feature-id>/feature_list.json`
   - `.agent-harness/archive/<feature-id>/progress.md`
   - 如果归档的是当前 active feature，说明 `.agent-harness/progress.md` 已被重置
5. 如果脚本报错，不要手工兜底修改 root state；把错误原样告诉用户并停止。

## 经验回顾（Retrospective）

归档脚本成功后，**必须**执行以下经验回顾流程：

### 核心原则：沉淀「规则」，不是沉淀「这次的解法」

`.agent-harness/lessons.md` 记录的是**跨 feature 可复用的规则/约定/能力**，不是某个功能的开发流水账。一条经验的价值不在于"记录发生了什么"，而在于"下次遇到同类情况时它能改变我的做法"。

**判断一条经验是否合格的唯一测试 —— 反向套用测试：**

> 假装这次的 feature 从没做过。把这条经验单独拿给一个正要开始**另一个**功能的人看，他能据此改变行动吗？
>
> - 能 → 这是一条规则，合格。
> - "这说的不就是那个功能吗，跟我没关系" → 这是流水账，丢弃。

**强制抽象动作：** 每条候选经验都必须先经过一次改写，把「个案」升级成「类别」。做法是逐层追问"为什么"，直到触底到一个通用机制：

- 这次踩的坑 → 属于哪一类坑？ → 触发这类坑的**通用条件**是什么？ → 避免它的**通用检查项**是什么？
- 改写后只保留最后两问的答案；原始个案降级为括号里的「来源举例」，不是经验本身。

**必须剔除具体载体：** 改写后的描述里不允许出现只属于本 feature 的字段名、组件名、接口名、表名、变量名。它们最多作为来源上下文举例出现，写进经验正文就说明还没抽象完。

**别抽过头：** 规则要具体到能指导一个动作——一个检查项、一次确认、一个成对更新。抽到「写代码要仔细」「记得测试」这种放之四海皆准、却指导不了任何具体动作的程度，虽然也能通过反向套用测试，但没有信息量，同样丢弃。合格的刻度是：读完就知道下次**具体该多做哪一步**。

去具体化示例（注意抽象层级的跃迁，不只是"换个说法"）：

- ❌ 个案：「InitialContactSelection 的 regions 参数要用数组，后端才能按 kol_region 过滤」
- ⚠️ 半抽象（仍绑定业务）：「regions 这种筛选参数要传数组」—— 换个字段名就不成立，不合格。
- ✅ 规则：「后端 repeated query 参数，前端必须传数组交给 serializer 展开为重复 key；逗号拼接的单串只有在后端显式 split 时才有效。改这类参数前先确认后端的绑定方式（repeated vs split）」

再举两例，示范"从个案到类别"的跃迁：

- 个案：「某页面加载时闪一下空数据」→ 规则：「异步数据在 resolve 前应有明确的 loading 态而非渲染空值，否则会闪烁；凡'请求-渲染'链路都要检查初始态」
- 个案：「改了某接口忘了同步 mock，联调报错」→ 规则：「接口契约（入参/出参/字段名）是前后端共享状态，单方修改必然引入不一致；契约变更必须成对更新调用方与其替身(mock/stub/类型定义)」

### 步骤

1. 读取归档快照 `.agent-harness/archive/<feature-id>/progress.md` 和 `.agent-harness/archive/<feature-id>/feature_list.json`。
2. 从中提取开发过程中值得沉淀的经验，分为三类：
   - **技术踩坑**：开发中遇到的 bug、陷阱及解决方式
   - **架构/模式决策**：设计模式选择、命名约定、接口契约等可复用的决策
   - **流程/协作问题**：阻塞原因、跨团队依赖、信息缺失等流程层面的教训
3. **对每条候选经验强制执行上面的抽象动作**，然后用反向套用测试筛一遍；没通过测试的直接丢弃，不呈现给用户。
4. 将通过筛选的条目以列表形式呈现给用户，每条包含：
   - 类型标签（技术踩坑 / 架构决策 / 流程问题）
   - 一句话规则描述（已去具体化，不含本 feature 专有载体）
   - 来源上下文（括号内注明从本 feature 的哪个个案抽象而来）
5. **询问用户确认**：哪些条目要写入 `.agent-harness/lessons.md`，用户可以：
   - 全部写入
   - 选择部分写入
   - 全部跳过
6. 用户确认后，将选中的条目追加到 `.agent-harness/lessons.md`，格式如下（正文写规则，来源个案放括号里）：

```markdown
### <feature-id> — <feature-name>（<归档日期>）

- **[技术踩坑]** <通用规则/检查项>（来源：<本 feature 的具体个案>）
- **[架构决策]** <通用约定/机制>（来源：<本 feature 的具体个案>）
- **[流程问题]** <通用教训>（来源：<本 feature 的具体个案>）
```

### 约束

- 如果 `.agent-harness/lessons.md` 不存在，先用空模板创建（包含标题和格式说明）。
- 只追加，不修改已有条目。
- 如果 progress.md 内容太少无法提取有意义的经验，告知用户"未发现可沉淀的经验"并跳过。
- 用户选择跳过时，不写入任何内容，正常结束归档流程。
- **抽象未完成不得写入**：条目正文若仍出现只属于本 feature 的字段名/组件名/接口名/表名/变量名，视为未通过抽象，退回重写或丢弃，不得追加。
- 如果所有候选经验都没通过反向套用测试，等同"未发现可沉淀的经验"，跳过。
