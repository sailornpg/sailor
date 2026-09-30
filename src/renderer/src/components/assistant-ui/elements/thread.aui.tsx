'use client'

import {
  ComposerAddAttachment,
  ComposerAttachments,
  UserMessageAttachments,
} from '@/components/assistant-ui/elements/attachment.aui'
import { File } from '@/components/assistant-ui/elements/file'
import { ThreadFollowupSuggestions } from '@/components/assistant-ui/elements/follow-up-suggestions.aui'
import { Image } from '@/components/assistant-ui/elements/image'
import { GenerationLoader } from '@/components/assistant-ui/elements/loading-state'
import { MarkdownText } from '@/components/assistant-ui/elements/markdown-text'
import { collectWebCitations } from '@/lib/webCitationSources'
import { Sources } from '@/components/assistant-ui/elements/sources.aui'
import {
  Reasoning,
  ReasoningContent,
  ReasoningRoot,
  ReasoningText,
  ReasoningTrigger,
} from '@/components/assistant-ui/elements/reasoning.aui'
import { ToolFallback } from '@/components/assistant-ui/elements/tool-fallback.aui'
import {
  ToolGroupContent,
  ToolGroupRoot,
  ToolGroupTrigger,
} from '@/components/assistant-ui/elements/tool-group.aui'
import { TooltipIconButton } from '@/components/assistant-ui/elements/tooltip-icon-button'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/assistant-ui/elements/skeleton'
import { cn } from '@/lib/utils'
import {
  initialScrollFollow,
  nextScrollFollow,
  type ScrollFollowEvent,
} from '@/components/assistant-ui/utils/scrollFollow'
import { getTurnIdFromMessageMetadata } from '@/components/chat/review/turnFileReviewMetadata'
import {
  ActionBarMorePrimitive,
  ActionBarPrimitive,
  AuiIf,
  type AssistantState,
  BranchPickerPrimitive,
  ComposerPrimitive,
  type DataMessagePartProps,
  ErrorPrimitive,
  groupPartByType,
  MessagePrimitive,
  SuggestionPrimitive,
  ThreadPrimitive,
  type FileMessagePartComponent,
  type ImageMessagePartComponent,
  type TextMessagePartComponent,
  type ToolCallMessagePartComponent,
  useAuiState,
} from '@assistant-ui/react'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  AudioLinesIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  MicIcon,
  MessageSquareQuote,
  MoreHorizontalIcon,
  PencilIcon,
  PhoneIcon,
  RefreshCwIcon,
  SquareIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from 'lucide-react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type FC,
  type PropsWithChildren,
  type ReactNode,
  type CSSProperties,
  type RefObject,
} from 'react'

export type ThreadGroupPart = MessagePrimitive.GroupedParts.GroupPart

/**
 * Optional component overrides for the thread. `AssistantMessage` and
 * `Welcome` replace whole sections; the remaining slots override how the
 * assistant message renders tool calls and part groups. Tool UIs registered
 * by name (toolkit `render`, `useAssistantDataUI`) take precedence over
 * `ToolFallback`. When `TaskGroup` is set, tool calls that carry a nested
 * conversation and have no registered UI render through it instead of the
 * tool group; without it they render like any other tool call.
 */
export type ThreadComponents = {
  AssistantMessage?: ComponentType | undefined
  FileChangeCard?: ComponentType<{ turnId: string }> | undefined
  Composer?: ComponentType<{ autoFocus?: boolean }> | undefined
  Welcome?: ComponentType | undefined
  ViewportNavigation?: ComponentType | undefined
  ToolFallback?: ToolCallMessagePartComponent | undefined
  ToolGroup?: ComponentType<PropsWithChildren<{ group: ThreadGroupPart }>> | undefined
  ReasoningGroup?: ComponentType<PropsWithChildren<{ group: ThreadGroupPart }>> | undefined
  TaskGroup?: ComponentType<{ group: ThreadGroupPart }> | undefined
  WorkspaceContext?: ComponentType<DataMessagePartProps> | undefined
  RuntimeEventStatus?: ComponentType | undefined
}

const messageGroupBy = groupPartByType({
  reasoning: ['group-chainOfThought', 'group-reasoning'],
  'tool-call': ['group-chainOfThought', 'group-tool'],
  'standalone-tool-call': [],
})

type ThreadGroupKey = 'group-chainOfThought' | 'group-reasoning' | 'group-tool' | 'group-task'

const TASK_GROUP_PATH: readonly ThreadGroupKey[] = ['group-chainOfThought', 'group-task']

