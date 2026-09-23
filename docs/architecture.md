# Architecture

Sailor keeps model execution outside the browser-like renderer and exposes a small, typed bridge through Electron preload.

```text
Renderer (React 19 + assistant-ui)
  Settings dialog
    -> appearance runtime (renderer-only localStorage, system media query)
    -> typed settings IPC
      -> SettingsService + Electron safeStorage
      -> ProviderModelCatalog -> provider /models
  WorkspaceChats (stable Chat instances keyed by chatId)
    -> useChat subscribes to the selected instance
    -> useAISDKRuntime adapts that subscription to AssistantRuntimeProvider
    -> IpcChatTransport
      -> preload window.sailor API
        -> Electron IPC
          -> AgentService -> PiRunner (AI SDK HarnessAgent + Pi)
            -> Pi provider mapping (OpenAI Completions / Responses / Anthropic Messages)
            -> PiStorage (native session checkpoint + virtual Skills files)
            -> Pi native read / write / edit / bash / grep / glob / ls
              -> chatId-bound canonical workspace root
              -> just-bash project mount + credential/symlink policy
              -> per-call native write/edit/bash approval
          <- UIMessageChunk stream
      <- ReadableStream<UIMessageChunk>
```

## Process boundaries

### Main process

`src/main` owns privileged application behavior:

- window lifecycle and external-link policy;
- native directory selection, workspace/chat validation and atomic history persistence;
- independent runs keyed by chatId/runId, including background completion and targeted cancellation;
- agent creation, cancellation, and provider credentials;
- retrieval and normalization of OpenAI-compatible `/models` catalogs;
- encrypted provider credential persistence under Electron's user-data directory;
- conversion of current user/approval input to Harness turns; Pi owns native model history and compression;
- a typed AI SDK tool registry with Zod contracts, driven by Pi through `HarnessAgent`;
- chat-scoped workspace tools with canonical path, symlink and sensitive-file checks; writes use explicit approval, expected hashes, atomic publication, and same-path serialization;
- single-file deterministic patches return before/after hashes, line counts, bounded diff references, and structured recovery actions; persisted tool history is display-only and never replays a write;
- streaming AI SDK `UIMessageChunk` events back over IPC;

Provider keys enter the renderer only when the user types a new value. Saved keys are encrypted with Electron `safeStorage`, and renderer-facing snapshots expose only `hasApiKey`; decryption happens only in the main process immediately before the corresponding model request.

### Preload

`src/preload` is the only bridge between the renderer and Electron. It exposes typed agent, workspace and settings operations from the `SailorApi` contract. Node integration remains disabled in the renderer.

### Renderer

`src/renderer` owns interaction and presentation only:

- `WorkspaceChats` retains one AI SDK `Chat<UIMessage>` instance per opened chat; `useChat({ chat })` subscribes to the selected instance without owning its lifetime;
- `IpcChatTransport` adapts Electron events to the AI SDK transport contract;
- assistant-ui Thread/primitives render conversations, Markdown messages, provider reasoning summaries, auditable tool groups, fallback tools, files, prompts and composer state;
- official assistant-ui WebSearch and Sources elements render historical search results and persisted native `source-url` parts; links are created only from validated HTTP(S) results;
- Sailor chat adapters own workspace/model/reasoning/save-error behavior while generic copied elements remain independent of Electron IPC and shared business contracts;
- the model settings dialog retrieves, searches, and selects the provider's remote model catalog;
- the settings dialog appearance page selects system/light/dark themes and accent presets; renderer-only appearance preferences are versioned in localStorage and never cross the preload boundary;
- per-model capability metadata such as context window, output limit, reasoning levels, and vision support is edited locally because `/models` responses do not expose it consistently;
- provider metadata and new credentials are submitted without reading saved secrets;
- layout components provide the project sidebar, workspace, and inspector.

### Shared contracts

`src/shared/contracts.ts` contains serializable IPC types and channel names. Streaming uses AI SDK's native `UIMessageChunk` protocol instead of a second application-specific message format.

## Source layout

```text
src/
├── main/
│   ├── agent/       # AI SDK orchestration and typed tool registry
│   ├── ipc/         # IPC registration
│   └── settings/    # provider persistence and secure credential adapter
├── preload/         # contextBridge API
├── renderer/
│   └── src/
│       ├── components/
│       │   ├── assistant-ui/elements/ # copied generic assistant-ui source components
│       │   ├── chat/                  # Sailor runtime, thread, composer, messages/tools adapters
│       │   ├── layout/
│       │   └── ui/
│       └── lib/     # renderer adapters
└── shared/          # cross-process and structured tool contracts
```

