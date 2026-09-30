import assert from 'node:assert/strict'
import test from 'node:test'
import { getThreadMessageTokenUsage } from '@assistant-ui/ai-sdk'
import {
  composeContextUsage,
  readContextExtras,
} from '../src/renderer/src/components/chat/composer/contextUsage.ts'

const measured = {
  systemChars: 400,
  toolChars: 400,
  attachmentChars: 0,
  conversationChars: 1200,
  images: 0,
}

/** 主进程写入的 metadata 形状：官方 usage + 我们自己的 contextUsage（窗口/分类测量）。 */
const metadataOf = (overrides: Record<string, unknown> = {}) => ({
  usage: { inputTokens: 1000, outputTokens: 120, totalTokens: 1120 },
  contextUsage: { contextWindow: 8000, modelId: 'model', payload: measured },
  ...overrides,
})

test('官方提取器直接消费主进程写入的 usage（原始与经 custom 两条路径）', () => {
  const raw = getThreadMessageTokenUsage({ role: 'assistant', metadata: metadataOf() })
  assert.deepEqual(raw, { inputTokens: 1000, outputTokens: 120, totalTokens: 1120 })

  // assistant-ui 的消息转换器把非白名单 key 挪进 custom，官方提取器同样能读到。
  const converted = getThreadMessageTokenUsage({
    role: 'assistant',
    metadata: {
      custom: {
        usage: {
          inputTokens: 1000,
          outputTokens: 120,
          inputTokenDetails: { cacheReadTokens: 640 },
        },
      },
    },
  })
  assert.deepEqual(converted, {
    inputTokens: 1000,
    outputTokens: 120,
    cachedInputTokens: 640,
    totalTokens: 1120,
  })
})

test('extras 读窗口与分类测量，两条 metadata 路径都认', () => {
  const raw = readContextExtras(metadataOf())
  assert.deepEqual(raw, { contextWindow: 8000, modelId: 'model', payload: measured })
  const converted = readContextExtras({
    custom: { contextUsage: { contextWindow: 8000, payload: measured } },
  })
  assert.deepEqual(converted, { contextWindow: 8000, payload: measured })
  // 没有窗口就渲染不了卡片（官方也不提供窗口）。
  assert.equal(readContextExtras({ contextUsage: { payload: measured } }), undefined)
  assert.equal(readContextExtras(undefined), undefined)
})

test('extras 兼容旧版本：缺字段按 0，非法值只丢分类', () => {
  const older = { systemChars: 400, toolChars: 400, conversationChars: 1200, images: 0 }
  assert.deepEqual(readContextExtras({ contextUsage: { contextWindow: 8000, payload: older } }), {
    contextWindow: 8000,
    payload: {
      systemChars: 400,
      toolChars: 400,
      attachmentChars: 0,
      conversationChars: 1200,
      images: 0,
    },
  })
  assert.deepEqual(
    readContextExtras({
      contextUsage: {
        contextWindow: 8000,
        inputTokens: 900,
        outputTokens: 90,
        payload: { ...older, images: -1 },
      },
    }),
    { contextWindow: 8000, legacyInputTokens: 900, legacyOutputTokens: 90 },
  )
})

test('总量官方优先，官方缺失时回退到早期写在 contextUsage 里的总量', () => {
  const extras = readContextExtras({
    contextUsage: {
      contextWindow: 8000,
      modelId: 'model',
      payload: measured,
      inputTokens: 900,
      outputTokens: 90,
    },
  })
  // 官方给了用量：以官方为准。
  assert.deepEqual(
    composeContextUsage({ tokens: { inputTokens: 1000, outputTokens: 120 }, extras }),
    { inputTokens: 1000, outputTokens: 120, contextWindow: 8000, payload: measured },
  )
  // 官方没有该消息的用量（分类口径上线初期的消息）：回退。
  assert.deepEqual(composeContextUsage({ tokens: undefined, extras }), {
    inputTokens: 900,
    outputTokens: 90,
    contextWindow: 8000,
    payload: measured,
  })
  // 两者都没有：不渲染卡片。
  assert.equal(
    composeContextUsage({
      tokens: undefined,
      extras: readContextExtras({ contextUsage: { contextWindow: 8000 } }),
    }),
    undefined,
  )
})

