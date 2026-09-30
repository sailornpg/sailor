import { WorkspaceContextChips } from './WorkspaceContextChips'
import { ReferenceSummary } from './ReferenceSummary'
import { sideChatQuoteDrafts } from '@/lib/sideChatQuoteDrafts'
import { useWorkspaceContexts } from '@/lib/workspaceContextDrafts'
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ComposerPrimitive,
  unstable_useSlashCommandAdapter,
  useAui,
  useAuiEvent,
  useAuiState,
} from '@assistant-ui/react'
import type { ChangeEvent } from 'react'
import { Check, MessageSquareQuote, Server, X } from 'lucide-react'
import {
  Composer,
  ComposerActions,
  ComposerAttachButton,
  ComposerBar,
  ComposerModelTrigger,
  ComposerMenu,
  ComposerMenuItem,
  ComposerModelItem,
  ComposerSend,
  ComposerToolbar,
} from '@/components/assistant-ui/elements/composer'
import { ComposerAttachments } from '@/components/assistant-ui/elements/attachment.aui'
import { Button } from '@/components/ui/button'
import { ghostButton } from '@/components/assistant-ui/elements/surfaces'
import { cn } from '@/lib/utils'
import type { WorkspaceChats } from '@/lib/WorkspaceChats'
import {
  type ComposerSlashCommand,
  type ModelSelection,
  type ProjectSummary,
  type SettingsSnapshot,
  type ThinkingLevel,
  type WorkspacePermissionMode,
} from '@shared/contracts'
import type { RunStatus, WorkspaceChatSummary } from '@shared/workspaces'
import type { PlanTodoList } from '@shared/planTodo'
import type { MessageQuote } from '@shared/messageQuote'
import { UNSUPPORTED_ATTACHMENT_MESSAGE } from '@shared/attachments'
import { useSailorChat, useSailorChatMessages } from '../runtime/SailorChatProvider'
import { SailorComposerContext } from './SailorComposerContext'
import { stopChatRun } from './composerPolicy'
import { PlanTodoListView } from '../PlanTodoListView'
import { SailorAskUserPopover } from '../tools/SailorAskUserCard'
import { findPendingAskUser } from './pendingAskUser'
import { hasPendingToolApproval } from './pendingToolApproval'
import { ThinkingLevelSlider, thinkingLabels } from './ThinkingLevelSlider'
import { SlashCommandItems } from './SlashCommandItems'
import { literalSlashCommandFormatter, toSlashCommandDefinitions } from './slashCommands'
import {
  createComposerDirectiveSelection,
  getComposerDirectiveParts,
  type ComposerDirectiveSelection,
} from './composerDirective'
import { ComposerDirectiveHighlight } from './ComposerDirectiveHighlight'
import { TransientErrorNotice } from './TransientErrorNotice'

interface SailorComposerProps {
  chatId: string
  registry: WorkspaceChats
  project?: ProjectSummary
  summary?: WorkspaceChatSummary
  settings: SettingsSnapshot
  onSelectModel: (selection: ModelSelection) => Promise<void>
  onOpenSettings: () => void
  onNewChat: () => Promise<void>
  onCompact: () => Promise<void>
  onOpenSideChat?: (question?: string, quote?: MessageQuote) => Promise<void>
  onRetrySave: () => void
}

const permissionLabels: Record<WorkspacePermissionMode, string> = {
  'allow-reads': '请求批准',
  'allow-edits': '自动编辑',
  'allow-all': '工作区域默认执行',
}

const permissionOptions: { id: WorkspacePermissionMode; name: string }[] = [
  { id: 'allow-reads', name: permissionLabels['allow-reads'] },
  { id: 'allow-edits', name: permissionLabels['allow-edits'] },
  { id: 'allow-all', name: permissionLabels['allow-all'] },
]

const MemoPlanTodoListView = memo(PlanTodoListView)
const MemoAskUserPopover = memo(SailorAskUserPopover)

