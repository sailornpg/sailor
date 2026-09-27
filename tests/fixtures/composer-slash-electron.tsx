import React, { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  unstable_useSlashCommandAdapter,
  useAui,
  useExternalStoreRuntime,
} from '@assistant-ui/react'
import type { ComposerSlashCommand } from '@shared/contracts'
import {
  literalSlashCommandFormatter,
  toSlashCommandDefinitions,
} from '@/components/chat/composer/slashCommands'
import { SlashCommandItems } from '@/components/chat/composer/SlashCommandItems'
import '@/styles/globals.css'

declare global {
  interface Window {
    __slashSmoke: {
      commands: ComposerSlashCommand[]
      sent?: string
      sideChatOpened?: boolean
      actionEvents: string[]
      ipcCalls: string[]
      done?: (results: { name: string; ok: boolean; detail?: string }[]) => void
    }
  }
}

const encoded = new URLSearchParams(window.location.search).get('commands')
const commands = (encoded ? JSON.parse(encoded) : []) as ComposerSlashCommand[]
window.__slashSmoke = { commands, actionEvents: [], ipcCalls: [] }
const commandMap = new Map(commands.map((command) => [command.id, command]))

function ComposerSurface() {
  const aui = useAui()
  const [sideChatOpened, setSideChatOpened] = useState(false)
  const definitions = useMemo(
    () =>
      toSlashCommandDefinitions(commands, (command) => {
        if (!command.action) return
        aui.composer.setText('')
        window.__slashSmoke.actionEvents.push(command.action)
        if (command.action === 'quit') window.__slashSmoke.ipcCalls.push('app:quit')
        if (command.action === 'compact')
          window.__slashSmoke.ipcCalls.push('agent:compact:smoke-chat')
      }),
    [aui],
  )
  const slash = unstable_useSlashCommandAdapter({
    commands: definitions,
    removeOnExecute: false,
  })

  const clear = () => aui.composer.setText('')
  const send = () => {
    const value = aui.composer.getState().text.trim()
    window.__slashSmoke.sent = value
    if (value === '/btw') {
      setSideChatOpened(true)
      window.__slashSmoke.sideChatOpened = true
    }
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
                <SlashCommandItems items={items} commandMap={commandMap} isLoading={false} />
              )}
            </ComposerPrimitive.Unstable_TriggerPopoverItems>
          </ComposerPrimitive.Unstable_TriggerPopover>
          <ComposerPrimitive.Root className="rounded-[16px] border border-border/60 bg-popover p-3 shadow-sm">
            <ComposerPrimitive.Input
              id="slash-input"
              autoFocus
              aria-label="任务描述"
              className="min-h-12 w-full resize-none bg-transparent outline-none"
              placeholder="输入 / 查看命令"
            />
            <div className="mt-2 flex justify-between">
              <span id="side-chat-state" className="text-xs text-foreground/50">
                {sideChatOpened ? '侧聊已开启' : '等待输入'}
              </span>
              <div className="flex gap-2">
                <button id="clear" type="button" onClick={clear}>
                  清空
                </button>
                <button id="send" type="button" onClick={send}>
                  发送
                </button>
              </div>
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
