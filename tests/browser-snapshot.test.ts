import assert from 'node:assert/strict'
import test from 'node:test'

import {
  bindRef,
  buildAccessibilitySnapshot,
  createRefTable,
  isInteractiveRole,
  pruneRefTable,
  resolveRef,
  type AxNodeInput,
  type RefTable,
} from '../src/main/browser/snapshot.ts'

function node(input: Partial<AxNodeInput> & { nodeId: string }): AxNodeInput {
  return {
    ignored: false,
    role: '',
    name: '',
    childIds: [],
    ...input,
  }
}

/** root > form > (textbox, button)，外加一段正文。 */
function pageFixture(): AxNodeInput[] {
  return [
    node({
      nodeId: '1',
      role: 'rootWebArea',
      name: 'Demo',
      childIds: ['2', '3'],
      backendDOMNodeId: 11,
    }),
    node({
      nodeId: '2',
      role: 'form',
      name: 'Sign in',
      childIds: ['4', '5', '6'],
      backendDOMNodeId: 21,
    }),
    node({ nodeId: '3', role: 'paragraph', childIds: ['7'], backendDOMNodeId: 31 }),
    node({ nodeId: '4', role: 'textbox', name: 'Email', backendDOMNodeId: 41 }),
    node({
      nodeId: '5',
      role: 'button',
      name: 'Continue',
      backendDOMNodeId: 51,
      properties: { disabled: true },
    }),
    node({ nodeId: '6', role: 'ignored', ignored: true, childIds: ['8'] }),
    node({ nodeId: '7', role: 'StaticText', name: 'Hello world', backendDOMNodeId: 71 }),
    node({ nodeId: '8', role: 'link', name: 'Forgot password', backendDOMNodeId: 81 }),
  ]
}

function snapshot(
  nodes: AxNodeInput[],
  table: RefTable,
  options: Partial<Parameters<typeof buildAccessibilitySnapshot>[2]> = {},
) {
  return buildAccessibilitySnapshot(nodes, table, {
    mode: 'all',
    maxChars: 10_000,
    depth: 15,
    ...options,
  })
}

test('interactive 模式只保留可交互元素，ignored 包装节点被提升', () => {
  const table = createRefTable()
  const result = snapshot(pageFixture(), table, { mode: 'interactive' })

  // ignored 节点自身不输出，但它的子 link 会被提升到同一层。
  assert.equal(
    result.text,
    [
      '    [ref_1] textbox "Email"',
      '    [ref_2] button "Continue" disabled',
      '    [ref_3] link "Forgot password"',
    ].join('\n'),
  )
  assert.equal(result.elementCount, 3)
  assert.equal(result.truncated, false)
})

test('all 模式带上正文，静态文本不分配 ref', () => {
  const table = createRefTable()
  const result = snapshot(pageFixture(), table)

  assert.match(result.text, /\[ref_1\] rootWebArea "Demo"/)
  assert.match(result.text, /\[ref_2\] form "Sign in"/)
  assert.match(result.text, /StaticText "Hello world"/)
  // 静态文本即使有后端节点也不进 ref 表：ref 只给能操作的东西。
  assert.doesNotMatch(result.text, /\[ref_\d+\] StaticText/)
  assert.match(result.text, / {4}StaticText "Hello world"/)
})

test('ref 号只增不减，同一节点跨快照复用同一个 ref', () => {
  const table = createRefTable()
  const first = snapshot(pageFixture(), table, { mode: 'interactive' })
  const second = snapshot(pageFixture(), table, { mode: 'interactive' })

  assert.equal(first.text, second.text)
  const emailRef = resolveRef(table, 'ref_1')
  assert.equal(emailRef?.backendDOMNodeId, 41)
  assert.equal(emailRef?.role, 'textbox')
  assert.equal(table.byRef.size, 3)
})

test('节点消失后 ref 变成 stale，剪枝不会把 ref 号让给别的节点', () => {
  const table = createRefTable()
  snapshot(pageFixture(), table, { mode: 'interactive' })
  pruneRefTable(table, new Set(['1', '2']))

  assert.equal(resolveRef(table, 'ref_1'), undefined)
  const rebound = bindRef(table, node({ nodeId: '9', role: 'button', name: 'New' }))
  assert.notEqual(rebound.ref, 'ref_1')
})

test('refId 聚焦只渲染子树，失效时报 focusStale', () => {
  const table = createRefTable()
  snapshot(pageFixture(), table, { mode: 'interactive' })

  const focused = snapshot(pageFixture(), table, { mode: 'interactive', refId: 'ref_1' })
  assert.equal(focused.focusStale, false)
  assert.equal(focused.text.trim(), '[ref_1] textbox "Email"')

  const stale = snapshot(pageFixture(), table, { mode: 'interactive', refId: 'ref_999' })
  assert.equal(stale.focusStale, true)
  assert.match(stale.text, /button "Continue"/)
})

test('depth 限制会剪掉更深的子树', () => {
  const table = createRefTable()
  const result = snapshot(pageFixture(), table, { mode: 'all', depth: 1 })

  assert.match(result.text, /\[ref_\d+\] form "Sign in"/)
  assert.doesNotMatch(result.text, /textbox "Email"/)
  assert.doesNotMatch(result.text, /Forgot password/)
})

test('超长输出按行截断并给出全量大小', () => {
  const nodes = [
    node({ nodeId: 'root', role: 'rootWebArea', childIds: ['a', 'b', 'c'] }),
    node({ nodeId: 'a', role: 'button', name: 'A'.repeat(40), backendDOMNodeId: 1 }),
    node({ nodeId: 'b', role: 'button', name: 'B'.repeat(40), backendDOMNodeId: 2 }),
    node({ nodeId: 'c', role: 'button', name: 'C'.repeat(40), backendDOMNodeId: 3 }),
  ]
  const table = createRefTable()
  const result = snapshot(nodes, table, { mode: 'interactive', maxChars: 60 })

  assert.equal(result.truncated, true)
  assert.ok(result.totalChars > 60)
  assert.match(result.text, /输出已截断/)
  const rendered = result.text.split('\n').filter((line) => /\[ref_\d+\]/.test(line))
  assert.equal(rendered.length, 1)
})

test('损坏的树（自引用 childIds）不会让遍历失控', () => {
  const table = createRefTable()
  const cyclic = [
    node({ nodeId: 'root', role: 'rootWebArea', childIds: ['root', 'self'] }),
    node({ nodeId: 'self', role: 'button', name: 'Loop', backendDOMNodeId: 7, childIds: ['root'] }),
  ]
  const result = snapshot(cyclic, table, { mode: 'interactive' })
  assert.match(result.text, /button "Loop"/)
  assert.equal(result.elementCount, 1)
})

test('isInteractiveRole 只认真正的可交互角色', () => {
  assert.equal(isInteractiveRole('button'), true)
  assert.equal(isInteractiveRole('textbox'), true)
  assert.equal(isInteractiveRole('paragraph'), false)
  assert.equal(isInteractiveRole('rootWebArea'), false)
})
