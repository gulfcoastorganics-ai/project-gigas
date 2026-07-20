import { getAudioEngine } from '../instruments/engine.js'

export class WAVExporter {
  constructor(options = {}) {
    this._sampleRate = options.sampleRate || 44100
    this._tailMs = options.tailMs || 2000
    this._cancelled = false
    this._onProgress = options.onProgress || null
  }

  cancel() {
    this._cancelled = true
  }

  async renderFullMix(project) {
    return this._renderStems(project, null)
  }

  async renderStem(project, trackIds) {
    return this._renderStems(project, trackIds)
  }

  async renderSection(project, sectionId) {
    const section = project?.blueprint?.sections?.find(s => s.id === sectionId)
    if (!section) throw new Error(`Section ${sectionId} not found`)

    const sectionProject = {
      ...project,
      blueprint: {
        ...project.blueprint,
        sections: [section],
        durationBars: section.lengthBars,
      },
      drums: (project.drums || []).filter(d =>
        d.startBeat >= section.startBar * 4 &&
        d.startBeat < (section.startBar + section.lengthBars) * 4
      ).map(d => ({
        ...d,
        startBeat: d.startBeat - section.startBar * 4,
      })),
      bass: (project.bass || []).filter(b =>
        b.startBeat >= section.startBar * 4 &&
        b.startBeat < (section.startBar + section.lengthBars) * 4
      ).map(b => ({
        ...b,
        startBeat: b.startBeat - section.startBar * 4,
      })),
      notes: (project.notes || []).filter(n =>
        n.startBeat >= section.startBar * 4 &&
        n.startBeat < (section.startBar + section.lengthBars) * 4
      ).map(n => ({
        ...n,
        startBeat: n.startBeat - section.startBar * 4,
      })),
    }

    return this._renderStems(sectionProject, null)
  }

  async _renderStems(project, trackIds) {
    if (!project?.blueprint) throw new Error('No project to render')
    this._cancelled = false

    const bpm = project.blueprint.bpm
    const durationBars = project.blueprint.durationBars || 16
    const beatsPerBar = 4
    const totalBeats = durationBars * beatsPerBar
    const beatDuration = 60 / bpm
    const totalDurationSec = totalBeats * beatDuration + this._tailMs / 1000

    if (totalDurationSec > 300) {
      throw new Error('Render exceeds 5 minutes — aborting for memory safety')
    }

    const sampleRate = this._sampleRate
    const totalSamples = Math.ceil(totalDurationSec * sampleRate)
    const numChannels = 2

    const tracks = trackIds
      ? (project.tracks || []).filter(t => trackIds.includes(t.id))
      : (project.tracks || [])

    const stemBuffers = []

    for (const track of tracks) {
      if (this._cancelled) break
      if (this._onProgress) this._onProgress(`Rendering ${track.name}...`, stemBuffers.length + 1, tracks.length)

      const buffer = await this._renderTrack(track, project, bpm, totalBeats, beatDuration, sampleRate, numChannels)
      if (buffer) {
        stemBuffers.push({ trackId: track.id, trackName: track.name, buffer })
      }
    }

    if (this._cancelled) {
      this._releaseBuffers(stemBuffers)
      throw new DOMException('Render cancelled', 'AbortError')
    }

    if (trackIds && trackIds.length > 0) {
      if (stemBuffers.length === 1) {
        return { stems: stemBuffers, mix: stemBuffers[0].buffer }
      }
      const mix = this._mixBuffers(stemBuffers.map(s => s.buffer), numChannels, sampleRate)
      return { stems: stemBuffers, mix }
    }

    if (stemBuffers.length === 0) {
      const empty = new AudioBuffer({ length: totalSamples, sampleRate, numberOfChannels: numChannels })
      return { stems: [], mix: empty }
    }

    const mix = this._mixBuffers(stemBuffers.map(s => s.buffer), numChannels, sampleRate)
    return { stems: stemBuffers, mix }
  }