## Current scope

The current architecture includes directory-scoped persistent chats with independent background runs, OpenAI/DeepSeek/custom provider settings, remote model catalog retrieval, per-model capability metadata, encrypted model credentials, selectable models, renderer-only system/light/dark appearance preferences with accent presets, streamed text and provider-returned reasoning summaries, Pi workspace tools, a structured auditable process view, source citations, generic tool-state fallback rendering, cancellation, and a Codex-style three-column shell. All visible application copy is Chinese while protocol and model identifiers keep their official names.

The settings dialog only exposes Models and Appearance. It composes shared Dialog, Button, Input and Select controls with official surface helpers and Collapsible, using flat rows, section rules, 8px controls and 12px dialogs. Model settings have a scrollable body and a fixed save footer. Appearance changes remain immediate and renderer-only.

Web search runs in Electron main through the local `zhulingyu666/ai-search-mcp` stdio server. Its `search` tool is exposed to Pi as Sailor's stable `web_search` name; `fetch_page` and `research` remain available as supporting tools. The server uses zero-key search engines with regional routing, caching, rate limiting and failover. MCP results are untrusted external content and the renderer only creates links after HTTP(S) validation. Legacy webSearch credentials are not persisted or exposed. Pi's approval-gated virtual bash remains available and cannot launch arbitrary host binaries.

The following are intentionally deferred:

- cloud sandbox execution and remote workspace synchronization;
- automatic project discovery (directories are explicitly selected);
- global chat search, pinning and moving chats between workspaces;
- Git diff collection;
- resumable streams after application restart.

## Workspace / 工作区契约

`src/shared/workspaces.ts` extends the existing `ProjectSummary` / `ChatSummary` relationship. A project has a stable UUID, display name and canonical `rootPath`; a chat has a UUID and immutable `projectId`. Titles derive from the first user text, normalized to one line and capped at 40 Unicode characters. Chat lists sort by latest message update.

`WorkspaceStore` writes a version 1 JSON document to `app.getPath('userData')/workspaces.json`:

- `projects`: `{ id, name, rootPath }[]`;
- `chats`: `{ id, projectId, title, updatedAt, messages: UIMessage[], runId, status, unread, error }[]`;
- `activeChatId: string | null`, `collapsedProjectIds: string[]`.

The store validates schema and references before changing data, serializes read/modify/write operations, and renames a unique temporary file after writing with mode 0600. An unreadable or corrupt file is preserved and reported, never silently reset. `runId` guards prevent stale writes. Histories retain native AI SDK parts (including reasoning/tool state), not flattened text. This initial JSON store targets local personal histories; it does not implement multi-process writers or a large-history database.

`WorkspaceService` owns the native picker adapter, message validation via `validateUIMessages` with the installed tool schemas, current in-memory run snapshots, save retry, and unread state. Empty new histories bypass the SDK's nonempty-array validator. It resolves the directory through persisted chatId→projectId, validates that it remains a directory at run start, and never accepts a renderer-supplied execution path. A missing directory blocks new runs without hiding saved history.

The preload exposes only `workspaces.snapshot`, `pickProject`, `createChat`, `getChat`, `setPreferences`, `retrySave`, and change notifications. It exposes no generic filesystem or IPC access. `workspace:changed` is an invalidation event; snapshots contain summaries, and full messages are fetched for the selected chat. New model runs still use the native `UIMessageChunk` stream over `agent:*` IPC.

`AgentService` reserves chatId/runId before asynchronous work, snapshots provider configuration at invocation, and permits independent chats to run concurrently. Within a chat only one run is active. It tees the UI stream: one branch reaches the renderer, the other is reconstructed by SDK `readUIMessageStream` and saved in main, including background or partial output. Cancellation only targets the specified run. For resumed conversation after cancellation/error, model conversion uses `ignoreIncompleteToolCalls` while preserving the original UI history. Completed or failed background runs gain unread state; selecting them clears it.

On disk failure the latest messages remain in the main-process live snapshot, with a renderer-visible `saveError`; retry flushes that snapshot. A chat with unsaved output cannot launch a new run until retry succeeds. Persisted `running` state without a live run is presented as interrupted after process restart; no model request is automatically resumed. View selection does not wait for preference writes; preference failures are reported separately. Renderer instance lifetime is independent of view mounting, not a general stream-reconnection mechanism after renderer reload.

