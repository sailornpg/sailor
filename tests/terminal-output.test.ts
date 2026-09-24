import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test, { after } from 'node:test'
import { createServer, type ViteDevServer } from 'vite'

const ALIASES = { '@shared': resolve('src/shared') }

let server: ViteDevServer | null = null

async function load(path: string): Promise<Record<string, any>> {
  server ??= await createServer({ logLevel: 'silent', server: { middlewareMode: true }, resolve: { alias: ALIASES } })
  return server.ssrLoadModule(path)
}

after(async () => {
  await server?.close()
})

async function loadOutput() {
  const shared = await load('/src/shared/terminal.ts').catch(() => assert.fail('共享终端契约尚未实现'))
  const output = await load('/src/main/terminal/TerminalOutputBuffer.ts').catch(() => assert.fail('终端输出缓冲尚未实现'))
  assert.equal(typeof output.TerminalOutputBuffer, 'function', '需要可测试的输出缓冲')
  assert.equal(typeof output.TerminalSubscriberQueue, 'function', '需要按订阅者的背压队列')
  return { shared, output }
}

function byteLength(data: string): number {
  return new TextEncoder().encode(data).length
}

function createManualScheduler() {
  interface Timer {
    fn: () => void
    cancelled: boolean
  }
  const timers: Timer[] = []
  return {
    schedule(fn: () => void) {
      const timer: Timer = { fn, cancelled: false }
      timers.push(timer)
      return () => {
        timer.cancelled = true
      }
    },
    run() {
      // Drain until idle: the production path chains a flush tick into a delivery tick.
      while (timers.length > 0) {
        for (const timer of timers.splice(0)) {
          if (!timer.cancelled) timer.fn()
        }
      }
    },
    pending: () => timers.filter(timer => !timer.cancelled).length,
  }
}

async function createBuffer(config: { outputLimitBytes?: number; flushIntervalMs?: number; maxFlushBytes?: number } = {}) {
  const { output, shared } = await loadOutput()
  const scheduler = createManualScheduler()
  const chunks: Array<{ seq: number; data: string }> = []
  const buffer = new output.TerminalOutputBuffer({
    outputLimitBytes: config.outputLimitBytes ?? shared.TERMINAL_LIMITS.outputLimitBytes,
    flushIntervalMs: config.flushIntervalMs ?? shared.TERMINAL_LIMITS.flushIntervalMs,
    maxFlushBytes: config.maxFlushBytes ?? shared.TERMINAL_LIMITS.maxFlushBytes,
    onChunk: (chunk: { seq: number; data: string }) => chunks.push(chunk),
    schedule: scheduler.schedule,
  })
  return { buffer, chunks, scheduler }
}

test('输出按刷新窗口批量合并，达到上限时立即刷新', async () => {
  const { buffer, chunks, scheduler } = await createBuffer({ maxFlushBytes: 8, flushIntervalMs: 16, outputLimitBytes: 64 })

  buffer.push('abc')
  buffer.push('def')
  assert.deepEqual(chunks, [], '窗口内的数据不逐块派发')
  assert.equal(scheduler.pending(), 1, '应安排一次刷新')

  scheduler.run()
  assert.deepEqual(chunks, [{ seq: 1, data: 'abcdef' }])

  buffer.push('x'.repeat(8))
  assert.deepEqual(chunks.map(chunk => chunk.seq), [1, 2], '达到批量上限立即刷新')
  buffer.push('tail')
  buffer.flush()
  assert.equal(chunks.map(chunk => chunk.data).join(''), 'abcdef' + 'x'.repeat(8) + 'tail')
  buffer.dispose()
})

test('关闭或退出前可以强制刷新尾部输出', async () => {
  const { buffer, chunks, scheduler } = await createBuffer({ maxFlushBytes: 1024 })
  buffer.push('bye\n')
  assert.equal(scheduler.pending(), 1)
  buffer.flush()
  assert.deepEqual(chunks, [{ seq: 1, data: 'bye\n' }])
  assert.equal(scheduler.pending(), 0, '刷新后必须取消挂起的定时器')
  buffer.dispose()
})

