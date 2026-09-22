import assert from 'node:assert/strict'
import test from 'node:test'
import { z } from 'zod'
import { measureContextPayload } from '../src/main/agent/pi/contextPayload.ts'

const imageDataUrl = `data:image/png;base64,${'A'.repeat(40000)}`

test('payload 测量：系统桶只算真正进入 prompt 的文本', () => {
  const measured = measureContextPayload({
    instructions: 'i'.repeat(120),
    skills: [
      // `content` 是模型按需加载的正文，prompt 里只有 name + description。
      { name: 'demo', description: 'd'.repeat(30), content: 'c'.repeat(9000) } as {
        name: string
        description: string
      },
    ],
    tools: {},
    messages: [],
  })
  assert.equal(measured.systemChars, 120 + 4 + 30)
  assert.equal(measured.toolChars, 0)
  assert.equal(measured.conversationChars, 0)
  assert.equal(measured.images, 0)
})

test('payload 测量：工具桶用 provider 形态的 JSON Schema，忽略可执行函数', () => {
  const inputs = z.object({ path: z.string().describe('absolute path') })
  const measured = measureContextPayload({
    instructions: '',
    skills: [],
    tools: {
      read_document: { description: 'read it', inputSchema: inputs, execute: () => undefined },
      web_search: { description: 'search', inputSchema: { type: 'object', properties: { q: { type: 'string' } } } },
    },
    messages: [],
  })
  const readSchema = JSON.stringify(z.toJSONSchema(inputs)).length
  const searchSchema = JSON.stringify({ type: 'object', properties: { q: { type: 'string' } } }).length
  assert.equal(measured.toolChars, ('read_document'.length + 'read it'.length + readSchema) + ('web_search'.length + 'search'.length + searchSchema))
})

test('payload 测量：会话桶统计文本、推理、工具入参与结果，绝不统计图片字节', () => {
  const measured = measureContextPayload({
    instructions: '',
    skills: [],
    tools: {},
    messages: [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: [{ type: 'text', text: 'world' }, { type: 'reasoning', text: 'thinking' }] },
      { role: 'assistant', content: [{ type: 'tool-call', toolName: 'read', input: { path: '/a' } }] },
      { role: 'tool', content: [{ type: 'tool-result', toolName: 'read', output: { text: 'file body' } }] },
      { role: 'user', content: [{ type: 'text', text: 'look' }, { type: 'file', mediaType: 'image/png', data: imageDataUrl }] },
    ],
  })
  assert.equal(measured.images, 1)
  // 工具名随入参/结果一起发给 provider，所以两处都要计入。
  const expectedConversation = 'hello'.length + 'world'.length + 'thinking'.length
    + 'read'.length + JSON.stringify({ path: '/a' }).length
    + 'read'.length + JSON.stringify({ text: 'file body' }).length + 'look'.length
  assert.equal(measured.conversationChars, expectedConversation)
  assert.ok(measured.conversationChars < 200, 'base64 图片数据不能计入会话字符')
})

test('payload 测量：附件正文与路径提示单独成类，不混进会话', () => {
  const notice = '<attachments>\n本轮上传的文档附件\n</attachments>'
  const measured = measureContextPayload({
    instructions: '',
    skills: [],
    tools: {},
    attachmentNotice: notice,
    messages: [
      { role: 'user', content: [{ type: 'text', text: '看看附件' }, { type: 'text', text: notice }] },
      { role: 'tool', content: [{ type: 'tool-result', toolName: 'read_document', output: { text: 'x'.repeat(500) } }] },
      { role: 'tool', content: [{ type: 'tool-result', toolName: 'grep', output: { text: 'y'.repeat(100) } }] },
    ],
  })
  assert.equal(measured.attachmentChars, notice.length + 'read_document'.length + JSON.stringify({ text: 'x'.repeat(500) }).length)
  assert.equal(measured.conversationChars, '看看附件'.length + 'grep'.length + JSON.stringify({ text: 'y'.repeat(100) }).length)
})

test('payload 测量：未知 part 与非字符串内容不抛错，缺失输入按 0 处理', () => {
  const measured = measureContextPayload({
    instructions: '',
    skills: [],
    tools: {},
    messages: [
      { role: 'assistant', content: [{ type: 'data-unknown', payload: { deep: [1, 2, 3] } }] },
      { role: 'user', content: [{ type: 'file', mediaType: 'application/pdf', filename: 'report.pdf', data: 'data:application/pdf;base64,AAAA' }] },
      { role: 'user', content: null },
      { role: 'user' },
    ],
  })
  assert.equal(measured.images, 0)
  assert.equal(measured.conversationChars, 0)
  assert.equal(measured.attachmentChars, 0)

  const empty = measureContextPayload({ instructions: '', skills: [], tools: {}, messages: [] })
  assert.deepEqual(empty, { systemChars: 0, toolChars: 0, attachmentChars: 0, conversationChars: 0, images: 0 })
})