Directory association provides three main-process read capabilities to the model: `list_files`, literal `search_files` and UTF-8 `read_file`. `WorkspaceService` resolves chatId to the persisted project; `WorkspaceToolScope` canonicalizes the root, rejects absolute paths, traversal, workspace-escaping symlinks and sensitive credential paths, and carries the run AbortSignal. Lists are depth/scan bounded and paginated, searches cap files and matches, and reads cap returned bytes and lines while reporting the full file SHA-256. These checks reduce accidental scope expansion but are not an OS sandbox. No generic filesystem API crosses preload. Writes and commands use the separately approved tools described above. Inspector panels continue to show explicit unavailable states instead of fabricated Git changes.

The Files panel adds project-scoped read-only IPC (`workspace-files:list` / `workspace-files:read`) for the renderer tree and preview. `WorkspaceFilesService` reuses `WorkspaceToolScope`, hides sensitive entries, rejects symlinks, bounds directory scans at 5000 entries and previews at 512 KiB/20,000 lines, normalizes line endings, and returns a SHA-256 snapshot. The renderer uses the offline MIT `@iconify-json/vscode-icons` set through `@iconify/react` for VS Code-style file icons and CodeMirror 6 for read-only syntax-highlighted text, line numbers, and selection offsets. File tree state and horizontal/vertical SplitPane preferences remain project-local renderer state.

Workspace file references use the validated `data-workspace-context` UI data part. Drafts are isolated by chatId; an entire file or selection stores relative path, line range, text snapshot, and hash. `WorkspaceService` validates project ownership and `PiRunner` projects the snapshot into an explicitly untrusted, data-only model text block without rereading the mutable file. History renders the original data part, so later file changes do not rewrite prior conversations.

Validation uses `tests/workspace-store.test.ts`, `tests/workspace-ipc.test.ts`, `tests/workspace-chat-lifecycle.test.ts` and the existing agent tests. Real Electron visual/interaction evidence is in `.agent-harness/evidence/workspace-sidebar-acceptance.md`.

## Tool UI and retired tools

Prefer assistant-ui's existing tool rendering and approval APIs before adding custom views. SailorThread uses the official ThinkingIndicator for pending responses and the official standalone ToolCall for each normal tool invocation, with no outer tool group or session timeline. Each call independently expands its raw request and formatted result; Pi targets map from `file_path` and legacy targets from `path`. Reasoning uses the official ghost variant without a full-width border. Long tool targets truncate on one line; expanded request/result blocks preserve whitespace and scroll. All actionable pending tool approvals use the official ApprovalCard shell, including legacy requests without approval metadata and interrupt-based requests, with readable command or edit previews and one-time allow/deny actions. Declared options and text questions render their existing controls inside the same shell, without inventing additional approval choices. Submission is locked until the runtime accepts the decision, and rejection restores controls with an error. Failures, cancellation and expired/rejected approvals retain StructuredToolFallback. Legacy responses preserve their addResult/resume protocol; native approvals retain respondToApproval and main-process validation. No persistent allow permission is introduced. Execution remains in main; renderer code only projects persisted native tool parts.

The active runtime uses Pi's native tools plus main-process MCP tools. Workspace message validation converts retired static tool parts (updatePlan, list_files, search_files, read_file, write_file, apply_patch and execute_shell) into native dynamic-tool history parts after structural validation, preserving inputs, outputs and call IDs for display without an executor. Historical WebSearch/Sources and shell feedback renderers stay available; reopening a chat cannot execute a retired tool. New MCP search calls are created only by main and the child process closes with each run.

## Pi Harness integration

`src/main/agent/pi/` owns the runtime adapter. `createPiConfiguration` maps saved provider protocol, model ID, context window, vision and reasoning capabilities into an explicit Pi provider named `sailor`. Credentials are supplied through an isolated authentication record, never global `process.env` mutation. `ResolvedModel` now includes optional `contextWindow` and `vision` from the existing settings model. Missing window/output limits use bounded defaults of 128000 / 8192; explicit values remain preferred when the provider exposes them.

`PiRunner` uses Pi's native tools with `permissionMode: allow-reads` and connects the local search MCP tools in main. Native write/edit/bash approvals are registered in main by approval ID, chat ID, run ID, call ID and tool name, expire after five minutes, and are consumed once before continuation. The runtime's saved call is authoritative; renderer responses cannot replace tool parameters. Reboot, cancellation and abandoning a pending turn invalidate approvals. IPC accepts only native write/edit/bash approval names. UI history validates against Pi's exported builtin schemas; retired static tool parts become dynamic history parts with no executor.

