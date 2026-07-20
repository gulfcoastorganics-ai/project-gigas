import { beatToPixels, pixelsToBeat, snapToGrid, beatToString, configureTimeModel, getPixelsPerBeat, setPixelsPerBeat, getSnapEnabled } from './timeModel.js'

const NOTE_HEIGHT = 12
const KEYBOARD_WIDTH = 60
const ROW_HEIGHT = NOTE_HEIGHT + 2
const DEFAULT_VELOCITY = 0.7

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const SCALE_NOTE_NAMES = {
  'major': [0, 2, 4, 5, 7, 9, 11],
  'minor': [0, 2, 3, 5, 7, 8, 10],
  'dorian': [0, 2, 3, 5, 7, 9, 10],
  'phrygian': [0, 1, 3, 5, 7, 8, 10],
  'lydian': [0, 2, 4, 6, 7, 9, 11],
  'mixolydian': [0, 2, 4, 5, 7, 9, 10],
  'locrian': [0, 1, 3, 5, 6, 8, 10],
  'harmonic_minor': [0, 2, 3, 5, 7, 8, 11],
  'melodic_minor': [0, 2, 3, 5, 7, 8, 10],
  'pentatonic_major': [0, 2, 4, 7, 9],
  'pentatonic_minor': [0, 3, 5, 7, 10],
  'blues': [0, 3, 5, 6, 7, 10],
}

function midiToName(pitch) {
  const octave = Math.floor(pitch / 12) - 1
  return `${NOTE_NAMES[pitch % 12]}${octave}`
}

function isWhiteKey(pitch) {
  const note = pitch % 12
  return [0, 2, 4, 5, 7, 9, 11].includes(note)
}

