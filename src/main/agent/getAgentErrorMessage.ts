import { InvalidToolInputError } from 'ai'
import { ZodError } from 'zod'

export function getAgentErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'string' && error.trim()) return isHarnessText(error) ? fallback : error
  if (error instanceof Error && error.message.trim()) {
    if (isHarnessError(error)) return fallback
    return error.message
  }
  return fallback
}

export function createAgentErrorFormatter(fallback: string): (error: unknown) => string {
  let latestToolInputError: string | undefined

  return (error) => {
    if (InvalidToolInputError.isInstance(error)) {
      const issues = findZodError(error)?.issues.map(({ message }) => message)
      latestToolInputError = issues?.length
        ? `工具输入无效：${issues.join('；')}`
        : '工具输入无效，请重试。'
      return latestToolInputError
    }

    if (
      latestToolInputError &&
      typeof error === 'string' &&
      error.startsWith('AI_InvalidToolInputError:')
    ) {
      return latestToolInputError
    }

    return getAgentErrorMessage(error, fallback)
  }
}

function isHarnessError(error: Error): boolean {
  const name = error.name.toLowerCase()
  const message = error.message.toLowerCase()
  return isHarnessText(`${name} ${message}`)
}

function isHarnessText(value: string): boolean {
  const text = value.toLowerCase()
  return text.includes('harness')
    || text.includes('sandbox')
    || text.includes('pi session')
    || text.includes('pi has no')
    || text.includes('sandbox')
    || text.includes('agent-v1')
    || text.includes('just-bash')
}

function findZodError(error: unknown): ZodError | undefined {
  const visited = new Set<unknown>()
  let current = error

  while (current && typeof current === 'object' && !visited.has(current)) {
    if (current instanceof ZodError) return current
    visited.add(current)
    current = 'cause' in current ? current.cause : undefined
  }

  return undefined
}
