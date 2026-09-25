import React, { act, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PlanTodoListView } from '../../src/renderer/src/components/chat/PlanTodoListView'
import { hasPendingToolApproval } from '../../src/renderer/src/components/chat/composer/pendingToolApproval'
import '../../src/renderer/src/styles/globals.css'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const root = createRoot(document.getElementById('root')!)
const results: { name: string; ok: boolean; error?: string }[] = []
const active = {
  revision: 1,
  steps: [
    { id: 'read', title: '检查实现与审批流程', status: 'completed' },
    { id: 'write', title: '写入文件并等待用户允许或拒绝', status: 'in-progress' },
    { id: 'verify', title: '验证结果', status: 'pending' },
  ],
}
const done = { revision: 2, steps: active.steps.map((step) => ({ ...step, status: 'completed' })) }
const panel = () => document.querySelector<HTMLElement>('.sailor-plan-todo-popover')
const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message)
}
const delay = async (ms: number) => {
  await act(() => new Promise((resolve) => setTimeout(resolve, ms)))
}
const render = async (props: any, key = 'chat-a:task-a') => {
  await act(() =>
    root.render(
      <StrictMode>
        <div style={{ maxWidth: 760, margin: '60px auto', padding: 24 }}>
          <p style={{ marginBottom: 24 }}>工具审批与任务计划生命周期验证</p>
          <PlanTodoListView key={key} {...props} />
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 16,
              background: 'var(--background)',
              padding: 20,
            }}
          >
            随心输入
          </div>
        </div>
      </StrictMode>,
    ),
  )
}
const check = async (name: string, test: () => Promise<void>) => {
  await act(() => root.render(null))
  try {
    await test()
    results.push({ name, ok: true })
  } catch (error) {
    results.push({ name, ok: false, error: String(error) })
  }
}

await check('审批等待和新 runId 续跑始终保留同一个 DOM', async () => {
  await render({ plan: active, runStatus: 'running', runId: 'transport-1' })
  await delay(250)
  const original = panel()
  for (const runId of ['transport-2', 'transport-3']) {
    await render({ plan: active, runStatus: 'completed', runId, waitingForApproval: true })
    await delay(1500)
    assert(panel() === original && panel()?.dataset.state === 'open', '审批期间浮层不应退场')
    await render({ plan: undefined, runStatus: 'running', runId })
    await delay(250)
    assert(
      panel() === original && panel()?.dataset.state === 'open',
      '审批续跑的快照空窗不应卸载浮层',
    )
    await render({ plan: active, runStatus: 'running', runId })
  }
  await render({ plan: active, runStatus: 'running', runId: 'transport-4' })
  assert(panel() === original && panel()?.dataset.state === 'open', '新审批传输 ID 不应重放入场')
})
await check('步骤全完成但仍在等待权限时不退场', async () => {
  await render({ plan: done, runStatus: 'running', runId: 'one' })
  await render({ plan: done, runStatus: 'completed', runId: 'one', waitingForApproval: true })
  await delay(1500)
  assert(panel()?.dataset.state === 'open', '审批暂停被误判成任务完成')
})
await check('完成延迟退场仅执行一次，快照刷新不重放', async () => {
  await render({ plan: active, runStatus: 'running', runId: 'one' })
  await delay(250)
  await render({ plan: done, runStatus: 'running', runId: 'one' })
  await delay(1450)
  assert(panel()?.dataset.state === 'open', '仍在运行时不能提前隐藏')
  await render({ plan: done, runStatus: 'completed', runId: 'one' })
  await delay(1250)
  assert(panel()?.dataset.state === 'closing', '缺少退场动画阶段')
  await delay(300)
  assert(!panel(), '动画结束后仍未卸载')
  await render({ plan: { ...done }, runStatus: 'completed', runId: 'one' })
  assert(!panel(), '同一完成快照不应重新显示')
})
await check('切回运行中会话恢复计划，已完成历史不闪现', async () => {
  await render({ plan: active, runStatus: 'running' })
  await render({}, 'chat-b:task-b')
  assert(!panel(), '其他会话不能显示旧计划')
  await render({ plan: active, runStatus: 'running' })
  assert(panel(), '切回运行中会话丢失计划')
  await render({ plan: done, runStatus: 'completed' }, 'chat-c:finished')
  assert(!panel(), '已完成历史重新挂载')
  await render({ plan: done }, 'chat-d:unknown')
  assert(!panel(), '未知状态的已完成历史不应先显示再隐藏')
})
await check('新用户任务清空旧计划，完成与新计划连续更新', async () => {
  await render({ plan: active, runStatus: 'running' })
  await render({ runStatus: 'running' }, 'chat-a:task-new')
  assert(!panel(), '新任务不能继承旧计划')
  await render({ plan: done, runStatus: 'running' }, 'chat-a:task-new')
  await render({ plan: active, runStatus: 'running' }, 'chat-a:task-new')
  await delay(250)
  assert(panel()?.dataset.state === 'open', '快速更新导致动画或状态卡住')
})
await check('只有当前消息的待审批状态延长计划展示', async () => {
  for (const state of [
    'approval-requested',
    'approval-responded',
    'output-denied',
    'output-available',
  ]) {
    const messages = [
      {
        id: 'assistant',
        role: 'assistant',
        parts: [{ type: 'tool-write', toolCallId: 'write', state }],
      },
    ]
    assert(
      hasPendingToolApproval(messages as any) === state.startsWith('approval-'),
      `审批状态 ${state} 判断错误`,
    )
    assert(
      !hasPendingToolApproval([...messages, { id: 'user-next', role: 'user', parts: [] }] as any),
      '新任务不应继承历史审批',
    )
  }
})
await check('主题、窄窗口、滚动和折叠', async () => {
  for (const dark of [false, true]) {
    document.documentElement.classList.toggle('dark', dark)
    await render(
      {
        plan: {
          ...active,
          steps: Array.from({ length: 15 }, (_, i) => ({
            ...active.steps[i % 3],
            id: `step-${i}`,
          })),
        },
        runStatus: 'running',
      },
      `visual-${dark}`,
    )
    await delay(250)
    await window.planTest.capture(dark ? 'dark' : 'light', dark, false)
    await window.planTest.capture(dark ? 'dark-narrow' : 'light-narrow', dark, true)
    await delay(250)
    assert(document.documentElement.scrollWidth <= window.innerWidth, '窄窗口横向溢出')
    const content = panel()!.querySelector<HTMLElement>('.sailor-plan-todo-content')!
    assert(
      content.scrollHeight > content.clientHeight && getComputedStyle(content).overflowY === 'auto',
      '长计划应在内部滚动',
    )
    const trigger = panel()!.querySelector('button')!
    await act(() => trigger.click())
    assert(trigger.getAttribute('aria-expanded') === 'false' && content.hidden, '折叠失效')
    await act(() => trigger.click())
    assert(trigger.getAttribute('aria-expanded') === 'true' && !content.hidden, '展开失效')
  }
})
await act(() => root.unmount())
window.planTest.done(results)
