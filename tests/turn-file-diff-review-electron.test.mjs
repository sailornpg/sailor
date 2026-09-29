import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const root = fileURLToPath(new URL('..', import.meta.url))
const executeFile = promisify(execFile)
const env = { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' }
delete env.ELECTRON_RUN_AS_NODE

const result = await executeFile(
  'node',
  [join(root, 'tests/chat-file-diff-review-electron.test.mjs')],
  {
    cwd: root,
    env,
    encoding: 'utf8',
    timeout: 120000,
  },
)
assert.match(result.stdout, /PASS chat file diff review Electron smoke \(17 checks\)/)

const threadSource = readFileSync(
  join(root, 'src/renderer/src/components/assistant-ui/elements/thread.aui.tsx'),
  'utf8',
)
const cardSource = readFileSync(
  join(root, 'src/renderer/src/components/chat/review/TurnFileChangeCard.tsx'),
  'utf8',
)
const styles = readFileSync(join(root, 'src/renderer/src/styles/globals.css'), 'utf8')
assert.match(threadSource, /FileChangeCard/)
assert.match(threadSource, /turnId/)
assert.match(threadSource, /autoScroll=\{autoScroll\}/)
assert.match(threadSource, /setAutoScroll\(false\)/)
assert.match(threadSource, /scrollToBottomOnRunStart=\{false\}/)
assert.match(threadSource, /autoScrollPaused/)
assert.match(threadSource, /userResumedAtBottom/)
assert.match(threadSource, /onPointerCancel=\{handleViewportPointerUp\}/)
assert.match(threadSource, /closest\('\.aui-thread-scroll-to-bottom'\)/)
assert.doesNotMatch(threadSource, /overflow-y-scroll scroll-smooth/)
assert.doesNotMatch(threadSource, /messageStatus !== 'running'/)
assert.match(cardSource, /data-turn-file-card/)
assert.match(cardSource, /if \(!summary \|\| summary\.fileCount === 0\)/)
assert.doesNotMatch(cardSource, /loading \|\| !summary/)
assert.match(cardSource, /requestPanelOpen/)
assert.match(styles, /\.sailor-composer-review-slot \{[\s\S]*?width: 100%;/)
assert.match(styles, /\.sailor-composer-review-slot \{[\s\S]*?padding-bottom: 12px;/)
assert.match(cardSource, /data-turn-id/)
assert.match(cardSource, /查看本轮文件变更/)
assert.match(threadSource, /aui-thread-scroll-to-bottom[\s\S]*?relative/)
console.log('PASS turn file diff review Electron smoke (22 checks)')