test('取最近一条有用量的 assistant 消息，官方与 extras 必须来自同一条', async () => {
  const { latestContextUsage } =
    await import('../src/renderer/src/components/chat/composer/contextUsage.ts')
  const older = { role: 'assistant', metadata: metadataOf() }
  const newerWithoutUsage = {
    role: 'assistant',
    metadata: { contextUsage: { contextWindow: 8000 } },
  }
  assert.deepEqual(
    latestContextUsage([older, { role: 'user' }, newerWithoutUsage], getThreadMessageTokenUsage),
    {
      inputTokens: 1000,
      outputTokens: 120,
      contextWindow: 8000,
      payload: measured,
    },
  )
  assert.equal(latestContextUsage([], getThreadMessageTokenUsage), undefined)
  assert.equal(
    latestContextUsage([{ role: 'user', metadata: metadataOf() }], getThreadMessageTokenUsage),
    undefined,
  )
})

test('成功压缩使旧用量失效，下一次模型调用后恢复真实用量', async () => {
  const { latestContextUsageState } =
    await import('../src/renderer/src/components/chat/composer/contextUsage.ts')
  const compacted = {
    role: 'assistant',
    metadata: metadataOf(),
    parts: [
      {
        type: 'data-pi-event',
        data: { id: 'compact-1', kind: 'compaction', phase: 'succeeded', trigger: 'manual', at: 1 },
      },
    ],
  }
  assert.deepEqual(latestContextUsageState([compacted], getThreadMessageTokenUsage), {
    pendingAfterCompaction: true,
  })
  const next = {
    role: 'assistant',
    metadata: metadataOf({ usage: { inputTokens: 240, outputTokens: 30, totalTokens: 270 } }),
  }
  assert.deepEqual(latestContextUsageState([compacted, next], getThreadMessageTokenUsage), {
    usage: { inputTokens: 240, outputTokens: 30, contextWindow: 8000, payload: measured },
    pendingAfterCompaction: false,
  })
  const failed = {
    role: 'assistant',
    parts: [
      {
        type: 'data-pi-event',
        data: { id: 'compact-2', kind: 'compaction', phase: 'failed', trigger: 'manual', at: 2 },
      },
    ],
  }
  assert.equal(
    latestContextUsageState([next, failed], getThreadMessageTokenUsage).usage?.inputTokens,
    240,
  )
})

test('分类按真实 payload 占比折算到官方精确总量，分类和严格等于总量', async () => {
  const { buildContextBreakdown } =
    await import('../src/renderer/src/components/chat/composer/contextUsage.ts')
  const view = buildContextBreakdown({
    inputTokens: 1000,
    outputTokens: 120,
    contextWindow: 8000,
    payload: measured,
  })
  assert.equal(view.limit, 8000)
  assert.equal(view.used, 1000)
  assert.equal(
    view.segments.reduce((sum, segment) => sum + segment.tokens, 0),
    1000,
  )
  // 权重 = ceil(chars / 4)：100 / 100 / 300，即 1000 按 1:1:3 分配；空分类不占一行。
  assert.deepEqual(
    view.segments.map((segment) => [segment.key, segment.tokens]),
    [
      ['system', 200],
      ['tools', 200],
      ['conversation', 600],
    ],
  )
})

test('附件（read_document 结果与路径提示）参与同一套折算', async () => {
  const { buildContextBreakdown } =
    await import('../src/renderer/src/components/chat/composer/contextUsage.ts')
  const view = buildContextBreakdown({
    inputTokens: 900,
    outputTokens: 0,
    contextWindow: 8000,
    payload: {
      systemChars: 0,
      toolChars: 0,
      attachmentChars: 1200,
      conversationChars: 0,
      images: 0,
    },
  })
  assert.deepEqual(
    view.segments.map((segment) => [segment.key, segment.tokens]),
    [['attachments', 900]],
  )
})