`PiStorage` uses an in-memory just-bash base for private session state and a MountableFs/ReadWriteFs project mount at `/home/sailor/workspace`. The host root is resolved exclusively from the chat in main. A filesystem policy wrapper retains credential path filtering and rejects symlinks; tool implementations are upstream Pi/just-bash. Project files are never checkpointed or restored from session snapshots. No cloud service is involved. Native bash uses just-bash commands and cannot execute arbitrary host binaries. Native write/edit use upstream overwrite/exact replacement semantics, replacing the old expectedHash/atomic patch contract.

Each completed or paused run stops the native runtime and atomically writes a version-1 checkpoint with opaque Harness resume metadata plus base64 native journal files under `pi-sessions/<sha256(chatId)>.json` (0600). Only the private virtual `.ai-sdk` files are checkpointed; Skills reload from the workspace. The checkpoint has a 32 MiB serialized limit. A missing journal or invalid checkpoint fails closed, preserving the original file. Failed checkpoint writes stay in memory and are retried before another model call. UI history remains in the existing version-1 workspace store. An interrupted approval abandoned by a new user prompt starts a new native session with a bounded textual history import; no historical tools execute.

Pi owns automatic compaction, native conversation construction and Skill discovery/selection. `loadPiSkills` supplies bounded validated workspace Skill bundles; it parses YAML structurally and skips symlinks and sensitive attachments. Global filesystem extensions, themes and prompt templates remain disabled by the adapter. Skill scripts are not automatically executed; no native host-command backend is available.

The pinned `harness-pi@1.0.119` emits post-turn compaction without a subsequent step boundary. `createSailorPi` adds that missing `finish-step` so Harness can expose the native compression event as a dynamic `compaction` tool part without rejecting the stream. It does not implement summarization or context selection. This compatibility shim is covered by a real-runtime automatic-compaction test and should be rechecked when upgrading the experimental Harness packages.

Verification: `tests/pi-provider.test.ts`, `tests/pi-storage.test.ts`, and `tests/pi-agent.test.ts` exercise protocol mapping, isolated storage, native multi-turn recovery, real OpenAI Completions/Responses HTTP fixtures, Skills, automatic compaction, approval acceptance/rejection, restart invalidation, local execution and cancellation. Anthropic protocol mapping is covered at configuration level; external provider compatibility and interruption at arbitrary OS process-kill boundaries are not claimed by fixture tests.

## Composer model and context rail

The compact model menu composes official `ComposerModelTrigger`, `ComposerMenu` and `ComposerModelItem`; selection continues through Settings IPC and the active-model snapshot, rather than a second modelContext owner. Reasoning remains a per-chat choice. The official `ComposerContext` ring displays a recent-call snapshot, not cumulative billing usage. A trusted inline Pi `message_end` observer reads per-call usage (including cache reads/writes), because harness-pi 1.0.119 emits zero step usage and cumulative session usage. The usage cell is shared with a parked Pi session across approval continuations. At both `finish-step` and `finish` (continuations can omit the former), Sailor publishes optional `UIMessage.metadata.contextUsage` with `{ inputTokens, outputTokens, contextWindow, modelId }` through the existing native metadata stream and workspace persistence. Zero synthetic compaction steps do not overwrite real usage. The tooltip labels inputs/outputs instead of inventing system/tool splits; post-compaction occupancy is refreshed by the next call. The renderer selects the most recent valid assistant usage in the current chat, so a newer unmetered message does not hide earlier statistics. Chats with no valid metadata display unknown; usage is not inferred from text or cumulative billing totals. No new IPC channel or credential exposure is introduced.


## Conversation map

`SailorThread` supplies the official `ConversationMapAui` through the optional `ThreadComponents.ViewportNavigation` slot, rendered inside `ThreadPrimitive.Viewport` so the map shares its viewport store. The right rail groups each user message and subsequent assistant responses into a turn, derives short titles/previews from the existing assistant-ui message content, tracks visible/current turns, and scrolls the viewport to the existing `data-message-id` anchor. The content reserves a right gutter; empty conversations hide the rail. PreviewCard uses the registry-required `@base-ui/react` dependency. No model call, message persistence changes, or independent AI SDK Chat instance is introduced.


## Thread list management

Each project renders copied official ThreadList source components using a metadata-only `useExternalStoreRuntime` + `ExternalStoreThreadListAdapter`. Its messages remain empty and sending is disabled; `WorkspaceChats` continues to own all real AI SDK Chat instances and background streams. Selection delegates to AppShell. Regular and archived records are projected separately; archive recovery is available in a collapsible list.

`workspace:manage-chat` accepts a validated chat ID plus rename/title (1-120 trimmed characters), archive, unarchive, or delete. Version-1 workspace records accept additive `archived` (default false) and optional `titleOverride`; old files load without migration. Automatic title updates respect the override. Management and run startup share an exclusion set; running and unsaved chats reject management. Archived chats remain readable and reject new runs until restored. Metadata changes serialize through the existing atomic store. Active archived/deleted records clear the persisted selection.