/**
 * Message-derived slots subscribe here instead of in the composer shell.
 *
 * Streaming changes the message list many times per second; when the shell read
 * it, the whole composer (including its autosizing textarea, which measures
 * itself on every render) re-rendered per delta and froze the window.
 */
const PlanPanel = memo(function PlanPanel({
  plan,
  runStatus,
  runId,
}: {
  plan?: PlanTodoList
  runStatus?: RunStatus
  runId?: string | null
}) {
  const messages = useSailorChatMessages()
  const waitingForApproval = hasPendingToolApproval(messages)
  return (
    <MemoPlanTodoListView
      plan={plan}
      runStatus={runStatus}
      runId={runId}
      waitingForApproval={waitingForApproval}
    />
  )
})

const AskUserSlot = memo(function AskUserSlot({ runStatus }: { runStatus?: RunStatus }) {
  const pending = useAuiState((state) => findPendingAskUser(state.thread.messages, runStatus))
  return <MemoAskUserPopover pending={pending} />
})

export function SailorComposer({
  chatId,
  registry,
  summary,
  settings,
  onSelectModel,
  project,
  onOpenSettings,
  onNewChat,
  onCompact,
  onOpenSideChat,
  onRetrySave,
}: SailorComposerProps) {
  const aui = useAui()
  useEffect(() => {
    const quote = sideChatQuoteDrafts.take(chatId)
    if (quote) aui.composer.setQuote(quote)
  }, [aui, chatId])
  const { clearError, error, stop, sendMessage } = useSailorChat()
  const runtimeRunning = useAuiState((state) => state.thread.isRunning)
  const references = useWorkspaceContexts(chatId)
  const composerEmpty = useAuiState((state) => state.composer.isEmpty)
  const composerText = useAuiState((state) => state.composer.text)
  const composerQuote = useAuiState((state) => state.composer.quote)
  const attachmentCount = useAuiState((state) => state.composer.attachments.length)
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevel>(
    registry.reasoning.get(chatId) ?? 'provider-default',
  )
  const [permissionMode, setPermissionMode] = useState<WorkspacePermissionMode>(
    project?.permissionMode ?? 'allow-all',
  )
  const [modelOpen, setModelOpen] = useState(false)
  const [permissionOpen, setPermissionOpen] = useState(false)
  const [selectionError, setSelectionError] = useState<string>()
  const [attachmentError, setAttachmentError] = useState<string>()
  const [selecting, setSelecting] = useState(false)
  const [sideChatBusy, setSideChatBusy] = useState(false)
  const [slashCommands, setSlashCommands] = useState<ComposerSlashCommand[]>([])
  const [slashCommandsLoading, setSlashCommandsLoading] = useState(true)
  const [selectedDirective, setSelectedDirective] = useState<ComposerDirectiveSelection>()
  const [composerCaretPosition, setComposerCaretPosition] = useState<number>()
  const [composerCaretIsCollapsed, setComposerCaretIsCollapsed] = useState(true)
  const [composerFocused, setComposerFocused] = useState(false)
  const [composerComposing, setComposerComposing] = useState(false)
  const [composerScrollTop, setComposerScrollTop] = useState(0)
  const [composerScrollLeft, setComposerScrollLeft] = useState(0)
  const pickerRef = useRef<HTMLDivElement>(null)
  const permissionRef = useRef<HTMLDivElement>(null)
  const composerInputRef = useRef<HTMLTextAreaElement>(null)
  const composerComposingRef = useRef(false)
  // The runtime rejects a dropped file before the adapter sees it, so the only
  // way to tell the user why is the official composer event.
  useAuiEvent('composer.attachmentAddError', () => {
    setAttachmentError(UNSUPPORTED_ATTACHMENT_MESSAGE)
  })
  useAuiEvent('composer.attachmentAdd', () => {
    setAttachmentError(undefined)
  })
  useEffect(() => {
    if (!modelOpen && !permissionOpen) return
    const outside = (event: PointerEvent) => {
      const target = event.target as Node
      if (!pickerRef.current?.contains(target)) setModelOpen(false)
      if (!permissionRef.current?.contains(target)) setPermissionOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [modelOpen, permissionOpen])
  useEffect(() => {
    let cancelled = false
    setSlashCommandsLoading(true)
    void window.sailor.workspaces
      .slashCommands(chatId)
      .then((commands) => {
        if (cancelled) return
        setSlashCommands(commands)
      })
      .catch(() => {
        if (!cancelled) setSlashCommands([])
      })
      .finally(() => {
        if (!cancelled) setSlashCommandsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [chatId])
  const modelOptions = useMemo(
    () =>
      settings.providers.flatMap((provider) =>
        provider.models.map((model) => ({
          id: `${provider.id}:${model.id}`,
          name: model.name,
          description: provider.name,
          providerId: provider.id,
          modelId: model.id,
          disabled: !provider.hasApiKey,
          keywords: [provider.name, model.id],
        })),
      ),
    [settings.providers],
  )
  const selectedModel = settings.activeModel
    ? `${settings.activeModel.providerId}:${settings.activeModel.modelId}`
    : undefined
  const selectedModelOption = modelOptions.find((model) => model.id === selectedModel)
  const btwMatch = onOpenSideChat ? /^\/btw(?:\s+([\s\S]*))?$/.exec(composerText.trim()) : null
  const availableSlashCommands = useMemo(
    () => slashCommands.filter((command) => command.id !== 'btw' || Boolean(onOpenSideChat)),
    [onOpenSideChat, slashCommands],
  )
  const slashCommandMap = useMemo(
    () => new Map(availableSlashCommands.map((command) => [command.id, command])),
    [availableSlashCommands],
  )
  const directiveActive = Boolean(
    selectedDirective && getComposerDirectiveParts(composerText, selectedDirective),
  )
  const updateComposerCaret = (input: HTMLTextAreaElement) => {
    const start = input.selectionStart ?? input.value.length
    const end = input.selectionEnd ?? start
    setComposerCaretPosition(start)
    setComposerCaretIsCollapsed(start === end)
  }
  const syncComposerDirective = (input: HTMLTextAreaElement) => {
    updateComposerCaret(input)
    const value = input.value
    setSelectedDirective((current) => {
      if (!current) return undefined
      return getComposerDirectiveParts(value, current) ? current : undefined
    })
  }
  const scheduleComposerDirectiveSync = (input: HTMLTextAreaElement) => {
    // ComposerPrimitive.Input invokes this consumer handler before it writes the
    // new controlled value into assistant-ui. Updating React state in that gap
    // makes React restore the stale value and moves the native caret to the end.
    queueMicrotask(() => {
      if (composerInputRef.current === input) syncComposerDirective(input)
    })
  }
  const handleComposerInputChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    if (
      composerComposingRef.current ||
      (event.nativeEvent instanceof InputEvent && event.nativeEvent.isComposing)
    )
      return
    scheduleComposerDirectiveSync(event.currentTarget)
  }
  const executeSlashCommand = useCallback(
    (command: ComposerSlashCommand) => {
      if (!command.action) {
        setSelectedDirective(
          createComposerDirectiveSelection(command, aui.composer.getState().text),
        )
        return
      }
      // Action commands are executed immediately and must never be submitted as
      // model prompt text. Skill and /btw commands intentionally have no action
      // and therefore keep the literal formatter behavior below.
      setSelectedDirective(undefined)
      setSelectionError(undefined)
      aui.composer.setText('')
      const reportActionError = (cause: unknown) => {
        setSelectionError(cause instanceof Error ? cause.message : '命令执行失败，请重试。')
      }
      if (command.action === 'settings') {
        onOpenSettings()
        return
      }
      if (command.action === 'model') {
        if (!modelOptions.length) {
          onOpenSettings()
          return
        }
        setModelOpen(true)
        requestAnimationFrame(() =>
          pickerRef.current
            ?.querySelector<HTMLButtonElement>('[data-slot=composer-model-trigger]')
            ?.focus(),
        )
        return
      }
      if (command.action === 'reload') {
        window.location.reload()
        return
      }
      if (command.action === 'quit') {
        void window.sailor.app.quit().catch(reportActionError)
        return
      }
      if (command.action === 'new') {
        void onNewChat().catch(reportActionError)
        return
      }
      if (command.action === 'compact') {
        void onCompact().catch(reportActionError)
      }
    },
    [aui, modelOptions.length, onCompact, onNewChat, onOpenSettings],
  )
  useEffect(() => {
    if (!selectedDirective) return
    const parts = getComposerDirectiveParts(composerText, selectedDirective)
    if (!parts && selectedDirective.offset >= 0) {
      setSelectedDirective(undefined)
      return
    }
    if (parts && selectedDirective.offset < 0) {
      setSelectedDirective((current) =>
        current && current.offset < 0 ? { ...current, offset: parts.before.length } : current,
      )
    }
  }, [composerText, selectedDirective])
  useLayoutEffect(() => {
    if (!selectedDirective) return
    const setCaretAfterDirective = () => {
      const input = composerInputRef.current
      const parts = getComposerDirectiveParts(aui.composer.getState().text, selectedDirective)
      if (!input || !parts) return
      const position = Math.min(
        parts.before.length +
          selectedDirective.literal.length +
          (input.value.slice(parts.before.length + selectedDirective.literal.length).startsWith(' ')
            ? 1
            : 0),
        input.value.length,
      )
      input.focus({ preventScroll: true })
      input.setSelectionRange(position, position)
      setComposerCaretPosition(position)
      setComposerCaretIsCollapsed(true)
    }
    setCaretAfterDirective()
    const frame = requestAnimationFrame(setCaretAfterDirective)
    return () => cancelAnimationFrame(frame)
  }, [aui, selectedDirective])
  const slashCommandDefinitions = useMemo(
    () => toSlashCommandDefinitions(availableSlashCommands, executeSlashCommand),
    [availableSlashCommands, executeSlashCommand],
  )
  const slash = unstable_useSlashCommandAdapter({
    commands: slashCommandDefinitions,
    removeOnExecute: false,
  })
  const launchSideChat = async () => {
    if (!onOpenSideChat || !btwMatch || sideChatBusy) return
    if (attachmentCount || references.length) {
      setSelectionError('请先移除主输入区的附件和文件引用，再开启侧聊。')
      return
    }
    setSideChatBusy(true)
    setSelectionError(undefined)
    try {
      await onOpenSideChat(btwMatch[1]?.trim() || undefined, composerQuote ?? undefined)
      aui.composer.setText('')
      aui.composer.setQuote(undefined)
    } catch (cause) {
      setSelectionError(cause instanceof Error ? cause.message : '侧聊创建失败，请重试。')
    } finally {
      setSideChatBusy(false)
    }
  }
  const persistedRunning = summary?.status === 'running'
  const runBusy = runtimeRunning || persistedRunning
  const sendDisabled =
    runBusy ||
    sideChatBusy ||
    Boolean(summary?.saveError) ||
    Boolean(summary?.archived) ||
    (composerEmpty && references.length === 0)

  useEffect(() => {
    registry.reasoning.set(chatId, thinkingLevel)
  }, [chatId, thinkingLevel, registry])

  useEffect(() => {
    setPermissionMode(project?.permissionMode ?? 'allow-all')
  }, [project?.permissionMode])

  const choosePermission = async (mode: WorkspacePermissionMode) => {
    if (!project || runBusy || mode === permissionMode) return
    setSelectionError(undefined)
    try {
      await window.sailor.workspaces.setPermission({ projectId: project.id, mode })
      setPermissionMode(mode)
      setPermissionOpen(false)
    } catch (cause) {
      setSelectionError(cause instanceof Error ? cause.message : '权限策略保存失败，请重试。')
    }
  }

  const transientError = selectionError ?? error?.message ?? summary?.error ?? attachmentError

  return (
    <div className="sailor-composer-stack">
      <PlanPanel
        plan={registry.getStablePlan(summary)}
        runStatus={runBusy ? 'running' : summary?.status}
        runId={summary?.runId}
      />
      <AskUserSlot runStatus={summary?.status} />
      {transientError && <TransientErrorNotice key={transientError} message={transientError} />}
      {summary?.saveError && (
        <div className="runtime-error" role="alert">
          {summary.saveError}{' '}
          <button type="button" onClick={onRetrySave}>
            重试保存
          </button>
        </div>
      )}
      <div className="sailor-composer-review-slot relative w-full">
        <ComposerPrimitive.Unstable_TriggerPopoverRoot>
          <ComposerPrimitive.Unstable_TriggerPopover
            char="/"
            adapter={slash.adapter}
            isLoading={slashCommandsLoading}
            aria-label="Slash commands"
            className="absolute inset-x-0 bottom-full z-30 mb-2 max-h-80 overflow-hidden rounded-[10px] border border-border/60 bg-popover p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.24)]"
          >
            <ComposerPrimitive.Unstable_TriggerPopover.Action
              formatter={literalSlashCommandFormatter}
              onExecute={slash.action.onExecute}
              removeOnExecute={false}
            />
            <ComposerPrimitive.Unstable_TriggerPopoverItems aria-label="可用命令">
              {(items) => (
                <SlashCommandItems
                  items={items}
                  commandMap={slashCommandMap}
                  isLoading={slashCommandsLoading}
                />
              )}
            </ComposerPrimitive.Unstable_TriggerPopoverItems>
          </ComposerPrimitive.Unstable_TriggerPopover>
          <ComposerPrimitive.Root className="w-full">
            <Composer className="max-w-none">
              <ComposerPrimitive.AttachmentDropzone asChild>
                <div className="sailor-composer-dropzone">
                  <ComposerBar className="border-black/[0.06] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.025),0_8px_24px_rgba(0,0,0,0.04)] dark:border-border/60 dark:bg-popover">
                    <div className="sailor-composer-attachments">
                      <ComposerPrimitive.Quote className="message-quote-container">
                        <ReferenceSummary
                          icon={<MessageSquareQuote size={15} aria-hidden />}
                          label="1 个消息引用"
                          title="消息引用"
                          dismiss={
                            <ComposerPrimitive.QuoteDismiss
                              aria-label="移除消息引用"
                              className="workspace-context-clear"
                            >
                              <X size={14} aria-hidden />
                            </ComposerPrimitive.QuoteDismiss>
                          }
                        >
                          <ComposerPrimitive.QuoteText className="message-quote-preview" />
                        </ReferenceSummary>
                      </ComposerPrimitive.Quote>
                      <WorkspaceContextChips chatId={chatId} />
                      <ComposerAttachments />
                    </div>
                    <div className="sailor-composer-input-layer">
                      <ComposerDirectiveHighlight
                        text={composerText}
                        selection={directiveActive ? selectedDirective : undefined}
                        caretPosition={composerCaretPosition}
                        caretIsCollapsed={composerCaretIsCollapsed}
                        focused={composerFocused && !composerComposing}
                        scrollTop={composerScrollTop}
                        scrollLeft={composerScrollLeft}
                      />
                      <ComposerPrimitive.Input
                        ref={composerInputRef}
                        onChange={handleComposerInputChange}
                        onCompositionStart={() => {
                          composerComposingRef.current = true
                          setComposerComposing(true)
                        }}
                        onCompositionEnd={(event) => {
                          composerComposingRef.current = false
                          const input = event.currentTarget
                          queueMicrotask(() => {
                            if (composerInputRef.current !== input) return
                            setComposerComposing(false)
                            syncComposerDirective(input)
                          })
                        }}
                        onClick={(event) => {
                          if (!composerComposingRef.current)
                            updateComposerCaret(event.currentTarget)
                        }}
                        onFocus={() => setComposerFocused(true)}
                        onBlur={() => setComposerFocused(false)}
                        onKeyUp={(event) => {
                          if (!composerComposingRef.current)
                            updateComposerCaret(event.currentTarget)
                        }}
                        onScroll={(event) => {
                          setComposerScrollTop(event.currentTarget.scrollTop)
                          setComposerScrollLeft(event.currentTarget.scrollLeft)
                        }}
                        onSelect={(event) => {
                          if (!composerComposingRef.current)
                            updateComposerCaret(event.currentTarget)
                        }}
                        onKeyDown={(event) => {
                          if (
                            event.key !== 'Enter' ||
                            event.shiftKey ||
                            event.nativeEvent.isComposing ||
                            sendDisabled
                          )
                            return
                          if (btwMatch) {
                            event.preventDefault()
                            void launchSideChat()
                            return
                          }
                          if (composerEmpty && references.length) {
                            event.preventDefault()
                            void sendMessage({ parts: [] })
                          }
                        }}
                        aria-label="任务描述"
                        autoFocus
                        spellCheck={false}
                        className={cn(
                          'placeholder:text-foreground/35 max-h-48 min-h-11 w-full resize-none bg-transparent px-3 py-2 text-[15px] leading-6 caret-blue-500 outline-none dark:caret-blue-400',
                          directiveActive && 'sailor-composer-input-tokenized',
                        )}
                        disabled={
                          runBusy || Boolean(summary?.saveError) || Boolean(summary?.archived)
                        }
                        enterKeyHint="send"
                        placeholder="随心输入"
                        rows={1}
                      />
                    </div>
                    <ComposerToolbar className="gap-1.5">
                      <ComposerActions className="min-w-0 flex-1 gap-1">
                        <ComposerPrimitive.AddAttachment asChild>
                          <ComposerAttachButton />
                        </ComposerPrimitive.AddAttachment>
                        {modelOptions.length > 0 ? (
                          <div
                            ref={pickerRef}
                            className="relative min-w-0"
                            onKeyDown={(event) => {
                              if (event.key === 'Escape') {
                                setModelOpen(false)
                                setPermissionOpen(false)
                                pickerRef.current
                                  ?.querySelector<HTMLButtonElement>(
                                    '[data-slot=composer-model-trigger]',
                                  )
                                  ?.focus()
                              }
                            }}
                            onBlur={(event) => {
                              if (!event.currentTarget.contains(event.relatedTarget))
                                setModelOpen(false)
                            }}
                          >
                            <ComposerModelTrigger
                              aria-label={`模型与思考等级，当前模型：${selectedModelOption?.name ?? '未选择'}，思考等级：${thinkingLabels[thinkingLevel]}`}
                              model={`${selectedModelOption?.name ?? '选择模型'} · ${thinkingLabels[thinkingLevel]}`}
                              open={modelOpen}
                              className="max-w-[min(15rem,calc(100vw-8rem))] truncate px-2.5"
                              onClick={() => setModelOpen((value) => !value)}
                            />
                            <ComposerMenu
                              open={modelOpen}
                              inert={!modelOpen}
                              aria-label="可用模型"
                              className="max-w-[calc(100vw-5rem)] p-1"
                            >
                              <div
                                data-model-list
                                className="min-h-0 max-h-64 overflow-y-auto overscroll-contain pe-0.5"
                              >
                                {modelOptions.map((model) => (
                                  <ComposerModelItem
                                    key={model.id}
                                    entry={{
                                      name: model.name,
                                      meta: model.description,
                                    }}
                                    selected={model.id === selectedModel}
                                    aria-pressed={model.id === selectedModel}
                                    disabled={model.disabled || selecting}
                                    className="rounded-lg px-2 py-1.5 text-[13px] disabled:opacity-40 [&>span:first-child]:min-w-0 [&>span:first-child]:truncate"
                                    title={model.disabled ? '请先配置提供商密钥' : model.name}
                                    onClick={async () => {
                                      setSelecting(true)
                                      setSelectionError(undefined)
                                      try {
                                        await onSelectModel({
                                          providerId: model.providerId,
                                          modelId: model.modelId,
                                        })
                                        setModelOpen(false)
                                      } catch (error) {
                                        setSelectionError(
                                          error instanceof Error
                                            ? error.message
                                            : '切换模型失败，请重试。',
                                        )
                                      } finally {
                                        setSelecting(false)
                                      }
                                    }}
                                  />
                                ))}
                              </div>
                              <ThinkingLevelSlider
                                value={thinkingLevel}
                                onValueChange={setThinkingLevel}
                                disabled={runBusy}
                              />
                            </ComposerMenu>
                          </div>
                        ) : (
                          <Button
                            className={cn(ghostButton, 'h-8 rounded-full px-2.5 text-[12.5px]')}
                            size="sm"
                            type="button"
                            variant="ghost"
                            onClick={onOpenSettings}
                          >
                            <Server aria-hidden /> 配置模型
                          </Button>
                        )}
                        {project && (
                          <div
                            ref={permissionRef}
                            className="relative min-w-0"
                            onKeyDown={(event) => {
                              if (event.key !== 'Escape') return
                              setPermissionOpen(false)
                              permissionRef.current
                                ?.querySelector<HTMLButtonElement>(
                                  '[data-slot=composer-model-trigger]',
                                )
                                ?.focus()
                            }}
                            onBlur={(event) => {
                              if (!event.currentTarget.contains(event.relatedTarget))
                                setPermissionOpen(false)
                            }}
                          >
                            <ComposerModelTrigger
                              aria-label={`工作区权限，当前：${permissionLabels[permissionMode]}`}
                              disabled={runBusy}
                              model={permissionLabels[permissionMode]}
                              open={permissionOpen}
                              className="px-2.5"
                              onClick={() => setPermissionOpen((value) => !value)}
                            />
                            <ComposerMenu
                              open={permissionOpen}
                              inert={!permissionOpen}
                              aria-label="工作区权限"
                              className="max-w-[calc(100vw-5rem)]"
                            >
                              {permissionOptions.map((option) => (
                                <ComposerMenuItem
                                  key={option.id}
                                  active={option.id === permissionMode}
                                  aria-pressed={option.id === permissionMode}
                                  disabled={runBusy || selecting}
                                  onClick={() => void choosePermission(option.id)}
                                >
                                  <span className="flex-1 truncate text-start">{option.name}</span>
                                  {option.id === permissionMode && <Check size={14} aria-hidden />}
                                </ComposerMenuItem>
                              ))}
                            </ComposerMenu>
                          </div>
                        )}
                      </ComposerActions>
                      <SailorComposerContext />
                      {runBusy ? (
                        <ComposerSend
                          aria-label="停止生成"
                          idle={false}
                          streaming
                          onClick={() => {
                            void stopChatRun(
                              summary?.runId ?? undefined,
                              window.sailor.agent.abort,
                              stop,
                            )
                          }}
                        />
                      ) : btwMatch ? (
                        <ComposerSend
                          aria-label="开启侧聊"
                          disabled={sendDisabled}
                          idle={false}
                          streaming={false}
                          onClick={() => {
                            void launchSideChat()
                          }}
                        />
                      ) : composerEmpty && references.length > 0 ? (
                        <ComposerSend
                          aria-label="发送"
                          disabled={sendDisabled}
                          idle={false}
                          streaming={false}
                          onClick={() => {
                            if (error) clearError()
                            void sendMessage({ parts: [] })
                          }}
                        />
                      ) : (
                        <ComposerPrimitive.Send asChild>
                          <ComposerSend
                            aria-label="发送"
                            disabled={sendDisabled}
                            idle={composerEmpty}
                            streaming={false}
                            onClick={() => {
                              if (error) clearError()
                              if (attachmentError) setAttachmentError(undefined)
                            }}
                          />
                        </ComposerPrimitive.Send>
                      )}
                    </ComposerToolbar>
                  </ComposerBar>
                </div>
              </ComposerPrimitive.AttachmentDropzone>
            </Composer>
          </ComposerPrimitive.Root>
        </ComposerPrimitive.Unstable_TriggerPopoverRoot>
      </div>
    </div>
  )
}
