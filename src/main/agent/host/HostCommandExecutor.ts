import {
  spawn as nodeSpawn,
  type ChildProcessWithoutNullStreams,
  type SpawnOptions,
} from 'node:child_process'
import { basename, relative, resolve } from 'node:path'
import { buildTerminalEnv, resolveShell } from '../../terminal/TerminalShell.js'

export const HOST_COMMAND_LIMITS = {
  maxCommandBytes: 32 * 1024,
  maxOutputBytes: 256 * 1024,
  timeoutMs: 300_000,
  killGraceMs: 1_500,
} as const

export type HostCommandLimits = { [Key in keyof typeof HOST_COMMAND_LIMITS]: number }

export interface HostCommandRunInput {
  rootPath: string
  command: string
  cwd?: string
  signal?: AbortSignal
}

export interface HostCommandResult {
  cwd: string
  stdout: string
  stderr: string
  exitCode: number | null
  signal: NodeJS.Signals | null
  timedOut: boolean
  aborted: boolean
  truncated: boolean
}

type SpawnHostProcess = (
  file: string,
  args: readonly string[],
  options: SpawnOptions,
) => ChildProcessWithoutNullStreams

export interface HostCommandExecutorOptions {
  env?: NodeJS.ProcessEnv
  limits?: Partial<HostCommandLimits>
  spawn?: SpawnHostProcess
}

function isWithin(rootPath: string, candidatePath: string): boolean {
  const child = relative(rootPath, candidatePath)
  return child === '' || (!child.startsWith('..') && !child.startsWith('/'))
}

function appendUtf8(
  current: string,
  incoming: string,
  remainingBytes: number,
): { value: string; bytes: number; truncated: boolean } {
  const incomingBytes = Buffer.from(incoming)
  if (incomingBytes.byteLength <= remainingBytes)
    return { value: current + incoming, bytes: incomingBytes.byteLength, truncated: false }
  if (remainingBytes <= 0) return { value: current, bytes: 0, truncated: true }
  const accepted = incomingBytes.subarray(0, remainingBytes).toString('utf8')
  return { value: current + accepted, bytes: Buffer.byteLength(accepted), truncated: true }
}

function signalProcess(child: ChildProcessWithoutNullStreams, signal: NodeJS.Signals): void {
  if (process.platform !== 'win32' && typeof child.pid === 'number' && child.pid > 0) {
    try {
      process.kill(-child.pid, signal)
    } catch {
      // The process group may already have exited; child.kill below is still useful.
    }
  }
  try {
    child.kill(signal)
  } catch {
    // A concurrently exiting child is already in the desired terminal state.
  }
}

function shellCommand(env: NodeJS.ProcessEnv): { file: string; args: string[] } {
  if (process.platform === 'win32') {
    const shell = resolveShell(env)
    return { file: shell.file, args: ['/d', '/s', '/c'] }
  }
  const shell = resolveShell(env)
  // POSIX `sh`/`dash` print an extra `logout` when forced into interactive mode,
  // which pollutes command stderr. User shells that source interactive setup
  // files (for example nvm in `.zshrc`) still need `-i` in addition to `-l`.
  const shellName = basename(shell.file).toLowerCase()
  const interactive = shellName === 'zsh' || shellName === 'bash' || shellName === 'fish'
  return { file: shell.file, args: [...shell.args, ...(interactive ? ['-i'] : []), '-c'] }
}

/** Runs one bounded command in the user's host environment from the main process. */
export class HostCommandExecutor {
  private readonly env: NodeJS.ProcessEnv
  private readonly limits: HostCommandLimits
  private readonly spawn: SpawnHostProcess

  constructor(options: HostCommandExecutorOptions = {}) {
    this.env = options.env ?? process.env
    this.limits = { ...HOST_COMMAND_LIMITS, ...options.limits }
    this.spawn = options.spawn ?? (nodeSpawn as SpawnHostProcess)
  }

  run(input: HostCommandRunInput): Promise<HostCommandResult> {
    const command = typeof input.command === 'string' ? input.command.trim() : ''
    if (!command) return Promise.reject(new Error('宿主命令不能为空。'))
    if (Buffer.byteLength(command) > this.limits.maxCommandBytes)
      return Promise.reject(new Error('宿主命令超过长度上限。'))

    const rootPath = resolve(input.rootPath)
    const cwd = resolve(rootPath, input.cwd ?? '.')
    if (!isWithin(rootPath, cwd)) return Promise.reject(new Error('宿主命令 cwd 不能离开工作区。'))

    const initialResult = (): HostCommandResult => ({
      cwd,
      stdout: '',
      stderr: '',
      exitCode: null,
      signal: null,
      timedOut: false,
      aborted: false,
      truncated: false,
    })
    if (input.signal?.aborted) return Promise.resolve({ ...initialResult(), aborted: true })

    const shell = shellCommand(this.env)
    let child: ChildProcessWithoutNullStreams
    try {
      child = this.spawn(shell.file, [...shell.args, command], {
        cwd,
        env: buildTerminalEnv(this.env),
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })
    } catch (error) {
      return Promise.reject(error)
    }

    return new Promise<HostCommandResult>((resolveResult, reject) => {
      const result = initialResult()
      let outputBytes = 0
      let settled = false
      let terminationStarted = false
      let killTimer: ReturnType<typeof setTimeout> | undefined
      let timeoutTimer: ReturnType<typeof setTimeout> | undefined
      let spawnError: Error | undefined

      const cleanup = () => {
        if (timeoutTimer) clearTimeout(timeoutTimer)
        if (killTimer) clearTimeout(killTimer)
        input.signal?.removeEventListener('abort', onAbort)
      }
      const finish = (code: number | null, signal: NodeJS.Signals | null) => {
        if (settled) return
        settled = true
        cleanup()
        if (spawnError && code === null && signal === null) {
          reject(spawnError)
          return
        }
        result.exitCode = code
        result.signal = signal
        resolveResult(result)
      }
      const stop = (reason: 'abort' | 'timeout' | 'output') => {
        if (terminationStarted || settled) return
        terminationStarted = true
        if (reason === 'abort') result.aborted = true
        if (reason === 'timeout') result.timedOut = true
        if (reason === 'output') result.truncated = true
        signalProcess(child, 'SIGTERM')
        killTimer = setTimeout(() => {
          if (!settled) signalProcess(child, 'SIGKILL')
        }, this.limits.killGraceMs)
      }
      const onAbort = () => stop('abort')
      const append = (target: 'stdout' | 'stderr', chunk: Buffer | string) => {
        if (settled) return
        const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
        const appended = appendUtf8(result[target], text, this.limits.maxOutputBytes - outputBytes)
        result[target] = appended.value
        outputBytes += appended.bytes
        if (appended.truncated) stop('output')
      }

      child.stdout.on('data', (chunk: Buffer | string) => append('stdout', chunk))
      child.stderr.on('data', (chunk: Buffer | string) => append('stderr', chunk))
      child.once('error', (error) => {
        spawnError = error
      })
      child.once('close', (code, signal) => finish(code, signal))
      input.signal?.addEventListener('abort', onAbort, { once: true })
      if (this.limits.timeoutMs > 0)
        timeoutTimer = setTimeout(() => stop('timeout'), this.limits.timeoutMs)
    })
  }
}
