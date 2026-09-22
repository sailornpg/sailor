import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { SettingsService } from '../src/main/settings/SettingsService.ts'
import { WorkspaceStore } from '../src/main/workspaces/WorkspaceStore.ts'

test('旧搜索配置不再暴露或解密，模型配置仍可加载', async () => {
  const root = await mkdtemp(join(tmpdir(), 'retired-settings-'))
  try {
    const path = join(root, 'settings.json')
    await writeFile(path, JSON.stringify({ version: 3, providers: [], activeModel: null, webSearch: { provider: 'tavily', encryptedApiKey: 'unused-legacy-value' } }))
    const service = new SettingsService(path, { encrypt: value => value, decrypt: () => { throw new Error('不应解密旧搜索凭据') } })
    assert.deepEqual(await service.getSnapshot(), { providers: [], activeModel: null })
    assert.equal('saveWebSearchProvider' in service, false)
    assert.equal('resolveWebSearchProvider' in service, false)
    await service.saveProvider({ id: 'qa', name: 'QA', baseUrl: 'https://example.com/v1', protocol: 'openai-completions', models: [] })
    assert.equal('webSearch' in JSON.parse(await readFile(path, 'utf8')), false)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('旧工作区执行开关被忽略且不可重新启用', async () => {
  const root = await mkdtemp(join(tmpdir(), 'retired-workspaces-'))
  try {
    const path = join(root, 'workspaces.json')
    await writeFile(path, JSON.stringify({ version: 1, projects: [], chats: [], activeChatId: null, collapsedProjectIds: [], shellExecutionEnabled: true }))
    const store = new WorkspaceStore(path)
    assert.equal('shellExecutionEnabled' in await store.snapshot(), false)
    await store.setPreferences({ shellExecutionEnabled: true } as never)
    assert.equal('shellExecutionEnabled' in JSON.parse(await readFile(path, 'utf8')), false)
    assert.equal('shellExecutionEnabled' in await store.snapshot(), false)
  } finally { await rm(root, { recursive: true, force: true }) }
})
