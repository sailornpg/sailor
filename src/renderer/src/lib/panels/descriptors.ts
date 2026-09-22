import { FileDiff, FolderClosed, Globe, MessageSquarePlus, Terminal } from 'lucide-react'
import type { PanelDescriptor } from './registry'

const noActiveChat = (what: string) => ({ available: false as const, reason: `先打开一个会话，再看${what}。` })

/** Registration order is the order shown in the panel picker. */
export const panelDescriptors: readonly PanelDescriptor[] = [
  {
    id: 'review',
    title: '审查',
    icon: FileDiff,
    shortcut: { key: 'g', ctrl: true, shift: true },
    scope: 'chat',
    multiplicity: 'single',
    availability: context => (context.chatId ? { available: true } : noActiveChat('本次改动')),
    load: () => import('@/components/panels/ReviewPanel'),
  },
  {
    id: 'terminal',
    title: '终端',
    icon: Terminal,
    shortcut: { key: '`', ctrl: true },
    scope: 'chat',
    multiplicity: 'single',
    availability: context => (context.chatId ? { available: true } : noActiveChat('执行记录')),
    load: () => import('@/components/panels/TerminalPanel'),
  },
  {
    id: 'browser',
    title: '浏览器',
    icon: Globe,
    shortcut: { key: 't', meta: true },
    scope: 'global',
    multiplicity: 'single',
    availability: () => ({ available: true }),
    load: () => import('@/components/panels/BrowserPreviewPanel'),
  },
  {
    id: 'files',
    title: '文件',
    icon: FolderClosed,
    shortcut: { key: 'p', meta: true },
    scope: 'project',
    multiplicity: 'single',
    availability: context => (context.projectId ? { available: true } : { available: false, reason: '先关联一个工作区，再浏览文件。' }),
    load: () => import('@/components/panels/FilesPanel'),
  },
  {
    id: 'side-chat',
    title: '侧边聊天',
    icon: MessageSquarePlus,
    shortcut: { key: 's', meta: true, alt: true },
    scope: 'global',
    multiplicity: 'single',
    availability: () => ({ available: true }),
    load: () => import('@/components/panels/SideChatPanel'),
  },
]

export const DEFAULT_PANEL_ID = 'review'
