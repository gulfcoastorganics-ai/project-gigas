import { ProviderManager } from '../providers/providerManager.js'
import { OpenAIProvider } from '../providers/openaiProvider.js'

export function renderProviderConfig(container, manager) {
  if (!manager) manager = new ProviderManager()

  container.innerHTML = `
    <div class="wz-provider-config">
      <h2 class="wz-section-title">AI Provider</h2>
      <p class="wz-muted" style="font-size:12px;margin:0 0 1rem">
        Configure an AI provider for blueprint generation and natural-language editing.
        The deterministic local fallback is always available.
      </p>
      <div id="wz-provider-list"></div>
      <div id="wz-provider-editor" style="margin-top:1rem"></div>
      <div id="wz-provider-status" class="wz-status" style="margin-top:0.5rem" hidden></div>
      <div class="wz-button-row" style="margin-top:1rem">
        <button class="wz-btn wz-btn-secondary" id="wz-provider-add-btn">+ Add Provider</button>
        <button class="wz-btn wz-btn-secondary" id="wz-provider-test-btn">Test Connection</button>
        <button class="wz-btn wz-btn-secondary" id="wz-provider-clear-btn">Clear Stored Keys</button>
      </div>
      <div class="wz-warning-box" style="margin-top:1rem;padding:8px 12px;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:4px;font-size:11px;color:var(--wz-warn)">
        ⚠ API keys are stored in browser localStorage. For production, use server-side environment variables or a backend proxy.
      </div>
    </div>
  `

  _renderProviderList(container, manager)
  _setupListeners(container, manager)

  if (manager.activeProvider) {
    _renderProviderEditor(container, manager, manager.activeProvider)
  }
}