  async _renderTrack(track, project, bpm, totalBeats, beatDuration, sampleRate, numChannels) {
    const ctx = new OfflineAudioContext(numChannels, Math.ceil(totalBeats * beatDuration * sampleRate) + Math.ceil(this._tailMs / 1000 * sampleRate), sampleRate)

    const masterGain = ctx.createGain()
    masterGain.gain.value = 0.8
    masterGain.connect(ctx.destination)

    const trackGain = ctx.createGain()
    trackGain.gain.value = track.volume ?? 1
    trackGain.connect(masterGain)

    if (track.type === 'drum' || track.id === 'kick' || track.id === 'snare' || track.id === 'hat') {
      const trackDrums = (project.drums || []).filter(d => d.trackId === track.id)
      for (const drum of trackDrums) {
        this._scheduleDrumRender(ctx, drum, bpm, trackGain)
      }
    } else if (track.type === 'bass' || track.id === 'bass') {
      const trackBass = (project.bass || []).filter(b => b.trackId === track.id || !b.trackId)
      for (const b of trackBass) {
        this._scheduleBassRender(ctx, b, bpm, trackGain)
      }
    } else if (track.type === 'melody' || track.id === 'lead') {
      const trackNotes = (project.notes || []).filter(n => n.trackId === track.id)
      for (const note of trackNotes) {
        this._scheduleNoteRender(ctx, note, bpm, trackGain)
      }
    }

    try {
      const buffer = await ctx.startRendering()
      return buffer
    } catch {
      return null
    }
  }

