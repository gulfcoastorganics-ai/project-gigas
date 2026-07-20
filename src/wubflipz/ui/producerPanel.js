export function renderProducerPanel(container, opts) {
  const { project, onPlay, onStop, onRegenerate, onExport, onUndo, onRedo, canUndo, canRedo } = opts
  const blueprint = project?.blueprint || null
  const sections = blueprint?.sections || []
  const tracks = project?.tracks || []

  container.innerHTML = `
    <div class="wz-producer-panel">
      <h2 class="wz-section-title">AI Producer</h2>
      <div id="wz-blueprint-info" class="wz-blueprint-info">
        ${blueprint ? renderBlueprintInfo(blueprint) : '<p class="wz-muted">No project loaded. Generate a track to begin.</p>'}
      </div>
      <div id="wz-section-map" class="wz-section-map">
        ${blueprint ? renderSectionMap(blueprint) : ''}
      </div>
      <div id="wz-transport" class="wz-transport">
        <button id="wz-play-btn" class="wz-btn wz-btn-play" ${!blueprint ? 'disabled' : ''}>▶ Play</button>
        <button id="wz-stop-btn" class="wz-btn wz-btn-stop" disabled>■ Stop</button>
        <span id="wz-beat-display" class="wz-beat-display">--</span>
      </div>
      <div class="wz-regeneration-controls">
        <h3 class="wz-subtitle">Selective Regeneration</h3>
        <div class="wz-field">
          <label for="wz-regen-scope">Scope</label>
          <select id="wz-regen-scope">
            <option value="entire_song">Entire Song</option>
            <option value="section">Section</option>
            <option value="track">Track</option>
            <option value="mix">Mix</option>
          </select>
        </div>
        <div class="wz-field" id="wz-regen-target-field" hidden>
          <label for="wz-regen-target">Target</label>
          <select id="wz-regen-target"></select>
        </div>
        <div class="wz-field">
          <label for="wz-regen-instruction">Instruction</label>
          <input id="wz-regen-instruction" type="text" placeholder="e.g. Make it heavier" ${!blueprint ? 'disabled' : ''}>
        </div>
        <div class="wz-preserve-group">
          <span class="wz-preserve-label">Preserve:</span>
          <label class="wz-check-label"><input type="checkbox" class="wz-preserve-cb" value="drums"> Drums</label>
          <label class="wz-check-label"><input type="checkbox" class="wz-preserve-cb" value="bass"> Bass</label>
          <label class="wz-check-label"><input type="checkbox" class="wz-preserve-cb" value="harmony"> Harmony</label>
          <label class="wz-check-label"><input type="checkbox" class="wz-preserve-cb" value="melody"> Melody</label>
        </div>
        <div class="wz-button-row">
          <button id="wz-regen-apply-btn" class="wz-btn wz-btn-primary" ${!blueprint ? 'disabled' : ''}>Apply</button>
          <button id="wz-regen-undo-btn" class="wz-btn wz-btn-secondary" ${!canUndo ? 'disabled' : ''}>↩ Undo</button>
          <button id="wz-regen-redo-btn" class="wz-btn wz-btn-secondary" ${!canRedo ? 'disabled' : ''}>↪ Redo</button>
        </div>
      </div>
      <div id="wz-regen-result" class="wz-status" hidden></div>
      <div class="wz-actions">
        <button id="wz-export-btn" class="wz-btn wz-btn-secondary" ${!blueprint ? 'disabled' : ''}>Export JSON</button>
      </div>
    </div>
  `

  const scopeEl = container.querySelector('#wz-regen-scope')
  const targetField = container.querySelector('#wz-regen-target-field')
  const targetSel = container.querySelector('#wz-regen-target')

  scopeEl.addEventListener('change', () => {
    const scope = scopeEl.value
    targetField.hidden = !(scope === 'section' || scope === 'track')
    if (scope === 'section') {
      targetSel.innerHTML = sections.map(s => `<option value="${s.id}">${escapeHtml(s.name)} (${s.type})</option>`).join('')
    } else if (scope === 'track') {
      targetSel.innerHTML = tracks.map(t => `<option value="${t.id}">${escapeHtml(t.name)} (${t.type})</option>`).join('')
    }
  })

  container.querySelector('#wz-play-btn')?.addEventListener('click', () => onPlay?.())
  container.querySelector('#wz-stop-btn')?.addEventListener('click', () => onStop?.())

  container.querySelector('#wz-regen-apply-btn')?.addEventListener('click', async () => {
    const scope = scopeEl.value
    const targetId = targetField.hidden ? undefined : targetSel.value
    const instruction = container.querySelector('#wz-regen-instruction')?.value || ''
    const preserve = [...container.querySelectorAll('.wz-preserve-cb:checked')].map(cb => cb.value)
    const status = container.querySelector('#wz-regen-result')

    if (onRegenerate) {
      status.hidden = false
      status.className = 'wz-status wz-status-info'
      status.textContent = 'Regenerating...'
      try {
        await onRegenerate({ scope, targetId, instruction, preserve })
        status.className = 'wz-status wz-status-success'
        status.textContent = 'Regeneration complete'
      } catch (err) {
        status.className = 'wz-status wz-status-error'
        status.textContent = `Error: ${err.message}`
      }
    }
  })

  container.querySelector('#wz-regen-undo-btn')?.addEventListener('click', () => onUndo?.())
  container.querySelector('#wz-regen-redo-btn')?.addEventListener('click', () => onRedo?.())
  container.querySelector('#wz-export-btn')?.addEventListener('click', () => onExport?.())
}

