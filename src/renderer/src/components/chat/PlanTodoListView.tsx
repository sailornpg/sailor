import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, ListTodo } from 'lucide-react'
import { TodoList, type TodoItem } from '@/components/assistant-ui/elements/todo-list'
import { cn } from '@/lib/utils'
import { floating, mono } from '@/components/assistant-ui/elements/surfaces'
import type { PlanTodoList } from '@shared/planTodo'
import type { RunStatus } from '@shared/workspaces'

interface PlanTodoListViewProps {
  plan?: PlanTodoList
  runStatus?: RunStatus
  runId?: string | null
}

function toTodoItems(plan: PlanTodoList): TodoItem[] {
  return plan.steps.map((step) => ({
    id: step.id,
    text: step.title,
    status:
      step.status === 'completed'
        ? 'done'
        : step.status === 'in-progress'
          ? 'active'
          : step.status === 'blocked'
            ? 'failed'
            : step.status === 'skipped'
              ? 'skipped'
              : 'pending',
    ...(step.status === 'blocked' ? { reason: '此步骤被阻塞' } : {}),
  }))
}

function statusSummary(items: readonly TodoItem[]): string {
  const done = items.filter((item) => item.status === 'done').length
  const active = items.filter((item) => item.status === 'active').length
  const pending = items.filter((item) => item.status === 'pending').length
  const failed = items.filter((item) => item.status === 'failed').length
  const skipped = items.filter((item) => item.status === 'skipped').length
  const parts = [`${done} 已完成`]
  if (active) parts.push(`${active} 进行中`)
  if (pending) parts.push(`${pending} 待处理`)
  if (failed) parts.push(`${failed} 阻塞`)
  if (skipped) parts.push(`${skipped} 已跳过`)
  return parts.join(' · ')
}

function hasUnfinishedSteps(plan: PlanTodoList | undefined): boolean {
  if (!plan) return false
  return plan.steps.some(
    (step) =>
      step.status === 'pending' || step.status === 'in-progress' || step.status === 'blocked',
  )
}

export function PlanTodoListView({ plan, runStatus, runId }: PlanTodoListViewProps) {
  const [expanded, setExpanded] = useState(true)
  const contentId = `sailor-plan-todo-content-${useId().replaceAll(':', '')}`
  const [displayPlan, setDisplayPlan] = useState(plan)
  const incomingPlanRef = useRef<{ plan?: PlanTodoList; signature: string }>({
    plan,
    signature: plan ? JSON.stringify(plan) : '',
  })
  incomingPlanRef.current = {
    plan,
    signature: plan ? JSON.stringify(plan) : '',
  }
  const displayPlanRef = useRef(displayPlan)
  displayPlanRef.current = displayPlan
  const displayedSignatureRef = useRef(displayPlan ? JSON.stringify(displayPlan) : '')
  const runIdRef = useRef(runId)
  const items = displayPlan ? toTodoItems(displayPlan) : []
  const [mounted, setMounted] = useState(() => Boolean(displayPlan))
  const [closing, setClosing] = useState(() => Boolean(displayPlan))
  const mountedRef = useRef(Boolean(displayPlan))
  const closeTimerRef = useRef<number | undefined>(undefined)
  const removeTimerRef = useRef<number | undefined>(undefined)
  const enterFrameRef = useRef<number | undefined>(undefined)

  const clearTimers = () => {
    if (closeTimerRef.current !== undefined) window.clearTimeout(closeTimerRef.current)
    if (removeTimerRef.current !== undefined) window.clearTimeout(removeTimerRef.current)
    if (enterFrameRef.current !== undefined) window.cancelAnimationFrame(enterFrameRef.current)
    closeTimerRef.current = undefined
    removeTimerRef.current = undefined
    enterFrameRef.current = undefined
  }

  const mountWithAnimation = () => {
    if (mountedRef.current) return
    mountedRef.current = true
    setMounted(true)
    setClosing(true)
    enterFrameRef.current = window.requestAnimationFrame(() => {
      enterFrameRef.current = undefined
      setClosing(false)
    })
  }

  const dismissWithAnimation = () => {
    if (!mountedRef.current || closeTimerRef.current !== undefined) return
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = undefined
      setClosing(true)
      removeTimerRef.current = window.setTimeout(() => {
        removeTimerRef.current = undefined
        mountedRef.current = false
        setMounted(false)
      }, 220)
    }, 1200)
  }

  useEffect(() => {
    const runChanged = runIdRef.current !== runId
    const incoming = incomingPlanRef.current
    const incomingHasUnfinishedSteps = hasUnfinishedSteps(incoming.plan)
    if (runChanged) {
      runIdRef.current = runId
      clearTimers()
      displayedSignatureRef.current = incoming.signature
      displayPlanRef.current = incoming.plan
      setDisplayPlan(incoming.plan)
      if (!incoming.plan) {
        mountedRef.current = false
        setMounted(false)
        setClosing(false)
      } else {
        mountWithAnimation()
      }
      return clearTimers
    }

    // Keep the last plan mounted during a same-run snapshot gap. This avoids
    // an unmount/remount flash while workspace persistence catches up.
    if (incoming.plan && incoming.signature !== displayedSignatureRef.current) {
      displayedSignatureRef.current = incoming.signature
      displayPlanRef.current = incoming.plan
      setDisplayPlan(incoming.plan)
    }

    if ((incoming.plan && incomingHasUnfinishedSteps) || runStatus === 'running') {
      clearTimers()
      if (incoming.plan) mountWithAnimation()
      setClosing(false)
    } else if (incoming.plan || displayPlanRef.current) {
      // A completed/stopped snapshot may briefly omit plan while the final
      // workspace write is settling. Keep the visible plan and use the same
      // delayed exit as a completed plan.
      setClosing(false)
      dismissWithAnimation()
    }

    return clearTimers
  }, [runId, runStatus, plan ? JSON.stringify(plan) : ''])

  if (!displayPlan || !mounted) return null
  return (
    <section
      className={cn('sailor-composer-popover', 'sailor-plan-todo-popover', floating)}
      data-expanded={expanded}
      data-state={closing ? 'closing' : 'open'}
      aria-label="当前计划"
    >
      <button
        type="button"
        className="sailor-plan-todo-trigger"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="sailor-plan-todo-heading">
          <ListTodo aria-hidden size={16} />
          <span>任务</span>
        </span>
        <span className={cn(mono, 'sailor-plan-todo-summary')}>
          {items.length ? statusSummary(items) : '暂无步骤'}
        </span>
        <span className="sailor-plan-todo-chevron" aria-hidden>
          {expanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </span>
        <span className="sr-only">
          计划第 {displayPlan.revision} 次更新，rev {displayPlan.revision}
        </span>
      </button>
      <div id={contentId} className="sailor-plan-todo-content" hidden={!expanded}>
        {items.length ? (
          <TodoList
            items={items}
            revision={displayPlan.revision}
            hideHeader
            className="max-w-none"
          />
        ) : (
          <p className="text-muted-foreground px-1 py-2 text-sm" role="status">
            计划暂无步骤
          </p>
        )}
      </div>
    </section>
  )
}