const taskAwareGroupBy = (
  part: Parameters<typeof messageGroupBy>[0],
  context?: Parameters<typeof messageGroupBy>[1],
): readonly ThreadGroupKey[] => {
  const path = messageGroupBy(part, context)
  return part.type === 'tool-call' &&
    part.messages !== undefined &&
    path.length > 0 &&
    !context?.toolUIs?.[part.toolName]?.length
    ? TASK_GROUP_PATH
    : path
}

export type ThreadProps = {
  components?: ThreadComponents | undefined
  autoFocus?: boolean | undefined
  entry?: ThreadEntryLayout | null | undefined
}

export type ThreadEntryLayout = {
  phase: 'welcome' | 'transition' | 'chat'
  welcomeRef: RefObject<HTMLDivElement | null>
  footerRef: RefObject<HTMLDivElement | null>
  welcomeStyle?: CSSProperties
}

const EMPTY_COMPONENTS: ThreadComponents = {}

const ThreadComponentsContext = createContext<ThreadComponents>(EMPTY_COMPONENTS)

// Startup exposes a loading placeholder thread; treat it as a new chat so
// the composer mounts centered. Loads after startup keep the docked layout.
const isNewChatView = (s: AssistantState) =>
  s.thread.messages.length === 0 && (!s.thread.isLoading || s.threads.isLoading)

// A switched thread that is still fetching its history: skeleton, not welcome.
const isHistoryLoadingView = (s: AssistantState) =>
  s.thread.messages.length === 0 &&
  s.thread.isLoading &&
  !s.thread.isDisabled &&
  !s.threads.isLoading

const ThreadHistorySkeleton: FC = () => (
  <div
    data-slot="aui_thread-history-skeleton"
    role="status"
    className="animate-in fade-in fill-mode-both flex flex-col gap-y-6 [animation-delay:150ms] [animation-duration:200ms]"
  >
    <span className="sr-only">正在加载会话</span>
    <Skeleton className="ml-auto h-9 w-2/5 rounded-xl motion-reduce:animate-none" />
    <div className="flex flex-col gap-y-2">
      <Skeleton className="h-4 w-11/12 motion-reduce:animate-none" />
      <Skeleton className="h-4 w-4/5 motion-reduce:animate-none" />
      <Skeleton className="h-4 w-3/5 motion-reduce:animate-none" />
    </div>
    <Skeleton className="ml-auto h-9 w-1/3 rounded-xl motion-reduce:animate-none" />
    <div className="flex flex-col gap-y-2">
      <Skeleton className="h-4 w-10/12 motion-reduce:animate-none" />
      <Skeleton className="h-4 w-2/3 motion-reduce:animate-none" />
    </div>
  </div>
)

export const Thread: FC<ThreadProps> = ({
  components = EMPTY_COMPONENTS,
  autoFocus = true,
  entry = null,
}) => {
  const isEmpty = useAuiState(isNewChatView)

  return (
    <ThreadComponentsContext.Provider value={components}>
      <ThreadRoot isEmpty={isEmpty} autoFocus={autoFocus} entry={entry} />
    </ThreadComponentsContext.Provider>
  )
}

