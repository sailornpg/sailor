import { SlashCommandIcon } from './SlashCommandItems'
import {
  formatComposerDirectiveLabel,
  getComposerDirectiveParts,
  type ComposerDirectiveSelection,
} from './composerDirective'

interface ComposerDirectiveHighlightProps {
  text: string
  selection?: ComposerDirectiveSelection
  caretPosition?: number
  caretIsCollapsed?: boolean
  focused?: boolean
  scrollTop?: number
  scrollLeft?: number
}

function TextWithCaret({
  text,
  position,
  showCaret,
}: {
  text: string
  position: number
  showCaret: boolean
}) {
  const safePosition = Math.max(0, Math.min(text.length, position))
  return (
    <>
      {text.slice(0, safePosition)}
      {showCaret && (
        <span className="sailor-composer-directive-caret" data-composer-directive-caret />
      )}
      {text.slice(safePosition)}
    </>
  )
}

export function ComposerDirectiveHighlight({
  text,
  selection,
  caretPosition,
  caretIsCollapsed = true,
  focused = false,
  scrollTop = 0,
  scrollLeft = 0,
}: ComposerDirectiveHighlightProps) {
  const parts = getComposerDirectiveParts(text, selection)
  if (!parts || !selection) return null
  const directiveOffset = parts.before.length
  const directiveEnd = directiveOffset + selection.literal.length
  const position = caretPosition ?? directiveEnd + (parts.after.startsWith(' ') ? 1 : 0)
  const caretBeforeToken = position <= directiveOffset
  const caretInToken = position > directiveOffset && position < directiveEnd
  const caretAfterToken = position >= directiveEnd

  return (
    <div
      aria-hidden="true"
      className="sailor-composer-directive-layer"
      data-composer-directive-layer
    >
      <div
        className="sailor-composer-directive-content"
        style={{ transform: `translate(${-scrollLeft}px, ${-scrollTop}px)` }}
      >
        <TextWithCaret
          text={parts.before}
          position={position}
          showCaret={focused && caretIsCollapsed && caretBeforeToken}
        />
        <span
          className="sailor-composer-directive-token"
          data-composer-directive-id={selection.command.id}
          data-composer-directive-token
        >
          <SlashCommandIcon
            command={selection.command}
            className="sailor-composer-directive-icon"
          />
          <span data-composer-directive-label>
            {formatComposerDirectiveLabel(selection.command)}
          </span>
        </span>
        {focused && caretIsCollapsed && caretInToken && (
          <span className="sailor-composer-directive-caret" data-composer-directive-caret />
        )}
        <TextWithCaret
          text={parts.after}
          position={position - directiveEnd}
          showCaret={focused && caretIsCollapsed && caretAfterToken}
        />
      </div>
    </div>
  )
}