function _renderProviderList(container, manager) {
  const listEl = container.querySelector('#wz-provider-list')
  if (!listEl) return

  listEl.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:6px">
      ${manager.providerNames.map(name => {
        const provider = manager.getProvider(name)
        const isActive = name === manager.activeProviderName
        const status = provider?.enabled ? (isActive ? 'Active' : 'Inactive') : 'Disabled'
        const color = provider?.enabled ? (isActive ? 'var(--wz-accent,#10b981)' : 'var(--wz-text-muted,#888)') : 'var(--wz-danger,#ef4444)'
        return `<button class="wz-provider-chip" data-name="${name}" style="display:flex;align-items:center;gap:4px;padding:4px 10px;border:1px solid ${color};border-radius:12px;background:${isActive ? 'rgba(16,185,129,0.1)' : 'transparent'};color:${color};cursor:pointer;font-size:11px">
          <span style="width:6px;height:6px;border-radius:50%;background:${color}"></span>
          ${name}
          <span style="font-size:9px;opacity:0.7">(${status})</span>
        </button>`
      }).join('')}
    </div>
  `

  listEl.querySelectorAll('.wz-provider-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.name
      manager.setActive(name)
      _renderProviderList(container, manager)
      _renderProviderEditor(container, manager, manager.getProvider(name))
    })
  })
}

function _renderProviderEditor(container, manager, provider) {
  const editor = container.querySelector('#wz-provider-editor')
  if (!editor || !provider) return

  const cfg = provider.config
  editor.innerHTML = `
    <h3 class="wz-subtitle" style="margin:0 0 0.5rem">${cfg.name} Settings</h3>
    <div class="wz-form-grid" style="grid-template-columns:1fr">
      <div class="wz-field">
        <label>Base URL</label>
        <input type="text" class="wz-provider-input" data-key="baseUrl" value="${escapeHtml(cfg.baseUrl)}" placeholder="https://api.openai.com/v1">
      </div>
      <div class="wz-field">
        <label>Model</label>
        <input type="text" class="wz-provider-input" data-key="model" value="${escapeHtml(cfg.model)}" placeholder="gpt-4o-mini">
      </div>
      <div class="wz-field">
        <label>API Key</label>
        <input type="password" class="wz-provider-input" data-key="apiKey" value="${escapeHtml(cfg.apiKey)}" placeholder="sk-...">
        <span style="font-size:9px;color:var(--wz-text-muted,#666)">Stored locally only. Never commit to source control.</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem">
        <div class="wz-field">
          <label>Timeout (ms)</label>
          <input type="number" class="wz-provider-input" data-key="timeoutMs" value="${cfg.timeoutMs}" min="1000" max="120000">
        </div>
        <div class="wz-field">
          <label>Max Tokens</label>
          <input type="number" class="wz-provider-input" data-key="maxTokens" value="${cfg.maxTokens}" min="256" max="8192">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem">
        <div class="wz-field">
          <label>Temperature</label>
          <input type="range" class="wz-provider-range" data-key="temperature" min="0" max="2" step="0.1" value="${cfg.temperature}">
          <span class="wz-range-value" style="font-size:10px;color:var(--wz-text-muted)">${cfg.temperature}</span>
        </div>
        <div class="wz-field" style="display:flex;align-items:center;gap:8px;padding-top:20px">
          <label class="wz-check-label">
            <input type="checkbox" class="wz-provider-check" data-key="enabled" ${cfg.enabled ? 'checked' : ''}>
            Enabled
          </label>
        </div>
      </div>
    </div>
    <div class="wz-button-row" style="margin-top:0.5rem">
      <button class="wz-btn wz-btn-primary" id="wz-provider-save-btn">Save Settings</button>
      <button class="wz-btn wz-btn-danger" id="wz-provider-remove-btn" style="color:var(--wz-danger);border-color:var(--wz-danger)">Remove Provider</button>
    </div>
  `

  editor.querySelectorAll('.wz-provider-range').forEach(input => {
    input.addEventListener('input', () => {
      const val = editor.querySelector(`.wz-range-value`)
      if (val) val.textContent = input.value
    })
  })

  editor.querySelector('#wz-provider-save-btn')?.addEventListener('click', () => {
    const updates = {}
    editor.querySelectorAll('.wz-provider-input').forEach(input => {
      const key = input.dataset.key
      if (key === 'timeoutMs' || key === 'maxTokens') {
        updates[key] = parseInt(input.value) || 30000
      } else {
        updates[key] = input.value
      }
    })
    editor.querySelectorAll('.wz-provider-range').forEach(input => {
      updates[input.dataset.key] = parseFloat(input.value)
    })
    editor.querySelectorAll('.wz-provider-check').forEach(input => {
      updates[input.dataset.key] = input.checked
    })
    provider.updateConfig(updates)
    _showStatus(container, 'Settings saved', 'success')
    _renderProviderList(container, manager)
  })

  editor.querySelector('#wz-provider-remove-btn')?.addEventListener('click', () => {
    manager.remove(provider.name)
    _renderProviderList(container, manager)
    editor.innerHTML = '<p class="wz-muted" style="font-style:italic">Provider removed.</p>'
    _showStatus(container, `Provider "${provider.name}" removed`, 'info')
  })
}

function _setupListeners(container, manager) {
  container.querySelector('#wz-provider-add-btn')?.addEventListener('click', () => {
    const name = `provider-${Date.now()}`
    const provider = new OpenAIProvider({ name, enabled: true })
    manager.register(name, provider)
    manager.setActive(name)
    _renderProviderList(container, manager)
    _renderProviderEditor(container, manager, provider)
    _showStatus(container, `Added provider "${name}". Configure it below.`, 'info')
  })

  container.querySelector('#wz-provider-test-btn')?.addEventListener('click', async () => {
    const provider = manager.activeProvider
    if (!provider) { _showStatus(container, 'No active provider to test', 'error'); return }
    _showStatus(container, 'Testing connection...', 'info')
    const result = await provider.testConnection()
    if (result.success) {
      _showStatus(container, `Connection OK — ${result.model} (${Math.round(result.latency)}ms)`, 'success')
    } else {
      _showStatus(container, `Connection failed: ${result.error}`, 'error')
    }
  })

  container.querySelector('#wz-provider-clear-btn')?.addEventListener('click', () => {
    OpenAIProvider.clearStored()
    _showStatus(container, 'Stored API keys cleared from localStorage', 'info')
  })
}

function _showStatus(container, message, type = 'info') {
  const el = container.querySelector('#wz-provider-status')
  if (!el) return
  el.textContent = message
  el.className = `wz-status wz-status-${type}`
  el.hidden = false
}

function escapeHtml(str) {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}
