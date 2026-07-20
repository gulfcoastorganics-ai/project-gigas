import {
  configureTimeModel, beatToPixels, pixelsToBeat, barToBeats,
  beatToSeconds, snapToGrid, setPixelsPerBeat, getPixelsPerBeat,
  beatToString, getTimelineWidth, setSnapEnabled, getSnapEnabled,
  setSnapDivision, getSnapDivision, getTimeSig, beatsToBar
} from './timeModel.js'

const TRACK_LABEL_WIDTH = 160
const TRACK_HEIGHT = 56
const HEADER_HEIGHT = 32
const EMPTY_CLIP_COLOR = 'var(--wz-track-empty, #2a2a3a)'

let clipIdCounter = 0
function nextClipId() { return 'clip_' + (++clipIdCounter) }

export class TimelineView {
  constructor(container, opts = {}) {
    this._container = container
    this._project = null
    this._tracks = []
    this._clips = []
    this._selectedClipIds = new Set()
    this._selectedTrackId = null
    this._playheadBeat = -1
    this._loopStart = -1
    this._loopEnd = -1
    this._zoom = 1
    this._scrollX = 0
    this._scrollY = 0
    this._dragging = null
    this._resizing = null
    this._onClipSelect = opts.onClipSelect || null
    this._onTrackSelect = opts.onTrackSelect || null
    this._onPlayheadMove = opts.onPlayheadMove || null
    this._onClipMove = opts.onClipMove || null
    this._onClipResize = opts.onClipResize || null
    this._onClipSplit = opts.onClipSplit || null
    this._onClipDuplicate = opts.onClipDuplicate || null
    this._onClipDelete = opts.onClipDelete || null
    this._onTrackMute = opts.onTrackMute || null
    this._onTrackSolo = opts.onTrackSolo || null
    this._onTrackVolume = opts.onTrackVolume || null
    this._onTrackPan = opts.onTrackPan || null
    this._onTrackLock = opts.onTrackLock || null
    this._onTrackRename = opts.onTrackRename || null
    this._onSectionClick = opts.onSectionClick || null
    this._onAction = opts.onAction || null
    this._undoStack = []
    this._redoStack = []
    this._changed = false
  }

  setProject(project) {
    this._project = project
    this._syncTracksAndClips()
    if (project?.blueprint) {
      configureTimeModel({
        bpm: project.blueprint.bpm,
        timeSignature: project.blueprint.timeSignature || [4, 4],
        pixelsPerBeat: 40 * this._zoom,
      })
    }
    this._changed = true
  }

  getProject() { return this._project }

  get hasChanges() { return this._changed }

