import React, { act, StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { Chat } from '@ai-sdk/react'
import { useAuiState } from '@assistant-ui/react'
import { IpcChatTransport } from '@/lib/IpcChatTransport'
import { SailorChatProvider } from '@/components/chat/runtime/SailorChatProvider'
import { Thread, type ThreadComponents } from '@/components/assistant-ui/elements/thread.aui'
import { SailorToolCalls } from '@/components/chat/tools/SailorToolCall'
import { SailorToolFallback } from '@/components/chat/tools/sailorToolkit'
import '../../src/renderer/src/styles/globals.css'

declare global {
  interface Window {
    toolkitTest: { done(results: { name: string; ok: boolean; error?: string }[]): void }
  }
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const searchResult = {
  query: 'Sailor docs',
  sources: [
    {
      sourceId: 'src_0123456789abcdef',
      title: 'Sailor docs',
      url: 'https://example.com/docs',
      snippet: 'docs',
      retrievedAt: '2026-09-25T00:00:00.000Z',
    },
  ],
}

const chat = new Chat({
  id: 'toolkit-electron-chat',
  transport: new IpcChatTransport(),
  messages: [
    {
      id: 'toolkit-assistant',
      role: 'assistant',
      parts: [
        {
          type: 'tool-web_search',
          toolCallId: 'search-1',
          state: 'output-available',
          input: { query: 'Sailor docs' },
          output: searchResult,
        },
        {
          type: 'tool-ask_user',
          toolCallId: 'ask-1',
          state: 'output-available',
          input: { question: '不应显示在消息区' },
          output: { outcome: 'skipped' },
        },
        {
          type: 'tool-update_plan',
          toolCallId: 'plan-1',
          state: 'output-available',
          input: { revision: 1, steps: [] },
          output: { revision: 1, steps: [] },
        },
      ],
    } as any,
  ],
})

const components: ThreadComponents = {
  ToolFallback: SailorToolFallback,
  ToolGroup: SailorToolCalls,
  Composer: () => null,
  Welcome: () => null,
}

function RegistryProbe({ onUpdate }: { onUpdate: (names: Record<string, number>) => void }) {
  const toolUIs = useAuiState((state) => state.tools.toolUIs)
  useEffect(() => {
    onUpdate(
      Object.fromEntries(
        Object.entries(toolUIs).map(([name, registrations]) => [name, registrations.length]),
      ),
    )
    return () => onUpdate({})
  }, [onUpdate, toolUIs])
  return null
}

const root = createRoot(document.getElementById('root')!)
const results: { name: string; ok: boolean; error?: string }[] = []
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message)
}

let latestRegistry: Record<string, number> = {}
const runtimeErrors: string[] = []
window.addEventListener('error', (event) => runtimeErrors.push(`error: ${event.message}`))
window.addEventListener('unhandledrejection', (event) =>
  runtimeErrors.push(`rejection: ${String(event.reason)}`),
)
const render = async () => {
  await act(() =>
    root.render(
      <StrictMode>
        <SailorChatProvider chat={chat}>
          <RegistryProbe
            onUpdate={(value) => {
              latestRegistry = value
            }}
          />
          <Thread components={components} />
        </SailorChatProvider>
      </StrictMode>,
    ),
  )
}

const check = async (name: string, test: () => Promise<void>) => {
  try {
    await test()
    results.push({ name, ok: true })
  } catch (error) {
    results.push({ name, ok: false, error: String(error) })
  }
}

await check('StrictMode 注册每个工具一次并渲染专用结果', async () => {
  await render()
  await act(() => delay(300))
  for (const name of [
    'read_document',
    'write',
    'edit',
    'bash',
    'web_search',
    'fetch_page',
    'ask_user',
    'update_plan',
  ])
    assert(
      latestRegistry[name] === 1,
      `${name} 应只有一个 registry renderer: ${JSON.stringify(latestRegistry)}`,
    )
  assert(
    document.querySelectorAll('[data-slot="web-search"]').length === 1,
    `web_search 应由注册 renderer 展示一次: ${document.body.innerHTML.slice(0, 4000)}`,
  )
  assert(!document.body.textContent?.includes('不应显示在消息区'), 'ask_user 不应出现在消息区')
  assert(
    !document.querySelector('[data-slot="tool-call"]')?.textContent?.includes('update_plan'),
    '成功 update_plan 不应出现工具行',
  )
})

await check('Provider 卸载后清理注册，再次挂载不累积', async () => {
  await act(() => root.render(null))
  await act(() => delay(100))
  assert(
    Object.keys(latestRegistry).length === 0,
    `卸载后 registry 未清理: ${JSON.stringify(latestRegistry)}`,
  )
  await render()
  await act(() => delay(300))
  assert(latestRegistry.web_search === 1, '重新挂载后 web_search 应只有一个注册')
})

await check('回答流期间根节点保持渲染且无运行时异常', async () => {
  const streamChat = new Chat({ id: 'stream-chat', transport: new IpcChatTransport() })
  await act(() =>
    root.render(
      <StrictMode>
        <SailorChatProvider chat={streamChat}>
          <Thread components={components} />
        </SailorChatProvider>
      </StrictMode>,
    ),
  )
  await act(() => delay(100))
  await act(() => streamChat.sendMessage({ text: '开始回答' }))
  await act(() => delay(1000))
  assert(document.querySelector('#root')?.childElementCount, '回答期间 #root 不应为空')
  assert(document.querySelector('.aui-thread-root'), '回答期间 thread root 不应消失')
  assert(runtimeErrors.length === 0, runtimeErrors.join('; '))
})

await act(() => root.unmount())
window.toolkitTest.done(results)
