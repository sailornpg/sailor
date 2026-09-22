"use client";

import type { ComponentProps, ReactNode } from "react";
import { CheckIcon, Loader2Icon, TerminalIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { field, inkButton, paper } from "./surfaces";

export type ApprovalState = "request" | "running" | "done" | "denied";

export function ApprovalCard({
  state,
  command,
  title,
  subtitle,
  onAllowOnce,
  onAlwaysAllow,
  onDeny,
  disabled = false,
  actions,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  | "children"
  | "state"
  | "command"
  | "title"
  | "subtitle"
  | "onAllowOnce"
  | "onAlwaysAllow"
  | "onDeny"
> & {
  disabled?: boolean;
  actions?: ReactNode;
  state: ApprovalState;
  command: string;
  title: string;
  subtitle: string;
  onAllowOnce?: () => void;
  onAlwaysAllow?: () => void;
  onDeny?: () => void;
}) {
  return (
    <div
      data-slot="approval-card"
      className={cn(
        paper,
        "flex w-full max-w-sm flex-col gap-3.5 rounded-[20px] p-4 [&_button:disabled]:pointer-events-none [&_button:disabled]:opacity-40 [&_button]:focus-visible:ring-2 [&_button]:focus-visible:ring-ring",
        className,
      )}

      {...props}
    >
      <div className="flex items-center gap-3">
        <span className="bg-foreground/[0.05] text-foreground/45 flex size-9 shrink-0 items-center justify-center rounded-xl">
          <TerminalIcon className="size-4" />
        </span>
        <div className="flex flex-col">
          <p className="text-[13.5px] font-medium">{title}</p>
          <p className="text-foreground/45 text-xs">{subtitle}</p>
        </div>
      </div>

      <div
        className={cn(
          field,
          "text-foreground/70 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-xl px-3.5 py-2.5 font-mono text-xs",
        )}
      >
        {command}
      </div>

      {actions ?? <div className="flex h-8 items-center justify-end gap-2">
        {state === "request" ? (
          <>
            {onDeny && (
              <button
                type="button"
                disabled={disabled}
                onClick={onDeny}
                className="text-foreground/55 hover:bg-foreground/[0.06] hover:text-foreground/90 h-8 rounded-full px-3.5 text-xs font-medium transition-[background-color,color,scale] duration-150 active:scale-[0.96]"
              >
                拒绝
              </button>
            )}
            {onAlwaysAllow && (
              <button
                type="button"
                disabled={disabled}
                onClick={onAlwaysAllow}
                className="text-foreground/55 hover:bg-foreground/[0.06] hover:text-foreground/90 h-8 rounded-full px-3.5 text-xs font-medium transition-[background-color,color,scale] duration-150 active:scale-[0.96]"
              >
                始终允许
              </button>
            )}
            {onAllowOnce && (
              <button
                type="button"
                disabled={disabled}
                onClick={onAllowOnce}
                className={cn(
                  inkButton,
                  "flex h-8 items-center rounded-full px-3.5 text-xs font-medium",
                )}
              >
                允许一次
              </button>
            )}
          </>
        ) : (
          <div
            key={state}
            className="fade-in animate-in text-foreground/55 flex items-center gap-2 text-xs duration-300"
          >
            {state === "running" ? (
              <>
                <Loader2Icon className="text-foreground/45 size-3.5 animate-spin" />
                已批准，执行中
              </>
            ) : state === "denied" ? (
              <>
                <XIcon className="text-foreground/45 size-3.5" />
                已拒绝
              </>
            ) : (
              <>
                <CheckIcon className="size-3.5 text-emerald-500" />
                已完成
              </>
            )}
          </div>
        )}
      </div>}
    </div>
  );
}
