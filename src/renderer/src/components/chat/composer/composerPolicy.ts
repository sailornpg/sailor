interface ComposerSubmissionInput {
  text: string
  fileCount: number
  isGenerating: boolean
  persistedRunStatus?: string
  saveError?: string
  runtimeError?: boolean
}

export interface ComposerSubmission {
  text: string
  clearRuntimeError: boolean
}

export function createComposerSubmission({
  text,
  fileCount,
  isGenerating,
  persistedRunStatus,
  saveError,
  runtimeError = false,
}: ComposerSubmissionInput): ComposerSubmission | null {
  if (isGenerating || persistedRunStatus === 'running' || saveError) return null
  if (!text.trim() && fileCount === 0) return null
  return { text, clearRuntimeError: runtimeError }
}

export async function stopChatRun(
  runId: string | undefined,
  abortPersistedRun: (runId: string) => Promise<unknown>,
  stopActiveChat: () => Promise<unknown>,
): Promise<void> {
  if (runId) await abortPersistedRun(runId)
  await stopActiveChat()
}
