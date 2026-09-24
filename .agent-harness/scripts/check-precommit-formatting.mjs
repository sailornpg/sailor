import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const temp = mkdtempSync(join(tmpdir(), 'sailor-precommit-'))
const staged = join(root, '.precommit-format-smoke.ts')
const unstaged = join(root, '.precommit-format-unstaged.ts')
const invalidJs = join(root, '.precommit-invalid.ts')
const invalidCss = join(root, '.precommit-invalid.css')
const index = join(temp, 'index')
const env = { ...process.env, GIT_INDEX_FILE: index }
let createdStaged = false
let createdUnstaged = false
let createdInvalidJs = false
let createdInvalidCss = false

function run(command, args) {
  return execFileSync(command, args, { cwd: root, env, encoding: 'utf8' })
}

try {
  assert.equal(existsSync(staged), false, 'Smoke test fixture path already exists')
  assert.equal(existsSync(unstaged), false, 'Smoke test fixture path already exists')
  assert.equal(existsSync(invalidJs), false, 'Smoke test fixture path already exists')
  assert.equal(existsSync(invalidCss), false, 'Smoke test fixture path already exists')
  run('git', ['read-tree', 'HEAD'])
  writeFileSync(staged, 'const   answer={value:"ok"}\n')
  createdStaged = true
  writeFileSync(unstaged, 'const   untouched={value:"keep"}\n')
  createdUnstaged = true
  run('git', ['add', '.precommit-format-smoke.ts'])

  run('sh', ['.husky/pre-commit'])

  assert.equal(
    run('git', ['show', ':.precommit-format-smoke.ts']),
    "const answer = { value: 'ok' }\n",
  )
  assert.equal(readFileSync(staged, 'utf8'), "const answer = { value: 'ok' }\n")
  assert.equal(readFileSync(unstaged, 'utf8'), 'const   untouched={value:"keep"}\n')
  assert.equal(run('git', ['diff', '--cached', '--name-only']).trim(), '.precommit-format-smoke.ts')
  run('git', ['read-tree', 'HEAD'])

  writeFileSync(invalidJs, 'debugger\n')
  createdInvalidJs = true
  run('git', ['add', '.precommit-invalid.ts'])
  assert.throws(() => run('sh', ['.husky/pre-commit']), { status: 1 })
  run('git', ['read-tree', 'HEAD'])

  writeFileSync(invalidCss, '.invalid { colour: red; }\n')
  createdInvalidCss = true
  run('git', ['add', '.precommit-invalid.css'])
  assert.throws(() => run('sh', ['.husky/pre-commit']), { status: 1 })
  console.log('Staged formatting passed; ESLint and Stylelint violations blocked the hook.')
} finally {
  if (createdStaged) unlinkSync(staged)
  if (createdUnstaged) unlinkSync(unstaged)
  if (createdInvalidJs) unlinkSync(invalidJs)
  if (createdInvalidCss) unlinkSync(invalidCss)
  rmSync(temp, { recursive: true, force: true })
}