test('缓存按字节上限淘汰最旧数据，并在快照中报告截断', async () => {
  const { buffer } = await createBuffer({ outputLimitBytes: 10, maxFlushBytes: 4 })
  for (const data of ['aaaa', 'bbbb', 'cccc']) {
    buffer.push(data)
    buffer.flush()
  }

  assert.ok(buffer.bufferedBytes <= 10)
  const all = buffer.snapshot(0)
  assert.deepEqual(all.chunks.map(chunk => chunk.seq), [2, 3])
  assert.equal(all.nextSeq, 4)
  assert.equal(all.truncated, true, '被淘汰的历史必须显式标记，不能假装完整')

  const recent = buffer.snapshot(2)
  assert.deepEqual(recent.chunks.map(chunk => chunk.seq), [3])
  assert.equal(recent.truncated, false)
  assert.deepEqual(buffer.snapshot(3), { chunks: [], nextSeq: 4, truncated: false })
  buffer.dispose()
})

test('大量输出下缓存与待刷新数据都保持在上限内', async () => {
  const { buffer } = await createBuffer({ outputLimitBytes: 4096, maxFlushBytes: 1024, flushIntervalMs: 16 })
  for (let index = 0; index < 400; index += 1) buffer.push('x'.repeat(1024))
  buffer.flush()

  assert.ok(buffer.bufferedBytes <= 4096, `缓存字节数超限：${buffer.bufferedBytes}`)
  assert.ok(buffer.pendingBytes <= 4096)
  const snapshot = buffer.snapshot(0)
  const retained = snapshot.chunks.reduce((total, chunk) => total + byteLength(chunk.data), 0)
  assert.ok(retained <= 4096, `快照字节数超限：${retained}`)
  assert.equal(snapshot.truncated, true)
  buffer.dispose()
})

test('分段的 Unicode 与 ANSI 序列在拼接后与原始字节完全一致', async () => {
  const { buffer, chunks } = await createBuffer({ outputLimitBytes: 4096, maxFlushBytes: 8, flushIntervalMs: 16 })
  const text = '\u001b[31m你好，世界🙂\u001b[0m\n'
  for (const character of text) {
    buffer.push(character)
    buffer.flush()
  }
  const joined = chunks.map(chunk => chunk.data).join('')
  assert.equal(joined, text, '分块不能丢字符或重复')
  assert.ok(Buffer.from(joined, 'utf8').equals(Buffer.from(text, 'utf8')), 'UTF-8 字节必须一致')
  assert.deepEqual(chunks.map(chunk => chunk.seq), chunks.map((_chunk, index) => index + 1), '序号必须连续')
  assert.equal(buffer.snapshot(0).truncated, false)
  buffer.dispose()
})

test('慢消费者超出预算时丢弃最旧数据并只报告一次截断', async () => {
  const { output } = await loadOutput()
  const scheduler = createManualScheduler()
  const delivered: Array<{ chunks: Array<{ seq: number; data: string }>; droppedBytes: number }> = []
  const queue = new output.TerminalSubscriberQueue({
    limitBytes: 8,
    deliver: (chunks: Array<{ seq: number; data: string }>, droppedBytes: number) => delivered.push({ chunks, droppedBytes }),
    schedule: scheduler.schedule,
  })

  for (let seq = 1; seq <= 4; seq += 1) queue.enqueue({ seq, data: 'aaaa' })
  scheduler.run()

  assert.equal(delivered.length, 1)
  const [batch] = delivered
  assert.ok(batch.droppedBytes > 0, '必须显式报告被丢弃的字节')
  const kept = batch.chunks.reduce((total, chunk) => total + byteLength(chunk.data), 0)
  assert.ok(kept <= 8, `待发预算被突破：${kept}`)
  assert.deepEqual(batch.chunks.map(chunk => chunk.seq), [3, 4], '保留最新的输出')

  queue.enqueue({ seq: 5, data: 'eeee' })
  queue.flush()
  assert.equal(delivered.length, 2)
  assert.equal(delivered[1].droppedBytes, 0, '截断只报告一次')
  assert.deepEqual(delivered[1].chunks.map(chunk => chunk.seq), [5])
  queue.dispose()
})

test('单个超出预算的数据块被整体丢弃并报告', async () => {
  const { output } = await loadOutput()
  const scheduler = createManualScheduler()
  const delivered: Array<{ chunks: Array<{ seq: number; data: string }>; droppedBytes: number }> = []
  const queue = new output.TerminalSubscriberQueue({
    limitBytes: 4,
    deliver: (chunks: Array<{ seq: number; data: string }>, droppedBytes: number) => delivered.push({ chunks, droppedBytes }),
    schedule: scheduler.schedule,
  })

  queue.enqueue({ seq: 1, data: 'x'.repeat(8) })
  scheduler.run()
  assert.equal(delivered.length, 1)
  assert.deepEqual(delivered[0].chunks, [])
  assert.equal(delivered[0].droppedBytes, 8)
  queue.dispose()
})