const ThreadRoot: FC<{ isEmpty: boolean; autoFocus: boolean; entry: ThreadEntryLayout | null }> = ({
  isEmpty: runtimeEmpty,
  autoFocus,
  entry,
}) => {
  const isEmpty = entry ? entry.phase === 'welcome' : runtimeEmpty
  const [autoScroll, setAutoScroll] = useState(true)
  const follow = useRef(initialScrollFollow)
  // Set while the viewport scrolls because we asked it to, so the resulting
  // scroll event is never mistaken for the reader leaving the tail.
  const programmaticScroll = useRef(false)
  const {
    Welcome = ThreadWelcome,
    Composer: ComposerComponent = Composer,
    ViewportNavigation,
    RuntimeEventStatus,
  } = useContext(ThreadComponentsContext)
  const applyFollowEvent = useCallback((event: ScrollFollowEvent) => {
    const next = nextScrollFollow(follow.current, event)
    if (next === follow.current) return
    follow.current = next
    setAutoScroll(next.following)
  }, [])
  const handleViewportWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      programmaticScroll.current = false
      applyFollowEvent({ kind: 'wheel', deltaY: event.deltaY })
    },
    [applyFollowEvent],
  )
  const handleViewportPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const pressed =
        event.target instanceof Element &&
        Boolean(event.target.closest('.aui-thread-scroll-to-bottom'))
      if (pressed) programmaticScroll.current = true
      applyFollowEvent({ kind: 'pin-control', pressed })
    },
    [applyFollowEvent],
  )
  const handleViewportPointerUp = useCallback(() => {
    applyFollowEvent({ kind: 'pin-control', pressed: false })
  }, [applyFollowEvent])
  const handleViewportClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.target instanceof Element && event.target.closest('.aui-thread-scroll-to-bottom')) {
        programmaticScroll.current = true
        applyFollowEvent({ kind: 'pin-control', pressed: true })
      }
    },
    [applyFollowEvent],
  )
  const handleViewportScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const viewport = event.currentTarget
      const programmatic = programmaticScroll.current
      programmaticScroll.current = false
      applyFollowEvent({
        kind: 'scroll',
        metrics: {
          scrollTop: viewport.scrollTop,
          scrollHeight: viewport.scrollHeight,
          clientHeight: viewport.clientHeight,
        },
        programmatic,
      })
    },
    [applyFollowEvent],
  )

  return (
    <ThreadPrimitive.Root
      className="aui-root aui-thread-root bg-background @container flex h-full flex-col"
      style={{
        ['--thread-max-width' as string]: '54rem',
        ['--composer-bg' as string]: 'color-mix(in oklab, var(--color-muted) 30%, transparent)',
        ['--composer-radius' as string]: '1rem',
        ['--composer-padding' as string]: '8px',
      }}
    >
      {/* Sailor deviation from the upstream element, which pins the user turn to
          the top and stops following the tail. Bottom anchoring makes streaming
          follow the tail, pausing when the reader scrolls up and resuming from
          ThreadScrollToBottom. The follow/pause decision itself lives in
          `utils/scrollFollow.ts` so that anchoring and layout corrections above
          the tail can never be mistaken for reader input, and this viewport opts
          out of browser scroll anchoring (`overflow-anchor: none`) so the two
          never fight over `scrollTop`. Keep this on `assistant-ui add thread`. */}
      <ThreadPrimitive.Viewport
        turnAnchor="bottom"
        autoScroll={autoScroll}
        // Do not plant a forced bottom-scroll intent on every run start. If the
        // reader scrolls up while a run begins, assistant-ui otherwise replays
        // that intent on the next content resize and pulls the viewport down.
        scrollToBottomOnRunStart={false}
        data-slot="aui_thread-viewport"
        className="relative flex flex-1 flex-col overflow-x-hidden overflow-y-scroll [overflow-anchor:none]"
        onWheel={handleViewportWheel}
        onPointerDown={handleViewportPointerDown}
        onPointerUp={handleViewportPointerUp}
        onPointerCancel={handleViewportPointerUp}
        onClick={handleViewportClick}
        onScroll={handleViewportScroll}
      >
        {ViewportNavigation && <ViewportNavigation />}
        <div
          className={cn(
            'mx-auto flex w-full max-w-(--thread-max-width) flex-1 flex-col px-4 pt-4',
            ViewportNavigation && !isEmpty && 'pr-14',
            isEmpty && 'justify-center',
          )}
        >
          {entry ? (
            entry.phase !== 'chat' && (
              <div
                ref={entry.welcomeRef}
                style={entry.welcomeStyle}
                className={entry.phase === 'transition' ? 'chat-welcome-exit' : undefined}
              >
                <Welcome />
              </div>
            )
          ) : (
            <AuiIf condition={isNewChatView}>
              <Welcome />
            </AuiIf>
          )}
          <AuiIf condition={isHistoryLoadingView}>
            <ThreadHistorySkeleton />
          </AuiIf>

          <div
            data-slot="aui_message-group"
            className="relative mb-8 flex flex-col gap-y-6 empty:hidden"
          >
            <ThreadPrimitive.Messages>{() => <ThreadMessage />}</ThreadPrimitive.Messages>
            {RuntimeEventStatus && (
              // A transient runtime status lives in the group's bottom margin
              // instead of the flow: mounting and clearing it must not resize the
              // scroll box, or the tail jumps under the reader mid-stream.
              <div data-slot="aui_runtime-event-slot" className="absolute inset-x-0 top-full">
                <RuntimeEventStatus />
              </div>
            )}
          </div>

          <ThreadPrimitive.ViewportFooter
            ref={entry?.footerRef}
            className={cn(
              'aui-thread-viewport-footer flex flex-col gap-4 overflow-visible pb-4 md:pb-6',
              !isEmpty && 'sticky bottom-0 mt-auto rounded-t-(--composer-radius)',
            )}
          >
            <ThreadScrollToBottom />
            <ThreadFollowupSuggestions />
            <ComposerComponent autoFocus={autoFocus} />
            <AuiIf condition={(s) => isNewChatView(s) && s.composer.isEmpty}>
              <ThreadSuggestions />
            </AuiIf>
          </ThreadPrimitive.ViewportFooter>
        </div>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  )
}