test('折算用最大余数法，取整既不丢也不超', async () => {
  const { buildContextBreakdown } =
    await import('../src/renderer/src/components/chat/composer/contextUsage.ts')
  const view = buildContextBreakdown({
    inputTokens: 100,
    outputTokens: 0,
    contextWindow: 1000,
    payload: { systemChars: 4, toolChars: 4, attachmentChars: 0, conversationChars: 4, images: 0 },
  })
  assert.equal(
    view.segments.reduce((sum, segment) => sum + segment.tokens, 0),
    100,
  )
  assert.deepEqual(
    view.segments.map((segment) => segment.tokens).sort((a, b) => a - b),
    [33, 33, 34],
  )
  assert.deepEqual(
    view.segments.map((segment) => segment.key),
    ['system', 'tools', 'conversation'],
  )
})

test('没有分类测量的消息用官方精确总量渲染单行，不编造分类', async () => {
  const { buildContextBreakdown } =
    await import('../src/renderer/src/components/chat/composer/contextUsage.ts')
  const base = { inputTokens: 1000, outputTokens: 120, contextWindow: 8000 }
  for (const usage of [
    base,
    {
      ...base,
      payload: {
        systemChars: 0,
        toolChars: 0,
        attachmentChars: 0,
        conversationChars: 0,
        images: 0,
      },
    },
  ]) {
    const view = buildContextBreakdown(usage)
    assert.deepEqual(view.segments, [{ key: 'input', tokens: 1000 }])
    assert.equal(view.used, 1000)
  }
})

test('composer 上下文卡片渲染官方 ContextBreakdown 并接上真实 segments 与 limit', async () => {
  const { readFile } = await import('node:fs/promises')
  const composer = await readFile(
    'src/renderer/src/components/assistant-ui/elements/composer.tsx',
    'utf8',
  )
  const slot = await readFile(
    'src/renderer/src/components/chat/composer/SailorComposerContext.tsx',
    'utf8',
  )

  assert.match(
    composer,
    /import \{ ContextBreakdown, type ContextSegment \} from ['"]\.\/context-breakdown['"]/,
  )
  const card = composer.slice(composer.indexOf('<ContextBreakdown'))
  assert.match(card.slice(0, 240), /segments=\{/)
  assert.match(card.slice(0, 240), /limit=\{/)
  assert.match(composer, /data-slot="composer-context"/)
  // 卡片下方不渲染说明文案（用户明确要求去掉，防止再长回来）。
  assert.doesNotMatch(composer, /note\??:|\{note\}|note=\{/)
  // 旧的自绘分类条与写死的 system/tools 桶必须彻底消失。
  assert.doesNotMatch(composer, /usage\.system|usage\.tools/)
  // 总量必须来自官方 API，分类测量来自我们自己的字段。
  assert.match(slot, /import \{ getThreadMessageTokenUsage \} from '@assistant-ui\/ai-sdk'/)
  assert.match(slot, /latestContextUsageState\(\s*messages,\s*getThreadMessageTokenUsage,?\s*\)/)
  // 消息改由 assistant-ui 状态读取，且卡片按用量签名 memo：流式增量不再重渲染整个 rail。
  assert.match(slot, /useAuiState\(\(state\) => state\.thread\.messages\)/)
  assert.match(slot, /memo\(ComposerContext\)/)
  assert.match(slot, /<MemoComposerContext \{\.\.\.props\} \/>/)
  // 配色对齐官方 demo 的四类（灰阶两档 + 蓝色两档）。
  assert.match(slot, /bg-foreground\/45/)
  assert.match(slot, /bg-foreground\/25/)
  assert.match(slot, /bg-blue-500\/60 dark:bg-blue-400\/60/)
  assert.match(slot, /bg-blue-500 dark:bg-blue-400/)
  for (const label of ['系统提示词', '工具定义', '附件', '会话'])
    assert.ok(slot.includes(label), label)
})
