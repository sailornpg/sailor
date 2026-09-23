import { useEffect, useRef, useState } from 'react'
import { EditorState } from '@codemirror/state'
import {
  EditorView,
  lineNumbers,
  highlightActiveLineGutter,
} from '@codemirror/view'
import { syntaxHighlighting, defaultHighlightStyle, HighlightStyle } from '@codemirror/language'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
const previewHighlightStyle = HighlightStyle.define(defaultHighlightStyle.specs.map(style => ({
  ...style,
  ...(typeof style.color === 'string' ? { color: `light-dark(${style.color}, color-mix(in srgb, ${style.color} 55%, white))` } : {}),
})))
export interface FileSelection {
  start: number
  end: number
  startLine: number
  endLine: number
  text: string
}
export function FileTextPreview({
  content,
  language,
  onSelection,
  onAddSelection,
}: {
  content: string
  language: string | null
  onSelection?: (value: FileSelection | null) => void
  onAddSelection?: (value: FileSelection) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const [bubble, setBubble] = useState<{ left: number; top: number; selection: FileSelection } | null>(null)
  const callback = useRef(onSelection)
  callback.current = onSelection
  useEffect(() => {
    if (!host.current) return
    const lang =
      language === 'json'
        ? json()
        : ['md', 'mdx'].includes(language ?? '')
          ? markdown()
          : ['ts', 'tsx', 'js', 'jsx', 'mjs'].includes(language ?? '')
            ? javascript({ typescript: true, jsx: true })
            : []
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: content,
        extensions: [
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          lineNumbers(),
          highlightActiveLineGutter(),
          syntaxHighlighting(previewHighlightStyle),
          lang,
          EditorView.contentAttributes.of({
            'aria-label': '文件内容',
            tabindex: '0',
          }),
          EditorView.theme({
            '&': {
              height: '100%',
              backgroundColor: 'transparent',
              color: 'var(--foreground)',
            },
            '.cm-scroller': {
              overflow: 'auto',
              fontFamily: 'monospace',
              fontSize: '13px',
            },
            '.cm-gutters': {
              // Sticky line numbers must mask text scrolling underneath them.
              backgroundColor: 'var(--surface-workspace)',
              color: 'var(--muted-foreground)',
              borderRight: '1px solid var(--border)',
            },
            '.cm-activeLineGutter': { backgroundColor: 'var(--muted)' },
            '&.cm-focused': { outline: 'none' },
          }),
          EditorView.updateListener.of((update) => {
            if (!update.selectionSet) return
            const { from, to } = update.state.selection.main
            if (from === to) {
              setBubble(null)
              callback.current?.(null)
              return
            }
            const selection = {
                    start: from,
                    end: to,
                    startLine: update.state.doc.lineAt(from).number,
                    endLine: update.state.doc.lineAt(Math.max(from, to - 1))
                      .number,
                    text: update.state.sliceDoc(from, to),
                  }
            callback.current?.(selection)
            const start = update.view.coordsAtPos(from)
            const end = update.view.coordsAtPos(to)
            const box = host.current?.getBoundingClientRect()
            if (start && end && box) {
              setBubble({ left: Math.max(8, Math.min(box.width - 132, ((start.left + end.right) / 2) - box.left - 66)), top: Math.max(8, start.top - box.top - 42), selection })
            }
          }),
        ],
      }),
    })
    return () => view.destroy()
  }, [content, language])
  return <div className="file-code-preview" ref={host}>
    {bubble && onAddSelection && <button type="button" className="file-selection-bubble" style={{ left: bubble.left, top: bubble.top }} onMouseDown={(event) => event.preventDefault()} onClick={() => { onAddSelection(bubble.selection); setBubble(null); callback.current?.(null) }}>引用选区</button>}
  </div>
}