const ThreadMessage: FC = () => {
  const { AssistantMessage: AssistantMessageComponent = AssistantMessage } =
    useContext(ThreadComponentsContext)
  const role = useAuiState((s) => s.message.role)
  const isEditing = useAuiState((s) => s.message.composer.isEditing)
  const isSpoken = useAuiState((s) => s.message.metadata.modality === 'voice')

  if (isEditing) return <EditComposer />
  if (isSpoken) return <SpokenMessage />
  if (role === 'user') return <UserMessage />
  return <AssistantMessageComponent />
}

type VoiceRunPosition = 'single' | 'start' | 'middle' | 'end'

const useVoiceRunPosition = (): VoiceRunPosition =>
  useAuiState((s) => {
    const before = s.thread.messages[s.message.index - 1]?.metadata.modality === 'voice'
    const after = s.thread.messages[s.message.index + 1]?.metadata.modality === 'voice'
    if (before) return after ? 'middle' : 'end'
    return after ? 'start' : 'single'
  })

const SpokenText: TextMessagePartComponent = ({ text }) => (
  <p className="aui-spoken-message-text m-0">{text}</p>
)

const SpokenMessage: FC = () => {
  const role = useAuiState((s) => s.message.role)
  const position = useVoiceRunPosition()
  const isSpeaking = useAuiState(
    (s) => s.message.role === 'assistant' && s.message.status?.type === 'running',
  )
  const opensExchange = position === 'start' || position === 'single'

  return (
    <MessagePrimitive.Root
      data-slot="aui_spoken-message-root"
      data-role={role}
      data-voice-run={position}
      className={cn(
        'aui-spoken-message bg-muted/40 mx-2 px-3 py-1.5 [contain-intrinsic-size:auto_48px] [content-visibility:auto]',
        position === 'single' && 'rounded-xl py-2',
        position === 'start' && 'rounded-t-xl pt-2',
        position === 'middle' && '-mt-6',
        position === 'end' && '-mt-6 rounded-b-xl pb-2',
      )}
    >
      {opensExchange && (
        <div
          data-slot="aui_spoken-exchange-header"
          className="text-muted-foreground mb-1.5 flex items-center gap-1.5 text-xs"
        >
          <PhoneIcon className="size-3" aria-hidden />
          <span>语音会话</span>
        </div>
      )}
      <div
        data-slot="aui_spoken-message-content"
        className="text-foreground flex items-start gap-2 text-sm leading-relaxed"
      >
        <span className="text-muted-foreground mt-1 shrink-0" aria-hidden>
          {role === 'user' ? (
            <MicIcon className="size-3.5" />
          ) : (
            <AudioLinesIcon className="size-3.5" />
          )}
        </span>
        <span className="sr-only">{role === 'user' ? '你说' : '助手说'}</span>
        <div className="min-w-0 flex-1 wrap-break-word">
          <MessagePrimitive.Parts components={{ Text: SpokenText }} />
          {isSpeaking && (
            <span
              data-slot="aui_spoken-message-indicator"
              role="status"
              className="text-muted-foreground ms-1 animate-pulse font-sans"
              aria-label="助手正在说话"
            >
              ●
            </span>
          )}
        </div>
        <SpokenActionBar />
      </div>
    </MessagePrimitive.Root>
  )
}

const SpokenActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="always"
      className="aui-spoken-action-bar text-muted-foreground flex shrink-0 gap-1"
    >
      <ActionBarPrimitive.Copy asChild>
        <TooltipIconButton tooltip="复制" className="size-6">
          <AuiIf condition={(s) => s.message.isCopied}>
            <CheckIcon className="animate-in zoom-in-50 fade-in duration-200 ease-out" />
          </AuiIf>
          <AuiIf condition={(s) => !s.message.isCopied}>
            <CopyIcon className="animate-in zoom-in-75 fade-in duration-150" />
          </AuiIf>
        </TooltipIconButton>
      </ActionBarPrimitive.Copy>
    </ActionBarPrimitive.Root>
  )
}

const ThreadScrollToBottom: FC = () => {
  return (
    // `instant` keeps an explicit user request from being retargeted while
    // streamed content grows.
    <ThreadPrimitive.ScrollToBottom behavior="instant" asChild>
      <TooltipIconButton
        tooltip="滚动到底部"
        variant="outline"
        className="aui-thread-scroll-to-bottom dark:border-border dark:bg-background dark:hover:bg-accent relative z-10 self-center rounded-full p-4 disabled:invisible"
      >
        <ArrowDownIcon />
      </TooltipIconButton>
    </ThreadPrimitive.ScrollToBottom>
  )
}

