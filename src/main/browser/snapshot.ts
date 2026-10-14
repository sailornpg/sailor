/**
 * 把 CDP 可访问性树转成模型可读的文本快照。
 *
 * 这一层是纯函数：输入归一化后的 AX 节点，输出文本与 ref 绑定，
 * 不触碰 Electron、不发起 CDP 请求，因此可以直接用 node --test 覆盖。
 *
 * ref 表按 tab 长期持有：ref 号只增不减，已发出的 ref 在同一页面存活期间始终
 * 指向同一个后端节点；节点消失后 ref 变为 stale，由调用方报 NOT_FOUND。
 */

export interface AxNodeInput {
  nodeId: string
  ignored: boolean
  /** 例如 rootWebArea / button / StaticText；空的 role 视为结构节点。 */
  role: string
  name: string
  value?: string
  description?: string
  childIds: string[]
  backendDOMNodeId?: number
  properties?: Record<string, string | number | boolean>
}

export interface RefBinding {
  ref: string
  nodeId: string
  backendDOMNodeId?: number
  role: string
  name: string
}

export interface RefTable {
  readonly byRef: Map<string, RefBinding>
  readonly byNodeId: Map<string, string>
  next: number
}

export function createRefTable(): RefTable {
  return { byRef: new Map(), byNodeId: new Map(), next: 1 }
}

export function bindRef(table: RefTable, node: AxNodeInput): RefBinding {
  const existingRef = table.byNodeId.get(node.nodeId)
  if (existingRef !== undefined) {
    const existing = table.byRef.get(existingRef)
    if (existing !== undefined) {
      const refreshed: RefBinding = {
        ...existing,
        backendDOMNodeId: node.backendDOMNodeId ?? existing.backendDOMNodeId,
        role: node.role,
        name: node.name,
      }
      table.byRef.set(existingRef, refreshed)
      return refreshed
    }
  }
  const ref = `ref_${table.next}`
  table.next += 1
  const binding: RefBinding = {
    ref,
    nodeId: node.nodeId,
    backendDOMNodeId: node.backendDOMNodeId,
    role: node.role,
    name: node.name,
  }
  table.byRef.set(ref, binding)
  table.byNodeId.set(node.nodeId, ref)
  return binding
}

export function resolveRef(table: RefTable, ref: string): RefBinding | undefined {
  return table.byRef.get(ref)
}

/** 树结构变化后清掉不再存在的节点，避免 ref 表无限增长。 */
export function pruneRefTable(table: RefTable, liveNodeIds: ReadonlySet<string>): void {
  for (const [ref, binding] of [...table.byRef]) {
    if (liveNodeIds.has(binding.nodeId)) continue
    table.byRef.delete(ref)
    table.byNodeId.delete(binding.nodeId)
  }
}

export interface SnapshotOptions {
  mode: 'interactive' | 'all'
  maxChars: number
  depth: number
  /** 只渲染该 ref 及其子树。 */
  refId?: string
}

export interface SnapshotResult {
  text: string
  totalChars: number
  truncated: boolean
  elementCount: number
  /** 请求了 refId，但当前树里已经没有该节点。 */
  focusStale: boolean
}

export const SNAPSHOT_DEFAULTS = {
  maxChars: 50_000,
  depth: 15,
  maxElements: 20_000,
} as const

/**
 * 元素的判定只跟角色有关：这些角色是用户能点、能输入、能选的东西。
 * 判定结果同时用于 interactive 过滤和"是否值得分配 ref"。
 */
const INTERACTIVE_ROLES = new Set([
  'button',
  'checkbox',
  'combobox',
  'disclosureTriangle',
  'gridcell',
  'link',
  'listbox',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'radio',
  'searchbox',
  'slider',
  'spinbutton',
  'switch',
  'tab',
  'textbox',
  'treeitem',
])

/** 纯结构或噪声角色：只有在带名字时才值得输出。 */
const STRUCTURAL_ROLES = new Set([
  '',
  'none',
  'generic',
  'presentation',
  'ignored',
  'inlineTextBox',
  'LineBreak',
  'listMarker',
])

/** 文本型角色：能读、但不可作为操作目标，因此不分配 ref。 */
const TEXT_ROLES = new Set(['StaticText', 'inlineTextBox', 'LineBreak', 'listMarker'])

export function isInteractiveRole(role: string): boolean {
  return INTERACTIVE_ROLES.has(role)
}

function propertyFlag(node: AxNodeInput, name: string): string | undefined {
  const raw = node.properties?.[name]
  if (raw === undefined) return undefined
  if (raw === true) return name
  if (raw === false) return undefined
  const text = String(raw)
  return text === '' || text === 'false' ? undefined : `${name}=${text}`
}

