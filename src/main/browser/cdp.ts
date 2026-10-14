/**
 * Chrome DevTools Protocol 的窄封装。
 *
 * 只用 Electron 自带的 webContents.debugger（内部就是 CDP），因此不需要
 * Playwright/Puppeteer 这类额外依赖，也不会引入第二套浏览器进程模型。
 * 这里不做协议语义判断，只负责：附着幂等、超时、错误归一化。
 */

export const CDP_PROTOCOL_VERSION = '1.3'
export const CDP_DEFAULT_TIMEOUT_MS = 15_000

/** focus emulation 只是输入前置条件，不该拖长或拖死真正的命令。 */
export const FOCUS_EMULATION_TIMEOUT_MS = 2_000

/** Electron `webContents.debugger` 里我们真正依赖的那部分。 */
export interface CdpDebuggerHost {
  isAttached(): boolean
  attach(protocolVersion?: string): void
  detach(): void
  sendCommand(method: string, commandParams?: Record<string, unknown>): Promise<unknown>
  on(event: 'message', listener: (event: unknown, method: string, params: unknown) => void): void
  on(event: 'detach', listener: (event: unknown, reason: string) => void): void
}

export interface CdpProtocolEvent {
  method: string
  params: Record<string, unknown>
}

export class CdpUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'CdpUnavailableError'
  }
}

export class CdpCommandError extends Error {
  readonly method: string
  readonly timedOut: boolean

  constructor(
    method: string,
    message: string,
    options: { timedOut?: boolean; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'CdpCommandError'
    this.method = method
    this.timedOut = options.timedOut ?? false
  }
}

export interface CdpSessionOptions {
  /** 单条命令的超时；截屏之类的慢命令可以单独放宽。 */
  timeoutMs?: number
}

/** 一个 webContents 对应一个 CdpSession；同一 target 只附着一次。 */
export class CdpSession {
  readonly #host: CdpDebuggerHost
  readonly #timeoutMs: number
  readonly #events = new Set<(event: CdpProtocolEvent) => void>()
  #attached = false
  #messageBound = false
  #inputReady = false

  constructor(host: CdpDebuggerHost, options: CdpSessionOptions = {}) {
    this.#host = host
    this.#timeoutMs = options.timeoutMs ?? CDP_DEFAULT_TIMEOUT_MS
  }

  get attached(): boolean {
    return this.#attached
  }

  /** 订阅协议事件（Runtime.consoleAPICalled、Log.entryAdded 等）。 */
  subscribe(listener: (event: CdpProtocolEvent) => void): () => void {
    this.#bindMessages()
    this.#events.add(listener)
    return () => {
      this.#events.delete(listener)
    }
  }

  #bindMessages(): void {
    if (this.#messageBound) return
    this.#messageBound = true
    this.#host.on('message', (_event, method, params) => {
      if (this.#events.size === 0) return
      const event: CdpProtocolEvent = { method, params: (params ?? {}) as Record<string, unknown> }
      for (const listener of [...this.#events]) listener(event)
    })
  }

  /**
   * 幂等附着。Electron 在 DevTools 已被打开时会抛错，这里翻译成可读原因，
   * 让上层能降级成"面板手动可用、Agent 操作不可用"。
   */
  ensureAttached(): void {
    if (this.#attached && this.#host.isAttached()) return
    try {
      if (!this.#host.isAttached()) this.#host.attach(CDP_PROTOCOL_VERSION)
    } catch (cause) {
      this.#attached = false
      throw new CdpUnavailableError(
        '无法附着调试协议：该页面已经打开了 DevTools，或 webContents 已销毁。请关闭 DevTools 后重试。',
        { cause },
      )
    }
    this.#host.on('detach', () => {
      this.#attached = false
    })
    this.#attached = true
  }

  async send<T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs?: number,
  ): Promise<T> {
    this.ensureAttached()
    await this.#ensureInputReady()
    const limit = timeoutMs ?? this.#timeoutMs
    let timer: NodeJS.Timeout | undefined
    try {
      const result = await Promise.race([
        this.#host.sendCommand(method, params),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            reject(
              new CdpCommandError(method, `${method} 在 ${limit}ms 内没有返回。`, {
                timedOut: true,
              }),
            )
          }, limit)
        }),
      ])
      return result as T
    } catch (cause) {
      if (cause instanceof CdpCommandError) throw cause
      throw new CdpCommandError(method, `${method} 执行失败：${describeError(cause)}`, { cause })
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
  }

  /**
   * 实测结论（macOS 14.6 / Electron 44.4.2）：WebContentsView 的 webContents 在窗口
   * 没有把焦点交给它时，会丢弃 CDP 注入的鼠标与键盘事件（Input.insertText 仍然生效）。
   * 打开 focus emulation 后三类输入都能真正落到页面上，而且不会抢走应用自身的焦点。
   */
  async #ensureInputReady(): Promise<void> {
    if (this.#inputReady) return
    this.#inputReady = true
    try {
      // 单独设一个短上限：这一步失败或卡住都不能拖住真正要发的命令。
      await Promise.race([
        this.#host.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true }),
        new Promise<void>((resolve) => {
          setTimeout(resolve, FOCUS_EMULATION_TIMEOUT_MS)
        }),
      ])
    } catch {
      // 老版本或非页面目标不支持时按原样继续：只影响合成输入，不影响读取。
    }
  }

  detach(): void {
    if (!this.#attached && !this.#host.isAttached()) return
    this.#attached = false
    try {
      if (this.#host.isAttached()) this.#host.detach()
    } catch {
      // 目标已销毁时 detach 会抛错；此处是清理路径，不需要让上层处理。
    }
  }
}

export function describeError(cause: unknown): string {
  if (cause instanceof Error) return cause.message
  if (typeof cause === 'string') return cause
  try {
    return JSON.stringify(cause)
  } catch {
    return String(cause)
  }
}
