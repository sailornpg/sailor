import { useState } from "react";
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  ThreadListPrimitive,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import {
  ThreadListItems,
  ThreadListItem,
  ThreadListRoot,
} from "@/components/assistant-ui/elements/thread-list.aui";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { ChatManagement, WorkspaceChatSummary } from "@shared/workspaces";

interface Props {
  chats: WorkspaceChatSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onManage: (id: string, input: ChatManagement) => Promise<void>;
}
const messages: ThreadMessageLike[] = [];

// Metadata-only list runtime. WorkspaceChats remains the sole owner of Chat instances and streams.
export function WorkspaceThreadList({
  chats,
  activeId,
  onSelect,
  onManage,
}: Props) {
  const [showArchived, setShowArchived] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const manage = async (id: string, input: ChatManagement) => {
    setError(undefined);
    try {
      await onManage(id, input);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "会话更新失败，请重试。",
      );
      throw error;
    }
  };
  const runtime = useExternalStoreRuntime({
    messages,
    convertMessage: (message) => message,
    isDisabled: true,
    onNew: async () => {
      throw new Error("请从工作区新建会话。");
    },
    adapters: {
      threadList: {
        threadId: activeId ?? undefined,
        threads: chats
          .filter((chat) => !chat.archived)
          .map((chat) => ({
            id: chat.id,
            title: chat.title,
            status: "regular" as const,
            custom: {
              runStatus: chat.status,
              unread: chat.unread,
              saveError: chat.saveError,
            },
          })),
        archivedThreads: chats
          .filter((chat) => chat.archived)
          .map((chat) => ({
            id: chat.id,
            title: chat.title,
            status: "archived" as const,
          })),
        onSwitchToThread: onSelect,
        onRename: (id, title) => manage(id, { action: "rename", title }),
        onArchive: async (id) => {
          await manage(id, { action: "archive" }).catch(() => {});
        },
        onUnarchive: async (id) => {
          await manage(id, { action: "unarchive" }).catch(() => {});
        },
        onDelete: (id) => {
          setDeleting(id);
        },
      },
    },
  });
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadListRoot>
        <ThreadListItems />
        {chats.some((chat) => chat.archived) && (
          <>
            <button
              type="button"
              className="px-2.5 py-2 text-left text-xs text-muted-foreground"
              aria-expanded={showArchived}
              onClick={() => setShowArchived((value) => !value)}
            >
              已归档（{chats.filter((chat) => chat.archived).length}）
            </button>
            {showArchived && (
              <ThreadListPrimitive.Items archived>
                {() => <ThreadListItem />}
              </ThreadListPrimitive.Items>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="px-2 text-xs text-destructive">
            {error}
          </p>
        )}
      </ThreadListRoot>
      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setDeleting(null);
        }}
      >
        <DialogContent>
          <DialogTitle>删除会话？</DialogTitle>
          <DialogDescription>
            将删除“{chats.find((chat) => chat.id === deleting)?.title}
            ”的聊天记录，无法撤销。工作区文件不会被删除。
          </DialogDescription>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setDeleting(null)}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                if (!deleting || busy) return;
                setBusy(true);
                try {
                  await manage(deleting, { action: "delete" });
                  setDeleting(null);
                } catch {
                  /* Error is shown in the dialog. */
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "正在删除…" : "删除会话"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AssistantRuntimeProvider>
  );
}