const ThreadWelcome: FC = () => {
  return (
    <div className="aui-thread-welcome-root mb-6 flex flex-col px-2">
      <p className="aui-thread-welcome-message-inner fade-in slide-in-from-bottom-1 animate-in fill-mode-both text-2xl font-medium tracking-tight duration-200">
        How can I help you today?
      </p>
    </div>
  )
}

const ThreadSuggestions: FC = () => {
  return (
    <div className="aui-thread-welcome-suggestions flex w-full flex-col">
      <ThreadPrimitive.Suggestions>{() => <ThreadSuggestionItem />}</ThreadPrimitive.Suggestions>
    </div>
  )
}

const ThreadSuggestionItem: FC = () => {
  return (
    <div className="aui-thread-welcome-suggestion-display fade-in slide-in-from-bottom-2 animate-in fill-mode-both duration-200">
      <SuggestionPrimitive.Trigger send asChild>
        <button
          type="button"
          className="aui-thread-welcome-suggestion group hover:bg-foreground/[0.03] focus-visible:ring-ring/50 flex w-full items-baseline gap-2.5 rounded-md px-2 py-2 text-start text-sm transition-colors outline-none focus-visible:ring-1 motion-reduce:transition-none"
        >
          <span
            aria-hidden
            className="text-muted-foreground/60 group-hover:text-foreground font-mono text-xs transition-colors motion-reduce:transition-none"
          >
            {'>'}
          </span>
          <span className="min-w-0 flex-1 truncate">
            <SuggestionPrimitive.Title className="aui-thread-welcome-suggestion-text-1 text-foreground" />{' '}
            <SuggestionPrimitive.Description className="aui-thread-welcome-suggestion-text-2 text-muted-foreground empty:hidden" />
          </span>
        </button>
      </SuggestionPrimitive.Trigger>
    </div>
  )
}

export type ComposerProps = {
  autoFocus?: boolean
  disabled?: boolean
  leadingAction?: ReactNode
  placeholder?: string
  trailingAction?: ReactNode
}

export const Composer: FC<ComposerProps> = ({
  autoFocus = false,
  disabled = false,
  leadingAction,
  placeholder = '发送消息…',
  trailingAction,
}) => {
  return (
    <ComposerPrimitive.Root className="aui-composer-root relative flex w-full flex-col">
      <ComposerPrimitive.AttachmentDropzone asChild>
        <div
          data-slot="aui_composer-shell"
          className="border-foreground/10 focus-within:border-foreground/25 data-[dragging=true]:border-ring flex w-full cursor-text flex-col gap-2 rounded-(--composer-radius) border bg-(--composer-bg) p-(--composer-padding) transition-[border-color] data-[dragging=true]:border-dashed data-[dragging=true]:bg-[color-mix(in_oklab,var(--color-accent)_50%,var(--color-background))]"
        >
          <ComposerAttachments />
          <ComposerPrimitive.Input
            placeholder={placeholder}
            className="aui-composer-input caret-primary placeholder:text-muted-foreground/60 max-h-48 min-h-10 w-full resize-none bg-transparent px-2.5 py-1 text-base leading-6 outline-none"
            rows={1}
            autoFocus={autoFocus}
            disabled={disabled}
            enterKeyHint="send"
            aria-label="消息输入"
          />
          <ComposerAction leadingAction={leadingAction} trailingAction={trailingAction} />
        </div>
      </ComposerPrimitive.AttachmentDropzone>
    </ComposerPrimitive.Root>
  )
}

const ComposerAction: FC<Pick<ComposerProps, 'leadingAction' | 'trailingAction'>> = ({
  leadingAction,
  trailingAction,
}) => {
  return (
    <div className="aui-composer-action-wrapper relative flex items-center justify-between">
      {leadingAction ?? <ComposerAddAttachment />}
      <div className="flex items-center gap-1.5">
        {trailingAction ?? <DefaultComposerActions />}
      </div>
    </div>
  )
}

