import './styles/main.css'
import './styles/timeline.css'
import { DirectorEngine } from './generation/director.js'
import { HarmonyGenerator } from './generation/harmony.js'
import { DrumGenerator } from './generation/drums.js'
import { BassGenerator } from './generation/bass.js'
import { MelodyGenerator } from './generation/melody.js'
import { TransitionGenerator } from './generation/transitions.js'
import { RegenerationEngine } from './generation/regeneration.js'
import { SeededRandom, hashCombine } from './generation/seededRandom.js'
import { getProfile } from './profiles/profiles.js'
import { renderCreateView, gatherSettings, setStatus } from './ui/createView.js'
import { renderProducerPanel, updateProducerPanel, updateTransportState } from './ui/producerPanel.js'
import { getAudioEngine } from './instruments/engine.js'
import { ProjectDB, downloadProject } from './storage/project-db.js'
import { TimelineView } from './timeline/timelineView.js'

export class WubFlipzApp {
  constructor(root) {
    this._root = root
    this._director = new DirectorEngine()
    this._regenerator = new RegenerationEngine()
    this._project = null
    this._projectId = null
    this._playing = false
    this._generating = false
    this._timeline = null
  }

  async init() {
    this._root.classList.add('wz-app')
    this._renderShell()
    this._setupNavigation()
    await this._showCreate()
  }

  _renderShell() {
    this._root.innerHTML = `
      <header class="wz-header">
        <h1>WubFlipz</h1>
        <span style="font-size:0.75rem;color:var(--wz-text-muted)">AI Music Producer</span>
        <nav class="wz-nav">
          <button class="wz-nav-btn" data-view="create">+ Create</button>
          <button class="wz-nav-btn" data-view="projects">Projects</button>
        </nav>
      </header>
      <main class="wz-main wz-main-with-timeline">
        <div class="wz-timeline-area" id="wz-timeline-area">
          <div class="wz-tl-empty" id="wz-tl-empty">Generate a track to see the timeline</div>
          <div class="wz-timeline-container" id="wz-timeline-container" style="display:none"></div>
        </div>
        <aside class="wz-panel" id="wz-sidebar">
          <div id="wz-sidebar-content"></div>
        </aside>
      </main>
    `
  }

