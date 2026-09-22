import type {
  ToolCallMessagePartComponent,
  ToolCallMessagePartProps,
  ToolCallMessagePartStatus,
} from "@assistant-ui/react";
import { useState } from "react";
import { ToolFallback, formatUnknownValue } from "@/components/assistant-ui/elements/tool-fallback.aui";
import { isPendingApprovalRequest, SailorApprovalCard } from "./SailorApprovalCard";
import { toolResultSchema } from "@shared/toolFeedback";
import {
  projectFileChangeFeedback,
  type FileChangeFeedback,
} from "@/lib/fileChangeFeedback";
import {
  projectShellExecutionFeedback,
  type ShellExecutionFeedback,
} from "@/lib/shellExecutionFeedback";
import {
  projectWebSearchFeedback,
  type WebSearchFeedback,
} from "@/lib/webSearchFeedback";
import { WebSearch } from "@/components/assistant-ui/elements/web-search";
import { Sources } from "@/components/assistant-ui/elements/sources.aui";
import { InlineCitation } from "@/components/assistant-ui/elements/inline-citation";
import { ToolError } from "@/components/assistant-ui/elements/tool-error";
import { WebPreview } from "@/components/assistant-ui/elements/web-preview";
import { requestPanelOpen } from "@/lib/panels/panelData";

function fileStatus(
  view: FileChangeFeedback,
  original: ToolCallMessagePartStatus | undefined,
): ToolCallMessagePartStatus | undefined {
  if (view.phase !== "failed") return original;
  return {
    type: "incomplete",
    reason: "error",
    error: `${view.errorCode}: ${view.errorMessage}`,
  };
}