  _syncTracksAndClips() {
    if (!this._project) return
    const bp = this._project.blueprint
    if (!bp) return
    configureTimeModel({
      bpm: bp.bpm, timeSignature: bp.timeSignature || [4, 4], pixelsPerBeat: 40 * this._zoom,
    })

    const trackDefs = this._project.tracks || []
    const existingTrackIds = new Set(trackDefs.map(t => t.id))
    const usedTrackIds = new Set()

    const eventGroups = {}
    const allEvents = [
      ...(this._project.drums || []).map(e => ({ ...e, _type: 'drum' })),
      ...(this._project.notes || []).map(e => ({ ...e, _type: 'note' })),
      ...(this._project.bass || []).map(e => ({ ...e, _type: 'bass' })),
      ...(this._project.chords || []).map(e => ({ ...e, _type: 'chord' })),
      ...(this._project.transitions || []).map(e => ({ ...e, _type: 'transition' })),
    ]
    for (const ev of allEvents) {
      const tid = ev.trackId || 'master'
      usedTrackIds.add(tid)
      if (!eventGroups[tid]) eventGroups[tid] = []
      eventGroups[tid].push(ev)
    }

    if (!usedTrackIds.has('master') && allEvents.length > 0) usedTrackIds.add('master')

    for (const tid of existingTrackIds) usedTrackIds.add(tid)

    const sectionTrackMap = {}
    if (bp.sections) {
      for (const sec of bp.sections) {
        for (const tid of usedTrackIds) {
          const key = `${sec.id}_${tid}`
          sectionTrackMap[key] = true
        }
      }
    }

    this._tracks = []
    this._clips = []
    const trackOrder = ['kick', 'snare', 'hat', 'bass', 'lead', 'chords', 'fx', 'master']
    const sortedTrackIds = [...usedTrackIds].sort((a, b) => {
      const ai = trackOrder.indexOf(a)
      const bi = trackOrder.indexOf(b)
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    })

    for (const tid of sortedTrackIds) {
      const def = trackDefs.find(t => t.id === tid)
      this._tracks.push({
        id: tid,
        name: def?.name || tid,
        type: def?.type || (tid === 'master' ? 'audio' : this._inferType(tid)),
        volume: def?.volume ?? 1,
        pan: def?.pan ?? 0,
        muted: def?.muted ?? false,
        solo: def?.solo ?? false,
        locked: def?.locked ?? false,
        color: def?.color || this._trackColor(tid),
      })
    }

    const sections = bp.sections || []
    if (sections.length === 0) {
      for (const track of this._tracks) {
        this._clips.push({
          id: nextClipId(), trackId: track.id, startBeat: 0,
          durationBeats: bp.durationBars * 4, name: track.name,
          locked: false, muted: false, color: track.color,
          sectionId: null, eventCount: 0, editable: true,
        })
      }
      return
    }

    for (const section of sections) {
      const secStart = section.startBar * 4
      const secEnd = (section.startBar + section.lengthBars) * 4
      for (const track of this._tracks) {
        const trackEvents = (eventGroups[track.id] || []).filter(e =>
          e.startBeat >= secStart && e.startBeat < secEnd
        )
        this._clips.push({
          id: nextClipId(),
          trackId: track.id,
          startBeat: secStart,
          durationBeats: secEnd - secStart,
          name: `${section.name || section.type} - ${track.name}`,
          locked: track.locked || false,
          muted: track.muted || false,
          color: track.color,
          sectionId: section.id,
          sectionType: section.type,
          eventCount: trackEvents.length,
          editable: true,
        })
      }
    }
  }

  _inferType(tid) {
    if (tid === 'kick' || tid === 'snare' || tid === 'hat' || tid === 'clap') return 'drum'
    if (tid === 'bass') return 'bass'
    if (tid === 'lead' || tid === 'melody') return 'melody'
    if (tid === 'chords' || tid === 'harmony') return 'harmony'
    if (tid === 'fx') return 'fx'
    return 'audio'
  }

  _trackColor(tid) {
    const colors = {
      kick: '#e74c3c', snare: '#e67e22', hat: '#f1c40f',
      bass: '#2ecc71', lead: '#3498db', chords: '#9b59b6',
      fx: '#1abc9c', master: '#95a5a6',
    }
    return colors[tid] || '#7f8c8d'
  }

  render() {
    if (!this._container) return
    if (!this._changed) return
    this._changed = false
    this._container.innerHTML = ''
    this._container.style.position = 'relative'
    this._container.style.overflow = 'hidden'

    const totalBeats = this._project?.blueprint
      ? this._project.blueprint.durationBars * 4
      : 64
    const totalWidth = Math.max(getTimelineWidth(totalBeats), this._container.clientWidth - TRACK_LABEL_WIDTH)

    this._renderHeader(totalWidth)
    this._renderTracks(totalWidth)
    this._renderPlayhead()
    this._renderLoopRegion()
  }