Deletion first commits removal from the workspace store, then removes Pi's hashed checkpoint and in-memory approval/config/save caches. A checkpoint cleanup I/O failure is surfaced; the removed chat cannot be resumed through IPC even if an orphan checkpoint remains. Renderer deletion is confirmed in a dialog, invalidates cached Chat/reasoning state, and removes the active view. Workspace files are never deleted. Rename/management errors remain visible, and destructive controls are disabled on busy/unsaved rows.

## Image input compatibility

The pinned harness-pi 1.0.119 accepts text-only Harness prompts. Sailor validates local PNG/JPEG/WebP/GIF data-URL attachments in main (at most 14 MiB base64 per image) and passes the current turn's image bytes through Pi's native `input` extension. The original UI file parts remain in history; Pi journals the native image content for subsequent turns and restarts. The image transfer is consumed once, so approval continuations do not resend attachments. Models without configured vision receive an explicit user-facing error. Each new turn resolves the selected model; an approval continuation retains its original model snapshot. Provider/model switching and actual image delivery are verified with local HTTP fixtures, not external provider claims.

## Document attachments and the read_document tool

Non-image attachments cannot ride Pi's `input` extension, which carries text and images only. Sailor therefore stages each supported document into the session's in-memory just-bash filesystem at `/home/sailor/attachments/<chatId>/<name>` — visible to the agent's native `read`/`ls`/`grep`/`bash`, but never written into the user's project directory — and replaces the file part with a text notice listing those absolute paths. That notice is why a document attachment no longer trips harness-pi's text-only prompt check.

`read_document` is a main-process host tool passed through `HarnessAgent`'s `tools` alongside the MCP search tools. It is read-only and needs no approval. Format detection reads the extension first and magic bytes second, so a renamed or extensionless file still routes correctly (`%PDF-` for PDF; OOXML files are ZIP containers distinguished by their directory entries). Parsers: `read-excel-file` for `.xlsx`/`.xlsm` (one section per sheet, dates restored instead of left as serial numbers), `mammoth` for `.docx`, `unpdf` for `.pdf`, and built-in UTF-8 decoding for `.csv`/`.tsv` and text/code types, which rejects NUL bytes as binary.

Every extraction is bounded (`DOCUMENT_BUDGETS`: 16 MiB source, 20 sheets, 500 rows, 60 columns, 16 KiB characters by default) and every truncation is reported explicitly instead of silently shortening the content. Results reuse the shared `toolFeedback` contract (`createToolSuccess`/`createToolFailure`), so the model and the UI see the same envelope as any other tool, and parser exceptions are replaced with a readable message carrying no host path or stack. Supported document extensions and the composer `accept` string share one definition in `src/shared/attachments.ts`, so the picker cannot offer a type the main process would refuse.

## Chat entry particle transition

The renderer-only ChatEntryContext tracks welcome → transition → chat per selected chatId, observing assistant-ui message/loading state. Only a locally observed empty chat receiving its first user message animates; history restoration renders the settled grid directly. A keyed SailorThreadView cancels the previous view's animations while WorkspaceChats retains ownership of the Chat and stream. No IPC or persistence contract changes.

ChatParticleBackdrop lives outside the welcome subtree and keeps one R3F Canvas/Points through submission. The welcome boat placeholder supplies container-relative geometry. particleGrid generates deterministic 20 CSS px grid destinations, maps boat particles to unique points, fades in missing points and fades out excess boat points on small surfaces. It uses neutral theme ink, a final 1.6 CSS px diameter and alpha .44; the layer ignores pointer hit testing and remains fixed while messages scroll. R3F runs during welcome/transition, uses demand rendering after settling, and pauses when hidden, with DPR capped at 1.5 and SVG fallback for reduced motion/context failure.

ComposerTransition captures the old footer rectangle before the React commit and interpolates to its measured destination over 570ms after an 80ms delay. It remeasures while animating to accommodate runtime scrolling, attachment/error rows and resize, then removes inline transforms/width. The existing Composer instance, official scroll viewport, focus behavior and native submission pipeline remain in place. The copied Thread element consumes an optional ChatEntryContext; outside Sailor it retains its original behavior.

Validation: tests/particle-grid-transition.test.ts and tests/chat-entry-transition.test.ts cover geometry and state decisions. Runtime evidence, screenshots and limitations are recorded in .agent-harness/evidence/chat-particle-grid-transition.md.