function describe(node: AxNodeInput): string | undefined {
  const role = node.role
  const name = node.name.trim()
  if (STRUCTURAL_ROLES.has(role) && name === '') return undefined
  if (role === 'StaticText' && name === '') return undefined

  const parts: string[] = []
  parts.push(role === '' ? 'node' : role)
  if (name !== '') parts.push(`"${name}"`)
  const value = node.value?.trim()
  if (value !== undefined && value !== '' && value !== name) parts.push(`value="${value}"`)
  for (const flag of [
    propertyFlag(node, 'disabled'),
    propertyFlag(node, 'checked'),
    propertyFlag(node, 'expanded'),
    propertyFlag(node, 'focused'),
    propertyFlag(node, 'required'),
    propertyFlag(node, 'readonly'),
  ]) {
    if (flag !== undefined) parts.push(flag)
  }
  return parts.join(' ')
}

/**
 * 生成快照文本。忽略的节点自身不输出，但它的子树会被提升到同一层，
 * 否则大量 ignored 包装节点会让可访问性树在文本层丢内容。
 */
export function buildAccessibilitySnapshot(
  nodes: readonly AxNodeInput[],
  table: RefTable,
  options: SnapshotOptions,
): SnapshotResult {
  const byId = new Map(nodes.map((node) => [node.nodeId, node]))
  const childIds = new Set<string>()
  for (const node of nodes) for (const child of node.childIds) childIds.add(child)

  let roots: AxNodeInput[] = nodes.filter((node) => !childIds.has(node.nodeId))
  let focusStale = false

  // 环形 childIds（页面结构损坏或 AX 缓存异常）会让"没有父节点"的判定落空，
  // 这里退回 rootWebArea，再退回第一个节点，保证至少渲染一棵真实的子树。
  if (roots.length === 0) {
    const rootWebArea = nodes.find((node) => node.role === 'rootWebArea')
    const fallback = rootWebArea ?? nodes[0]
    if (fallback !== undefined) roots = [fallback]
  }

  if (options.refId !== undefined) {
    const binding = resolveRef(table, options.refId)
    const focused = binding === undefined ? undefined : byId.get(binding.nodeId)
    if (focused === undefined) {
      focusStale = true
      const rootWebArea = nodes.find((node) => node.role === 'rootWebArea')
      roots = rootWebArea ? [rootWebArea] : roots
    } else {
      roots = [focused]
    }
  }

  const liveNodeIds = new Set(nodes.map((node) => node.nodeId))
  pruneRefTable(table, liveNodeIds)

  const lines: string[] = []
  let elementCount = 0
  let overBudget = false

  const walk = (node: AxNodeInput, level: number, ancestors: ReadonlySet<string>): void => {
    if (overBudget || elementCount >= SNAPSHOT_DEFAULTS.maxElements) return
    if (ancestors.has(node.nodeId)) return

    const nextAncestors = new Set(ancestors)
    nextAncestors.add(node.nodeId)
    const withinDepth = level <= options.depth

    if (!node.ignored && withinDepth) {
      const label = describe(node)
      const interactive = isInteractiveRole(node.role)
      const keep = options.mode === 'all' ? label !== undefined : interactive && label !== undefined
      if (keep && label !== undefined) {
        const assignRef =
          !TEXT_ROLES.has(node.role) && (interactive || node.backendDOMNodeId !== undefined)
        const binding = assignRef ? bindRef(table, node) : undefined
        const prefix =
          binding === undefined
            ? ' '.repeat(level * 2)
            : `${' '.repeat(level * 2)}[${binding.ref}] `
        lines.push(`${prefix}${label}`)
        elementCount += 1
        if (lines.length > SNAPSHOT_DEFAULTS.maxElements) overBudget = true
      }
    }

    if (overBudget) return
    for (const childId of node.childIds) {
      const child = byId.get(childId)
      if (child === undefined) continue
      walk(child, node.ignored ? level : level + 1, nextAncestors)
    }
  }

  for (const root of roots) walk(root, 0, new Set())

  const body = lines.join('\n')
  const totalChars = body.length
  if (totalChars <= options.maxChars) {
    return { text: body, totalChars, truncated: false, elementCount, focusStale }
  }

  const clipped: string[] = []
  let used = 0
  for (const line of lines) {
    const cost = line.length + (clipped.length === 0 ? 0 : 1)
    if (used + cost > options.maxChars) break
    clipped.push(line)
    used += cost
  }
  const notice = `\n… 输出已截断：完整快照约 ${totalChars} 字符，共 ${elementCount} 个元素。可用 maxChars 提高上限，或用 refId/depth 聚焦到局部。`
  return {
    text: `${clipped.join('\n')}${notice}`,
    totalChars,
    truncated: true,
    elementCount,
    focusStale,
  }
}