  _renderHeader(totalWidth) {
    const header = document.createElement('div')
    header.className = 'wz-tl-header'
    header.style.cssText = `height:${HEADER_HEIGHT}px;position:sticky;top:0;z-index:3;display:flex;background:var(--wz-bg, #1a1a2e);border-bottom:1px solid var(--wz-border, #333)`

    const labelArea = document.createElement('div')
    labelArea.style.cssText = `width:${TRACK_LABEL_WIDTH}px;min-width:${TRACK_LABEL_WIDTH}px;display:flex;align-items:center;padding:0 8px;font-weight:700;font-size:12px;color:var(--wz-text, #ddd)`
    labelArea.textContent = 'Track'
    header.appendChild(labelArea)

    const rulerArea = document.createElement('div')
    rulerArea.style.cssText = `flex:1;overflow:hidden;position:relative`
    header.appendChild(rulerArea)

    const bp = this._project?.blueprint
    if (bp) {
      const timeSig = getTimeSig()
      const totalBars = bp.durationBars || 32
      for (let bar = 0; bar <= totalBars; bar++) {
        const beatPos = bar * timeSig[0]
        const x = beatToPixels(beatPos)
        const isMajor = bar % 4 === 0
        const mark = document.createElement('div')
        mark.style.cssText = `position:absolute;left:${x}px;top:0;width:1px;height:100%;background:${isMajor ? 'var(--wz-text, #ddd)' : 'var(--wz-border, #444)'};opacity:${isMajor ? 0.6 : 0.3}`
        rulerArea.appendChild(mark)

        const label = document.createElement('div')
        label.style.cssText = `position:absolute;left:${x + 3}px;top:2px;font-size:${isMajor ? 11 : 9}px;color:var(--wz-text-muted, #888);white-space:nowrap;pointer-events:none`
        label.textContent = `${bar + 1}`
        rulerArea.appendChild(label)
      }

      const sections = bp.sections || []
      for (const sec of sections) {
        const x = beatToPixels(sec.startBar * timeSig[0])
        const w = beatToPixels(sec.lengthBars * timeSig[0])
        if (w < 2) continue
        const badge = document.createElement('div')
        badge.className = 'wz-tl-section-badge'
        badge.style.cssText = `position:absolute;left:${x}px;top:${HEADER_HEIGHT - 14}px;width:${w - 1}px;height:14px;font-size:8px;display:flex;align-items:center;justify-content:center;color:var(--wz-text, #ccc);background:var(--wz-section-bg, rgba(255,255,255,0.05));border-radius:2px;cursor:pointer;overflow:hidden;white-space:nowrap`
        badge.textContent = sec.name || sec.type
        badge.dataset.sectionId = sec.id
        badge.addEventListener('click', (e) => {
          e.stopPropagation()
          if (this._onSectionClick) this._onSectionClick(sec)
        })
        rulerArea.appendChild(badge)
      }
    }

    header.querySelector('.wz-tl-header')?.remove()
    this._container.appendChild(header)
  }