test('重新订阅从 sinceSeq 续传，不重复也不丢失保留窗口内的数据', async () => {
  const { buffer, chunks } = await createBuffer({ outputLimitBytes: 4096, maxFlushBytes: 4 })
  for (const data of ['one!', 'two!', 'three!']) {
    buffer.push(data)
    buffer.flush()
  }

  const seenLast = buffer.snapshot(0).chunks[0].seq
  assert.deepEqual(buffer.snapshot(seenLast).chunks.map(chunk => chunk.seq), [seenLast + 1, seenLast + 2])

  const resume = buffer.snapshot(seenLast + 1)
  assert.deepEqual(resume.chunks.map(chunk => chunk.data), ['three!'])
  assert.equal(resume.nextSeq, seenLast + 3)
  assert.equal(resume.truncated, false)

  const live: string[] = []
  buffer.push('four!')
  const emitted = chunks.filter(chunk => chunk.seq >= resume.nextSeq)
  live.push(...emitted.map(chunk => chunk.data))
  assert.deepEqual(live, ['four!'], '实时流从 nextSeq 继续，不与快照重叠')
  buffer.dispose()
})

interface FakePtyRecord {
  dataListeners: Set<(data: string) => void>
  exitListeners: Set<(event: { code: number | null; signal: number | null }) => void>
}

function createPtyDouble() {
  const records: FakePtyRecord[] = []
  const adapter = {
    spawn() {
      const record: FakePtyRecord = { dataListeners: new Set(), exitListeners: new Set() }
      records.push(record)
      return {
        pid: 9000 + records.length,
        onData(listener: (data: string) => void) {
          record.dataListeners.add(listener)
          return () => record.dataListeners.delete(listener)
        },
        onExit(listener: (event: { code: number | null; signal: number | null }) => void) {
          record.exitListeners.add(listener)
          return () => record.exitListeners.delete(listener)
        },
        write() {},
        resize() {},
        signalGroup() {},
        kill() {
          for (const listener of [...record.exitListeners]) listener({ code: 0, signal: 9 })
        },
      }
    },
  }
  return {
    adapter,
    records,
    emitData(record: FakePtyRecord, data: string) {
      for (const listener of [...record.dataListeners]) listener(data)
    },
    emitExit(record: FakePtyRecord, code = 0) {
      for (const listener of [...record.exitListeners]) listener({ code, signal: null })
    },
  }
}

function createSender(id: number) {
  return {
    id,
    destroyed: false,
    received: [] as Array<{ subscriptionId: string; event: any }>,
    isDestroyed() {
      return this.destroyed
    },
    send(payload: { subscriptionId: string; event: any }) {
      this.received.push(payload)
    },
  }
}

async function createSessionHarness() {
  const { shared, output } = await loadOutput()
  const serviceModule = await load('/src/main/terminal/TerminalService.ts').catch(() => assert.fail('工作区单终端服务尚未实现'))
  const ipcModule = await load('/src/main/terminal/TerminalIpcHandler.ts').catch(() => assert.fail('终端窄 IPC 尚未实现'))
  const pty = createPtyDouble()
  const scheduler = createManualScheduler()
  const service = new serviceModule.TerminalService({
    resolveProjectRoot: async () => '/projects/one',
    adapter: pty.adapter,
    env: { SHELL: '/bin/zsh' },
    limits: { exitGraceMs: 5, flushIntervalMs: 16, maxFlushBytes: 8, outputLimitBytes: 64, subscriberLimitBytes: 16 },
    schedule: scheduler.schedule,
  })
  const sender = createSender(1)
  const handler = new ipcModule.TerminalIpcHandler({
    service,
    isTrustedSender: () => true,
    limits: { subscriberLimitBytes: 16, flushIntervalMs: 16 },
    schedule: scheduler.schedule,
  })
  assert.equal(typeof shared.TERMINAL_LIMITS.flushIntervalMs, 'number')
  assert.equal(typeof output.TerminalOutputBuffer, 'function')
  return { service, handler, pty, sender, scheduler }
}

