import {
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Rows3,
  Columns3,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { PanelProps } from '@/lib/panels/registry'
import { FileIcon } from './fileIcon'
import { FilePreviewState } from './FilePreviewState'
import {
  FileSplitPane,
  clampFileTreeRatio,
  type FilePanelOrientation,
} from './FileSplitPane'
import { createWorkspaceContext } from '@shared/workspaceContext'
import { workspaceContextDrafts } from '@/lib/workspaceContextDrafts'
import { FileTextPreview, type FileSelection } from './FileTextPreview'
import type {
  WorkspaceFilePreview,
  WorkspaceFileTreePage,
} from '@shared/contracts'
import { Button } from '@/components/ui/button'
interface Preferences {
  orientation: FilePanelOrientation
  ratio: number
  selected: string | null
  expandedPaths: string[]
}
function preferences(projectId: string): Preferences {
  try {
    const v = JSON.parse(
      localStorage.getItem(`sailor.files-panel.v1:${projectId}`) ?? 'null',
    )
    if (v && ['horizontal', 'vertical'].includes(v.orientation))
      return {
        orientation: v.orientation,
        ratio: clampFileTreeRatio(v.ratio),
        selected: typeof v.selected === 'string' ? v.selected : null,
        expandedPaths: Array.isArray(v.expandedPaths) ? v.expandedPaths.filter((p:unknown)=>typeof p==='string').slice(0,100) : [],
      }
  } catch {
    /* optional preferences */
  }
  return {
    orientation:
      typeof window !== 'undefined' && window.innerWidth < 1100
        ? 'vertical'
        : 'horizontal',
    ratio: 0.32,
    selected: null,
    expandedPaths: [],
  }
}
export function FileTreeRows({
  page,
  pages,
  expanded,
  selected,
  toggle,
  open,
  more,
  depth = 0,
}: {
  page: WorkspaceFileTreePage
  pages: Record<string, WorkspaceFileTreePage>
  expanded: Set<string>
  selected: string | null
  toggle: (path: string) => void
  open: (path: string) => void
  more: (path: string, cursor: string) => void
  depth?: number
}) {
  return (
    <>
      {page.entries
        .map((entry) => (
          <div key={entry.relativePath}>
            <button
              type="button"
              className={`file-tree-row${selected === entry.relativePath ? ' is-selected' : ''}`}
              style={{ paddingLeft: 8 + depth * 14 }}
              aria-expanded={
                entry.kind === 'directory'
                  ? expanded.has(entry.relativePath)
                  : undefined
              }
              onClick={() =>
                entry.kind === 'directory'
                  ? toggle(entry.relativePath)
                  : open(entry.relativePath)
              }
              onKeyDown={(event) => {
                if (
                  entry.kind === 'directory' &&
                  ((event.key === 'ArrowRight' &&
                    !expanded.has(entry.relativePath)) ||
                    (event.key === 'ArrowLeft' &&
                      expanded.has(entry.relativePath)))
                ) {
                  event.preventDefault()
                  toggle(entry.relativePath)
                }
              }}
            >
              {entry.kind === 'directory' ? (
                expanded.has(entry.relativePath) ? (
                  <ChevronDown size={14} />
                ) : (
                  <ChevronRight size={14} />
                )
              ) : (
                <span className="file-tree-chevron-spacer" />
              )}
              <FileIcon
                name={entry.name}
                directory={entry.kind === 'directory'}
                expanded={expanded.has(entry.relativePath)}
              />
              <span title={entry.relativePath}>{entry.name}</span>
            </button>
            {entry.kind === 'directory' &&
              expanded.has(entry.relativePath) &&
              (pages[entry.relativePath] ? (
                <>
                  <FileTreeRows
                    page={pages[entry.relativePath]}
                    pages={pages}
                    expanded={expanded}
                    selected={selected}
                    toggle={toggle}
                    open={open}
                    more={more}
                    depth={depth + 1}
                  />
                  {pages[entry.relativePath].nextCursor && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        more(
                          entry.relativePath,
                          pages[entry.relativePath].nextCursor!,
                        )
                      }
                    >
                      加载更多
                    </Button>
                  )}
                </>
              ) : (
                <p role="status">正在读取目录…</p>
              ))}
          </div>
        ))}
    </>
  )
}
export default function FilesPanel(props: PanelProps) {
  return <ProjectFiles key={props.context.projectId} {...props} />
}
function ProjectFiles({ context, data }: PanelProps) {
  const projectId = context.projectId ?? ''
  const [prefs, setPrefs] = useState(() => preferences(projectId))
  const [pages, setPages] = useState<Record<string, WorkspaceFileTreePage>>({})
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(prefs.expandedPaths))
  const [preview, setPreview] = useState<WorkspaceFilePreview | null>(null)
  const [selection, setSelection] = useState<FileSelection | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const active = useRef(true)
  const ticket = useRef(0)
  const generation = useRef(0)
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
      ++generation.current
      ++ticket.current
    }
  }, [])
  useEffect(() => {
    try {
      localStorage.setItem(
        `sailor.files-panel.v1:${projectId}`,
        JSON.stringify({...prefs,expandedPaths:[...expanded]}),
      )
    } catch {
      /* preferences are optional */
    }
  }, [prefs, projectId, expanded])
  const load = async (path = '', cursor?: string) => {
    const version = generation.current
    try {
      const page = await window.sailor.workspaces.files.list({
        projectId,
        path,
        cursor,
      })
      if (active.current && version === generation.current)
        setPages((old) => ({
          ...old,
          [path]: {
            ...page,
            entries: cursor
              ? [...(old[path]?.entries ?? []), ...page.entries]
              : page.entries,
          },
        }))
    } catch (cause) {
      if (active.current && version === generation.current) {
        setError(cause instanceof Error ? cause.message : '目录读取失败。')
        setPages((old) => ({ ...old, [path]: { entries: [] } }))
      }
    }
  }
  const open = async (path: string) => {
    const id = ++ticket.current
    setLoading(true)
    setPreviewError(null)
    setSelection(null)
    setNotice(null)
    setPreview(null)
    setError(null)
    setPrefs((p) => ({ ...p, selected: path }))
    try {
      const result = await window.sailor.workspaces.files.read({
        projectId,
        path,
      })
      if (active.current && id === ticket.current) setPreview(result)
    } catch (cause) {
      if (active.current && id === ticket.current)
        setPreviewError(cause instanceof Error ? cause.message : '文件读取失败。')
    } finally {
      if (active.current && id === ticket.current) setLoading(false)
    }
  }
  useEffect(() => {
    if (projectId) {
      void load()
      for (const path of prefs.expandedPaths) void load(path)
      if (prefs.selected) void open(prefs.selected)
    }
  }, [projectId])
  useEffect(() => {
    if (data.file?.projectId === projectId) void open(data.file.path)
  }, [data.file?.nonce, projectId])
  const addReference = (range?: FileSelection) => {
    if (!preview || !context.chatId) return
    try {
      workspaceContextDrafts.add(
        context.chatId,
        createWorkspaceContext(projectId, preview, range),
      )
      setNotice('已添加到当前会话')
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '引用添加失败。')
    }
  }
  const toggle = (path: string) => {
    setExpanded((old) => {
      const next = new Set(old)
      next.has(path) ? next.delete(path) : next.add(path)
      return next
    })
    if (!pages[path]) void load(path)
  }
  const refresh = () => {
    ++generation.current
    setPages({})
    setExpanded(new Set())
    setError(null)
    void load()
    if (prefs.selected) void open(prefs.selected)
  }
  if (!projectId)
    return (
      <div className="panel-empty-state">先关联一个工作区，再浏览文件。</div>
    )
  return (
    <section aria-label="文件" className="files-panel">
      <header className="files-panel-toolbar">
        <span className="files-panel-path" title={prefs.selected ?? undefined}>{prefs.selected ?? '选择一个文件'}</span>
        <Button
          aria-label="刷新文件"
          onClick={refresh}
          size="icon"
          variant="ghost"
        >
          <RefreshCw size={15} />
        </Button>
        <Button
          aria-label="左右布局"
          aria-pressed={prefs.orientation === 'horizontal'}
          onClick={() => setPrefs((p) => ({ ...p, orientation: 'horizontal' }))}
          size="icon"
          variant="ghost"
        >
          <Columns3 size={15} />
        </Button>
        <Button
          aria-label="上下布局"
          aria-pressed={prefs.orientation === 'vertical'}
          onClick={() => setPrefs((p) => ({ ...p, orientation: 'vertical' }))}
          size="icon"
          variant="ghost"
        >
          <Rows3 size={15} />
        </Button>
      </header>
      {error && (
        <div className="runtime-error" role="alert">
          {error}
        </div>
      )}
      <FileSplitPane
        orientation={prefs.orientation}
        ratio={prefs.ratio}
        onRatioChange={(ratio) => setPrefs((p) => ({ ...p, ratio }))}
        tree={
          <>
            {pages[''] ? (
              <>
                <FileTreeRows
                  page={pages['']}
                  pages={pages}
                  expanded={expanded}
                  selected={prefs.selected}
                  toggle={toggle}
                  open={(path) => void open(path)}
                  more={(path, cursor) => void load(path, cursor)}
                />
                {pages[''].entries.length === 0 && (
                  <p className="panel-empty-state">没有可浏览的文件。</p>
                )}
                {pages[''].nextCursor && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void load('', pages[''].nextCursor)}
                  >
                    加载更多
                  </Button>
                )}
              </>
            ) : (
              <p role="status">正在读取目录…</p>
            )}
          </>
        }
        preview={
          <article className="file-preview">
            {notice && <p role="status">{notice}</p>}
            {loading ? (
              <FilePreviewState kind="loading" title="正在加载预览" description="正在读取文件内容，请稍候。" />
            ) : previewError ? (
              <FilePreviewState kind="error" title="无法加载文件" description={previewError} onRetry={prefs.selected ? () => void open(prefs.selected!) : undefined} />
            ) : preview ? (
              preview.previewable ? (
                <>
                  {preview.truncated && (
                    <p role="status">
                      仅预览前 512 KiB / 20,000 行，完整文件{' '}
                      {preview.byteLength} 字节。
                    </p>
                  )}
                  {preview.content.length === 0 ? (
                    <FilePreviewState title="此文件为空" description="文件中暂无可预览的内容。" />
                  ) : <FileTextPreview
                    content={preview.content}
                    language={preview.language}
                    onSelection={setSelection}
                    onAddSelection={(range) => addReference(range)}
                  />}
                </>
              ) : (
                <FilePreviewState kind="unsupported" title="暂不支持预览此文件" description={`${preview.reason} 请在其他应用中打开此文件查看。`} />
              )
            ) : (
              <FilePreviewState title="选择文件以预览" description="从文件树中选择文件，在这里查看内容。" />
            )}
          </article>
        }
      />
    </section>
  )
}
