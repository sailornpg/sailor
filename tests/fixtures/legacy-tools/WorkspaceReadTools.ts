import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { z } from "zod";
import {
  TOOL_BUDGETS,
  createInvalidArgumentFailure,
  createToolFailure,
  createToolSuccess,
  type ToolFailure,
  type ToolResult,
} from "../../../src/shared/toolFeedback.js";
import {
  WorkspaceToolScopeError,
  type WorkspaceToolContext,
} from "../../../src/main/workspaces/WorkspaceToolScope.js";

const MAX_LIST_DEPTH = 5;
const MAX_LIST_SCAN = 5_000;
const MAX_SEARCH_FILES = 500;
const MAX_SEARCH_FILE_BYTES = 1024 * 1024;

export const listFilesInputSchema = z.strictObject({
  path: z.string().min(1).max(4096).default("."),
  depth: z.number().int().min(1).max(MAX_LIST_DEPTH).default(1),
  cursor: z.number().int().nonnegative().default(0),
  limit: z
    .number()
    .int()
    .min(1)
    .max(TOOL_BUDGETS.listFilesPageSize)
    .default(TOOL_BUDGETS.listFilesPageSize),
});

export const searchFilesInputSchema = z.strictObject({
  path: z.string().min(1).max(4096).default("."),
  query: z.string().min(1).max(1_000),
  caseSensitive: z.boolean().default(false),
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(TOOL_BUDGETS.searchMatches)
    .default(TOOL_BUDGETS.searchMatches),
});

export const readFileInputSchema = z.strictObject({
  path: z.string().min(1).max(4096),
  startLine: z.number().int().min(1).default(1),
  maxLines: z
    .number()
    .int()
    .min(1)
    .max(TOOL_BUDGETS.readFileLines)
    .default(TOOL_BUDGETS.readFileLines),
});

export type ListFilesInput = z.infer<typeof listFilesInputSchema>;
export type SearchFilesInput = z.infer<typeof searchFilesInputSchema>;
export type ReadFileInput = z.infer<typeof readFileInputSchema>;

interface ListedEntry {
  path: string;
  type: "file" | "directory";
  bytes?: number;
}

interface CollectedEntries {
  entries: ListedEntry[];
  depthTruncated: boolean;
  scanTruncated: boolean;
}

function toWorkspacePath(rootPath: string, absolutePath: string): string {
  return relative(rootPath, absolutePath).split(sep).join("/") || ".";
}

function elapsed(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}

function truncateUtf8(
  text: string,
  maximumBytes: number,
): { text: string; truncated: boolean } {
  if (Buffer.byteLength(text) <= maximumBytes)
    return { text, truncated: false };
  let low = 0;
  let high = text.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (Buffer.byteLength(text.slice(0, middle)) <= maximumBytes) low = middle;
    else high = middle - 1;
  }
  return { text: text.slice(0, low), truncated: true };
}

function isBinary(buffer: Buffer): boolean {
  if (buffer.subarray(0, 8_192).includes(0)) return true;
  const text = buffer.toString("utf8");
  return !Buffer.from(text, "utf8").equals(buffer);
}

function invalidFailure(
  toolCallId: string,
  tool: string,
  error: z.ZodError,
): ToolFailure {
  return createInvalidArgumentFailure({
    toolCallId,
    tool,
    issues: error.issues.map((issue) => ({
      path: issue.path.join(".") || "input",
      message: issue.message,
    })),
  });
}

function operationFailure(
  toolCallId: string,
  tool: string,
  startedAt: number,
  error: unknown,
): ToolFailure {
  if (error instanceof WorkspaceToolScopeError) {
    return createToolFailure({
      toolCallId,
      tool,
      summary: `${tool} 未完成`,
      durationMs: elapsed(startedAt),
      code: error.code,
      message: error.message,
      retryable: [
        "CANCELLED",
        "WORKSPACE_UNAVAILABLE",
        "NOT_FOUND",
        "PERMISSION_DENIED",
      ].includes(error.code),
      recovery: error.recovery,
    });
  }
  const systemCode = (error as NodeJS.ErrnoException)?.code;
  if (systemCode === "EACCES" || systemCode === "EPERM") {
    return createToolFailure({
      toolCallId,
      tool,
      summary: `${tool} 未完成：没有读取权限`,
      durationMs: elapsed(startedAt),
      code: "PERMISSION_DENIED",
      message: "没有权限读取目标路径。",
      retryable: false,
      recovery: [
        { action: "ask_user", reason: "请检查文件权限或选择其他路径" },
      ],
    });
  }
  return createToolFailure({
    toolCallId,
    tool,
    summary: `${tool} 执行失败`,
    durationMs: elapsed(startedAt),
    code: "INTERNAL_ERROR",
    message: "只读工具执行遇到未知错误，内部细节已隐藏。",
    retryable: true,
    recovery: [{ action: "retry", reason: "请检查工作区状态后重试" }],
  });
}