  _renderTracks(totalWidth) {
    const bodyContainer = document.createElement('div')
    bodyContainer.className = 'wz-tl-body'
    bodyContainer.style.cssText = `overflow:auto;max-height:${Math.min(this._container.clientHeight - HEADER_HEIGHT, 600)}px;position:relative`
    bodyContainer.addEventListener('scroll', () => {
      this._scrollX = bodyContainer.scrollLeft
      this._scrollY = bodyContainer.scrollTop
    })
    if (this._scrollX) bodyContainer.scrollLeft = this._scrollX
    if (this._scrollY) bodyContainer.scrollTop = this._scrollY

    const inner = document.createElement('div')
    inner.style.cssText = `position:relative;min-width:${TRACK_LABEL_WIDTH + totalWidth}px`

    for (let ti = 0; ti < this._tracks.length; ti++) {
      const track = this._tracks[ti]
      const y = ti * TRACK_HEIGHT
      const row = document.createElement('div')
      row.className = 'wz-tl-track-row'
      row.style.cssText = `position:absolute;top:${y}px;left:0;right:0;height:${TRACK_HEIGHT}px;display:flex;border-bottom:1px solid var(--wz-border, #222)`
      if (track.id === this._selectedTrackId) {
        row.style.background = 'var(--wz-selected-bg, rgba(255,255,255,0.05))'
      }

      const label = this._createTrackLabel(track)
      row.appendChild(label)

      const lane = document.createElement('div')
      lane.style.cssText = `flex:1;position:relative;background:var(--wz-lane-bg, rgba(255,255,255,0.02))`
      lane.dataset.trackId = track.id

      lane.addEventListener('click', (e) => {
        if (e.target === lane || e.target.classList.contains('wz-tl-lane')) {
          this._selectTrack(track.id)
          if (this._onTrackSelect) this._onTrackSelect(track)
        }
      })

      for (const clip of this._clips) {
        if (clip.trackId !== track.id) continue
        const clipEl = this._createClipElement(clip)
        lane.appendChild(clipEl)
      }

      row.appendChild(lane)
      inner.appendChild(row)

      const beatLines = document.createElement('div')
      beatLines.style.cssText = `position:absolute;top:0;left:${TRACK_LABEL_WIDTH}px;right:0;height:100%;pointer-events:none`
      const bp = this._project?.blueprint
      if (bp) {
        const ts = getTimeSig()
        const totalBars = bp.durationBars || 32
        for (let bar = 0; bar <= totalBars; bar++) {
          const x = beatToPixels(bar * ts[0])
          if (x < 0) continue
          const line = document.createElement('div')
          line.style.cssText = `position:absolute;left:${x}px;top:0;width:1px;height:100%;background:var(--wz-grid-line, rgba(255,255,255,0.04))`
          beatLines.appendChild(line)
        }
      }
      inner.appendChild(beatLines)
    }

    const totalHeight = this._tracks.length * TRACK_HEIGHT
    inner.style.height = `${totalHeight}px`

    bodyContainer.appendChild(inner)
    this._container.appendChild(bodyContainer)

    this._bodyContainer = bodyContainer
    this._trackInner = inner
  }

