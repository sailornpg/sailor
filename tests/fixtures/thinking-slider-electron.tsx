import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { getAvailableThinkingLevels, type ThinkingLevel } from '@shared/contracts'
import { ThinkingLevelSlider, thinkingLabels } from '@/components/chat/composer/ThinkingLevelSlider'
import '@/styles/globals.css'

type PermissionMode = 'allow-reads' | 'allow-all'
type Request = { thinkingLevel: ThinkingLevel; permissionMode: PermissionMode }
type SmokeState = {
  thinkingLevel: ThinkingLevel
  permissionMode: PermissionMode
  levels: ThinkingLevel[]
  labels: Record<ThinkingLevel, string>
  request?: Request
  requests: Request[]
  valuesChanged: ThinkingLevel[]
}

declare global {
  interface Window {
    __thinkingSliderSmoke?: SmokeState
  }
}

const levels = getAvailableThinkingLevels()

function ThinkingSliderSmoke() {
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevel>('provider-default')
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('allow-reads')
  const [modelOpen, setModelOpen] = useState(false)
  const [permissionOpen, setPermissionOpen] = useState(false)
  const [requests, setRequests] = useState<Request[]>([])
  const [valuesChanged, setValuesChanged] = useState<ThinkingLevel[]>([])
  const request = requests.at(-1)

  const smokeState = (window.__thinkingSliderSmoke ??= {
    thinkingLevel,
    permissionMode,
    levels,
    labels: thinkingLabels,
    requests,
    valuesChanged,
  })
  Object.assign(smokeState, {
    thinkingLevel,
    permissionMode,
    levels,
    labels: thinkingLabels,
    request,
    requests,
    valuesChanged,
  })

  useEffect(() => {
    window.name = JSON.stringify({ thinkingLevel, permissionMode })
  }, [permissionMode, thinkingLevel])

  return (
    <main className="min-h-screen p-2">
      <button
        id="model"
        type="button"
        aria-expanded={modelOpen}
        onClick={() => setModelOpen((open) => !open)}
      >
        选择模型
      </button>
      <div
        id="model-menu"
        hidden={!modelOpen}
        className="mt-1 w-[400px] rounded-[10px] border border-border/60 bg-popover p-1 shadow-md"
      >
        <div id="model-list" data-model-list className="max-h-20 overflow-y-auto">
          {Array.from({ length: 12 }, (_, index) => (
            <button
              key={index}
              data-model={`model-${index}`}
              className="flex w-full justify-between rounded-sm py-1.5 px-2 text-[13px]"
              type="button"
            >
              <span>Model {index + 1}</span>
              <span className="text-muted-foreground">Provider</span>
            </button>
          ))}
        </div>
        <ThinkingLevelSlider
          value={thinkingLevel}
          onValueChange={(next) => {
            setThinkingLevel(next)
            setValuesChanged((previous) => [...previous, next])
          }}
        />
      </div>
      <button
        id="permission"
        type="button"
        aria-expanded={permissionOpen}
        onClick={() => setPermissionOpen((open) => !open)}
      >
        {permissionMode === 'allow-all' ? '工作区域默认执行' : '请求批准'}
      </button>
      <div id="permission-menu" hidden={!permissionOpen}>
        <button
          type="button"
          data-mode="allow-all"
          onClick={() => {
            setPermissionMode('allow-all')
            setPermissionOpen(false)
          }}
        >
          工作区域默认执行
        </button>
      </div>
      <button
        id="send"
        type="button"
        onClick={() => {
          setRequests((previous) => [...previous, { thinkingLevel, permissionMode }])
        }}
      >
        发送
      </button>
      <button
        id="change-after-start"
        type="button"
        onClick={() => setPermissionMode('allow-reads')}
      >
        切换当前工作区设置
      </button>
      <output id="status">{request ? 'approval-pending' : ''}</output>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<ThinkingSliderSmoke />)