export class WorkspaceReadTools {
  constructor(private readonly context: WorkspaceToolContext) {}

  async listFiles(toolCallId: string, input: unknown): Promise<ToolResult> {
    const startedAt = Date.now();
    const parsed = listFilesInputSchema.safeParse(input);
    if (!parsed.success)
      return invalidFailure(toolCallId, "list_files", parsed.error);
    try {
      const directory = await this.context.scope.resolvePath(
        parsed.data.path,
        "directory",
      );
      const collected = await this.collectEntries(directory, parsed.data.depth);
      const entries = collected.entries.sort((left, right) =>
        left.path.localeCompare(right.path),
      );
      const page = entries.slice(
        parsed.data.cursor,
        parsed.data.cursor + parsed.data.limit,
      );
      const nextCursor =
        parsed.data.cursor + page.length < entries.length
          ? parsed.data.cursor + page.length
          : null;
      const truncated =
        nextCursor !== null ||
        collected.depthTruncated ||
        collected.scanTruncated;
      return createToolSuccess({
        toolCallId,
        tool: "list_files",
        summary: page.length === 0 ? "目录为空" : `列出 ${page.length} 个条目`,
        durationMs: elapsed(startedAt),
        truncated,
        data: { path: parsed.data.path, entries: page, nextCursor },
      });
    } catch (error) {
      return operationFailure(toolCallId, "list_files", startedAt, error);
    }
  }

  async searchFiles(toolCallId: string, input: unknown): Promise<ToolResult> {
    const startedAt = Date.now();
    const parsed = searchFilesInputSchema.safeParse(input);
    if (!parsed.success)
      return invalidFailure(toolCallId, "search_files", parsed.error);
    try {
      const target = await this.context.scope.resolvePath(parsed.data.path);
      const metadata = await stat(target);
      let files: ListedEntry[];
      let truncated = false;
      if (metadata.isFile()) {
        files = [
          {
            path: toWorkspacePath(this.context.rootPath, target),
            type: "file",
            bytes: metadata.size,
          },
        ];
      } else if (metadata.isDirectory()) {
        const collected = await this.collectEntries(target, MAX_LIST_DEPTH);
        files = collected.entries.filter((entry) => entry.type === "file");
        truncated = collected.depthTruncated || collected.scanTruncated;
      } else {
        throw new WorkspaceToolScopeError(
          "NOT_A_FILE",
          "搜索目标不是普通文件或目录。",
          [{ action: "list_files", reason: "请选择普通文件或目录" }],
        );
      }

      const matches: Array<{
        path: string;
        lineNumber: number;
        line: string;
        hash: string;
      }> = [];
      const needle = parsed.data.caseSensitive
        ? parsed.data.query
        : parsed.data.query.toLocaleLowerCase();
      for (const file of files.slice(0, MAX_SEARCH_FILES)) {
        if ((file.bytes ?? 0) > MAX_SEARCH_FILE_BYTES) {
          truncated = true;
          continue;
        }
        const absolutePath = await this.context.scope.resolvePath(
          file.path,
          "file",
        );
        const buffer = await readFile(absolutePath, {
          signal: this.context.signal,
        });
        if (isBinary(buffer)) continue;
        const hash = createHash("sha256").update(buffer).digest("hex");
        const lines = buffer.toString("utf8").split(/\r?\n/);
        for (let index = 0; index < lines.length; index += 1) {
          const haystack = parsed.data.caseSensitive
            ? lines[index]
            : lines[index].toLocaleLowerCase();
          if (!haystack.includes(needle)) continue;
          if (matches.length >= parsed.data.maxResults) {
            truncated = true;
            break;
          }
          matches.push({
            path: file.path,
            lineNumber: index + 1,
            line: lines[index],
            hash,
          });
        }
        if (matches.length >= parsed.data.maxResults) {
          const hasMoreInFile = lines.some(
            (line, index) =>
              index + 1 > matches.at(-1)!.lineNumber &&
              (parsed.data.caseSensitive
                ? line
                : line.toLocaleLowerCase()
              ).includes(needle),
          );
          truncated ||= hasMoreInFile;
          if (truncated) break;
        }
      }
      if (files.length > MAX_SEARCH_FILES) truncated = true;
      return createToolSuccess({
        toolCallId,
        tool: "search_files",
        summary:
          matches.length === 0
            ? `未找到“${parsed.data.query}”`
            : `找到 ${matches.length} 处匹配`,
        durationMs: elapsed(startedAt),
        truncated,
        data: { path: parsed.data.path, query: parsed.data.query, matches },
      });
    } catch (error) {
      return operationFailure(toolCallId, "search_files", startedAt, error);
    }
  }

