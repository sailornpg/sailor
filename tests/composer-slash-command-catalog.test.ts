import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createServer } from 'vite'

test('command catalog exposes Sailor and validated workspace Skills without file content', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'sailor-slash-commands-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, '.agents/skills/review'), { recursive: true })
  await writeFile(
    join(root, '.agents/skills/review/SKILL.md'),
    '---\nname: review\ndescription: Review the current change\n---\nsecret skill instructions',
  )

  const vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true } })
  t.after(() => vite.close())
  const { WorkspaceToolScope } = await vite.ssrLoadModule(
    '/src/main/workspaces/WorkspaceToolScope.ts',
  )
  const { loadComposerSlashCommands } = await vite.ssrLoadModule(
    '/src/main/agent/pi/piSlashCommands.ts',
  )
  const scope = await WorkspaceToolScope.create(root, new AbortController().signal)
  const commands = await loadComposerSlashCommands(scope)

  assert.deepEqual(
    commands.map(({ id, label, description, source, icon, argumentHint }) => ({
      id,
      label,
      description,
      source,
      icon,
      argumentHint,
    })),
    [
      {
        id: 'btw',
        label: 'btw',
        description: '开启只读侧聊，追问当前回答',
        source: 'sailor',
        icon: 'MessageCircleQuestion',
        argumentHint: undefined,
      },
      {
        id: 'settings',
        label: 'settings',
        description: '打开 Sailor 设置',
        source: 'sailor',
        icon: 'Settings2',
        argumentHint: undefined,
      },
      {
        id: 'model',
        label: 'model',
        description: '打开模型与思考等级菜单',
        source: 'sailor',
        icon: 'Bot',
        argumentHint: undefined,
      },
      {
        id: 'new',
        label: 'new',
        description: '创建并切换到新会话',
        source: 'sailor',
        icon: 'Plus',
        argumentHint: undefined,
      },
      {
        id: 'quit',
        label: 'quit',
        description: '退出 Sailor 应用',
        source: 'sailor',
        icon: 'Power',
        argumentHint: undefined,
      },
      {
        id: 'reload',
        label: 'reload',
        description: '重新加载 Sailor 界面',
        source: 'sailor',
        icon: 'RefreshCcw',
        argumentHint: undefined,
      },
      {
        id: 'compact',
        label: 'compact',
        description: '压缩当前 Pi 会话上下文',
        source: 'sailor',
        icon: 'Minimize2',
        argumentHint: undefined,
      },
      {
        id: 'skill:review',
        label: 'skill:review',
        description: 'Review the current change',
        source: 'skill',
        icon: 'Sparkles',
        argumentHint: '[参数]',
      },
    ],
  )
  const serialized = JSON.stringify(commands)
  assert.doesNotMatch(serialized, /secret skill instructions/)
  assert.doesNotMatch(serialized, /SKILL\.md|\.agents\/skills/)
})
