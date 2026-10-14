import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const BROWSER_CAPTURE_LIMITS = {
  /** 单张 PNG 上限。超出的截图不会写盘，避免把工作区状态撑爆。 */
  maxBytes: 8 * 1024 * 1024,
  /** 每个会话最多保留的截图张数。 */
  maxPerChat: 20,
} as const

export interface BrowserCapture {
  captureId: string
  chatId: string
  path: string
  width: number
  height: number
  bytes: number
  createdAt: string
}

export class BrowserCaptureError extends Error {
  readonly code: 'TOO_LARGE' | 'NOT_FOUND' | 'INVALID_ID'

  constructor(code: BrowserCaptureError['code'], message: string) {
    super(message)
    this.name = 'BrowserCaptureError'
    this.code = code
  }
}

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * 截图落盘。图片不进聊天消息（否则会随会话持久化把 workspaces.json 撑大），
 * 只在工具结果里带 artifactRef，UI 需要时再按 chatId + captureId 取。
 */
export class BrowserCaptures {
  readonly #root: string
  readonly #created = new Map<string, BrowserCapture[]>()

  constructor(directory: string) {
    this.#root = join(directory, 'browser-captures')
  }

  get root(): string {
    return this.#root
  }

  async save(input: {
    chatId: string
    png: Uint8Array
    width: number
    height: number
  }): Promise<BrowserCapture> {
    if (input.png.byteLength > BROWSER_CAPTURE_LIMITS.maxBytes) {
      throw new BrowserCaptureError(
        'TOO_LARGE',
        `截图 ${input.png.byteLength} 字节，超过 ${BROWSER_CAPTURE_LIMITS.maxBytes} 字节上限。`,
      )
    }
    const captureId = randomUUID()
    const directory = join(this.#root, input.chatId)
    const path = join(directory, `${captureId}.png`)
    await mkdir(directory, { recursive: true })
    await writeFile(path, input.png)
    const capture: BrowserCapture = {
      captureId,
      chatId: input.chatId,
      path,
      width: input.width,
      height: input.height,
      bytes: input.png.byteLength,
      createdAt: new Date().toISOString(),
    }
    const list = [...(this.#created.get(input.chatId) ?? []), capture]
    this.#created.set(input.chatId, list.slice(-BROWSER_CAPTURE_LIMITS.maxPerChat))
    return capture
  }

  async read(chatId: string, captureId: string): Promise<Uint8Array> {
    // captureId 必须是自己签发的 UUID：它同时是路径的一部分，所以先按格式拒绝。
    if (!ID_PATTERN.test(captureId)) {
      throw new BrowserCaptureError('INVALID_ID', '截图 id 格式不正确。')
    }
    const known = (this.#created.get(chatId) ?? []).find((item) => item.captureId === captureId)
    if (known === undefined) {
      throw new BrowserCaptureError('NOT_FOUND', '这个截图不属于当前会话，或已经被清理。')
    }
    return readFile(known.path)
  }
}
