import React, { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  unstable_useSlashCommandAdapter,
  useAui,
  useAuiState,
  useExternalStoreRuntime,
} from '@assistant-ui/react'
import type { ComposerSlashCommand } from '@shared/contracts'
import { ComposerDirectiveHighlight } from '@/components/chat/composer/ComposerDirectiveHighlight'
import {
  createComposerDirectiveSelection,
  getComposerDirectiveParts,
  type ComposerDirectiveSelection,
} from '@/components/chat/composer/composerDirective'
import {
  literalSlashCommandFormatter,
  toSlashCommandDefinitions,
} from '@/components/chat/composer/slashCommands'
import '@/styles/globals.css'

declare global {
  interface Window {
    __directiveSmoke: {
      commands: ComposerSlashCommand[]
      sent?: string
      done?: (results: { name: string; ok: boolean; detail?: string }[]) => void
    }
  }
}

const encoded = new URLSearchParams(window.location.search).get('commands')
const commands = (encoded ? JSON.parse(encoded) : []) as ComposerSlashCommand[]
window.__directiveSmoke = { commands }

function ComposerSurface() {
  const aui = useAui()
  const text = useAuiState((state) => state.composer.text)
  const [selectedDirective, setSelectedDirective] = useState<ComposerDirectiveSelection>()
  const [caretPosition, setCaretPosition] = useState<number>()
  const [caretIsCollapsed, setCaretIsCollapsed] = useState(true)
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const definitions = useMemo(
    () =>
      toSlashCommandDefinitions(commands, (command) => {
        if (command.action) {
          aui.composer.setText('')
          return
        }
        setSelectedDirective(
          createComposerDirectiveSelection(command, aui.composer.getState().text),
        )
      }),
    [aui],
  )
  const slash = unstable_useSlashCommandAdapter({
    commands: definitions,
    removeOnExecute: false,
  })
  const directiveActive = Boolean(
    selectedDirective && getComposerDirectiveParts(text, selectedDirective),
  )

  useLayoutEffect(() => {
    if (!selectedDirective) return
    const input = inputRef.current
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
    setCaretPosition(position)
    setCaretIsCollapsed(true)
  }, [aui, selectedDirective])

  const updateCaret = (input: HTMLTextAreaElement) => {
    const start = input.selectionStart ?? input.value.length
    const end = input.selectionEnd ?? start
    setCaretPosition(start)
    setCaretIsCollapsed(start === end)
  }

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateCaret(event.currentTarget)
    const value = event.currentTarget.value
    setSelectedDirective((current) =>
      current && getComposerDirectiveParts(value, current) ? current : undefined,
    )
  }

  const send = () => {
    window.__directiveSmoke.sent = aui.composer.getState().text.trim()
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-2rem)] w-[min(680px,calc(100vw-32px))] items-end pb-8">
      <div className="relative w-full">
        <ComposerPrimitive.Unstable_TriggerPopoverRoot>
          <ComposerPrimitive.Unstable_TriggerPopover
            char="/"
            adapter={slash.adapter}
            aria-label="Slash commands"
            className="absolute inset-x-0 bottom-full z-20 mb-2 max-h-80 overflow-hidden rounded-[10px] border border-border/60 bg-popover p-1.5 shadow-md"
          >
            <ComposerPrimitive.Unstable_TriggerPopover.Action
              formatter={literalSlashCommandFormatter}
              onExecute={slash.action.onExecute}
              removeOnExecute={false}
            />
            <ComposerPrimitive.Unstable_TriggerPopoverItems>
              {(items) => (
                <div data-slash-command-list className="max-h-80 overflow-y-auto">
                  {items.map((item, index) => (
                    <ComposerPrimitive.Unstable_TriggerPopoverItem
                      key={item.id}
                      item={item}
                      index={index}
                      data-command-id={item.id}
                      className="block w-full rounded-lg px-3 py-2 text-left data-[highlighted]:bg-foreground/[0.06]"
                    >
                      /{item.label}
                    </ComposerPrimitive.Unstable_TriggerPopoverItem>
                  ))}
                </div>
              )}
            </ComposerPrimitive.Unstable_TriggerPopoverItems>
          </ComposerPrimitive.Unstable_TriggerPopover>
          <ComposerPrimitive.Root className="rounded-[16px] border border-border/60 bg-popover p-3 shadow-sm">
            <div className="sailor-composer-input-layer">
              <ComposerDirectiveHighlight
                text={text}
                selection={directiveActive ? selectedDirective : undefined}
                caretPosition={caretPosition}
                caretIsCollapsed={caretIsCollapsed}
                focused={focused}
              />
              <ComposerPrimitive.Input
                ref={inputRef}
                id="directive-input"
                autoFocus
                aria-label="任务描述"
                className={`min-h-12 w-full resize-none bg-transparent px-3 py-2 text-[15px] leading-6 outline-none ${directiveActive ? 'sailor-composer-input-tokenized' : ''}`}
                onChange={handleChange}
                onClick={(event) => updateCaret(event.currentTarget)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onKeyUp={(event) => updateCaret(event.currentTarget)}
                onSelect={(event) => updateCaret(event.currentTarget)}
                placeholder="输入 / 查看命令"
              />
            </div>
            <div className="mt-2 flex justify-end gap-2">
              <button id="send-directive" type="button" onClick={send}>
                发送
              </button>
            </div>
          </ComposerPrimitive.Root>
        </ComposerPrimitive.Unstable_TriggerPopoverRoot>
      </div>
    </main>
  )
}

function App() {
  const runtime = useExternalStoreRuntime({
    messages: [],
    onNew: async () => {},
  })
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ComposerSurface />
    </AssistantRuntimeProvider>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
