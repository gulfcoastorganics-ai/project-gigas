export function renderCreateView(container, { onGenerate, onGenerateBlueprint }) {
  container.innerHTML = `
    <div class="wz-create-view">
      <h2 class="wz-section-title">Create Track</h2>
      <div class="wz-form-grid">
        <div class="wz-field">
          <label for="wz-prompt">Prompt</label>
          <textarea id="wz-prompt" rows="3" placeholder="e.g. 150 BPM dark ritual dubstep with a restrained intro, tense buildup, heavy call-and-response first drop...">150 BPM dark ritual dubstep with a restrained intro, tense buildup, heavy call-and-response first drop, short atmospheric break, and a more intense final drop</textarea>
        </div>
        <div class="wz-field">
          <label for="wz-genre">Genre</label>
          <select id="wz-genre">
            <option value="dubstep">Dubstep</option>
            <option value="riddim">Riddim</option>
            <option value="melodic-dubstep">Melodic Dubstep</option>
            <option value="drum-and-bass">Drum & Bass</option>
            <option value="trap">Trap</option>
            <option value="wave">Wave</option>
            <option value="cinematic-bass">Cinematic Bass</option>
            <option value="experimental-bass">Experimental Bass</option>
          </select>
        </div>
        <div class="wz-field">
          <label for="wz-bpm">BPM</label>
          <input id="wz-bpm" type="number" min="60" max="300" value="140" placeholder="Auto">
        </div>
        <div class="wz-field">
          <label for="wz-key">Key</label>
          <select id="wz-key">
            <option value="">Auto</option>
            <option value="C">C</option><option value="C#">C#</option>
            <option value="D">D</option><option value="D#">D#</option>
            <option value="E">E</option><option value="F">F</option>
            <option value="F#">F#</option><option value="G">G</option>
            <option value="G#">G#</option><option value="A">A</option>
            <option value="A#">A#</option><option value="B">B</option>
          </select>
        </div>
        <div class="wz-field">
          <label for="wz-scale">Scale</label>
          <select id="wz-scale">
            <option value="">Auto</option>
            <option value="minor">Minor</option>
            <option value="major">Major</option>
            <option value="dorian">Dorian</option>
            <option value="phrygian">Phrygian</option>
            <option value="lydian">Lydian</option>
          </select>
        </div>
        <div class="wz-field">
          <label for="wz-length">Length (seconds)</label>
          <input id="wz-length" type="range" min="30" max="120" value="75">
          <span id="wz-length-display">75s</span>
        </div>
        <div class="wz-field">
          <label for="wz-intensity">Intensity</label>
          <input id="wz-intensity" type="range" min="0" max="10" value="5">
        </div>
        <div class="wz-field">
          <label for="wz-seed">Seed (0 = random)</label>
          <input id="wz-seed" type="number" min="0" value="0">
        </div>
      </div>
      <div class="wz-button-row">
        <button id="wz-gen-blueprint" class="wz-btn wz-btn-secondary">Generate Blueprint</button>
        <button id="wz-gen-full" class="wz-btn wz-btn-primary">Generate Full Track</button>
      </div>
      <div id="wz-gen-status" class="wz-status" hidden></div>
    </div>
  `

  const lengthSlider = container.querySelector('#wz-length')
  const lengthDisplay = container.querySelector('#wz-length-display')
  lengthSlider.addEventListener('input', () => {
    lengthDisplay.textContent = `${lengthSlider.value}s`
  })

  container.querySelector('#wz-gen-blueprint').addEventListener('click', () => {
    const settings = gatherSettings(container)
    onGenerateBlueprint(settings)
  })

  container.querySelector('#wz-gen-full').addEventListener('click', () => {
    const settings = gatherSettings(container)
    onGenerate(settings)
  })
}

export function gatherSettings(container) {
  const get = (id) => container.querySelector(`#${id}`)?.value
  return {
    prompt: get('wz-prompt'),
    genre: get('wz-genre'),
    bpm: parseInt(get('wz-bpm')) || undefined,
    key: get('wz-key') || undefined,
    scale: get('wz-scale') || undefined,
    lengthSec: parseInt(get('wz-length')),
    intensity: parseInt(get('wz-intensity')) / 10,
    seed: parseInt(get('wz-seed')) || undefined,
  }
}

export function setStatus(container, message, type = 'info') {
  const status = container.querySelector('#wz-gen-status')
  if (!status) return
  status.textContent = message
  status.className = `wz-status wz-status-${type}`
  status.hidden = false
}