export function updateProducerPanel(container, project, opts = {}) {
  const { canUndo, canRedo } = opts
  const infoEl = container.querySelector('#wz-blueprint-info')
  const mapEl = container.querySelector('#wz-section-map')
  if (infoEl) infoEl.innerHTML = project?.blueprint ? renderBlueprintInfo(project.blueprint) : '<p class="wz-muted">No project loaded.</p>'
  if (mapEl) mapEl.innerHTML = project?.blueprint ? renderSectionMap(project.blueprint) : ''

  const playBtn = container.querySelector('#wz-play-btn')
  const stopBtn = container.querySelector('#wz-stop-btn')
  const exportBtn = container.querySelector('#wz-export-btn')
  const regenBtn = container.querySelector('#wz-regen-apply-btn')
  const undoBtn = container.querySelector('#wz-regen-undo-btn')
  const redoBtn = container.querySelector('#wz-regen-redo-btn')
  const enabled = !!project?.blueprint
  if (playBtn) playBtn.disabled = !enabled
  if (stopBtn) stopBtn.disabled = !enabled
  if (exportBtn) exportBtn.disabled = !enabled
  if (regenBtn) regenBtn.disabled = !enabled
  if (undoBtn) undoBtn.disabled = !canUndo
  if (redoBtn) redoBtn.disabled = !canRedo
}

export function updateTransportState(container, playing, beat = 0) {
  const playBtn = container.querySelector('#wz-play-btn')
  const stopBtn = container.querySelector('#wz-stop-btn')
  const beatDisplay = container.querySelector('#wz-beat-display')
  if (playBtn) playBtn.textContent = playing ? '▶ Playing...' : '▶ Play'
  if (stopBtn) stopBtn.disabled = !playing
  if (beatDisplay) beatDisplay.textContent = playing ? `Beat ${beat}` : '--'
}

function renderBlueprintInfo(blueprint) {
  return `
    <div class="wz-info-grid">
      <div class="wz-info-item"><span class="wz-info-label">Title</span><span>${escapeHtml(blueprint.title || 'Untitled')}</span></div>
      <div class="wz-info-item"><span class="wz-info-label">BPM</span><span>${blueprint.bpm}</span></div>
      <div class="wz-info-item"><span class="wz-info-label">Key</span><span>${blueprint.key} ${blueprint.scale}</span></div>
      <div class="wz-info-item"><span class="wz-info-label">Genre</span><span>${escapeHtml((blueprint.genre || []).join(', '))}</span></div>
      <div class="wz-info-item"><span class="wz-info-label">Bars</span><span>${blueprint.durationBars}</span></div>
      <div class="wz-info-item"><span class="wz-info-label">Seed</span><span>${blueprint.seed}</span></div>
      <div class="wz-info-item"><span class="wz-info-label">Duration</span><span>~${Math.round(blueprint.durationBars * 4 / blueprint.bpm * 60)}s</span></div>
    </div>
  `
}

function renderSectionMap(blueprint) {
  const sections = blueprint.sections || []
  const totalBars = blueprint.durationBars || 32
  return `
    <h3 class="wz-subtitle">Sections</h3>
    <div class="wz-section-bar">
      ${sections.map(s => {
        const pct = (s.lengthBars / totalBars * 100).toFixed(1)
        const energyPct = (s.energy * 100).toFixed(0)
        return `<div class="wz-section-segment" style="width:${pct}%" title="${escapeHtml(s.name)}: ${s.type} (energy ${energyPct}%)">
          <span class="wz-section-label">${escapeHtml(s.name)}</span>
          <span class="wz-section-energy" style="height:${energyPct}%"></span>
        </div>`
      }).join('')}
    </div>
  `
}

function escapeHtml(str) {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}