  _scheduleDrumRender(ctx, drum, bpm, dest) {
    const beatDur = 60 / bpm
    const startTime = drum.startBeat * beatDur
    const vel = drum.velocity || 0.8

    if (drum.sound === 'kick') {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(150, startTime)
      osc.frequency.exponentialRampToValueAtTime(30, startTime + 0.1)
      gain.gain.setValueAtTime(vel, startTime)
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3)
      osc.connect(gain).connect(dest)
      osc.start(startTime)
      osc.stop(startTime + 0.4)
    } else if (drum.sound === 'snare' || drum.sound === 'clap') {
      const bufferSize = Math.ceil(ctx.sampleRate * 0.1)
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
      const data = noiseBuffer.getChannelData(0)
      for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize)
      const noise = ctx.createBufferSource()
      noise.buffer = noiseBuffer
      const gain = ctx.createGain()
      const filter = ctx.createBiquadFilter()
      filter.type = 'highpass'
      filter.frequency.value = 200
      gain.gain.setValueAtTime(vel * 0.8, startTime)
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.2)
      noise.connect(filter).connect(gain).connect(dest)
      noise.start(startTime)
      noise.stop(startTime + 0.3)
    } else if (drum.sound === 'closed_hat' || drum.sound === 'open_hat') {
      const isOpen = drum.sound === 'open_hat'
      const bufLen = Math.ceil(ctx.sampleRate * (isOpen ? 0.3 : 0.05))
      const noiseBuffer = ctx.createBuffer(1, bufLen, ctx.sampleRate)
      const data = noiseBuffer.getChannelData(0)
      for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufLen, isOpen ? 1 : 3)
      const noise = ctx.createBufferSource()
      noise.buffer = noiseBuffer
      const filter = ctx.createBiquadFilter()
      filter.type = 'highpass'
      filter.frequency.value = isOpen ? 5000 : 8000
      const gain = ctx.createGain()
      gain.gain.value = vel * (isOpen ? 0.3 : 0.4)
      noise.connect(filter).connect(gain).connect(dest)
      noise.start(startTime)
      noise.stop(startTime + (isOpen ? 0.35 : 0.1))
    }
  }

  _scheduleBassRender(ctx, bassEvent, bpm, dest) {
    const beatDur = 60 / bpm
    const startTime = bassEvent.startBeat * beatDur
    const duration = Math.max(0.25, bassEvent.durationBeats * beatDur)
    const freq = 440 * Math.pow(2, (bassEvent.rootNote - 69) / 12)
    const articulation = bassEvent.articulation || 'sub'
    const intensity = bassEvent.intensity || 0.7

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    const filter = ctx.createBiquadFilter()

    if (articulation === 'sub') {
      osc.type = 'sine'
      filter.type = 'lowpass'
      filter.frequency.value = 200
    } else if (articulation === 'growl') {
      osc.type = 'sawtooth'
      filter.type = 'lowpass'
      filter.frequency.setValueAtTime(800, startTime)
      filter.frequency.linearRampToValueAtTime(4000, startTime + duration * 0.5)
      filter.frequency.linearRampToValueAtTime(200, startTime + duration)
      filter.Q.value = 2
    } else if (articulation === 'wobble') {
      osc.type = 'sawtooth'
      filter.type = 'lowpass'
      filter.frequency.value = 2000
      filter.Q.value = 5
      const lfo = ctx.createOscillator()
      const lfoGain = ctx.createGain()
      lfo.frequency.value = 2 + intensity * 6
      lfoGain.gain.value = 1500
      lfo.connect(lfoGain).connect(filter.frequency)
      lfo.start(startTime)
      lfo.stop(startTime + duration + 0.1)
    } else if (articulation === 'screech') {
      osc.type = 'square'
      filter.type = 'highpass'
      filter.frequency.value = 2000
      filter.Q.value = 3
    } else {
      osc.type = 'sawtooth'
      filter.type = 'bandpass'
      filter.frequency.value = 1000
      filter.Q.value = 8
    }

    osc.frequency.value = freq
    gain.gain.setValueAtTime(intensity * 0.5, startTime)
    gain.gain.linearRampToValueAtTime(intensity * 0.3, startTime + duration * 0.5)
    gain.gain.setValueAtTime(intensity * 0.3, startTime + duration - 0.05)
    gain.gain.linearRampToValueAtTime(0, startTime + duration)

    osc.connect(filter).connect(gain).connect(dest)
    osc.start(startTime)
    osc.stop(startTime + duration + 0.1)
  }

  _scheduleNoteRender(ctx, note, bpm, dest) {
    const beatDur = 60 / bpm
    const startTime = note.startBeat * beatDur
    const duration = Math.max(0.25, note.durationBeats * beatDur)
    const freq = 440 * Math.pow(2, (note.pitch - 69) / 12)
    const vel = note.velocity || 0.5

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    const filter = ctx.createBiquadFilter()

    osc.type = 'sawtooth'
    filter.type = 'lowpass'
    filter.frequency.value = 4000
    filter.Q.value = 1

    osc.frequency.value = freq
    gain.gain.setValueAtTime(vel * 0.4, startTime)
    gain.gain.linearRampToValueAtTime(vel * 0.2, startTime + duration * 0.5)
    gain.gain.linearRampToValueAtTime(0, startTime + duration)

    const detune = ctx.createOscillator()
    const detuneGain = ctx.createGain()
    detune.frequency.value = 5
    detuneGain.gain.value = 5
    detune.connect(detuneGain).connect(osc.frequency)
    detune.start(startTime)
    detune.stop(startTime + duration + 0.1)

    osc.connect(filter).connect(gain).connect(dest)
    osc.start(startTime)
    osc.stop(startTime + duration + 0.1)
  }

  _mixBuffers(buffers, numChannels, sampleRate) {
    const maxLen = Math.max(...buffers.map(b => b.length))
    const result = new AudioBuffer({ length: maxLen, sampleRate, numberOfChannels: numChannels })
    for (let ch = 0; ch < numChannels; ch++) {
      const output = result.getChannelData(ch)
      for (const buf of buffers) {
        const input = buf.getChannelData(Math.min(ch, buf.numberOfChannels - 1))
        for (let i = 0; i < input.length; i++) {
          output[i] += input[i]
        }
      }
    }
    return result
  }

  _releaseBuffers(stemBuffers) {
    for (const sb of stemBuffers) {
      sb.buffer = null
    }
    stemBuffers.length = 0
  }
}

export function audioBufferToWAV(buffer) {
  const numCh = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const length = buffer.length
  const bytesPerSample = 2
  const dataSize = length * numCh * bytesPerSample
  const headerSize = 44
  const totalSize = headerSize + dataSize

  const arrayBuffer = new ArrayBuffer(totalSize)
  const view = new DataView(arrayBuffer)

  writeStr(view, 0, 'RIFF')
  view.setUint32(4, totalSize - 8, true)
  writeStr(view, 8, 'WAVE')
  writeStr(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numCh, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * numCh * bytesPerSample, true)
  view.setUint16(32, numCh * bytesPerSample, true)
  view.setUint16(34, bytesPerSample * 8, true)
  writeStr(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  let offset = 44
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]))
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF
      view.setInt16(offset, Math.round(intSample), true)
      offset += 2
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' })
}

export function downloadWAV(blob, filename = 'wubflipz-export.wav') {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function writeStr(view, offset, str) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i))
  }
}
