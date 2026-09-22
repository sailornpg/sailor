import assert from 'node:assert/strict'
import test from 'node:test'
import { createAgentErrorFormatter, getAgentErrorMessage } from '../src/main/agent/getAgentErrorMessage.ts'

test('harness/Pi 内部错误对用户统一显示 agent 提示', () => {
  assert.equal(getAgentErrorMessage(new Error('Harness session pi stopped'), 'agent 运行失败。'), 'agent 运行失败。')
  assert.equal(getAgentErrorMessage(new Error('request failed'), 'agent 运行失败。'), 'request failed')
  const format = createAgentErrorFormatter('agent 运行失败。')
  assert.equal(format(new Error('Sandbox provider just-bash failed')), 'agent 运行失败。')
})