const DefaultComposerActions: FC = () => (
  <>
    <AuiIf condition={(s) => s.thread.capabilities.dictation}>
      <AuiIf condition={(s) => s.composer.dictation == null}>
        <ComposerPrimitive.Dictate asChild>
          <TooltipIconButton
            tooltip="Voice input"
            side="bottom"
            type="button"
            variant="ghost"
            size="icon"
            className="aui-composer-dictate text-muted-foreground hover:text-foreground size-7 rounded-full"
            aria-label="Start voice input"
          >
            <MicIcon className="aui-composer-dictate-icon size-4" />
          </TooltipIconButton>
        </ComposerPrimitive.Dictate>
      </AuiIf>
      <AuiIf condition={(s) => s.composer.dictation != null}>
        <ComposerPrimitive.StopDictation asChild>
          <TooltipIconButton
            tooltip="Stop dictation"
            side="bottom"
            type="button"
            variant="ghost"
            size="icon"
            className="aui-composer-stop-dictation text-destructive size-7 rounded-full"
            aria-label="Stop voice input"
          >
            <SquareIcon className="aui-composer-stop-dictation-icon size-3.5 animate-pulse fill-current" />
          </TooltipIconButton>
        </ComposerPrimitive.StopDictation>
      </AuiIf>
    </AuiIf>
    <AuiIf condition={(s) => !s.thread.isRunning}>
      <ComposerPrimitive.Send asChild>
        <TooltipIconButton
          tooltip="Send message"
          side="bottom"
          type="button"
          variant="default"
          size="icon"
          className="aui-composer-send size-7 rounded-full"
          aria-label="Send message"
        >
          <ArrowUpIcon className="aui-composer-send-icon size-4" />
        </TooltipIconButton>
      </ComposerPrimitive.Send>
    </AuiIf>
    <AuiIf condition={(s) => s.thread.isRunning}>
      <ComposerPrimitive.Cancel asChild>
        <Button
          type="button"
          variant="default"
          size="icon"
          className="aui-composer-cancel size-7 rounded-full"
          aria-label="停止生成"
        >
          <SquareIcon className="aui-composer-cancel-icon size-3.5 fill-current" />
        </Button>
      </ComposerPrimitive.Cancel>
    </AuiIf>
  </>
)

const MessageError: FC = () => {
  return (
    <MessagePrimitive.Error>
      <ErrorPrimitive.Root className="aui-message-error-root border-destructive bg-destructive/10 text-destructive dark:bg-destructive/5 mt-2 rounded-md border p-3 text-sm dark:text-red-200">
        <ErrorPrimitive.Message className="aui-message-error-message line-clamp-2" />
      </ErrorPrimitive.Root>
    </MessagePrimitive.Error>
  )
}

/**
 * `GenerationLoader` renders the tick it is handed but never advances it, so the
 * clock lives here. Reduced-motion users keep the static matrix and the shimmer
 * label instead of a band that jumps between states.
 */
const useGenerationTick = (): number => {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const id = window.setInterval(() => setTick((value) => value + 1), 120)
    return () => window.clearInterval(id)
  }, [])

  return tick
}

const GeneratingIndicator: FC = () => {
  const tick = useGenerationTick()

  // A full-width row whose content sits at the left margin, holding the line
  // the first tokens will use.
  return <GenerationLoader label="呀嘞呀嘞..." tick={tick} role="status" className="py-2" />
}

/**
 * Citation collection lives on the answer text alone: only the answer's own
 * links should become references, so reasoning keeps rendering plain markdown.
 */
const AssistantAnswerText: FC = () => {
  const content = useAuiState((s) => s.message.content)
  const citations = useMemo(() => collectWebCitations(content), [content])

  return (
    <div data-aui-quote-selectable>
      <MarkdownText citations={citations} />
    </div>
  )
}

