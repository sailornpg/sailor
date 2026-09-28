import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test, { type TestContext } from 'node:test'
import { createServer } from 'vite'

async function loadProjector(t: TestContext) {
  const vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true } })
  t.after(() => vite.close())
  return vite.ssrLoadModule('/src/main/agent/pi/PiEventProjector.ts')
}

test('Pi bridge exposes only the four display events', async () => {
  const patch = await readFile('patches/@ai-sdk__harness-pi@1.0.119.patch', 'utf8')
  assert.match(patch, /onNativeEvent/)
  assert.match(patch, /compaction_start.*compaction_end.*auto_retry_start.*auto_retry_end/s)
})

test('Pi events retain one bounded lifecycle within the matching chat and run', async (t) => {
  const module = await loadProjector(t)
  const received: unknown[] = []
  const projector = new module.PiEventProjector('chat-a', 'run-a', (event) => received.push(event))
  projector.accept('chat-b', 'run-a', { type: 'compaction_start', reason: 'threshold' })
  projector.accept('chat-a', 'run-b', { type: 'compaction_start', reason: 'threshold' })
  assert.equal(received.length, 0)
  projector.accept('chat-a', 'run-a', { type: 'compaction_start', reason: 'threshold' })
  projector.accept('chat-a', 'run-a', { type: 'compaction_start', reason: 'threshold' })
  assert.equal(received.length, 1)
  projector.accept('chat-a', 'run-a', {
    type: 'compaction_end',
    reason: 'threshold',
    aborted: false,
    result: { tokensBefore: 1000, summary: 'private summary' },
  })
  projector.accept('chat-a', 'run-a', {
    type: 'compaction_end',
    reason: 'threshold',
    aborted: false,
    result: {},
  })
  assert.equal(received.length, 2)
  assert.equal((received[0] as { id: string }).id, (received[1] as { id: string }).id)
  assert.deepEqual((received[1] as { event: unknown }).event, {
    id: (received[0] as { id: string }).id,
    kind: 'compaction',
    phase: 'succeeded',
    trigger: 'threshold',
    at: (received[1] as { event: { at: number } }).event.at,
    tokensBefore: 1000,
  })
  assert.doesNotMatch(JSON.stringify(received), /private summary/)
  projector.close()
  projector.accept('chat-a', 'run-a', { type: 'auto_retry_start', attempt: 1, maxAttempts: 3 })
  assert.equal(received.length, 2)
})

test('retry updates one event and rejects invalid counts or unmatched endings', async (t) => {
  const module = await loadProjector(t)
  const received: Array<{ id: string; event: { phase: string; attempt?: number } }> = []
  const projector = new module.PiEventProjector('chat', 'run', (event) => received.push(event))
  projector.accept('chat', 'run', { type: 'auto_retry_end', success: true, attempt: 1 })
  projector.accept('chat', 'run', { type: 'auto_retry_start', attempt: -1, maxAttempts: 3 })
  assert.equal(received.length, 0)
  projector.accept('chat', 'run', {
    type: 'auto_retry_start',
    attempt: 1,
    maxAttempts: 3,
    errorMessage: 'secret',
  })
  projector.accept('chat', 'run', { type: 'auto_retry_start', attempt: 2, maxAttempts: 3 })
  projector.accept('chat', 'run', {
    type: 'auto_retry_end',
    success: false,
    attempt: 2,
    finalError: 'private',
  })
  projector.accept('chat', 'run', { type: 'auto_retry_end', success: false, attempt: 2 })
  assert.deepEqual(
    received.map((item) => item.event.phase),
    ['started', 'started', 'failed'],
  )
  assert.deepEqual(new Set(received.map((item) => item.id)).size, 1)
  assert.doesNotMatch(JSON.stringify(received), /secret|private/)
})

test('back-to-back compactions and retry cycles each receive a fresh event id', async (t) => {
  const { PiEventProjector } = await loadProjector(t)
  const received: Array<{ event: { id: string; phase: string; kind: string } }> = []
  const projector = new PiEventProjector('chat', 'run', (event) => received.push(event))
  projector.accept('chat', 'run', { type: 'compaction_start', reason: 'overflow' })
  projector.accept('chat', 'run', { type: 'compaction_end', reason: 'overflow', aborted: true })
  projector.accept('chat', 'run', { type: 'compaction_start', reason: 'threshold' })
  projector.accept('chat', 'run', {
    type: 'compaction_end',
    reason: 'threshold',
    aborted: false,
    errorMessage: 'failure',
  })
  projector.accept('chat', 'run', { type: 'auto_retry_start', attempt: 1, maxAttempts: 2 })
  projector.accept('chat', 'run', { type: 'auto_retry_end', attempt: 1, success: true })
  projector.accept('chat', 'run', { type: 'auto_retry_start', attempt: 1, maxAttempts: 2 })
  assert.deepEqual(
    received.map(({ event }) => event.phase),
    ['started', 'cancelled', 'started', 'failed', 'started', 'succeeded', 'started'],
  )
  assert.notEqual(received[0].event.id, received[2].event.id)
  assert.notEqual(received[4].event.id, received[6].event.id)
  assert.doesNotMatch(JSON.stringify(received), /failure/)
})
