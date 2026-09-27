import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import type { WorkspacePermissionMode } from '../../../shared/contracts.js'
import type { HostCommandExecutor, HostCommandResult } from './HostCommandExecutor.js'

export const HOST_EXEC_TOOL = 'host_exec'

export const hostExecRequestSchema = z.strictObject({
  command: z
    .string()
    .trim()
    .min(1)
    .max(32 * 1024),
  cwd: z.string().trim().min(1).max(1000).optional(),
})

export function hostExecApprovalFor(
  permissionMode: WorkspacePermissionMode,
): 'approved' | 'user-approval' {
  return permissionMode === 'allow-all' ? 'approved' : 'user-approval'
}

export interface HostExecToolInput {
  rootPath: string
  signal: AbortSignal
  resolveCwd: (cwd: string) => Promise<string>
  executor: Pick<HostCommandExecutor, 'run'>
  enabled?: boolean
}

/** Creates the host command tool only for full chats; side chats pass enabled=false. */
export function createHostExecTool(input: HostExecToolInput): ToolSet {
  if (input.enabled === false) return {}
  return {
    [HOST_EXEC_TOOL]: tool({
      description:
        'Run a project command in the real host environment, such as npm, pnpm, node, or a test runner. The command runs in the selected workspace and returns bounded stdout, stderr, and exit information.',
      inputSchema: hostExecRequestSchema,
      execute: async (request): Promise<HostCommandResult> => {
        const cwd = await input.resolveCwd(request.cwd ?? '.')
        return input.executor.run({
          rootPath: input.rootPath,
          cwd,
          command: request.command,
          signal: input.signal,
        })
      },
    }),
  } as ToolSet
}