  async readFile(toolCallId: string, input: unknown): Promise<ToolResult> {
    const startedAt = Date.now();
    const parsed = readFileInputSchema.safeParse(input);
    if (!parsed.success)
      return invalidFailure(toolCallId, "read_file", parsed.error);
    try {
      const absolutePath = await this.context.scope.resolvePath(
        parsed.data.path,
        "file",
      );
      const buffer = await readFile(absolutePath, {
        signal: this.context.signal,
      });
      if (isBinary(buffer)) {
        return createToolFailure({
          toolCallId,
          tool: "read_file",
          summary: `未读取 ${parsed.data.path}：检测到二进制内容`,
          durationMs: elapsed(startedAt),
          code: "BINARY_FILE",
          message: "该文件不是可安全展示的 UTF-8 文本。",
          retryable: false,
          recovery: [{ action: "list_files", reason: "请选择文本文件" }],
        });
      }
      const text = buffer.toString("utf8");
      const lines = text.length === 0 ? [] : text.split(/\r?\n/);
      const selected = lines.slice(
        parsed.data.startLine - 1,
        parsed.data.startLine - 1 + parsed.data.maxLines,
      );
      const bounded = truncateUtf8(
        selected.join("\n"),
        TOOL_BUDGETS.readFileBytes,
      );
      const selectedLineCount =
        bounded.text.length === 0 ? 0 : bounded.text.split("\n").length;
      const endLine =
        selectedLineCount === 0
          ? Math.min(lines.length, parsed.data.startLine - 1)
          : parsed.data.startLine + selectedLineCount - 1;
      const truncated =
        bounded.truncated ||
        parsed.data.startLine > 1 ||
        endLine < lines.length;
      return createToolSuccess({
        toolCallId,
        tool: "read_file",
        summary: `已读取 ${parsed.data.path} 第 ${parsed.data.startLine}-${endLine} 行`,
        durationMs: elapsed(startedAt),
        truncated,
        data: {
          path: parsed.data.path,
          content: bounded.text,
          startLine: parsed.data.startLine,
          endLine,
          totalLines: lines.length,
          bytes: buffer.byteLength,
          hash: createHash("sha256").update(buffer).digest("hex"),
        },
      });
    } catch (error) {
      return operationFailure(toolCallId, "read_file", startedAt, error);
    }
  }

  private async collectEntries(
    directory: string,
    maximumDepth: number,
  ): Promise<CollectedEntries> {
    const entries: ListedEntry[] = [];
    let depthTruncated = false;
    let scanTruncated = false;
    const visit = async (
      absoluteDirectory: string,
      depth: number,
    ): Promise<void> => {
      if (entries.length >= MAX_LIST_SCAN) {
        scanTruncated = true;
        return;
      }
      const children = (
        await readdir(absoluteDirectory, { withFileTypes: true })
      ).sort((left, right) => left.name.localeCompare(right.name));
      for (const child of children) {
        if (entries.length >= MAX_LIST_SCAN) {
          scanTruncated = true;
          return;
        }
        const lexicalPath = join(absoluteDirectory, child.name);
        const workspacePath = toWorkspacePath(
          this.context.rootPath,
          lexicalPath,
        );
        let canonicalPath: string;
        try {
          canonicalPath = await this.context.scope.resolvePath(workspacePath);
        } catch (error) {
          if (
            error instanceof WorkspaceToolScopeError &&
            ["SENSITIVE_PATH", "OUTSIDE_WORKSPACE", "NOT_FOUND"].includes(
              error.code,
            )
          )
            continue;
          throw error;
        }
        const metadata = await stat(canonicalPath);
        if (metadata.isDirectory()) {
          entries.push({ path: workspacePath, type: "directory" });
          if (depth < maximumDepth) await visit(canonicalPath, depth + 1);
          else depthTruncated = true;
        } else if (metadata.isFile()) {
          entries.push({
            path: workspacePath,
            type: "file",
            bytes: metadata.size,
          });
        }
      }
    };
    await visit(directory, 1);
    return { entries, depthTruncated, scanTruncated };
  }
}
