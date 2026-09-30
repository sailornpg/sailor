import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import { createServer } from 'vite'
import type { UIMessageChunk } from 'ai'

const modulePath = '/src/renderer/src/lib/streamChunkCoalescer.ts'

async function loadCoalescer() {
  const vite = await createServer({
    logLevel: 'silent',
    server: { middlewareMode: true },
    resolve: { alias: { '@': resolve('src/renderer/src'), '@shared': resolve('src/shared') } },
  })
  try {
    return (await vite.ssrLoadModule(modulePath).catch(() => ({}))) as Record<string, unknown>
  } finally {
    await vite.close()
  }
}

const module = await loadCoalescer()
type Coalescer = {
  push(chunk: UIMessageChunk): UIMessageChunk[]
  flush(): UIMessageChunk[]
  pending(): boolean
}
type CoalescerConstructor = new () => Coalescer

const create = (): Coalescer => {
  const Constructor = module['StreamChunkCoalescer'] as CoalescerConstructor | undefined
  assert.equal(typeof Constructor, 'function', '需要实现流式 chunk 合并器 StreamChunkCoalescer')
  return new Constructor()
}

const delta = (text: string, id = 'text-1'): UIMessageChunk => ({
  type: 'text-delta',
  id,
  delta: text,
})
const reasoning = (text: string, id = 'reason-1'): UIMessageChunk => ({
  type: 'reasoning-delta',
  id,
  delta: text,
})

test('连续的文本增量合并成一次更新，直到显式 flush', () => {
  const coalescer = create()
  assert.deepEqual(coalescer.push(delta('你')), [])
  assert.deepEqual(coalescer.push(delta('好')), [])
  assert.deepEqual(coalescer.push(delta('世界')), [])
  assert.equal(coalescer.pending(), true)

  assert.deepEqual(coalescer.flush(), [{ type: 'text-delta', id: 'text-1', delta: '你好世界' }])
  assert.equal(coalescer.pending(), false)
  assert.deepEqual(coalescer.flush(), [])
})

test('控制类 chunk 先冲掉已缓冲文本并保持顺序', () => {
  const coalescer = create()
  coalescer.push(delta('第一段'))
  const emitted = [
    ...coalescer.push({ type: 'text-end', id: 'text-1' }),
    ...coalescer.push({ type: 'start-step' }),
  ]
  assert.deepEqual(emitted, [
    { type: 'text-delta', id: 'text-1', delta: '第一段' },
    { type: 'text-end', id: 'text-1' },
    { type: 'start-step' },
  ])
})

test('不同 id 或不同类别的增量不互相合并', () => {
  const coalescer = create()
  coalescer.push(delta('A', 'text-1'))
  const afterIdSwitch = coalescer.push(delta('B', 'text-2'))
  assert.deepEqual(afterIdSwitch, [{ type: 'text-delta', id: 'text-1', delta: 'A' }])

  const afterKindSwitch = coalescer.push(reasoning('想'))
  assert.deepEqual(afterKindSwitch, [{ type: 'text-delta', id: 'text-2', delta: 'B' }])
  assert.deepEqual(coalescer.flush(), [{ type: 'reasoning-delta', id: 'reason-1', delta: '想' }])
})

test('工具入参增量合并：write 的大文件不再逐 delta 触发重新解析', () => {
  const coalescer = create()
  const start: UIMessageChunk = {
    type: 'tool-input-start',
    toolCallId: 'call-1',
    toolName: 'write',
  }
  assert.deepEqual(coalescer.push(start), [start])
  assert.deepEqual(
    coalescer.push({
      type: 'tool-input-delta',
      toolCallId: 'call-1',
      inputTextDelta: '{"file_path":"a.ts",',
    }),
    [],
  )
  assert.deepEqual(
    coalescer.push({
      type: 'tool-input-delta',
      toolCallId: 'call-1',
      inputTextDelta: '"content":"export const a = 1"}',
    }),
    [],
  )
  assert.deepEqual(coalescer.flush(), [
    {
      type: 'tool-input-delta',
      toolCallId: 'call-1',
      inputTextDelta: '{"file_path":"a.ts","content":"export const a = 1"}',
    },
  ])
})

test('不同工具调用的入参增量不互相合并，且 available 前必定冲刷', () => {
  const coalescer = create()
  coalescer.push({ type: 'tool-input-delta', toolCallId: 'call-1', inputTextDelta: '{"a"' })
  assert.deepEqual(
    coalescer.push({ type: 'tool-input-delta', toolCallId: 'call-2', inputTextDelta: '{"b"' }),
    [{ type: 'tool-input-delta', toolCallId: 'call-1', inputTextDelta: '{"a"' }],
  )
  const available: UIMessageChunk = {
    type: 'tool-input-available',
    toolCallId: 'call-2',
    toolName: 'write',
    input: { b: 1 },
  }
  assert.deepEqual(coalescer.push(available), [
    { type: 'tool-input-delta', toolCallId: 'call-2', inputTextDelta: '{"b"' },
    available,
  ])
})

test('带 providerMetadata 的增量不参与合并', () => {
  const coalescer = create()
  coalescer.push(delta('前'))
  const emitted = coalescer.push({
    type: 'text-delta',
    id: 'text-1',
    delta: '后',
    providerMetadata: { test: { trace: 'x' } },
  } as UIMessageChunk)

  assert.deepEqual(emitted, [
    { type: 'text-delta', id: 'text-1', delta: '前' },
    { type: 'text-delta', id: 'text-1', delta: '后', providerMetadata: { test: { trace: 'x' } } },
  ])
})

test('传输层用合并器按间隔冲刷，而不是逐 chunk 入队', async () => {
  const transport = await readFile('src/renderer/src/lib/IpcChatTransport.ts', 'utf8')
  assert.match(transport, /StreamChunkCoalescer/)
  assert.match(transport, /coalescer\.push\(/)
  assert.match(transport, /coalescer\.flush\(\)/)
  // 结束或取消时必须把缓冲内容交给运行时，否则最后一段回答会丢。
  assert.match(transport, /FLUSH_INTERVAL_MS/)
})