const AssistantMessage: FC = () => {
  const {
    ToolFallback: ToolFallbackComponent = ToolFallback,
    ToolGroup,
    ReasoningGroup,
    TaskGroup: TaskGroupComponent,
    FileChangeCard,
  } = useContext(ThreadComponentsContext)
  const metadata = useAuiState((s) => s.message.metadata)
  const turnId = getTurnIdFromMessageMetadata(metadata)
  // The tail is the message being appended to; skipping its box would let the
  // content-visibility placeholder replace the real height while it grows.
  const isTail = useAuiState((s) => s.message.index === s.thread.messages.length - 1)
  const groupBy = TaskGroupComponent ? taskAwareGroupBy : messageGroupBy

  const ACTION_BAR_PT = 'pt-1.5'
  // Keep the action bar inside the contained root's paint box, then cancel its reserved space in flow.
  const ACTION_BAR_HEIGHT = `min-h-7.5 ${ACTION_BAR_PT}`

  return (
    <MessagePrimitive.Root
      data-slot="aui_assistant-message-root"
      data-role="assistant"
      className={cn(
        'fade-in slide-in-from-bottom-1 animate-in relative -mb-7.5 pb-7.5 duration-150',
        !isTail && '[contain-intrinsic-size:auto_200px] [content-visibility:auto]',
      )}
    >
      <div
        data-slot="aui_assistant-message-content"
        className="text-foreground px-2 leading-relaxed wrap-break-word"
      >
        <MessagePrimitive.GroupedParts groupBy={groupBy}>
          {({ part, children }) => {
            switch (part.type) {
              case 'group-chainOfThought':
                return <div data-slot="aui_chain-of-thought">{children}</div>
              case 'group-task':
                return TaskGroupComponent ? <TaskGroupComponent group={part} /> : null
              case 'group-tool':
                if (ToolGroup) {
                  return <ToolGroup group={part}>{children}</ToolGroup>
                }
                return (
                  <ToolGroupRoot variant="ghost">
                    <ToolGroupTrigger
                      count={part.indices.length}
                      active={part.status.type === 'running'}
                    />
                    <ToolGroupContent>{children}</ToolGroupContent>
                  </ToolGroupRoot>
                )
              case 'group-reasoning': {
                if (ReasoningGroup) {
                  return <ReasoningGroup group={part}>{children}</ReasoningGroup>
                }
                const running = part.status.type === 'running'
                return (
                  <ReasoningRoot variant="ghost" className="my-1" streaming={running}>
                    <ReasoningTrigger active={running} />
                    <ReasoningContent aria-busy={running}>
                      <ReasoningText>{children}</ReasoningText>
                    </ReasoningContent>
                  </ReasoningRoot>
                )
              }
              case 'text':
                return <AssistantAnswerText />
              case 'reasoning':
                return <Reasoning {...part} />
              case 'tool-call':
                return part.toolUI ?? <ToolFallbackComponent {...part} />
              case 'data':
                return part.dataRendererUI
              case 'file':
                return (
                  <div data-slot="aui_assistant-message-file" className="py-1">
                    <File {...part} />
                  </div>
                )
              case 'image':
                return (
                  <div data-slot="aui_assistant-message-image" className="py-1">
                    <Image {...part} />
                  </div>
                )
              case 'source':
                return <Sources {...part} />
              case 'indicator':
                return <GeneratingIndicator />
              default:
                return null
            }
          }}
        </MessagePrimitive.GroupedParts>
        <MessageError />
      </div>
      {FileChangeCard && turnId && <FileChangeCard turnId={turnId} />}

      <div
        data-slot="aui_assistant-message-footer"
        className={cn('ms-2 flex items-center', ACTION_BAR_HEIGHT)}
      >
        <BranchPicker />
        <AssistantActionBar />
      </div>
    </MessagePrimitive.Root>
  )
}

const AssistantActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="aui-assistant-action-bar-root text-muted-foreground animate-in fade-in col-start-3 row-start-2 -ms-1 flex gap-1 duration-200"
    >
      <ActionBarPrimitive.Copy asChild>
        <TooltipIconButton tooltip="复制">
          <AuiIf condition={(s) => s.message.isCopied}>
            <CheckIcon className="animate-in zoom-in-50 fade-in duration-200 ease-out" />
          </AuiIf>
          <AuiIf condition={(s) => !s.message.isCopied}>
            <CopyIcon className="animate-in zoom-in-75 fade-in duration-150" />
          </AuiIf>
        </TooltipIconButton>
      </ActionBarPrimitive.Copy>
      <AuiIf condition={(s) => s.thread.capabilities.feedback}>
        <ActionBarPrimitive.FeedbackPositive asChild>
          <TooltipIconButton
            tooltip="有帮助"
            className="data-[submitted=true]:bg-accent data-[submitted=true]:text-accent-foreground"
          >
            <ThumbsUpIcon />
          </TooltipIconButton>
        </ActionBarPrimitive.FeedbackPositive>
        <ActionBarPrimitive.FeedbackNegative asChild>
          <TooltipIconButton
            tooltip="没有帮助"
            className="data-[submitted=true]:bg-accent data-[submitted=true]:text-accent-foreground"
          >
            <ThumbsDownIcon />
          </TooltipIconButton>
        </ActionBarPrimitive.FeedbackNegative>
      </AuiIf>
    </ActionBarPrimitive.Root>
  )
}

const UserFilePart: FileMessagePartComponent = (part) => (
  <div data-slot="aui_user-message-file" className="py-1">
    <File {...part} />
  </div>
)

const UserImagePart: ImageMessagePartComponent = (part) => (
  <div data-slot="aui_user-message-image" className="py-1">
    <Image {...part} />
  </div>
)

const isWorkspaceContext = (part: { type?: string; name?: string }) =>
  part.type === 'data' && part.name === 'workspace-context'

const contextGrouping = (parts: readonly { type?: string; name?: string }[]) => [
  {
    groupKey: 'workspace-context',
    indices: parts.flatMap((part, index) => (isWorkspaceContext(part) ? [index] : [])),
  },
]

