const STORAGE_KEY = 'wubflipz-provider-config'

export class OpenAIProvider {
  constructor(config = {}) {
    this._config = this._applyDefaults(config)
    this._lastError = null
    this._lastLatency = 0
    this._lastModel = null
  }

  _applyDefaults(config) {
    return {
      name: config.name || 'openai',
      baseUrl: config.baseUrl || 'https://api.openai.com/v1',
      model: config.model || 'gpt-4o-mini',
      apiKey: config.apiKey || '',
      timeoutMs: config.timeoutMs || 30000,
      maxTokens: config.maxTokens || 2048,
      temperature: config.temperature ?? 0.7,
      enabled: config.enabled !== false,
    }
  }

  get config() { return { ...this._config } }
  get lastError() { return this._lastError }
  get lastLatency() { return this._lastLatency }
  get lastModel() { return this._lastModel }
  get enabled() { return this._config.enabled }
  get name() { return this._config.name }

  updateConfig(updates) {
    this._config = this._applyDefaults({ ...this._config, ...updates })
    this.save()
  }

  _redactHeaders(headers) {
    const h = { ...headers }
    if (h.Authorization) h.Authorization = h.Authorization.slice(0, 12) + '...[REDACTED]'
    if (h['api-key']) h['api-key'] = '...[REDACTED]'
    return h
  }

  async generate({ messages, signal, temperature, schema }) {
    if (!this._config.enabled) throw new Error('AI provider is disabled')
    if (!this._config.apiKey) throw new Error('No API key configured')

    const startTime = performance.now()
    this._lastError = null

    const body = {
      model: this._config.model,
      messages,
      temperature: temperature ?? this._config.temperature,
      max_tokens: this._config.maxTokens,
    }

    if (schema) {
      body.response_format = { type: 'json_object' }
    }

    const url = `${this._config.baseUrl.replace(/\/+$/, '')}/chat/completions`
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this._config.apiKey}`,
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      if (!controller.signal.aborted) controller.abort()
    }, this._config.timeoutMs)

    const combinedSignal = signal || controller.signal
    if (signal) {
      signal.addEventListener('abort', () => {
        if (!controller.signal.aborted) controller.abort()
      }, { once: true })
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: combinedSignal,
      })

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '')
        const msg = `Provider returned ${response.status}: ${response.statusText}${errorBody ? ` - ${errorBody.slice(0, 200)}` : ''}`
        this._lastError = msg
        throw new Error(msg)
      }

      const data = await response.json()
      this._lastLatency = performance.now() - startTime
      this._lastModel = data.model || this._config.model

      if (!data.choices || data.choices.length === 0) {
        this._lastError = 'No choices in response'
        throw new Error('Empty response from provider')
      }

      const choice = data.choices[0]
      const content = choice.message?.content || ''

      return { content, model: data.model, usage: data.usage }
    } catch (err) {
      if (err.name === 'AbortError') {
        this._lastError = 'Request timed out or was cancelled'
        throw new DOMException('Provider request timed out or was cancelled', 'TimeoutError')
      }
      this._lastError = err.message
      throw err
    } finally {
      clearTimeout(timeoutId)
    }
  }

  async testConnection() {
    try {
      const result = await this.generate({
        messages: [
          { role: 'system', content: 'Respond with a single word: ok' },
          { role: 'user', content: 'Confirm connectivity' },
        ],
      })
      return { success: true, latency: this._lastLatency, model: this._lastModel }
    } catch (err) {
      return { success: false, error: err.message, latency: this._lastLatency }
    }
  }

  async simulateFailure() {
    const result = await this.testConnection()
    if (!result.success) return result
    try {
      await this.generate({
        messages: [
          { role: 'system', content: 'Respond with this exact JSON: {"status": "ok"}' },
          { role: 'user', content: 'Test structured output' },
        ],
        schema: true,
      })
      return { success: true, latency: this._lastLatency, model: this._lastModel, fallbackTested: false }
    } catch (err) {
      return { success: false, error: err.message, latency: this._lastLatency, fallbackTested: true }
    }
  }

  save() {
    try {
      const toStore = {
        ...this._config,
        apiKey: this._config.apiKey ? 'stored' : '',
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore))
    } catch {}
  }

  static load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return null
      const data = JSON.parse(raw)
      if (data.apiKey === 'stored') {
        data.apiKey = ''
      }
      return new OpenAIProvider(data)
    } catch {
      return null
    }
  }

  static clearStored() {
    try { localStorage.removeItem(STORAGE_KEY) } catch {}
  }
}
