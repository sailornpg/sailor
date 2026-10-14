import assert from 'node:assert/strict'
import test from 'node:test'

import {
  browserTargetFromInput,
  isAllowedBrowserUrl,
  isBrowserHistoryTarget,
} from '../src/shared/browser.ts'

test('back / forward 解析成历史意图，大小写不敏感', () => {
  assert.deepEqual(browserTargetFromInput('back'), {
    ok: true,
    target: { kind: 'history', direction: 'back' },
  })
  assert.deepEqual(browserTargetFromInput('  FORWARD '), {
    ok: true,
    target: { kind: 'history', direction: 'forward' },
  })
  assert.equal(isBrowserHistoryTarget('back'), true)
  assert.equal(isBrowserHistoryTarget('backwards'), false)
})

test('裸域名补 https，本地回环补 http', () => {
  assert.deepEqual(browserTargetFromInput('example.com'), {
    ok: true,
    target: { kind: 'url', url: 'https://example.com/' },
  })
  assert.deepEqual(browserTargetFromInput('docs.example.com/a?b=1'), {
    ok: true,
    target: { kind: 'url', url: 'https://docs.example.com/a?b=1' },
  })
  assert.deepEqual(browserTargetFromInput('localhost:5173'), {
    ok: true,
    target: { kind: 'url', url: 'http://localhost:5173/' },
  })
  assert.deepEqual(browserTargetFromInput('127.0.0.1:3000/app'), {
    ok: true,
    target: { kind: 'url', url: 'http://127.0.0.1:3000/app' },
  })
})

test('显式协议按原样保留，about:blank 可用', () => {
  assert.deepEqual(browserTargetFromInput('http://example.com/x'), {
    ok: true,
    target: { kind: 'url', url: 'http://example.com/x' },
  })
  assert.deepEqual(browserTargetFromInput(' about:blank '), {
    ok: true,
    target: { kind: 'url', url: 'about:blank' },
  })
})

test('危险协议与带凭据的地址一律拒绝', () => {
  const rejected = [
    'file:///etc/passwd',
    'javascript:alert(1)',
    'data:text/html,<h1>x</h1>',
    'devtools://devtools/bundled/inspector.html',
    'blob:https://example.com/abc',
    'chrome://settings',
    'ws://example.com/socket',
    'http://user:secret@example.com/',
  ]
  for (const input of rejected) {
    const result = browserTargetFromInput(input)
    assert.equal(result.ok, false, `应拒绝 ${input}`)
    if (!result.ok) assert.match(result.reason, /只允许|不能带|无法/)
  }
})

test('相对路径与空输入不会被猜测成站点', () => {
  for (const input of ['', '   ', '/foo/bar', './index.html', 'foo/bar']) {
    assert.equal(browserTargetFromInput(input).ok, false, `应拒绝 ${JSON.stringify(input)}`)
  }
})

test('isAllowedBrowserUrl 是 main 侧最后一道关', () => {
  assert.equal(isAllowedBrowserUrl('https://example.com/'), true)
  assert.equal(isAllowedBrowserUrl('http://localhost:5183/'), true)
  assert.equal(isAllowedBrowserUrl('about:blank'), true)
  assert.equal(isAllowedBrowserUrl('file:///tmp/x'), false)
  assert.equal(isAllowedBrowserUrl('not a url'), false)
  assert.equal(isAllowedBrowserUrl('https://token@example.com/'), false)
})

test('补全后的地址本身也过白名单校验', () => {
  const result = browserTargetFromInput('example.com/path#hash')
  assert.equal(result.ok, true)
  if (result.ok && result.target.kind === 'url') {
    assert.equal(isAllowedBrowserUrl(result.target.url), true)
    assert.equal(result.target.url, 'https://example.com/path#hash')
  }
})
