# Side Chat (`/btw`)

## Goal and scope

Side chat answers a related question beside a main chat without adding its question or answer to the main chat's model history. A side chat is a separate, persistent chat bound to one parent chat and project. It reuses Sailor's AI SDK Chat, assistant-ui Thread, streaming transport, and Pi runner, with a read-only tool policy.

The side chat freezes the parent at the latest completed turn. When the parent has a saved Pi checkpoint, creation clones that checkpoint into an isolated side-chat checkpoint, preserving the native conversation context including images and compaction state without sharing future writes. If no checkpoint exists, it falls back to a bounded text snapshot. Project files remain shared and may change while the side chat is open; current file reads are current state, not part of the frozen conversation.

## User flow

- In a completed, saved main chat, submitting `/btw` opens a new side chat with an empty composer. Submitting `/btw <question>` opens it and sends the question there. Neither form adds a user message to the main chat.
- Selecting text inside one main-chat message shows a quote toolbar. "Add to chat" adds a removable quote to the main composer; "Ask in side chat" creates a side chat and places the selected text in its composer as a removable quote. The user can then type a question. The quote is visible with the side-chat message and projected into that side chat's model prompt; selecting or asking never changes the parent history. Quotes are limited to 8 KiB of UTF-8 text.
- Each invocation creates a new side chat at the latest completed parent turn. Closing the panel hides its view; it does not stop or delete the chat. Reopening the side-chat panel for a parent selects that parent's most recently updated side chat. A new `/btw` starts a fresh branch.
- The right dock retains its chat scope. A side chat is rendered only in the right panel and omitted from the regular ThreadList. The parent and side chat use different `Chat` instances and different `AssistantRuntimeProvider` trees; the same chat instance is never mounted in both surfaces.
- The side view reuses SailorThread and its normal message/tool rendering. Narrow-panel adaptation hides the welcome particle transition and Conversation Map, and keeps an accessible composer, stop, error and save-retry controls. The main chat remains mounted and can run independently.

## Snapshot and persistence

- Creation is a main-process operation. It accepts only a parent chat ID; main resolves the project and source messages. The parent must be a regular, unarchived chat whose latest run is completed and saved, with at least one completed assistant response. Running, failed, stopped, unsaved, missing and side-chat parents are rejected with a user-facing reason.
- The branch point is the last completed assistant message ID. The fallback snapshot contains ordered user and assistant **text parts** through that message, bounded to 64 KiB of UTF-8 JSON. The cloned native checkpoint preserves images and other Pi context; when it exists, the text fallback may be omitted if it exceeds the limit. Without a native checkpoint, a parent containing images cannot create a side chat because that would silently lose visible context.
- A version-1 workspace chat gains additive side-chat metadata: `parentChatId`, `forkMessageId`, and an optional `contextSnapshot`. These are main-owned, immutable after creation and validated on read. Side chats have their own ID, messages, run status and Pi checkpoint. Creation copies the saved parent checkpoint into a separate side path and removes the new side record if that copy fails; it does not change the parent's messages or `activeChatId`.
- On its first prompt, main resumes the cloned side checkpoint when available; otherwise it injects the frozen text snapshot as data. Later turns resume only the side chat's own Pi state. UI history displays only side-chat turns. Restart restores the saved metadata, messages and side checkpoint without replaying a tool call or starting a model run.
- If Pi checkpoint saving fails, the existing save-error rule blocks another turn until retry succeeds. Forking reads the parent's saved checkpoint but never mutates it.

## Tool and lifecycle policy

- Side chats expose read-only Pi builtins (`read`, `grep`, `glob`, `ls`) and read-only host tools where available. `write`, `edit`, `bash` and any host tool that mutates the workspace are absent from the model tool set. Main rejects a forged write approval for a side-chat ID even if renderer sends one.
- A side chat uses the same canonical project root and read restrictions as its parent. Shared workspace state is not frozen. No side-chat action can write to the project through the agent tool path.
- Stopping a side run only aborts that run. Switching or closing the panel leaves a running side chat alive and allows background completion. Deleting one side chat removes its UI record and Pi checkpoint without changing its parent.
- Archiving a parent archives its side chats; restoring the parent restores them. Deleting a parent removes its side-chat records and checkpoints after the workspace transaction. A failed checkpoint cleanup is surfaced and the orphan cannot be resumed through IPC. Busy or unsaved descendants block parent archive/delete until they are stopped and saved.

## Verification

Store/IPC tests cover atomic creation, parent validation, snapshot limits and relationship validation. Pi tests cover one-time import, independent multi-turn resume and read-only filtering. Lifecycle tests cover restart, archive and deletion. The real Electron view is checked in light/dark themes, narrow window, empty/streaming/error/stopped states, focus and overflow, with evidence under `.agent-harness/evidence/side-chat-visual.md`.