function pitchFromKey(key) {
  const map = { 'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11 }
  return map[key] || 0
}

export class PianoRoll {
  constructor(container, opts = {}) {
    this._container = container
    this._notes = []
    this._key = opts.key || 'C'
    this._scale = opts.scale || 'minor'
    this._bpm = opts.bpm || 140
    this._lowestPitch = opts.lowestPitch ?? 48
    this._highestPitch = opts.highestPitch ?? 84
    this._visibleBeats = opts.visibleBeats || 16
    this._pixelsPerBeat = opts.pixelsPerBeat || (getPixelsPerBeat() || 60)
    this._selectedNoteIds = new Set()
    this._drumMode = false
    this._drumSounds = opts.drumSounds || ['kick', 'snare', 'clap', 'closed_hat', 'open_hat', 'tom', 'ride', 'crash', 'fx']
    this._drumHits = []
    this._drumGridDivision = opts.drumGridDivision || 0.25
    this._onNotesChange = opts.onNotesChange || null
    this._onHitsChange = opts.onHitsChange || null
    this._onNoteSelect = opts.onNoteSelect || null
    this._onClose = opts.onClose || null
    this._dragging = null
    this._resizingNote = null
    this._editingVelocity = null
    this._scrollY = 0
    this._scrollX = 0
    this._folded = false
    this._highlightScale = true
    this._changed = false
    this._autoRender = true
  }

  setNotes(notes) {
    this._notes = notes.map(n => ({ ...n, id: n.id || crypto.randomUUID() }))
    this._changed = true
  }

  getNotes() { return this._notes }

  setDrumHits(hits) {
    this._drumHits = hits.map(h => ({ ...h, id: h.id || crypto.randomUUID() }))
    this._changed = true
  }

  getDrumHits() { return this._drumHits }

  setMode(drumMode) {
    this._drumMode = drumMode
    this._changed = true
  }

  setScale(key, scale) {
    this._key = key
    this._scale = scale
    this._changed = true
  }

  render() {
    this._container.innerHTML = ''
    this._container.style.cssText = 'display:flex;flex-direction:column;background:var(--wz-bg,#16162a);border:1px solid var(--wz-border,#2a2a3e);border-radius:6px;overflow:hidden;height:100%'

    this._renderHeader()
    if (this._drumMode) {
      this._renderDrumGrid()
    } else {
      this._renderPianoGrid()
    }
    this._renderFooter()
  }

  _renderHeader() {
    const header = document.createElement('div')
    header.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 12px;background:var(--wz-bg-secondary,#1a1a2e);border-bottom:1px solid var(--wz-border,#333);flex-shrink:0'

    const title = document.createElement('span')
    title.style.cssText = 'font-size:12px;font-weight:600;color:var(--wz-text,#ddd)'
    title.textContent = this._drumMode ? 'Drum Grid' : `Piano Roll — ${this._key} ${this._scale}`
    header.appendChild(title)

    const toggleBtn = document.createElement('button')
    toggleBtn.style.cssText = 'font-size:10px;padding:2px 6px;border:1px solid var(--wz-border,#444);border-radius:3px;background:transparent;color:var(--wz-text-muted,#888);cursor:pointer;margin-left:auto'
    toggleBtn.textContent = this._folded ? 'Unfold' : 'Fold'
    toggleBtn.title = 'Fold to used notes / selected scale'
    toggleBtn.addEventListener('click', () => {
      this._folded = !this._folded
      this.render()
    })
    header.appendChild(toggleBtn)

    if (!this._drumMode) {
      const scaleToggle = document.createElement('button')
      scaleToggle.style.cssText = 'font-size:10px;padding:2px 6px;border:1px solid var(--wz-border,#444);border-radius:3px;background:transparent;color:var(--wz-text-muted,#888);cursor:pointer'
      scaleToggle.textContent = this._highlightScale ? 'Scale: On' : 'Scale: Off'
      scaleToggle.title = 'Toggle scale highlighting'
      scaleToggle.addEventListener('click', () => {
        this._highlightScale = !this._highlightScale
        this.render()
      })
      header.appendChild(scaleToggle)
    }

    const closeBtn = document.createElement('button')
    closeBtn.style.cssText = 'font-size:14px;padding:2px 8px;border:1px solid var(--wz-border,#444);border-radius:3px;background:transparent;color:var(--wz-text-muted,#888);cursor:pointer'
    closeBtn.textContent = '✕'
    closeBtn.title = 'Close editor'
    closeBtn.addEventListener('click', () => { if (this._onClose) this._onClose() })
    header.appendChild(closeBtn)

    this._container.appendChild(header)
  }

  _renderFooter() {
    const footer = document.createElement('div')
    footer.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 12px;background:var(--wz-bg-secondary,#1a1a2e);border-top:1px solid var(--wz-border,#333);flex-shrink:0;font-size:10px;color:var(--wz-text-muted,#888)'

    const count = this._drumMode ? this._drumHits.length : this._notes.length
    footer.textContent = `${count} ${this._drumMode ? 'hits' : 'notes'} · ${this._bpm} BPM · ${snapToGrid(0)} snap`

    if (this._selectedNoteIds.size > 0) {
      const sel = document.createElement('span')
      sel.textContent = ` · ${this._selectedNoteIds.size} selected`
      footer.appendChild(sel)
    }

    this._container.appendChild(footer)
  }

  _renderPianoGrid() {
    const body = document.createElement('div')
    body.style.cssText = 'flex:1;display:flex;overflow:hidden;position:relative'

    const scrollContainer = document.createElement('div')
    scrollContainer.style.cssText = 'flex:1;overflow:auto;position:relative'
    if (this._scrollX) scrollContainer.scrollLeft = this._scrollX
    if (this._scrollY) scrollContainer.scrollTop = this._scrollY
    scrollContainer.addEventListener('scroll', () => {
      this._scrollX = scrollContainer.scrollLeft
      this._scrollY = scrollContainer.scrollTop
    })

    const pianoKeys = document.createElement('div')
    pianoKeys.style.cssText = `width:${KEYBOARD_WIDTH}px;min-width:${KEYBOARD_WIDTH}px;background:var(--wz-bg,#111);border-right:1px solid var(--wz-border,#333);overflow:hidden;position:sticky;left:0;z-index:2`

    const totalPitches = this._highestPitch - this._lowestPitch + 1
    const usedPitches = new Set(this._notes.map(n => n.pitch))
    let visiblePitches = []
    for (let p = this._highestPitch; p >= this._lowestPitch; p--) {
      if (this._folded && !usedPitches.has(p)) continue
      visiblePitches.push(p)
    }
    if (visiblePitches.length === 0) {
      visiblePitches = Array.from({ length: totalPitches }, (_, i) => this._highestPitch - i)
    }

    const totalHeight = visiblePitches.length * ROW_HEIGHT
    const gridWidth = this._visibleBeats * this._pixelsPerBeat

    const gridArea = document.createElement('div')
    gridArea.style.cssText = `position:relative;width:${gridWidth}px;height:${totalHeight}px`

    const scaleNotes = new Set()
    if (this._highlightScale) {
      const rootPitch = pitchFromKey(this._key)
      const intervals = SCALE_NOTE_NAMES[this._scale] || SCALE_NOTE_NAMES['minor']
      for (let octave = -1; octave < 10; octave++) {
        for (const interval of intervals) {
          scaleNotes.add(rootPitch + interval + octave * 12)
        }
      }
    }

    pianoKeys.style.height = `${totalHeight}px`

    visiblePitches.forEach((pitch, vi) => {
      const y = vi * ROW_HEIGHT
      const isWhite = isWhiteKey(pitch)
      const inScale = scaleNotes.has(pitch)
      const noteName = midiToName(pitch)

      const keyEl = document.createElement('div')
      keyEl.style.cssText = `position:absolute;top:${y}px;left:0;right:0;height:${ROW_HEIGHT}px;display:flex;align-items:center;padding:0 4px;font-size:8px;color:${inScale ? 'var(--wz-text,#ddd)' : 'var(--wz-text-muted,#555)'};background:${isWhite ? 'var(--wz-surface,#1a1a1e)' : '#222'};border-bottom:1px solid var(--wz-border,#222);cursor:pointer;user-select:none`
      keyEl.textContent = noteName
      keyEl.dataset.pitch = pitch
      pianoKeys.appendChild(keyEl)

      const rowBg = document.createElement('div')
      rowBg.style.cssText = `position:absolute;top:${y}px;left:0;width:${gridWidth}px;height:${ROW_HEIGHT}px;background:${inScale ? 'transparent' : 'rgba(255,100,100,0.03)'};pointer-events:none;border-bottom:1px solid var(--wz-grid-line,rgba(255,255,255,0.04))`
      gridArea.appendChild(rowBg)

      for (let beat = 0; beat < this._visibleBeats; beat += 0.25) {
        const bx = beat * this._pixelsPerBeat
        if (beat % 1 === 0) {
          const beatLine = document.createElement('div')
          beatLine.style.cssText = `position:absolute;left:${bx}px;top:0;width:1px;height:${totalHeight}px;background:var(--wz-grid-line,rgba(255,255,255,0.06));pointer-events:none`
          gridArea.appendChild(beatLine)
        }
      }
    })

    for (const note of this._notes) {
      if (!visiblePitches.includes(note.pitch)) continue
      const vi = visiblePitches.indexOf(note.pitch)
      const y = vi * ROW_HEIGHT + 1
      const x = note.startBeat * this._pixelsPerBeat
      const w = Math.max(note.durationBeats * this._pixelsPerBeat, 4)
      const isSelected = this._selectedNoteIds.has(note.id)

      const el = document.createElement('div')
      el.dataset.noteId = note.id
      el.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${ROW_HEIGHT - 2}px;border-radius:3px;background:${isSelected ? '#4a9eff' : '#2ecc71'};border:${isSelected ? '2px solid #fff' : '1px solid rgba(255,255,255,0.15)'};cursor:pointer;z-index:${isSelected ? 3 : 2};box-sizing:border-box`

      el.addEventListener('mousedown', (e) => {
        e.stopPropagation()
        if (e.ctrlKey || e.metaKey) {
          this._toggleNoteSelection(note.id)
          return
        }
        this._selectNote(note.id)
        this._startDragNote(note.id, e, scrollContainer, visiblePitches, gridArea)
      })

      el.addEventListener('dblclick', () => {
        this._editVelocity(note.id, el)
      })

      gridArea.appendChild(el)

      const velBar = document.createElement('div')
      velBar.style.cssText = `position:absolute;left:${x}px;top:${y + ROW_HEIGHT - 3}px;width:${Math.max(w * note.velocity, 2)}px;height:2px;background:rgba(46,204,113,${note.velocity});border-radius:1px;pointer-events:none;z-index:1`
      gridArea.appendChild(velBar)
    }

    gridArea.addEventListener('mousedown', (e) => {
      if (e.target === gridArea || e.target.classList.contains('wz-pr-row-bg')) {
        const rect = gridArea.getBoundingClientRect()
        const x = e.clientX - rect.left + (scrollContainer?.scrollLeft || 0)
        const y = e.clientY - rect.top + (scrollContainer?.scrollTop || 0)
        const beat = snapToGrid(x / this._pixelsPerBeat)
        const pitchIdx = Math.floor(y / ROW_HEIGHT)
        if (pitchIdx >= 0 && pitchIdx < visiblePitches.length) {
          const pitch = visiblePitches[pitchIdx]
          this._addNote(pitch, beat)
        }
      }
    })

    scrollContainer.appendChild(gridArea)
    body.appendChild(pianoKeys)
    body.appendChild(scrollContainer)
    this._container.appendChild(body)

    this._gridArea = gridArea
    this._scrollContainer = scrollContainer
    this._visiblePitches = visiblePitches
  }

  _renderDrumGrid() {
    const body = document.createElement('div')
    body.style.cssText = 'flex:1;display:flex;overflow:hidden;position:relative'

    const scrollContainer = document.createElement('div')
    scrollContainer.style.cssText = 'flex:1;overflow:auto;position:relative'

    const soundLabels = document.createElement('div')
    soundLabels.style.cssText = `width:${KEYBOARD_WIDTH}px;min-width:${KEYBOARD_WIDTH}px;background:var(--wz-bg,#111);border-right:1px solid var(--wz-border,#333);overflow:hidden;position:sticky;left:0;z-index:2`

    const totalHeight = this._drumSounds.length * ROW_HEIGHT
    const gridWidth = this._visibleBeats * this._pixelsPerBeat

    const gridArea = document.createElement('div')
    gridArea.style.cssText = `position:relative;width:${gridWidth}px;height:${totalHeight}px`

    const soundColors = {
      kick: '#e74c3c', snare: '#e67e22', clap: '#f39c12',
      closed_hat: '#f1c40f', open_hat: '#f1c40f', tom: '#2ecc71',
      ride: '#3498db', crash: '#9b59b6', fx: '#1abc9c',
    }

    soundLabels.style.height = `${totalHeight}px`

    this._drumSounds.forEach((sound, si) => {
      const y = si * ROW_HEIGHT
      const label = document.createElement('div')
      label.style.cssText = `position:absolute;top:${y}px;left:0;right:0;height:${ROW_HEIGHT}px;display:flex;align-items:center;padding:0 4px;font-size:9px;color:var(--wz-text,#ddd);border-bottom:1px solid var(--wz-border,#222);border-left:3px solid ${soundColors[sound] || '#888'};user-select:none`
      label.textContent = sound.replace('_', ' ')
      soundLabels.appendChild(label)

      const rowBg = document.createElement('div')
      rowBg.style.cssText = `position:absolute;top:${y}px;left:0;width:${gridWidth}px;height:${ROW_HEIGHT}px;border-bottom:1px solid var(--wz-grid-line,rgba(255,255,255,0.04));pointer-events:none`
      gridArea.appendChild(rowBg)

      for (let beat = 0; beat < this._visibleBeats; beat += this._drumGridDivision) {
        const bx = beat * this._pixelsPerBeat
        if (beat % 1 === 0) {
          const beatLine = document.createElement('div')
          beatLine.style.cssText = `position:absolute;left:${bx}px;top:0;width:1px;height:${totalHeight}px;background:var(--wz-grid-line,rgba(255,255,255,0.08));pointer-events:none`
          gridArea.appendChild(beatLine)
        }
      }
    })

    for (const hit of this._drumHits) {
      const si = this._drumSounds.indexOf(hit.sound)
      if (si === -1) continue
      const y = si * ROW_HEIGHT + 2
      const x = hit.startBeat * this._pixelsPerBeat
      const w = Math.max(hit.durationBeats * this._pixelsPerBeat || this._pixelsPerBeat * 0.25, 6)
      const isSelected = this._selectedNoteIds.has(hit.id)

      const el = document.createElement('div')
      el.dataset.hitId = hit.id
      el.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${ROW_HEIGHT - 4}px;border-radius:3px;background:${isSelected ? '#4a9eff' : (soundColors[hit.sound] || '#888')};border:${isSelected ? '2px solid #fff' : '1px solid rgba(255,255,255,0.15)'};opacity:${hit.probability || 1};cursor:pointer;z-index:${isSelected ? 3 : 2};box-sizing:border-box`

      el.addEventListener('mousedown', (e) => {
        e.stopPropagation()
        if (e.ctrlKey || e.metaKey) {
          this._toggleNoteSelection(hit.id)
          return
        }
        this._selectNote(hit.id)
        this._startDragDrumHit(hit.id, e, scrollContainer, gridArea)
      })

      el.addEventListener('dblclick', () => {
        this._editHitVelocity(hit.id, el)
      })

      gridArea.appendChild(el)
    }

    gridArea.addEventListener('mousedown', (e) => {
      if (e.target === gridArea || e.target.classList.contains('wz-pr-row-bg') || e.target.tagName === 'DIV' && !e.target.dataset.hitId && !e.target.dataset.noteId) {
        const rect = gridArea.getBoundingClientRect()
        const x = e.clientX - rect.left + (scrollContainer?.scrollLeft || 0)
        const y = e.clientY - rect.top + (scrollContainer?.scrollTop || 0)
        const beat = snapToGrid(x / this._pixelsPerBeat)
        const soundIdx = Math.floor(y / ROW_HEIGHT)
        if (soundIdx >= 0 && soundIdx < this._drumSounds.length) {
          const sound = this._drumSounds[soundIdx]
          this._addDrumHit(sound, beat)
        }
      }
    })

    scrollContainer.appendChild(gridArea)
    body.appendChild(soundLabels)
    body.appendChild(scrollContainer)
    this._container.appendChild(body)

    this._gridArea = gridArea
    this._scrollContainer = scrollContainer
  }

  _addNote(pitch, beat) {
    const note = {
      id: crypto.randomUUID(),
      pitch,
      startBeat: beat,
      durationBeats: 1,
      velocity: DEFAULT_VELOCITY,
      probability: 1,
    }
    this._notes.push(note)
    this._selectNote(note.id)
    if (this._onNotesChange) this._onNotesChange(this._notes)
    if (this._autoRender) this.render()
  }

  _addDrumHit(sound, beat) {
    const hit = {
      id: crypto.randomUUID(),
      sound,
      startBeat: beat,
      durationBeats: 0.25,
      velocity: DEFAULT_VELOCITY,
      probability: 1,
    }
    this._drumHits.push(hit)
    this._selectNote(hit.id)
    if (this._onHitsChange) this._onHitsChange(this._drumHits)
    if (this._autoRender) this.render()
  }

  _selectNote(id) {
    this._selectedNoteIds.clear()
    this._selectedNoteIds.add(id)
    if (this._onNoteSelect) this._onNoteSelect(id)
  }

  _toggleNoteSelection(id) {
    if (this._selectedNoteIds.has(id)) {
      this._selectedNoteIds.delete(id)
    } else {
      this._selectedNoteIds.add(id)
    }
  }

  _startDragNote(noteId, e, scrollContainer, visiblePitches, gridArea) {
    const note = this._notes.find(n => n.id === noteId)
    if (!note) return
    const startX = e.clientX
    const startY = e.clientY
    const origBeat = note.startBeat
    const origPitch = note.pitch
    const scrollLeft = scrollContainer.scrollLeft
    const scrollTop = scrollContainer.scrollTop
    let moved = false

    const onMove = (em) => {
      moved = true
      const dx = em.clientX - startX
      const dy = em.clientY - startY
      const beatDelta = pixelsToBeat(dx)
      const pitchDelta = Math.round(-dy / ROW_HEIGHT)
      note.startBeat = snapToGrid(Math.max(0, origBeat + beatDelta))
      const newPitch = Math.max(0, Math.min(127, origPitch + pitchDelta))
      if (visiblePitches.includes(newPitch)) {
        note.pitch = newPitch
      }
      this.render()
    }

    const onEnd = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onEnd)
      if (moved && this._onNotesChange) this._onNotesChange(this._notes)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onEnd)
  }

  _startDragDrumHit(hitId, e, scrollContainer, gridArea) {
    const hit = this._drumHits.find(h => h.id === hitId)
    if (!hit) return
    const startX = e.clientX
    const origBeat = hit.startBeat
    let moved = false

    const onMove = (em) => {
      moved = true
      const dx = em.clientX - startX
      const beatDelta = pixelsToBeat(dx)
      hit.startBeat = snapToGrid(Math.max(0, origBeat + beatDelta))
      this.render()
    }

    const onEnd = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onEnd)
      if (moved && this._onHitsChange) this._onHitsChange(this._drumHits)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onEnd)
  }

  _editVelocity(noteId, el) {
    const note = this._notes.find(n => n.id === noteId)
    if (!note) return
    const input = document.createElement('input')
    input.type = 'range'
    input.min = 0
    input.max = 100
    input.value = Math.round(note.velocity * 100)
    input.style.cssText = 'position:absolute;left:0;right:0;bottom:-20px;z-index:10;width:100%;height:16px;margin:0'
    el.appendChild(input)
    input.focus()
    input.addEventListener('input', () => {
      note.velocity = parseInt(input.value) / 100
      if (this._onNotesChange) this._onNotesChange(this._notes)
    })
    input.addEventListener('blur', () => input.remove())
  }

  _editHitVelocity(hitId, el) {
    const hit = this._drumHits.find(h => h.id === hitId)
    if (!hit) return
    const input = document.createElement('input')
    input.type = 'range'
    input.min = 0
    input.max = 100
    input.value = Math.round(hit.velocity * 100)
    input.style.cssText = 'position:absolute;left:0;right:0;bottom:-20px;z-index:10;width:100%;height:16px;margin:0'
    el.appendChild(input)
    input.focus()
    input.addEventListener('input', () => {
      hit.velocity = parseInt(input.value) / 100
      if (this._onHitsChange) this._onHitsChange(this._drumHits)
    })
    input.addEventListener('blur', () => input.remove())
  }

  removeSelectedNotes() {
    for (const id of this._selectedNoteIds) {
      const ni = this._notes.findIndex(n => n.id === id)
      if (ni !== -1) this._notes.splice(ni, 1)
      const hi = this._drumHits.findIndex(h => h.id === id)
      if (hi !== -1) this._drumHits.splice(hi, 1)
    }
    this._selectedNoteIds.clear()
    if (this._onNotesChange) this._onNotesChange(this._notes)
    if (this._onHitsChange) this._onHitsChange(this._drumHits)
    if (this._autoRender) this.render()
  }

  quantizeSelected() {
    for (const id of this._selectedNoteIds) {
      const note = this._notes.find(n => n.id === id)
      if (note) {
        note.startBeat = snapToGrid(note.startBeat)
        note.durationBeats = Math.max(0.25, snapToGrid(note.durationBeats))
      }
      const hit = this._drumHits.find(h => h.id === id)
      if (hit) {
        hit.startBeat = snapToGrid(hit.startBeat)
      }
    }
    if (this._onNotesChange) this._onNotesChange(this._notes)
    if (this._onHitsChange) this._onHitsChange(this._drumHits)
    if (this._autoRender) this.render()
  }

  transposeSelected(semitones) {
    for (const id of this._selectedNoteIds) {
      const note = this._notes.find(n => n.id === id)
      if (note) {
        note.pitch = Math.max(0, Math.min(127, note.pitch + semitones))
      }
    }
    if (this._onNotesChange) this._onNotesChange(this._notes)
    if (this._autoRender) this.render()
  }

  duplicateSelected() {
    const newNotes = []
    for (const id of this._selectedNoteIds) {
      const note = this._notes.find(n => n.id === id)
      if (note) {
        const dup = { ...note, id: crypto.randomUUID(), startBeat: note.startBeat + 4 }
        this._notes.push(dup)
        newNotes.push(dup)
      }
      const hit = this._drumHits.find(h => h.id === id)
      if (hit) {
        const dup = { ...hit, id: crypto.randomUUID(), startBeat: hit.startBeat + 4 }
        this._drumHits.push(dup)
        newNotes.push(dup)
      }
    }
    this._selectedNoteIds = new Set(newNotes.map(n => n.id))
    if (this._onNotesChange) this._onNotesChange(this._notes)
    if (this._onHitsChange) this._onHitsChange(this._drumHits)
    if (this._autoRender) this.render()
  }

  selectAll() {
    if (this._drumMode) {
      this._selectedNoteIds = new Set(this._drumHits.map(h => h.id))
    } else {
      this._selectedNoteIds = new Set(this._notes.map(n => n.id))
    }
    if (this._autoRender) this.render()
  }

  deselectAll() {
    this._selectedNoteIds.clear()
    if (this._autoRender) this.render()
  }

  getSelectedNotes() {
    return this._notes.filter(n => this._selectedNoteIds.has(n.id))
  }

  getSelectedHits() {
    return this._drumHits.filter(h => this._selectedNoteIds.has(h.id))
  }

  setVisibleBeats(beats) {
    this._visibleBeats = Math.max(4, beats)
    if (this._autoRender) this.render()
  }

  getVisibleBeats() { return this._visibleBeats }

  setPixelsPerBeat(ppb) {
    this._pixelsPerBeat = Math.max(10, Math.min(200, ppb))
    if (this._autoRender) this.render()
  }

  refresh() {
    if (this._autoRender) this.render()
  }
}
