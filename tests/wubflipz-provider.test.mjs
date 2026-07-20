import { describe, it, before, mock } from 'node:test'
import assert from 'node:assert'

const basePath = process.cwd()

describe('OpenAIProvider', () => {
  it('exports OpenAIProvider class', async () => {
    const mod = await import(`${basePath}/src/wubflipz/providers/openaiProvider.js`)
    assert.ok(typeof mod.OpenAIProvider === 'function')
  })

  it('creates with default config', async () => {
    const { OpenAIProvider } = await import(`${basePath}/src/wubflipz/providers/openaiProvider.js`)
    const p = new OpenAIProvider()
    assert.strictEqual(p.name, 'openai')
    assert.strictEqual(p.config.baseUrl, 'https://api.openai.com/v1')
    assert.strictEqual(p.config.model, 'gpt-4o-mini')
  })

  it('creates with custom config', async () => {
    const { OpenAIProvider } = await import(`${basePath}/src/wubflipz/providers/openaiProvider.js`)
    const p = new OpenAIProvider({ name: 'custom', baseUrl: 'https://example.com', model: 'custom-model' })
    assert.strictEqual(p.name, 'custom')
    assert.strictEqual(p.config.baseUrl, 'https://example.com')
  })

  it('throws if disabled', async () => {
    const { OpenAIProvider } = await import(`${basePath}/src/wubflipz/providers/openaiProvider.js`)
    const p = new OpenAIProvider({ enabled: false })
    await assert.rejects(() => p.generate({ messages: [] }), /disabled/)
  })

  it('throws if no API key', async () => {
    const { OpenAIProvider } = await import(`${basePath}/src/wubflipz/providers/openaiProvider.js`)
    const p = new OpenAIProvider({ apiKey: '' })
    await assert.rejects(() => p.generate({ messages: [] }), /API key/)
  })

  it('updates config', async () => {
    const { OpenAIProvider } = await import(`${basePath}/src/wubflipz/providers/openaiProvider.js`)
    const p = new OpenAIProvider()
    p.updateConfig({ model: 'gpt-4', timeoutMs: 60000 })
    assert.strictEqual(p.config.model, 'gpt-4')
    assert.strictEqual(p.config.timeoutMs, 60000)
  })

  it('redacts authorization headers', async () => {
    const { OpenAIProvider } = await import(`${basePath}/src/wubflipz/providers/openaiProvider.js`)
    const p = new OpenAIProvider()
    const headers = { Authorization: 'Bearer sk-my-secret-key-12345', 'Content-Type': 'application/json' }
    const redacted = p._redactHeaders(headers)
    assert.ok(redacted.Authorization.includes('[REDACTED]'))
    assert.ok(!redacted.Authorization.includes('my-secret-key'))
  })

  it('rejects empty responses', async () => {
    const { OpenAIProvider } = await import(`${basePath}/src/wubflipz/providers/openaiProvider.js`)
    const p = new OpenAIProvider({ apiKey: 'test-key' })
    mock.method(global, 'fetch', () => {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ choices: [] }),
      })
    })
    await assert.rejects(() => p.generate({ messages: [] }), /Empty response/)
    mock.reset()
  })

  it('handles HTTP errors', async () => {
    const { OpenAIProvider } = await import(`${basePath}/src/wubflipz/providers/openaiProvider.js`)
    const p = new OpenAIProvider({ apiKey: 'test-key' })
    mock.method(global, 'fetch', () => {
      return Promise.resolve({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve('Invalid API key'),
      })
    })
    await assert.rejects(() => p.generate({ messages: [] }), /401/)
    assert.ok(p.lastError)
    mock.reset()
  })

  it('handles network errors', async () => {
    const { OpenAIProvider } = await import(`${basePath}/src/wubflipz/providers/openaiProvider.js`)
    const p = new OpenAIProvider({ apiKey: 'test-key' })
    mock.method(global, 'fetch', () => Promise.reject(new Error('Network failure')))
    await assert.rejects(() => p.generate({ messages: [] }), /Network/)
    mock.reset()
  })

  it('handles timeout', async () => {
    const { OpenAIProvider } = await import(`${basePath}/src/wubflipz/providers/openaiProvider.js`)
    const p = new OpenAIProvider({ apiKey: 'test-key', timeoutMs: 50 })
    mock.method(global, 'fetch', (url, opts) => {
      return new Promise((_, reject) => {
        const onAbort = () => reject(new DOMException('The operation was aborted', 'AbortError'))
        opts.signal.addEventListener('abort', onAbort, { once: true })
      })
    })
    await assert.rejects(
      () => p.generate({ messages: [] }),
      { name: 'TimeoutError' }
    )
    // Give the event loop a tick to clean up
    await new Promise(r => setTimeout(r, 10))
    mock.reset()
  })

  it('returns content from successful response', async () => {
    const { OpenAIProvider } = await import(`${basePath}/src/wubflipz/providers/openaiProvider.js`)
    const p = new OpenAIProvider({ apiKey: 'test-key' })
    mock.method(global, 'fetch', () => {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'Hello from AI' } }],
          model: 'gpt-4o',
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      })
    })
    const result = await p.generate({ messages: [{ role: 'user', content: 'Hi' }] })
    assert.strictEqual(result.content, 'Hello from AI')
    assert.strictEqual(result.model, 'gpt-4o')
    assert.ok(p.lastLatency > 0)
    mock.reset()
  })

  it('testConnection returns success on OK', async () => {
    const { OpenAIProvider } = await import(`${basePath}/src/wubflipz/providers/openaiProvider.js`)
    const p = new OpenAIProvider({ apiKey: 'test-key' })
    mock.method(global, 'fetch', () => {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'ok' } }],
          model: 'gpt-4o-mini',
        }),
      })
    })
    const result = await p.testConnection()
    assert.ok(result.success)
    assert.ok(result.latency !== undefined)
    mock.reset()
  })

  it('testConnection returns failure on error', async () => {
    const { OpenAIProvider } = await import(`${basePath}/src/wubflipz/providers/openaiProvider.js`)
    const p = new OpenAIProvider({ apiKey: 'test-key' })
    mock.method(global, 'fetch', () => Promise.reject(new Error('fail')))
    const result = await p.testConnection()
    assert.ok(!result.success)
    assert.ok(result.error)
    mock.reset()
  })
})