function FileChangeResult({ view }: { view: FileChangeFeedback }) {
  return (
    <div className="space-y-2 text-xs" data-file-change-phase={view.phase}>
      <div className="font-medium">{view.summary}</div>
      <div className="text-muted-foreground">路径：{view.path}</div>
      {view.changes && (
        <div className="text-muted-foreground">
          变更：+{view.changes.addedLines} / -{view.changes.removedLines} 行
        </div>
      )}
      {view.diffRef && (
        <div className="text-muted-foreground">Diff：{view.diffRef.id}</div>
      )}
      {view.preview && (
        <pre className="bg-muted/50 max-h-48 overflow-auto rounded-md p-2 whitespace-pre-wrap">
          {view.preview.text}
          {view.preview.truncated ? "\n…（预览已截断）" : ""}
        </pre>
      )}
      {view.recovery && view.recovery.length > 0 && (
        <div className="text-muted-foreground">
          <div className="font-medium">下一步</div>
          <ul className="list-disc pl-4">
            {view.recovery.map((item, index) => (
              <li key={`${item.action}-${index}`}>
                {item.action}：{item.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function FileChangeToolFallback(props: ToolCallMessagePartProps) {
  const view = projectFileChangeFeedback({
    toolName: props.toolName,
    args: props.args,
    result: props.result,
    status:
      props.status?.type === "requires-action"
        ? "requires-action"
        : props.status?.type === "running"
          ? "running"
          : props.status?.type === "incomplete" &&
              props.status.reason === "cancelled"
            ? "cancelled"
            : props.status?.type === "incomplete"
              ? "error"
              : "complete",
  });
  if (!view) return <ToolFallback {...props} />;
  const status = fileStatus(view, props.status);
  const requiresAction = props.status?.type === "requires-action";
  return (
    <ToolFallback.Root
      defaultOpen={
        requiresAction || view.phase === "failed" || view.phase === "applied"
      }
    >
      <ToolFallback.Trigger toolName={props.toolName} status={status} />
      <ToolFallback.Content>
        <ToolFallback.Error status={status} />
        <ToolFallback.Args argsText={props.argsText} />
        {requiresAction && <ToolFallback.Approval {...props} />}
        <FileChangeResult view={view} />
      </ToolFallback.Content>
    </ToolFallback.Root>
  );
}

function ShellExecutionResult({ view }: { view: ShellExecutionFeedback }) {
  return (
    <div className="space-y-2 text-xs" data-shell-execution-phase={view.phase}>
      <div className="font-medium">{view.summary}</div>
      <div className="text-muted-foreground">
        目录：{view.cwd}
        {view.exitCode !== undefined && `；退出码：${view.exitCode ?? "无"}`}
        {view.signal && `；信号：${view.signal}`}
      </div>
      {view.terminationReason && (
        <div className="text-muted-foreground">
          终止原因：{view.terminationReason}
        </div>
      )}
      {view.stdoutTail && (
        <pre className="bg-muted/50 max-h-48 overflow-auto rounded-md p-2 whitespace-pre-wrap">
          {view.stdoutTail}
        </pre>
      )}
      {view.stderrTail && (
        <pre className="border-destructive/30 bg-destructive/5 max-h-48 overflow-auto rounded-md border p-2 whitespace-pre-wrap">
          {view.stderrTail}
        </pre>
      )}
      {view.truncated && (
        <div className="text-muted-foreground">
          输出已截断，仅显示尾部；完整内容请查看日志。
        </div>
      )}
      {view.logRef && (
        <div className="text-muted-foreground">
          日志：{view.logRef.label ?? view.logRef.id}
        </div>
      )}
      {view.recovery && (
        <ul className="list-disc pl-4 text-muted-foreground">
          {view.recovery.map((item, index) => (
            <li key={`${item.action}-${index}`}>
              {item.action}：{item.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ShellExecutionToolFallback(props: ToolCallMessagePartProps) {
  const view = projectShellExecutionFeedback({
    toolName: props.toolName,
    args: props.args,
    result: props.result,
    status:
      props.status?.type === "requires-action"
        ? "requires-action"
        : props.status?.type === "running"
          ? "running"
          : props.status?.type === "incomplete" &&
              props.status.reason === "cancelled"
            ? "cancelled"
            : props.status?.type === "incomplete"
              ? "error"
              : "complete",
  });
  if (!view) return <ToolFallback {...props} />;
  const status =
    view.phase === "failed"
      ? {
          type: "incomplete" as const,
          reason: "error" as const,
          error: view.errorMessage,
        }
      : props.status;
  const requiresAction = props.status?.type === "requires-action";
  return (
    <ToolFallback.Root
      defaultOpen={
        requiresAction || view.phase === "failed" || view.phase === "succeeded"
      }
    >
      <ToolFallback.Trigger toolName={props.toolName} status={status} />
      <ToolFallback.Content>
        <ToolFallback.Error status={status} />
        <ToolFallback.Args argsText={props.argsText} />
        {requiresAction && <ToolFallback.Approval {...props} />}
        <ShellExecutionResult view={view} />
      </ToolFallback.Content>
    </ToolFallback.Root>
  );
}

function WebSearchResult({ view }: { view: WebSearchFeedback }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  return (
    <div className="space-y-3" data-web-search-phase={view.phase}>
      <WebSearch
        query={view.query}
        results={view.sources.map(({ title, domain }) => ({ title, domain }))}
        visibleResults={view.sources.length}
        searching={view.phase === "running"}
        cycle={0}
      />
      {view.sources.length > 0 && (
        <div className="space-y-2" aria-label="Web 来源">
          <InlineCitation
            className="max-w-none"
            sources={view.sources.map((source) => ({
              domain: source.domain,
              title: source.title,
              snippet: source.snippet,
            }))}
            openIndex={openIndex}
            onOpenIndexChange={setOpenIndex}
          >{view.summary}</InlineCitation>
          <div className="flex flex-wrap gap-1.5">
          {view.sources.map((source) => (
            <Sources.Root href={source.url} key={source.sourceId}>
              <Sources.Icon url={source.url} />
              <Sources.Title>{source.title}</Sources.Title>
            </Sources.Root>
          ))}
          </div>
        </div>
      )}
      {view.phase === "failed" && (
        <div className="text-destructive space-y-1 text-xs">
          <div>
            {view.errorCode}：{view.errorMessage}
          </div>
          {view.recovery && (
            <ul className="list-disc pl-4 text-muted-foreground">
              {view.recovery.map((item, index) => (
                <li key={`${item.action}-${index}`}>{item.reason}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function WebSearchToolFallback(props: ToolCallMessagePartProps) {
  const view = projectWebSearchFeedback({
    toolName: props.toolName,
    args: props.args,
    result: props.result,
    status:
      props.status?.type === "running"
        ? "running"
        : props.status?.type === "incomplete" &&
            props.status.reason === "cancelled"
          ? "cancelled"
          : props.status?.type === "incomplete"
            ? "error"
            : "complete",
  });
  if (!view) return <ToolFallback {...props} />;
  const status =
    view.phase === "failed"
      ? {
          type: "incomplete" as const,
          reason: "error" as const,
          error: `${view.errorCode}: ${view.errorMessage}`,
        }
      : props.status;
  return (
    <ToolFallback.Root defaultOpen>
      <ToolFallback.Trigger toolName={props.toolName} status={status} />
      <ToolFallback.Content>
        <ToolFallback.Error status={status} />
        <WebSearchResult view={view} />
      </ToolFallback.Content>
    </ToolFallback.Root>
  );
}

function WebPagePreviewToolFallback(props: ToolCallMessagePartProps) {
  const value = props.result && typeof props.result === "object" ? props.result as Record<string, unknown> : {};
  const url = typeof value.url === "string" ? value.url : "";
  const content = typeof value.mainText === "string" ? value.mainText : typeof value.markdown === "string" ? value.markdown : "";
  if (!url || !content) return <ToolFallback {...props} />;
  const openPreview = () => {
    requestPanelOpen({ panelId: "browser", data: { preview: { url, content, title: typeof value.title === "string" ? value.title : url } } });
  };
  return (
    <ToolFallback.Root defaultOpen>
      <ToolFallback.Trigger toolName={props.toolName} status={props.status} />
      <ToolFallback.Content>
        <WebPreview origin={new URL(url).hostname} loading={false} onOpenExternal={openPreview}>
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap p-3 text-xs leading-relaxed">{content}</pre>
        </WebPreview>
      </ToolFallback.Content>
    </ToolFallback.Root>
  );
}

/** What the model aimed at, in one readable line, instead of the raw argument JSON. */
function toolTarget(args: unknown, toolName: string): string {
  const record = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
  const candidate = [
    record.file_path,
    record.path,
    record.command,
    record.pattern,
    record.query,
  ].find((value): value is string => typeof value === "string" && value.length > 0);
  return candidate ?? toolName;
}

function statusErrorText(status: ToolCallMessagePartStatus | undefined): string | undefined {
  if (status?.type !== "incomplete") return undefined;
  const error = (status as { error?: unknown }).error;
  return typeof error === "string" && error.length > 0 ? error : undefined;
}

/**
 * Every state that reaches this component is actionable or failed: the official
 * `ToolCall` element only draws running/success, and the generic `ToolFallback`
 * would print the raw argument JSON. Failures therefore render the official
 * `ToolError` card, which names the tool and its target and keeps the recovery
 * hint the tool result carries.
 */
function ToolFailureResult(props: ToolCallMessagePartProps) {
  const parsed = toolResultSchema.safeParse(props.result);
  const failure = parsed.success && !parsed.data.ok ? parsed.data : undefined;
  const recovery = failure?.error.recovery
    .map((item) => `${item.action}（${item.reason}）`)
    .join("；");
  const message = failure
    ? `${failure.error.code}：${failure.error.message}${recovery ? `；建议：${recovery}` : ""}`
    : props.status?.type === "incomplete" && props.status.reason === "cancelled"
      ? "已取消"
      : statusErrorText(props.status) ??
        (props.status?.type === "requires-action"
          ? "需要你的操作后才能继续"
          : formatUnknownValue(props.result) || "工具未完成");

  return (
    <ToolError
      name={props.toolName}
      target={toolTarget(props.args, props.toolName)}
      message={message}
      attempt={1}
      maxAttempts={1}
      retrying={false}
    />
  );
}

export const StructuredToolFallback: ToolCallMessagePartComponent = (props) => {
  if (isPendingApprovalRequest(props)) return <SailorApprovalCard key={props.approval?.id ?? props.toolCallId} {...props} />;
  if (props.toolName === "apply_patch")
    return <FileChangeToolFallback {...props} />;
  if (props.toolName === "execute_shell")
    return <ShellExecutionToolFallback {...props} />;
  if (props.toolName === "web_search")
    return <WebSearchToolFallback {...props} />;
  if (props.toolName === "fetch_page")
    return <WebPagePreviewToolFallback {...props} />;

  return <ToolFailureResult {...props} />;
};