  _createTrackLabel(track) {
    const label = document.createElement('div')
    label.className = 'wz-tl-track-label'
    label.style.cssText = `width:${TRACK_LABEL_WIDTH}px;min-width:${TRACK_LABEL_WIDTH}px;display:flex;flex-direction:column;justify-content:center;padding:4px 8px;background:var(--wz-track-label-bg, #1e1e30);border-right:1px solid var(--wz-border, #333);position:sticky;left:0;z-index:2;user-select:none`

    const nameRow = document.createElement('div')
    nameRow.style.cssText = 'display:flex;align-items:center;gap:4px'

    const nameSpan = document.createElement('span')
    nameSpan.textContent = track.name
    nameSpan.style.cssText = 'font-size:11px;font-weight:600;color:var(--wz-text, #ddd);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer'
    nameSpan.title = 'Click to rename'
    nameSpan.addEventListener('dblclick', () => {
      const input = document.createElement('input')
      input.type = 'text'
      input.value = track.name
      input.style.cssText = 'width:100%;font-size:11px;background:var(--wz-input-bg, #222);color:var(--wz-text, #ddd);border:1px solid var(--wz-accent, #4a9eff);border-radius:2px;padding:1px 4px'
      nameSpan.replaceWith(input)
      input.focus()
      input.select()
      input.addEventListener('blur', () => {
        const newName = input.value.trim() || track.name
        if (newName !== track.name && this._onTrackRename) {
          this._onTrackRename(track.id, newName)
        }
        nameSpan.textContent = newName
        input.replaceWith(nameSpan)
      })
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') input.blur()
        if (e.key === 'Escape') { input.value = track.name; input.blur() }
      })
    })
    nameRow.appendChild(nameSpan)

    const controls = document.createElement('div')
    controls.style.cssText = 'display:flex;gap:2px;margin-top:2px;flex-wrap:wrap'

    const addBtn = (label, action, active, color) => {
      const btn = document.createElement('button')
      btn.textContent = label
      btn.title = `${action} ${track.name}`
      btn.style.cssText = `font-size:9px;padding:1px 4px;border:1px solid ${active ? 'var(--wz-accent, #4a9eff)' : 'var(--wz-border, #444)'};border-radius:2px;background:${active ? 'var(--wz-accent, #4a9eff)' : 'transparent'};color:${active ? '#fff' : 'var(--wz-text-muted, #888)'};cursor:pointer;line-height:1.2`
      btn.dataset.trackId = track.id
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        btn.dataset.handled = 'true'
        if (action === 'mute' && this._onTrackMute) this._onTrackMute(track.id, !track.muted)
        if (action === 'solo' && this._onTrackSolo) this._onTrackSolo(track.id, !track.solo)
        if (action === 'lock' && this._onTrackLock) this._onTrackLock(track.id, !track.locked)
      })
      return btn
    }

    controls.appendChild(addBtn('M', 'mute', track.muted, '#e74c3c'))
    controls.appendChild(addBtn('S', 'solo', track.solo, '#f1c40f'))
    controls.appendChild(addBtn('🔒', 'lock', track.locked, '#9b59b6'))

    label.appendChild(nameRow)
    label.appendChild(controls)
    return label
  }

  _createClipElement(clip) {
    const el = document.createElement('div')
    el.className = 'wz-tl-clip'
    el.dataset.clipId = clip.id
    el.dataset.trackId = clip.trackId

    const x = beatToPixels(clip.startBeat)
    const w = Math.max(beatToPixels(clip.durationBeats), 4)
    const isSelected = this._selectedClipIds.has(clip.id)

    el.style.cssText = `
      position:absolute;left:${x}px;top:4px;width:${w}px;
      height:${TRACK_HEIGHT - 8}px;border-radius:4px;
      background:${isSelected ? 'var(--wz-clip-selected, #4a9eff)' : clip.color || EMPTY_CLIP_COLOR};
      opacity:${clip.muted ? 0.4 : 1};
      border:${isSelected ? '2px solid #fff' : '1px solid rgba(255,255,255,0.1)'};
      cursor:${clip.locked ? 'default' : 'pointer'};
      display:flex;flex-direction:column;justify-content:space-between;
      overflow:hidden;user-select:none;z-index:${isSelected ? 2 : 1};
      box-sizing:border-box
    `

    if (clip.locked) {
      el.style.background = `repeating-linear-gradient(45deg, ${clip.color || EMPTY_CLIP_COLOR}, ${clip.color || EMPTY_CLIP_COLOR} 4px, rgba(0,0,0,0.2) 4px, rgba(0,0,0,0.2) 8px)`
    }

    const nameEl = document.createElement('div')
    nameEl.style.cssText = 'font-size:9px;padding:2px 4px;color:rgba(255,255,255,0.9);overflow:hidden;text-overflow:ellipsis;white-space:nowrap'
    nameEl.textContent = clip.name
    el.appendChild(nameEl)

    const meta = document.createElement('div')
    meta.style.cssText = 'font-size:7px;padding:0 4px 2px;color:rgba(255,255,255,0.5);display:flex;justify-content:space-between'
    const startLabel = beatToString(clip.startBeat)
    meta.innerHTML = `<span>${startLabel}</span><span>${clip.eventCount || 0} ev</span>`
    el.appendChild(meta)

    el.addEventListener('click', (e) => {
      e.stopPropagation()
      if (e.ctrlKey || e.metaKey) {
        this._toggleClipSelection(clip.id)
      } else {
        this._selectClip(clip.id)
      }
    })

    el.addEventListener('dblclick', () => {
      if (this._onAction) this._onAction('openClip', clip)
    })

    if (!clip.locked) {
      this._addDragHandlers(el, clip)
      this._addResizeHandlers(el, clip)
    }

    return el
  }

  _addDragHandlers(el, clip) {
    let startX, startBeat, moved

    const onStart = (ex) => {
      if (clip.locked) return
      startX = ex.clientX
      startBeat = clip.startBeat
      moved = false
      el.style.cursor = 'grabbing'
      el.style.zIndex = '10'
      el.style.opacity = '0.8'

      const onMove = (em) => {
        const dx = em.clientX - startX
        if (Math.abs(dx) > 3) moved = true
        const beatDelta = pixelsToBeat(dx)
        const newBeat = snapToGrid(startBeat + beatDelta)
        const maxBeat = this._project?.blueprint
          ? (this._project.blueprint.durationBars * 4) - clip.durationBeats
          : 256
        el.style.left = `${beatToPixels(Math.max(0, Math.min(newBeat, maxBeat)))}px`
      }

      const onEnd = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onEnd)
        el.style.cursor = 'pointer'
        el.style.opacity = '1'
        if (!moved) return
        const finalBeat = snapToGrid(startBeat + pixelsToBeat(parseFloat(el.style.left) - beatToPixels(startBeat)))
        const clampedBeat = Math.max(0, Math.min(finalBeat,
          (this._project?.blueprint?.durationBars || 64) * 4 - clip.durationBeats))
        el.style.left = `${beatToPixels(clampedBeat)}px`
        if (this._onClipMove) this._onClipMove(clip.id, clampedBeat)
        clip.startBeat = clampedBeat
      }

      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onEnd)
    }

    el.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('wz-tl-resize-handle')) return
      onStart(e)
    })
  }

  _addResizeHandlers(el, clip) {
    const handleSize = 6
    const handleL = document.createElement('div')
    handleL.className = 'wz-tl-resize-handle wz-tl-resize-left'
    handleL.style.cssText = `position:absolute;left:0;top:0;width:${handleSize}px;height:100%;cursor:w-resize;z-index:3`
    const handleR = document.createElement('div')
    handleR.className = 'wz-tl-resize-handle wz-tl-resize-right'
    handleR.style.cssText = `position:absolute;right:0;top:0;width:${handleSize}px;height:100%;cursor:e-resize;z-index:3`

    el.appendChild(handleL)
    el.appendChild(handleR)

    const makeResizer = (side) => {
      let startX, startDur, startBeat, startW

      const onStart = (e) => {
        e.stopPropagation()
        startX = e.clientX
        startDur = clip.durationBeats
        startBeat = clip.startBeat
        const rect = el.getBoundingClientRect()
        startW = rect.width
        el.style.zIndex = '10'

        const onMove = (em) => {
          const dx = em.clientX - startX
          const durDelta = pixelsToBeat(dx)
          if (side === 'left') {
            const newBeat = snapToGrid(startBeat + durDelta)
            const clampedNewBeat = Math.max(0, Math.min(newBeat, startBeat + startDur - 0.25))
            const newDur = startDur - (clampedNewBeat - startBeat)
            el.style.left = `${beatToPixels(clampedNewBeat)}px`
            el.style.width = `${Math.max(beatToPixels(newDur), 4)}px`
          } else {
            const newDur = snapToGrid(Math.max(0.25, startDur + durDelta))
            const maxDur = (this._project?.blueprint?.durationBars || 64) * 4 - startBeat
            el.style.width = `${Math.max(beatToPixels(Math.min(newDur, maxDur)), 4)}px`
          }
        }

        const onEnd = () => {
          document.removeEventListener('mousemove', onMove)
          document.removeEventListener('mouseup', onEnd)
          el.style.zIndex = '1'
          if (side === 'left') {
            const newLeft = parseFloat(el.style.left)
            const newStart = pixelsToBeat(newLeft)
            const newDur = snapToGrid(startDur + startBeat - newStart)
            const clampedDur = Math.max(0.25, newDur)
            clip.startBeat = pixelsToBeat(newLeft)
            clip.durationBeats = clampedDur
            if (this._onClipResize) this._onClipResize(clip.id, clip.startBeat, clip.durationBeats)
          } else {
            const newW = parseFloat(el.style.width)
            clip.durationBeats = Math.max(0.25, pixelsToBeat(newW))
            if (this._onClipResize) this._onClipResize(clip.id, clip.startBeat, clip.durationBeats)
          }
        }

        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onEnd)
      }

      handleL.addEventListener('mousedown', (e) => { if (side === 'left') onStart(e) })
      handleR.addEventListener('mousedown', (e) => { if (side === 'right') onStart(e) })
    }

    makeResizer('left')
    makeResizer('right')
  }

  _renderPlayhead() {
    if (this._playheadBeat < 0) return
    const x = beatToPixels(this._playheadBeat) + TRACK_LABEL_WIDTH
    const old = this._container.querySelector('.wz-tl-playhead')
    if (old) old.remove()
    const ph = document.createElement('div')
    ph.className = 'wz-tl-playhead'
    ph.style.cssText = `position:absolute;left:${x}px;top:0;width:2px;height:100%;background:var(--wz-playhead, #e74c3c);z-index:10;pointer-events:none;box-shadow:0 0 4px rgba(231,76,60,0.5)`
    ph.id = 'wz-tl-playhead-el'
    this._container.appendChild(ph)
  }

  _renderLoopRegion() {
    const old = this._container.querySelector('.wz-tl-loop-region')
    if (old) old.remove()
    if (this._loopStart < 0 || this._loopEnd < 0) return
    const x = beatToPixels(this._loopStart) + TRACK_LABEL_WIDTH
    const w = beatToPixels(this._loopEnd - this._loopStart)
    const region = document.createElement('div')
    region.className = 'wz-tl-loop-region'
    region.style.cssText = `position:absolute;left:${x}px;top:${HEADER_HEIGHT}px;width:${w}px;height:${this._tracks.length * TRACK_HEIGHT}px;background:rgba(74,158,255,0.08);border:1px solid rgba(74,158,255,0.3);z-index:5;pointer-events:none`
    this._container.appendChild(region)
  }

  setPlayhead(beat) {
    this._playheadBeat = beat
    this._changed = true
    this._renderPlayhead()
  }

  setLoop(start, end) {
    this._loopStart = start
    this._loopEnd = end
    this._renderLoopRegion()
  }

  clearLoop() {
    this._loopStart = -1
    this._loopEnd = -1
    this._renderLoopRegion()
  }

  setZoom(zoom) {
    this._zoom = Math.max(0.25, Math.min(4, zoom))
    setPixelsPerBeat(40 * this._zoom)
    this._changed = true
  }

  getZoom() { return this._zoom }

  zoomIn() { this.setZoom(this._zoom * 1.25) }
  zoomOut() { this.setZoom(this._zoom / 1.25) }

  _selectTrack(trackId) {
    this._selectedTrackId = trackId
    this._selectedClipIds.clear()
    this._changed = true
  }

  _selectClip(clipId) {
    this._selectedClipIds.clear()
    this._selectedClipIds.add(clipId)
    const clip = this._clips.find(c => c.id === clipId)
    if (clip) this._selectedTrackId = clip.trackId
    this._changed = true
    if (this._onClipSelect) this._onClipSelect(clip)
  }

  _toggleClipSelection(clipId) {
    if (this._selectedClipIds.has(clipId)) {
      this._selectedClipIds.delete(clipId)
    } else {
      this._selectedClipIds.add(clipId)
    }
    this._changed = true
  }

  selectAll() {
    this._selectedClipIds = new Set(this._clips.map(c => c.id))
    this._changed = true
  }

  deselectAll() {
    this._selectedClipIds.clear()
    this._changed = true
  }

  getSelectedClips() {
    return this._clips.filter(c => this._selectedClipIds.has(c.id))
  }

  getSelectedTrack() {
    return this._tracks.find(t => t.id === this._selectedTrackId) || null
  }

  getTrack(trackId) {
    return this._tracks.find(t => t.id === trackId) || null
  }

  getClip(clipId) {
    return this._clips.find(c => c.id === clipId) || null
  }

  getAllTracks() { return this._tracks }
  getAllClips() { return this._clips }

  splitClip(clipId, splitBeat) {
    const clip = this._clips.find(c => c.id === clipId)
    if (!clip || clip.locked) return null
    if (splitBeat <= clip.startBeat || splitBeat >= clip.startBeat + clip.durationBeats) return null
    const splitSnapped = snapToGrid(splitBeat)
    const leftDur = splitSnapped - clip.startBeat
    const rightDur = clip.durationBeats - leftDur
    if (leftDur < 0.25 || rightDur < 0.25) return null

    this._pushUndo()
    clip.durationBeats = leftDur
    const newClip = {
      ...clip,
      id: nextClipId(),
      startBeat: splitSnapped,
      durationBeats: rightDur,
      eventCount: 0,
    }
    const idx = this._clips.indexOf(clip)
    this._clips.splice(idx + 1, 0, newClip)
    this._changed = true
    return { left: clip, right: newClip }
  }

  duplicateClip(clipId) {
    const clip = this._clips.find(c => c.id === clipId)
    if (!clip || clip.locked) return null
    this._pushUndo()
    const newClip = {
      ...clip,
      id: nextClipId(),
      startBeat: clip.startBeat + clip.durationBeats + 1,
      eventCount: clip.eventCount,
    }
    this._clips.push(newClip)
    this._changed = true
    return newClip
  }

  deleteClip(clipId) {
    const idx = this._clips.findIndex(c => c.id === clipId)
    if (idx === -1) return false
    const clip = this._clips[idx]
    if (clip.locked) return false
    this._pushUndo()
    this._clips.splice(idx, 1)
    this._selectedClipIds.delete(clipId)
    this._changed = true
    return true
  }

  _pushUndo() {
    this._undoStack.push(JSON.parse(JSON.stringify(this._clips)))
    if (this._undoStack.length > 50) this._undoStack.shift()
    this._redoStack = []
  }

  undo() {
    if (this._undoStack.length === 0) return false
    this._redoStack.push(JSON.parse(JSON.stringify(this._clips)))
    this._clips = this._undoStack.pop()
    this._changed = true
    return true
  }

  redo() {
    if (this._redoStack.length === 0) return false
    this._undoStack.push(JSON.parse(JSON.stringify(this._clips)))
    this._clips = this._redoStack.pop()
    this._changed = true
    return true
  }

  canUndo() { return this._undoStack.length > 0 }
  canRedo() { return this._redoStack.length > 0 }

  getClipBeatFromClick(clientX) {
    const rect = this._container.getBoundingClientRect()
    const x = clientX - rect.left - TRACK_LABEL_WIDTH + (this._bodyContainer?.scrollLeft || 0)
    return snapToGrid(pixelsToBeat(x))
  }

  getTrackFromClick(clientY) {
    const rect = this._container.getBoundingClientRect()
    const y = clientY - rect.top - HEADER_HEIGHT + (this._bodyContainer?.scrollTop || 0)
    const idx = Math.floor(y / TRACK_HEIGHT)
    if (idx >= 0 && idx < this._tracks.length) return this._tracks[idx]
    return null
  }

  clickPlayhead(clientX) {
    const beat = this.getClipBeatFromClick(clientX)
    if (beat >= 0 && this._onPlayheadMove) {
      this._onPlayheadMove(beat)
    }
    return beat
  }

  refresh() {
    this._changed = true
    this.render()
  }

  updateTrack(trackId, updates) {
    const track = this._tracks.find(t => t.id === trackId)
    if (!track) return
    Object.assign(track, updates)
    this._changed = true
  }

  updateClip(clipId, updates) {
    const clip = this._clips.find(c => c.id === clipId)
    if (!clip) return
    Object.assign(clip, updates)
    this._changed = true
  }

  syncMuteSolo() {
    const hasSolo = this._tracks.some(t => t.solo)
    for (const clip of this._clips) {
      const track = this._tracks.find(t => t.id === clip.trackId)
      if (!track) continue
      clip.muted = track.muted || (hasSolo && !track.solo)
    }
    this._changed = true
  }
}
