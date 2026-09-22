import { pi } from "@ai-sdk/harness-pi";
import { tool, type Tool, type ToolSet } from "ai";
import {
  toolResultSchema,
  toToolModelOutput,
  type ToolResult,
} from "../../../src/shared/toolFeedback.js";
import {
  listFilesInputSchema,
  type ListFilesInput,
  readFileInputSchema,
  type ReadFileInput,
  searchFilesInputSchema,
  type SearchFilesInput,
  WorkspaceReadTools,
} from "./WorkspaceReadTools.js";
import type { WorkspaceToolContext } from "../../../src/main/workspaces/WorkspaceToolScope.js";
import {
  applyPatchInputSchema,
  type ApplyPatchInput,
  writeFileInputSchema,
  type WriteFileInput,
  WorkspaceWriteTools,
} from "./WorkspaceWriteTools.js";
import type { WorkspaceWriteApproval } from "./WorkspaceWriteApproval.js";

function modelOutput(output: ToolResult) {
  const value = JSON.parse(JSON.stringify(toToolModelOutput(output)));
  return output.ok
    ? { type: "json" as const, value }
    : { type: "error-json" as const, value };
}

const descriptions = {
  list_files:
    "列出当前工作区内的文件和目录。用于定位文件；路径必须相对工作区，结果有深度和分页限制。",
  search_files:
    "在当前工作区文本文件中按字面量搜索，返回路径、行号、匹配行和文件 hash。",
  read_file:
    "读取当前工作区内的 UTF-8 文本文件，返回有界内容、行范围和完整文件 SHA-256。",
  write_file:
    "在当前工作区创建或显式覆盖单个 UTF-8 文件。每次调用都需要用户批准；覆盖必须提供 expectedHash。",
  apply_patch:
    "在当前工作区单个文件上应用完整上下文补丁。每次调用都需要用户批准，并必须提供 expectedHash。",
} as const;

export interface AgentTools {
  list_files: Tool<ListFilesInput, ToolResult>;
  search_files: Tool<SearchFilesInput, ToolResult>;
  read_file: Tool<ReadFileInput, ToolResult>;
  write_file?: Tool<WriteFileInput, ToolResult>;
  apply_patch?: Tool<ApplyPatchInput, ToolResult>;
}

// Schema-only registry for persisted UI message validation. No executor is
// reachable from history validation.
export const agentTools: ToolSet = {
  ...pi.builtinTools,
  list_files: tool({
    description: descriptions.list_files,
    inputSchema: listFilesInputSchema,
  }),
  search_files: tool({
    description: descriptions.search_files,
    inputSchema: searchFilesInputSchema,
  }),
  read_file: tool({
    description: descriptions.read_file,
    inputSchema: readFileInputSchema,
  }),
  write_file: tool({
    description: descriptions.write_file,
    inputSchema: writeFileInputSchema,
  }),
  apply_patch: tool({
    description: descriptions.apply_patch,
    inputSchema: applyPatchInputSchema,
  }),

};

export function createAgentTools(
  context: WorkspaceToolContext,
  writeApprovals?: WorkspaceWriteApproval,
): AgentTools {
  const operations = new WorkspaceReadTools(context);
  return {
    list_files: tool({
      description: descriptions.list_files,
      inputSchema: listFilesInputSchema,
      outputSchema: toolResultSchema,
      execute: (input, { toolCallId }) =>
        operations.listFiles(toolCallId, input),
      toModelOutput: ({ output }) => modelOutput(output),
    }),
    search_files: tool({
      description: descriptions.search_files,
      inputSchema: searchFilesInputSchema,
      outputSchema: toolResultSchema,
      execute: (input, { toolCallId }) =>
        operations.searchFiles(toolCallId, input),
      toModelOutput: ({ output }) => modelOutput(output),
    }),
    read_file: tool({
      description: descriptions.read_file,
      inputSchema: readFileInputSchema,
      outputSchema: toolResultSchema,
      execute: (input, { toolCallId }) =>
        operations.readFile(toolCallId, input),
      toModelOutput: ({ output }) => modelOutput(output),
    }),
    ...(writeApprovals
      ? {
          write_file: tool({
            description: descriptions.write_file,
            inputSchema: writeFileInputSchema,
            outputSchema: toolResultSchema,
            execute: (input, { toolCallId }) =>
              new WorkspaceWriteTools(context, writeApprovals).writeFile(
                toolCallId,
                input,
              ),
            toModelOutput: ({ output }) => modelOutput(output),
          }),
          apply_patch: tool({
            description: descriptions.apply_patch,
            inputSchema: applyPatchInputSchema,
            outputSchema: toolResultSchema,
            execute: (input, { toolCallId }) =>
              new WorkspaceWriteTools(context, writeApprovals).applyPatch(
                toolCallId,
                input,
              ),
            toModelOutput: ({ output }) => modelOutput(output),
          }),
        }
      : {}),

  };
}
