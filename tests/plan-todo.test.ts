import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createServer } from 'vite'

async function fixture(t: test.TestContext) {
  const dir = await mkdtemp(join(tmpdir(), 'sailor-plan-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const vite = await createServer({
    logLevel: 'silent',
    server: { middlewareMode: true },
    resolve: { alias: { '@shared': join(process.cwd(), 'src/shared') } },
  })
  t.after(() => vite.close())
  const storeModule = await vite.ssrLoadModule('/src/main/workspaces/WorkspaceStore.ts')
  const planModule = await vite.ssrLoadModule('/src/shared/planTodo.ts')
  const store = new storeModule.WorkspaceStore(join(dir, 'state.json'))
  const project = await store.addProject(dir)
  const chat = await store.createChat(project.id)
  await store.updateChat(chat.id, { runId: 'run-1', status: 'running' })
  return {
    store,
    chat,
    file: join(dir, 'state.json'),
    Store: storeModule.WorkspaceStore,
    plan: planModule,
  }
}

test('persists stable todo IDs, statuses, revision, and keeps completed steps on updates', async (t) => {
  const { store, chat, file, Store, plan } = await fixture(t)
  const first = plan.createPlanTodoList({
    revision: 1,
    steps: [
      { id: 'inspect', title: '检查现状', status: 'completed' },
      { id: 'implement', title: '实现功能', status: 'in-progress' },
    ],
  })
  await store.updatePlan(chat.id, 'run-1', first)
  const second = plan.createPlanTodoList({
    revision: 2,
    steps: [
      { id: 'inspect', title: '检查现状', status: 'pending' },
      { id: 'implement', title: '实现功能', status: 'completed' },
    ],
  })
  await store.updatePlan(chat.id, 'run-1', second)
  const restarted = new Store(file)
  const saved = await restarted.getChat(chat.id)
  assert.equal(saved.plan?.revision, 2)
  assert.equal(saved.plan?.steps.find((step: any) => step.id === 'inspect')?.status, 'completed')
  assert.equal(saved.plan?.steps.find((step: any) => step.id === 'implement')?.status, 'completed')
})

test('rejects stale revisions, foreign runs, duplicate IDs, and unknown states', async (t) => {
  const { store, chat, plan } = await fixture(t)
  assert.throws(() =>
    plan.createPlanTodoList({
      revision: 1,
      steps: [{ id: 'same', title: 'A', status: 'unknown' }],
    }),
  )
  assert.throws(
    () =>
      plan.createPlanTodoList({
        revision: 1,
        steps: [
          { id: 'same', title: 'A', status: 'pending' },
          { id: 'same', title: 'B', status: 'pending' },
        ],
      }),
    /唯一|duplicate/i,
  )
  const first = plan.createPlanTodoList({
    revision: 1,
    steps: [{ id: 'a', title: 'A', status: 'pending' }],
  })
  await store.updatePlan(chat.id, 'run-1', first)
  await assert.rejects(
    store.updatePlan(chat.id, 'other-run', { ...first, revision: 2 }),
    /运行|run/i,
  )
  await assert.rejects(store.updatePlan(chat.id, 'run-1', first), /revision|版本|过期/i)
})

test('update_plan host tool persists revisions through the active run callback', async (t) => {
  const { plan } = await fixture(t)
  const vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true } })
  t.after(() => vite.close())
  const { createUpdatePlanTool } = await vite.ssrLoadModule('/src/main/agent/pi/updatePlanTool.ts')
  const writes: unknown[] = []
  const tools = createUpdatePlanTool({
    updatePlan: async (value: unknown) => {
      writes.push(value)
      return value
    },
  })
  const input = plan.createPlanTodoList({
    revision: 1,
    steps: [{ id: 'read', title: '阅读代码', status: 'in-progress' }],
  })
  const output = await tools.update_plan.execute(input, { toolCallId: 'call-plan' })
  assert.deepEqual(writes, [input])
  assert.deepEqual(output, input)
})