test('附着时返回保留窗口内的快照，之后的实时事件从 nextSeq 继续', async () => {
  const { service, handler, pty, sender, scheduler } = await createSessionHarness()
  const info = await handler.create(sender, { projectId: 'p1', cols: 80, rows: 24 })
  pty.emitData(pty.records[0], 'first')
  scheduler.run()

  const attached = await handler.attach(sender, { projectId: 'p1', sessionId: info.sessionId })
  assert.deepEqual(attached.chunks.map((chunk: { data: string }) => chunk.data), ['first'])
  assert.equal(attached.nextSeq, 2)
  assert.equal(attached.truncated, false)

  pty.emitData(pty.records[0], 'second')
  scheduler.run()
  const outputEvents = sender.received.filter(payload => payload.event.type === 'output')
  assert.deepEqual(outputEvents.map(payload => payload.event.data), ['second'])
  assert.equal(outputEvents[0].event.seq, 2, '实时事件从 nextSeq 继续，不与快照重叠')

  handler.dispose()
  await service.disposeAll()
})

test('重新附着只补发未收到的部分，并与实时流拼接成完整输出', async () => {
  const { service, handler, pty, sender, scheduler } = await createSessionHarness()
  const info = await handler.create(sender, { projectId: 'p1', cols: 80, rows: 24 })
  pty.emitData(pty.records[0], 'aaaa')
  scheduler.run()
  const first = await handler.attach(sender, { projectId: 'p1', sessionId: info.sessionId })
  assert.equal(first.chunks.map((chunk: { data: string }) => chunk.data).join(''), 'aaaa')
  // `sinceSeq` is the last sequence already applied; live chunks carry `nextSeq` onward.
  const lastApplied = first.chunks.at(-1).seq
  assert.equal(first.nextSeq, lastApplied + 1)

  await handler.detach(sender, first.subscriptionId)
  pty.emitData(pty.records[0], 'bbbb')
  pty.emitData(pty.records[0], 'cccc')
  scheduler.run()

  const resumed = await handler.attach(sender, { projectId: 'p1', sessionId: info.sessionId, sinceSeq: lastApplied })
  assert.equal(resumed.chunks.map((chunk: { data: string }) => chunk.data).join(''), 'bbbbcccc')
  assert.equal(resumed.nextSeq, first.nextSeq + 1)

  pty.emitData(pty.records[0], 'dddd')
  scheduler.run()
  const outputEvents = sender.received.filter(payload => payload.event.type === 'output' && payload.event.seq >= resumed.nextSeq)
  assert.deepEqual(outputEvents.map(payload => payload.event.data), ['dddd'])

  handler.dispose()
  await service.disposeAll()
})

test('退出前的尾部输出先于退出状态送达', async () => {
  const { service, handler, pty, sender, scheduler } = await createSessionHarness()
  const info = await handler.create(sender, { projectId: 'p1', cols: 80, rows: 24 })
  await handler.attach(sender, { projectId: 'p1', sessionId: info.sessionId })

  pty.emitData(pty.records[0], 'tail')
  pty.emitExit(pty.records[0], 0)
  scheduler.run()

  const types = sender.received.map(payload => payload.event.type)
  const tailIndex = types.indexOf('output')
  const exitIndex = types.indexOf('state')
  assert.ok(tailIndex >= 0, '尾部输出必须送达')
  assert.ok(exitIndex > tailIndex, '退出状态必须排在尾部输出之后')
  assert.equal(sender.received[exitIndex].event.info.status, 'exited')

  handler.dispose()
  await service.disposeAll()
})

test('慢消费者的订阅队列按上限丢弃并下发明确的截断提示', async () => {
  const { service, handler, pty, sender, scheduler } = await createSessionHarness()
  const info = await handler.create(sender, { projectId: 'p1', cols: 80, rows: 24 })
  await handler.attach(sender, { projectId: 'p1', sessionId: info.sessionId })

  for (let index = 0; index < 12; index += 1) pty.emitData(pty.records[0], 'aaaaaaaa')
  scheduler.run()
  const dropped = sender.received.filter(payload => payload.event.type === 'dropped')

  assert.ok(dropped.length >= 1, '必须下发截断提示而不是静默丢数据')
  assert.ok(dropped[0].event.bytes > 0)
  assert.equal(dropped[0].event.sessionId, info.sessionId)
  const kept = sender.received
    .filter(payload => payload.event.type === 'output')
    .reduce((total: number, payload: { event: { data: string } }) => total + byteLength(payload.event.data), 0)
  assert.ok(kept <= 16, `待发预算被突破：${kept}`)

  handler.dispose()
  await service.disposeAll()
})