  _setupNavigation() {
    this._root.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view
        if (view === 'create') this._showCreate()
        else if (view === 'projects') this._showProjects()
      })
    })
  }

  _showProgress(text = 'Generating...') {
    const overlay = document.createElement('div')
    overlay.className = 'wz-progress-overlay'
    overlay.id = 'wz-progress'
    overlay.innerHTML = `
      <div class="wz-progress-card">
        <div class="wz-spinner"></div>
        <p>${escapeHtml(text)}</p>
        <button class="wz-btn wz-btn-secondary" id="wz-cancel-gen" style="margin-top:1rem">Cancel</button>
      </div>
    `
    this._root.appendChild(overlay)
  }

  _hideProgress() {
    const overlay = this._root.querySelector('#wz-progress')
    if (overlay) overlay.remove()
  }

  async _showCreate() {
    const container = this._root.querySelector('#wz-content')
    renderCreateView(container, {
      onGenerateBlueprint: (settings) => this._handleGenerateBlueprint(settings),
      onGenerate: (settings) => this._handleGenerate(settings),
    })
  }

  async _showProjects() {
    const container = this._root.querySelector('#wz-content')
    const projects = await ProjectDB.list()
    container.innerHTML = `
      <div class="wz-panel">
        <h2 class="wz-section-title">Saved Projects</h2>
        <div class="wz-project-list">
          ${projects.length === 0 ? '<p class="wz-muted">No saved projects yet.</p>' :
            projects.map(p => `
              <div class="wz-project-item" data-id="${escapeHtml(p.id)}">
                <div class="wz-project-info">
                  <div class="wz-project-title">${escapeHtml(p.title)}</div>
                  <div class="wz-project-meta">${p.bpm} BPM · ${escapeHtml(p.genre || '')} · ${new Date(p.savedAt).toLocaleDateString()}</div>
                </div>
              </div>
            `).join('')
          }
        </div>
      </div>
    `
    container.querySelectorAll('.wz-project-item').forEach(item => {
      item.addEventListener('click', async () => {
        const project = await ProjectDB.load(item.dataset.id)
        if (project) {
          this._project = project
          this._projectId = project.id
          this._updateTimeline()
          this._updateSidebar()
        }
      })
    })
  }

  async _handleGenerateBlueprint(settings) {
    this._showProgress('Generating blueprint...')
    try {
      const prompt = settings.prompt
      const seed = settings.seed || hashCombine(prompt, JSON.stringify(settings))
      const blueprint = await this._director.generate(prompt, { ...settings, seed, useAI: false })

      if (!this._project) {
        this._project = { id: crypto.randomUUID(), title: blueprint.title, blueprint, notes: [], drums: [], bass: [], chords: [], transitions: [], tracks: [], createdAt: new Date().toISOString() }
      } else {
        this._project.blueprint = blueprint
      }
      this._projectId = this._project.id

      setStatus(this._root.querySelector('#wz-content'), 'Blueprint generated successfully!', 'success')
      this._updateTimeline()
      this._updateSidebar()
      await ProjectDB.save(this._project)
    } catch (err) {
      setStatus(this._root.querySelector('#wz-content'), `Error: ${err.message}`, 'error')
    } finally {
      this._hideProgress()
    }
  }

  async _handleGenerate(settings) {
    this._showProgress('Generating full track...')
    try {
      const prompt = settings.prompt
      const seed = settings.seed || hashCombine(prompt, JSON.stringify(settings))

      const blueprint = await this._director.generate(prompt, { ...settings, seed, useAI: false })
      const profile = getProfile(settings.genre) || getProfile('dubstep')
      const rng = new SeededRandom(seed)

      const harmonyGen = new HarmonyGenerator(rng.child('harmony'))
      const chords = harmonyGen.generateChordProgression(blueprint, profile)

      const drumGen = new DrumGenerator(rng.child('drums'))
      const drums = drumGen.generate(blueprint.bpm, blueprint.sections, settings.genre)

      const bassGen = new BassGenerator(rng.child('bass'))
      const bass = bassGen.generate(blueprint.bpm, blueprint.sections, chords, blueprint, settings.genre)

      const melGen = new MelodyGenerator(rng.child('melody'))
      const notes = melGen.generate(blueprint, chords, settings.genre)

      const transGen = new TransitionGenerator(rng.child('transitions'))
      const transitions = transGen.generate(blueprint.sections, blueprint)

      this._project = {
        id: crypto.randomUUID(),
        title: blueprint.title,
        blueprint,
        chords,
        drums,
        bass,
        notes,
        transitions,
        tracks: [
          { id: 'kick', name: 'Kick', type: 'drum', volume: 1, pan: 0 },
          { id: 'snare', name: 'Snare', type: 'drum', volume: 1, pan: 0 },
          { id: 'hat', name: 'Hi-Hat', type: 'drum', volume: 1, pan: 0 },
          { id: 'bass', name: 'Bass', type: 'bass', volume: 1, pan: 0 },
          { id: 'lead', name: 'Lead', type: 'melody', volume: 1, pan: 0 },
          { id: 'chords', name: 'Chords', type: 'harmony', volume: 1, pan: 0 },
          { id: 'fx', name: 'FX', type: 'fx', volume: 1, pan: 0 },
        ],
        createdAt: new Date().toISOString(),
      }
      this._projectId = this._project.id

      setStatus(this._root.querySelector('#wz-content'), `Track generated! ${notes.length} notes, ${drums.length} drums, ${bass.length} bass events.`, 'success')
      this._updateTimeline()
      this._updateSidebar()
      await ProjectDB.save(this._project)
    } catch (err) {
      setStatus(this._root.querySelector('#wz-content'), `Error: ${err.message}`, 'error')
    } finally {
      this._hideProgress()
    }
  }

  _updateTimeline() {
    const container = this._root.querySelector('#wz-timeline-container')
    const empty = this._root.querySelector('#wz-tl-empty')
    if (!container) return

    if (!this._project?.blueprint) {
      container.style.display = 'none'
      if (empty) empty.style.display = 'flex'
      return
    }

    container.style.display = 'flex'
    if (empty) empty.style.display = 'none'

    if (!this._timeline) {
      this._timeline = new TimelineView(container, {
        onClipSelect: (clip) => {
          this._selectedClip = clip
        },
        onTrackSelect: (track) => {
          this._selectedTrack = track
        },
        onPlayheadMove: (beat) => {
          const engine = getAudioEngine()
          engine.setCurrentBeat(beat)
          if (this._playing) {
            this._handleStop()
          }
        },
        onClipMove: (clipId, startBeat) => {
          this._timelineChanged = true
        },
        onClipResize: (clipId, startBeat, durationBeats) => {
          this._timelineChanged = true
        },
        onTrackMute: (trackId, muted) => {
          const track = this._project?.tracks?.find(t => t.id === trackId)
          if (track) track.muted = muted
          if (this._timeline) {
            this._timeline.updateTrack(trackId, { muted })
            this._timeline.syncMuteSolo()
            this._timeline.refresh()
          }
        },
        onTrackSolo: (trackId, solo) => {
          const track = this._project?.tracks?.find(t => t.id === trackId)
          if (track) track.solo = solo
          if (this._timeline) {
            this._timeline.updateTrack(trackId, { solo })
            this._timeline.syncMuteSolo()
            this._timeline.refresh()
          }
        },
        onTrackVolume: (trackId, volume) => {
          const track = this._project?.tracks?.find(t => t.id === trackId)
          if (track) track.volume = volume
        },
        onTrackPan: (trackId, pan) => {
          const track = this._project?.tracks?.find(t => t.id === trackId)
          if (track) track.pan = pan
        },
        onTrackLock: (trackId, locked) => {
          const track = this._project?.tracks?.find(t => t.id === trackId)
          if (track) track.locked = locked
          if (this._timeline) {
            this._timeline.updateTrack(trackId, { locked })
            this._timeline.refresh()
          }
        },
        onTrackRename: (trackId, name) => {
          const track = this._project?.tracks?.find(t => t.id === trackId)
          if (track) track.name = name
          this._updateTimeline()
        },
        onSectionClick: (section) => {
          this._selectedSection = section
        },
        onAction: (action, data) => {
          if (action === 'openClip') {
            this._openClipEditor(data)
          }
        },
      })
    }

    this._timeline.setProject(this._project)
    this._timeline.refresh()
  }

  _openClipEditor(clip) {
    if (!clip) return
    this._timelineRefreshing = true
    this._updateTimeline()
    this._timelineRefreshing = false
  }

  _updateSidebar() {
    const sidebar = this._root.querySelector('#wz-sidebar-content')
    if (!sidebar) return

    renderProducerPanel(sidebar, {
      project: this._project,
      canUndo: this._regenerator.canUndo,
      canRedo: this._regenerator.canRedo,
      onPlay: () => this._handlePlay(),
      onStop: () => this._handleStop(),
      onRegenerate: (req) => this._handleSelectiveRegen(req),
      onExport: () => this._handleExport(),
      onUndo: () => this._handleUndo(),
      onRedo: () => this._handleRedo(),
    })
  }

  _handlePlay() {
    if (this._playing) return
    if (!this._project?.blueprint) return

    const engine = getAudioEngine()
    engine.setBpm(this._project.blueprint.bpm)
    engine.ensureContext()

    engine.createChannel('kick', engine.createTrackGain())
    engine.createChannel('snare', engine.createTrackGain())
    engine.createChannel('hat', engine.createTrackGain())
    engine.createChannel('bass', engine.createTrackGain())
    engine.createChannel('lead', engine.createTrackGain())

    const drums = this._project.drums || []
    const notes = this._project.notes || []
    const bass = this._project.bass || []

    for (const d of drums) engine.scheduleDrumEvent(d, 0.1)
    for (const n of notes) engine.schedulePlay(n, 0.1)
    for (const b of bass) {
      engine.schedulePlay({
        ...b,
        pitch: b.rootNote,
        type: 'synth',
        articulation: b.articulation,
        velocity: b.intensity,
        trackId: b.trackId || 'bass',
      }, 0.1)
    }

    this._playing = true
    const sidebar = this._root.querySelector('#wz-sidebar-content')
    updateTransportState(sidebar, true)

    engine.setOnBeat((beat) => {
      updateTransportState(sidebar, true, beat)
      if (this._timeline) {
        this._timeline.setPlayhead(beat)
      }
    })
    engine.play()
  }

  _handleStop() {
    const engine = getAudioEngine()
    engine.stop()
    this._playing = false
    const sidebar = this._root.querySelector('#wz-sidebar-content')
    updateTransportState(sidebar, false)
    if (this._timeline) {
      this._timeline.setPlayhead(-1)
    }
  }

  async _handleRegenerate() {
    if (!this._project?.blueprint) return
    const settings = {
      genre: this._project.blueprint.genre[0],
      bpm: this._project.blueprint.bpm,
      key: this._project.blueprint.key,
      scale: this._project.blueprint.scale,
      prompt: this._project.blueprint.prompt,
      seed: Date.now(),
      useAI: false,
    }
    this._handleStop()
    await this._handleGenerate(settings)
  }

  async _handleSelectiveRegen(req) {
    this._handleStop()
    this._showProgress('Regenerating...')
    try {
      const result = await this._regenerator.regenerate(this._project, {
        scope: req.scope,
        targetId: req.targetId,
        instruction: req.instruction || '',
        preserve: req.preserve || [],
        change: ['all'],
        seed: Date.now(),
      })
      this._project = result.project
      this._projectId = result.project.id
      await ProjectDB.save(this._project)
      this._updateTimeline()
      this._updateSidebar()
    } catch (err) {
      const sidebar = this._root.querySelector('#wz-sidebar-content')
      const status = sidebar?.querySelector('#wz-regen-result')
      if (status) { status.className = 'wz-status wz-status-error'; status.textContent = `Error: ${err.message}`; status.hidden = false }
    } finally {
      this._hideProgress()
    }
  }

  _handleUndo() {
    const result = this._regenerator.undo()
    if (result) {
      this._project = result.project
      this._projectId = result.project.id
      this._updateTimeline()
      this._updateSidebar()
    }
  }

  _handleRedo() {
    const result = this._regenerator.redo()
    if (result) {
      this._project = result.project
      this._projectId = result.project.id
      this._updateTimeline()
      this._updateSidebar()
    }
  }

  _handleExport() {
    if (!this._project) return
    downloadProject(this._project)
  }
}

function escapeHtml(str) {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}
