import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import { createServer, type ViteDevServer } from 'vite'
import { createDocx, createPdf, createXlsx } from './helpers/document-fixtures.ts'

let vite: ViteDevServer
let documents: typeof import('../src/main/agent/documents/extractDocument.ts')

test.before(async () => {
  vite = await createServer({
    logLevel: 'silent',
    resolve: { alias: { '@shared': resolve(process.cwd(), 'src/shared') } },
    server: { middlewareMode: true },
  })
  documents = await vite.ssrLoadModule('/src/main/agent/documents/extractDocument.ts') as typeof documents
})

test.after(async () => {
  await vite?.close()
})

const extract = (filename: string, bytes: Uint8Array, extra: Record<string, unknown> = {}) =>
  documents.extractDocument({ filename, bytes, ...extra })

test('格式探测同时看扩展名与 magic bytes', () => {
  const { detectDocumentFormat } = documents
  assert.equal(detectDocumentFormat({ filename: 'sales.xlsx', bytes: createXlsx() }), 'xlsx')
  assert.equal(detectDocumentFormat({ filename: 'report.docx', bytes: createDocx() }), 'docx')
  assert.equal(detectDocumentFormat({ filename: 'notes.pdf', bytes: createPdf() }), 'pdf')
  assert.equal(detectDocumentFormat({ filename: 'data.csv', bytes: Buffer.from('a,b\n1,2\n') }), 'csv')
  assert.equal(detectDocumentFormat({ filename: 'notes.txt', bytes: Buffer.from('hello') }), 'text')
  assert.equal(detectDocumentFormat({ filename: 'notes.md', bytes: Buffer.from('# hi') }), 'text')

  // 后缀写错时靠内容识别
  assert.equal(detectDocumentFormat({ filename: 'mystery.bin', bytes: createPdf() }), 'pdf')
  assert.equal(detectDocumentFormat({ filename: 'mystery.dat', bytes: createDocx() }), 'docx')

  assert.equal(detectDocumentFormat({ filename: 'archive.zip', bytes: Buffer.from('PK\x03\x04rest') }), undefined)
  assert.equal(detectDocumentFormat({ filename: 'photo.png', bytes: Buffer.from('89504e470d0a1a0a', 'hex') }), undefined)
})

test('xlsx 逐 sheet 输出表名与行，并把日期还原为日期而不是数字', async () => {
  const result = await extract('sales.xlsx', createXlsx())
  assert.equal(result.format, 'xlsx')
  assert.match(result.summary, /2 个 sheet/)
  const sheets = result.data.sheets as Array<{ name: string; rows: string[][] }>
  assert.equal(sheets.length, 2)
  assert.equal(sheets[0].name, 'Summary')
  assert.deepEqual(sheets[0].rows[0], ['Name', 'Quantity', 'When'])
  assert.deepEqual(sheets[0].rows[1], ['Widget', '3', '2023-03-15'])
  assert.deepEqual(sheets[0].rows[2], ['Gadget', '7', ''])
  assert.equal(sheets[1].name, 'Detail')
  assert.deepEqual(sheets[1].rows[1], ['North', 'Ada'])
  assert.match(result.data.text as string, /Summary/)
  assert.match(result.data.text as string, /Widget/)
  assert.equal(result.truncated, false)
})

test('xlsx 超过行数上限时截断并显式标注', async () => {
  const rows = ['<row r="1"><c r="A1" t="inlineStr"><is><t>n</t></is></c></row>']
  for (let index = 2; index <= 40; index += 1) {
    rows.push(`<row r="${index}"><c r="A${index}" t="inlineStr"><is><t>row-${index}</t></is></c></row>`)
  }
  const bytes = createXlsx([{ name: 'Big', rows }])
  const result = await extract('big.xlsx', bytes, { maxRows: 5 })
  const sheets = result.data.sheets as Array<{ name: string; rows: string[][]; truncated: boolean }>
  assert.equal(sheets[0].rows.length, 5)
  assert.equal(sheets[0].truncated, true)
  assert.equal(result.truncated, true)
  assert.match(result.summary, /截断/)
})

test('docx 与 pdf 抽取为文本，并受字符上限约束', async () => {
  const docx = await extract('report.docx', createDocx())
  assert.equal(docx.format, 'docx')
  assert.match(docx.data.text as string, /Quarterly report/)
  assert.match(docx.data.text as string, /Revenue grew 12%/)
  assert.match(docx.summary, /report\.docx/)

  const pdf = await extract('notes.pdf', createPdf())
  assert.equal(pdf.format, 'pdf')
  assert.match(pdf.data.text as string, /Hello from pdf/)

  const limited = await extract('report.docx', createDocx(), { maxCharacters: 10 })
  assert.equal((limited.data.text as string).length, 10)
  assert.equal(limited.truncated, true)
})

test('文本与 csv 解码为文本，二进制内容被明确拒绝', async () => {
  const csv = await extract('data.csv', Buffer.from('name,qty\nWidget,3\n'))
  assert.equal(csv.format, 'csv')
  assert.match(csv.data.text as string, /Widget,3/)

  const text = await extract('notes.md', Buffer.from('# 标题\n正文\n'))
  assert.equal(text.format, 'text')
  assert.match(text.data.text as string, /标题/)

  await assert.rejects(
    () => extract('blob.txt', Buffer.from('abc\u0000def')),
    (error: Error) => /binary|二进制/i.test(error.message),
  )
})

test('未知类型与超大文件返回可读失败，解析异常不泄漏路径', async () => {
  await assert.rejects(
    () => extract('photo.png', Buffer.from('89504e470d0a1a0a', 'hex')),
    (error: Error) => /UNSUPPORTED_TYPE/.test((error as { code?: string }).code ?? ''),
  )

  await assert.rejects(
    () => extract('huge.txt', Buffer.alloc(documents.DOCUMENT_BUDGETS.sourceBytes + 1, 0x61)),
    (error: Error) => /TOO_LARGE/.test((error as { code?: string }).code ?? ''),
  )

  const corrupt = createXlsx().subarray(0, 40)
  await assert.rejects(
    () => extract('broken.xlsx', corrupt),
    (error: Error) => {
      assert.equal((error as { code?: string }).code, 'PARSE_FAILED')
      assert.doesNotMatch(error.message, /\/Users\/|at .*\(.*:\d+:\d+\)/)
      return true
    },
  )
})
