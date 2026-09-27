import type { ComposerSlashCommand } from '../../../shared/contracts.js'
import { loadPiSkills } from './PiStorage.js'
import type { WorkspaceToolScope } from '../../workspaces/WorkspaceToolScope.js'

/**
 * Commands owned by Sailor rather than the Pi terminal UI. The renderer can
 * filter a command out when the current chat does not expose its capability.
 *
 * Pi's interactive-only commands are mapped to Sailor actions instead of being
 * sent through the prompt API. The renderer owns the visible UI action while
 * the main process owns application/agent operations such as quit and compact.
 */
export const SAILOR_COMPOSER_SLASH_COMMANDS: readonly ComposerSlashCommand[] = [
  {
    id: 'btw',
    label: 'btw',
    description: '开启只读侧聊，追问当前回答',
    source: 'sailor',
    icon: 'MessageCircleQuestion',
  },
  {
    id: 'settings',
    label: 'settings',
    description: '打开 Sailor 设置',
    source: 'sailor',
    action: 'settings',
    icon: 'Settings2',
  },
  {
    id: 'model',
    label: 'model',
    description: '打开模型与思考等级菜单',
    source: 'sailor',
    action: 'model',
    icon: 'Bot',
  },
  {
    id: 'new',
    label: 'new',
    description: '创建并切换到新会话',
    source: 'sailor',
    action: 'new',
    icon: 'Plus',
  },
  {
    id: 'quit',
    label: 'quit',
    description: '退出 Sailor 应用',
    source: 'sailor',
    action: 'quit',
    icon: 'Power',
  },
  {
    id: 'reload',
    label: 'reload',
    description: '重新加载 Sailor 界面',
    source: 'sailor',
    action: 'reload',
    icon: 'RefreshCcw',
  },
  {
    id: 'compact',
    label: 'compact',
    description: '压缩当前 Pi 会话上下文',
    source: 'sailor',
    action: 'compact',
    icon: 'Minimize2',
  },
]

/**
 * Build the command surface from the same validated Skill bundles Pi receives
 * on its next turn. Only bounded frontmatter metadata crosses the IPC boundary.
 */
export async function loadComposerSlashCommands(
  scope: WorkspaceToolScope,
): Promise<ComposerSlashCommand[]> {
  const skills = await loadPiSkills(scope)
  return [
    ...SAILOR_COMPOSER_SLASH_COMMANDS,
    ...skills.map((skill) => ({
      id: `skill:${skill.name}`,
      label: `skill:${skill.name}`,
      description: skill.description,
      source: 'skill' as const,
      icon: 'Sparkles',
      argumentHint: '[参数]',
    })),
  ]
}
