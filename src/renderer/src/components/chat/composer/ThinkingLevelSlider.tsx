import { getAvailableThinkingLevels, type ThinkingLevel } from '@shared/contracts'
import { Slider } from '@/components/ui/slider'

export const thinkingLabels: Record<ThinkingLevel, string> = {
  'provider-default': '模型默认',
  off: '关闭',
  minimal: '最少',
  low: '较低',
  medium: '中等',
  high: '较高',
  xhigh: '最高',
  max: '最大',
}

const thinkingLevels = getAvailableThinkingLevels()

export function ThinkingLevelSlider({
  value,
  onValueChange,
  disabled = false,
}: {
  value: ThinkingLevel
  onValueChange: (value: ThinkingLevel) => void
  disabled?: boolean
}) {
  const thinkingIndex = Math.max(0, thinkingLevels.indexOf(value))

  return (
    <div className="mt-1 shrink-0 border-t border-border/60 px-2 pt-1.5 pb-1" data-thinking-control>
      <div className="flex items-center justify-between gap-3">
        <span className="text-foreground/55 text-xs">思考等级</span>
        <span className="text-foreground/70 text-xs tabular-nums" data-thinking-value>
          {thinkingLabels[value]}
        </span>
      </div>
      <Slider
        className="mt-1 h-5"
        value={[thinkingIndex]}
        min={0}
        max={thinkingLevels.length - 1}
        step={1}
        aria-label="思考等级"
        data-thinking-slider
        data-thinking-slider-track
        disabled={disabled}
        thumbProps={{
          'aria-label': '思考等级',
          'aria-valuetext': thinkingLabels[value],
        }}
        onValueChange={(nextValues) => {
          const next = thinkingLevels[nextValues[0]]
          if (next) onValueChange(next)
        }}
      >
        <div
          className="pointer-events-none absolute inset-x-2 top-1/2 z-10 h-1.5 -translate-y-1/2"
          data-thinking-marker-rail
          aria-hidden
        >
          {thinkingLevels.map((level, index) => (
            <span
              key={level}
              data-thinking-step={index}
              data-thinking-marker
              className={`absolute top-1/2 size-1 opacity-40 -translate-x-1/2 -translate-y-1/2 rounded-full ${
                index < thinkingIndex
                  ? 'bg-[var(--appearance-accent-foreground)]/60'
                  : 'bg-muted-foreground'
              }`}
              style={{ left: `${(index / (thinkingLevels.length - 1)) * 100}%` }}
            />
          ))}
        </div>
      </Slider>
    </div>
  )
}
