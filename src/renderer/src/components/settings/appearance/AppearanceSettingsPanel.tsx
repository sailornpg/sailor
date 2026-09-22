import { Check, RotateCcw, Monitor, Sun, Moon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type {
  AccentColor,
  AppearancePreferences,
  ThemeMode,
} from '@/lib/appearancePreferences'

const themeOptions: Array<{ value: ThemeMode; label: string; icon: typeof Monitor }> = [
  { value: 'system', label: '跟随系统', icon: Monitor },
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
]

const accentOptions: Array<{ value: AccentColor; label: string }> = [
  { value: 'default', label: '默认' },
  { value: 'blue', label: '蓝色' },
  { value: 'green', label: '绿色' },
  { value: 'purple', label: '紫色' },
]

interface AppearanceSettingsPanelProps {
  message: string | null
  onChange: (preferences: AppearancePreferences) => void
  onReset: () => void
  preferences: AppearancePreferences
}

export function AppearanceSettingsPanel({
  message,
  onChange,
  onReset,
  preferences,
}: AppearanceSettingsPanelProps) {
  return (
    <div className="appearance-settings">
      <div className="settings-heading">
        <div>
          <h2>外观</h2>
          <p>选择界面主题和强调色，更改会立即应用。</p>
        </div>
      </div>

      <section className="appearance-group" aria-labelledby="theme-heading">
        <div className="appearance-group-heading">
          <div>
            <h3 id="theme-heading">主题</h3>
            <p>跟随系统会随操作系统的外观设置自动切换。</p>
          </div>
        </div>
        <div className="theme-options">
          {themeOptions.map((option) => (
            <Button variant="ghost"
              aria-pressed={preferences.theme === option.value}
              className={preferences.theme === option.value ? 'theme-option selected' : 'theme-option'}
              key={option.value}
              onClick={() => onChange({ ...preferences, theme: option.value })}
              type="button"
            >
              <option.icon aria-hidden="true" className="theme-symbol" />
              <span>{option.label}</span>
              {preferences.theme === option.value && <Check aria-hidden="true" />}
            </Button>
          ))}
        </div>
      </section>

      <section className="appearance-group" aria-labelledby="accent-heading">
        <div className="appearance-group-heading">
          <div>
            <h3 id="accent-heading">强调色</h3>
            <p>用于选中项、焦点和主要交互状态。</p>
          </div>
        </div>
        <div className="accent-options">
          {accentOptions.map((option) => (
            <Button variant="ghost"
              aria-label={`${option.label}强调色`}
              aria-pressed={preferences.accent === option.value}
              className={preferences.accent === option.value ? 'accent-option selected' : 'accent-option'}
              data-accent-preview={option.value}
              key={option.value}
              onClick={() => onChange({ ...preferences, accent: option.value })}
              type="button"
            >
              <span className="accent-swatch" />
              <span>{option.label}</span>
              {preferences.accent === option.value && <Check aria-hidden="true" />}
            </Button>
          ))}
        </div>
      </section>

      <div className="appearance-footer">
        <div aria-live="polite" className="appearance-message">{message}</div>
        <Button onClick={onReset} type="button" variant="outline">
          <RotateCcw />
          恢复默认
        </Button>
      </div>
    </div>
  )
}