describe('ProviderManager', () => {
  it('exports ProviderManager class', async () => {
    const mod = await import(`${basePath}/src/wubflipz/providers/providerManager.js`)
    assert.ok(typeof mod.ProviderManager === 'function')
  })

  it('creates manager with default providers', async () => {
    const { ProviderManager } = await import(`${basePath}/src/wubflipz/providers/providerManager.js`)
    const m = new ProviderManager()
    assert.ok(m.providerNames.length >= 1)
  })

  it('registers and activates providers', async () => {
    const { ProviderManager } = await import(`${basePath}/src/wubflipz/providers/providerManager.js`)
    const { OpenAIProvider } = await import(`${basePath}/src/wubflipz/providers/openaiProvider.js`)
    const m = new ProviderManager()
    const p = new OpenAIProvider({ name: 'test-provider', apiKey: 'key', enabled: true })
    m.register('test-provider', p)
    assert.ok(m.providerNames.includes('test-provider'))
    m.setActive('test-provider')
    assert.strictEqual(m.activeProviderName, 'test-provider')
  })

  it('removes providers', async () => {
    const { ProviderManager } = await import(`${basePath}/src/wubflipz/providers/providerManager.js`)
    const { OpenAIProvider } = await import(`${basePath}/src/wubflipz/providers/openaiProvider.js`)
    const m = new ProviderManager()
    const p = new OpenAIProvider({ name: 'temp', apiKey: 'key' })
    m.register('temp', p)
    m.remove('temp')
    assert.ok(!m.providerNames.includes('temp'))
  })

  it('generate throws without active provider', async () => {
    const { ProviderManager } = await import(`${basePath}/src/wubflipz/providers/providerManager.js`)
    const { OpenAIProvider } = await import(`${basePath}/src/wubflipz/providers/openaiProvider.js`)
    const m = new ProviderManager()
    for (const name of m.providerNames) m.remove(name)
    assert.strictEqual(m.activeProvider, null, 'Should have no active provider')
    await assert.rejects(() => m.generate({ messages: [] }), /No active/)
  })

  it('throws for unknown provider activation', async () => {
    const { ProviderManager } = await import(`${basePath}/src/wubflipz/providers/providerManager.js`)
    const m = new ProviderManager()
    assert.throws(() => m.setActive('nonexistent'), /not found/)
  })

  it('toConfig returns serializable state', async () => {
    const { ProviderManager } = await import(`${basePath}/src/wubflipz/providers/providerManager.js`)
    const { OpenAIProvider } = await import(`${basePath}/src/wubflipz/providers/openaiProvider.js`)
    const m = new ProviderManager()
    const config = m.toConfig()
    assert.ok(config.activeProvider)
    assert.ok(config.providers)
  })

  it('createDefault returns manager', async () => {
    const { ProviderManager } = await import(`${basePath}/src/wubflipz/providers/providerManager.js`)
    const m = ProviderManager.createDefault()
    assert.ok(m instanceof ProviderManager)
  })
})