const userMessageGrouping = (parts: readonly { type?: string; name?: string }[]) => [
  {
    groupKey: 'content',
    indices: parts.flatMap((part, index) => (isWorkspaceContext(part) ? [] : [index])),
  },
]

const UserMessagePartGroup: FC<PropsWithChildren> = ({ children }) => (
  <div
    data-aui-quote-selectable
    className="aui-user-message-content min-w-0 w-fit max-w-full justify-self-end bg-muted text-foreground rounded-(--composer-radius) px-4 py-2 wrap-break-word empty:hidden"
  >
    {children}
  </div>
)
const ContextPartGroup: FC<PropsWithChildren> = ({ children }) => <>{children}</>

const UserMessage: FC = () => {
  const { WorkspaceContext: workspaceContext } = useContext(ThreadComponentsContext)
  return (
    <MessagePrimitive.Root
      data-slot="aui_user-message-root"
      className="fade-in slide-in-from-bottom-1 animate-in grid auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] content-start gap-y-2 px-2 duration-150 [contain-intrinsic-size:auto_200px] [content-visibility:auto] [&:where(>*)]:col-start-2"
      data-role="user"
    >
      <MessagePrimitive.Quote>
        {({ text }) => (
          <details className="workspace-context-message message-quote-sent">
            <summary>
              <MessageSquareQuote
                className="workspace-context-message-icon"
                size={16}
                aria-hidden
              />
              <span className="workspace-context-message-label">消息引用</span>
              {/* <span className="workspace-context-message-range">快照</span> */}
            </summary>
            <pre>{text}</pre>
          </details>
        )}
      </MessagePrimitive.Quote>
      <div className="aui-user-message-attachment-row col-span-full flex min-w-0 flex-col items-end gap-2 empty:hidden">
        <UserMessageAttachments />
        <MessagePrimitive.Unstable_PartsGrouped
          groupingFunction={contextGrouping}
          components={{
            data: { by_name: { 'workspace-context': workspaceContext } },
            Group: ContextPartGroup,
          }}
        />
      </div>

      <MessagePrimitive.Unstable_PartsGrouped
        groupingFunction={userMessageGrouping}
        components={{
          File: UserFilePart,
          Image: UserImagePart,
          data: { by_name: { 'workspace-context': workspaceContext } },
          Group: UserMessagePartGroup,
        }}
      />

      <BranchPicker
        data-slot="aui_user-branch-picker"
        className="col-span-full col-start-1 row-start-3 -me-1 justify-end"
      />
    </MessagePrimitive.Root>
  )
}

const UserActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="aui-user-action-bar-root flex flex-col items-end"
    >
      <ActionBarPrimitive.Edit asChild>
        <TooltipIconButton tooltip="Edit" className="aui-user-action-edit">
          <PencilIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.Edit>
    </ActionBarPrimitive.Root>
  )
}

const EditComposer: FC = () => {
  return (
    <MessagePrimitive.Root
      data-slot="aui_edit-composer-wrapper"
      className="flex flex-col px-2 [contain-intrinsic-size:auto_200px] [content-visibility:auto]"
    >
      <ComposerPrimitive.Root className="aui-edit-composer-root border-foreground/10 focus-within:border-foreground/25 ms-auto flex w-full max-w-[85%] cursor-text flex-col rounded-(--composer-radius) border bg-(--composer-bg) transition-[border-color]">
        <ComposerPrimitive.Input
          className="aui-edit-composer-input text-foreground min-h-14 w-full resize-none bg-transparent px-4 pt-3 pb-1 text-base outline-none"
          autoFocus
        />
        <div className="aui-edit-composer-footer mx-2.5 mb-2.5 flex items-center gap-1.5 self-end">
          <ComposerPrimitive.Cancel asChild>
            <Button variant="ghost" size="sm" className="h-8 px-3">
              Cancel
            </Button>
          </ComposerPrimitive.Cancel>
          <ComposerPrimitive.Send asChild>
            <Button size="sm" className="h-8 px-3">
              Update
            </Button>
          </ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.Root>
    </MessagePrimitive.Root>
  )
}

const BranchPicker: FC<BranchPickerPrimitive.Root.Props> = ({ className, ...rest }) => {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className={cn(
        'aui-branch-picker-root text-muted-foreground -ms-2 me-2 inline-flex items-center text-xs',
        className,
      )}
      {...rest}
    >
      <BranchPickerPrimitive.Previous asChild>
        <TooltipIconButton tooltip="Previous">
          <ChevronLeftIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Previous>
      <span className="aui-branch-picker-state font-medium">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next asChild>
        <TooltipIconButton tooltip="Next">
          <ChevronRightIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  )
}
