import { OpenAIProvider } from './openaiProvider.js'

export class ProviderManager {
  constructor() {
    this._providers = new Map()
    this._activeProviderName = null
    this._loadSaved()
  }

  get activeProvider() {
    if (!this._activeProviderName) return null
    return this._providers.get(this._activeProviderName) || null
  }

  get activeProviderName() { return this._activeProviderName }
  get providerNames() { return [...this._providers.keys()] }
  get providers() { return new Map(this._providers) }

  register(name, provider) {
    this._providers.set(name, provider)
    if (!this._activeProviderName) {
      this._activeProviderName = name
    }
  }

  setActive(name) {
    if (!this._providers.has(name)) throw new Error(`Provider not found: ${name}`)
    this._activeProviderName = name
  }

  remove(name) {
    this._providers.delete(name)
    if (this._activeProviderName === name) {
      this._activeProviderName = this._providers.size > 0 ? this._providers.keys().next().value : null
    }
  }

  getProvider(name) {
    return this._providers.get(name) || null
  }

  async generate(opts) {
    if (!this.activeProvider) throw new Error('No active AI provider configured')
    return this.activeProvider.generate(opts)
  }

  _loadSaved() {
    const saved = OpenAIProvider.load()
    if (saved) {
      this.register(saved.name, saved)
    }
    const defaults = [
      { name: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
      { name: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-3-haiku-20240307' },
    ]
    for (const def of defaults) {
      if (!this._providers.has(def.name)) {
        const provider = new OpenAIProvider({ ...def, enabled: def.name === 'openai' })
        this.register(def.name, provider)
      }
    }
  }

  toConfig() {
    const configs = {}
    for (const [name, provider] of this._providers) {
      configs[name] = {
        ...provider.config,
        apiKey: provider.config.apiKey ? '[stored]' : '',
      }
    }
    return { activeProvider: this._activeProviderName, providers: configs }
  }

  static createDefault() {
    const manager = new ProviderManager()
    return manager
  }
}
