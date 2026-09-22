import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
Object.assign(globalThis, { window: dom.window, document: dom.window.document })
const { renderMarkdown, ansiToHtml } = await import('../src/views/plugin/saipackage/utils/render')
const { streamTerminal } = await import('../src/views/plugin/saipackage/utils/terminal-stream')

test('store descriptions remove active HTML and unsafe URL protocols', () => {
  const payloads = [
    '<img src=x onerror="window.auditMarker=1">',
    '<svg onload="window.auditMarker=1"></svg>',
    '<a href="javascript:alert(1)">click</a>',
    '[click](javascript:alert)',
    '<a href="jav&#x61;script:alert(1)">click</a>',
    '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
    '[click](https://example.test/" onclick="alert)',
    '<math><mtext><img src=x onerror=alert(1)></mtext></math>'
  ]
  for (const payload of payloads) {
    const container = document.createElement('div')
    container.innerHTML = renderMarkdown(payload)
    assert.equal(container.querySelector('script,iframe,svg,math,img'), null)
    for (const element of container.querySelectorAll('*')) {
      for (const attribute of element.attributes) {
        assert.ok(!attribute.name.startsWith('on'))
        if (attribute.name === 'href') assert.ok(!/javascript:|data:/i.test(attribute.value))
      }
    }
  }
})

test('safe markdown formatting and HTTPS links are retained', () => {
  const html = renderMarkdown('# Title\n**bold** [docs](https://example.test/docs)')
  assert.match(html, /<h1>Title<\/h1>/)
  assert.match(html, /<strong>bold<\/strong>/)
  assert.match(html, /href="https:\/\/example.test\/docs"/)
})

test('terminal output displays HTML as text while preserving ANSI colours', () => {
  const payload = '<img src=x onerror="alert(1)"> & text'
  const container = document.createElement('div')
  container.innerHTML = ansiToHtml(`\u001b[31m${payload}\u001b[0m`)
  assert.equal(container.querySelector('img'), null)
  assert.equal(container.textContent, payload)
  assert.equal(container.querySelector('span')?.style.color, 'red')
})

const streamOptions = () => ({
  baseUrl: '/api',
  token: 'test-only-token',
  command: 'npm.install',
  uuid: 'test-uuid',
  extend: 'module-install:test',
  signal: new AbortController().signal
})

test('terminal uses POST and a header token, parses fragmented UTF-8 SSE', async () => {
  const messages: string[] = []
  let calls = 0
  const bytes = new TextEncoder().encode('data: {"data":"你好","uuid":"test-uuid"}\r\n\r\n')
  await streamTerminal({
    ...streamOptions(),
    onmessage: (event) => messages.push(event.data),
    fetch: async (url, init) => {
      calls++
      assert.equal(url, '/api/app/saipackage/index/terminal')
      assert.equal(init?.method, 'POST')
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer test-only-token')
      assert.ok(!String(init?.body).includes('test-only-token'))
      const stream = new ReadableStream({
        start(controller) {
          for (let i = 0; i < bytes.length; i++) controller.enqueue(bytes.slice(i, i + 1))
          controller.close()
        }
      })
      return new Response(stream, { headers: { 'content-type': 'text/event-stream' } })
    }
  })
  assert.equal(calls, 1)
  assert.equal(messages.length, 1)
  assert.equal(JSON.parse(messages[0]).data, '你好')
})

test('failed terminal requests never replay a command', async () => {
  for (const status of [401, 403, 500]) {
    let calls = 0
    await assert.rejects(
      streamTerminal({
        ...streamOptions(),
        onmessage: () => {},
        fetch: async () => {
          calls++
          return new Response('', { status })
        }
      })
    )
    assert.equal(calls, 1)
  }
})

test('network failures never reconnect a command', async () => {
  let calls = 0
  await assert.rejects(
    streamTerminal({
      ...streamOptions(),
      onmessage: () => {},
      fetch: async () => {
        calls++
        throw new Error('disconnected')
      }
    })
  )
  assert.equal(calls, 1)
})
