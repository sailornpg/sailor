import { FolderClosed } from 'lucide-react'
import type { PanelProps } from '@/lib/panels/registry'
import { PanelPlaceholder } from './PanelPlaceholder'

export default function FilesPanel({ context }: PanelProps) {
  return <PanelPlaceholder
    description="只读工作区文件浏览尚未接入：renderer 目前没有通用文件系统接口，浏览器进程也不会获得 Node 权限。"
    hint={context.projectId ? '接入后，文件树只读，路径越界与敏感文件会在主进程被拒绝。' : '先关联一个工作区。'}
    icon={FolderClosed}
    title="文件"
  />
}
