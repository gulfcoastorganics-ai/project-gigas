const GM_DRUM_MAP = {
  kick: 36, snare: 38, clap: 39, closed_hat: 42, open_hat: 46,
  tom: 45, ride: 51, crash: 49, fx: 76,
}

export class MIDIWriter {
  constructor(bpm = 140, ticksPerBeat = 480) {
    this._bpm = bpm
    this._tpb = ticksPerBeat
    this._tracks = []
  }

  addTrack(name, events, isDrum = false) {
    this._tracks.push({ name, events, isDrum })
  }

  addNoteTrack(name, notes, channel = 0) {
    const events = (notes || []).map(n => ({
      tick: Math.round(n.startBeat * this._tpb),
      duration: Math.round(n.durationBeats * this._tpb),
      pitch: clamp(0, 127, Math.round(n.pitch)),
      velocity: clamp(0, 127, Math.round((n.velocity || 0.7) * 127)),
      channel,
    }))
    this.addTrack(name, events)
  }

  addDrumTrack(name, drums, channel = 9) {
    const events = (drums || []).map(d => ({
      tick: Math.round(d.startBeat * this._tpb),
      duration: Math.round((d.durationBeats || 0.25) * this._tpb),
      pitch: GM_DRUM_MAP[d.sound] || 36,
      velocity: clamp(0, 127, Math.round((d.velocity || 0.8) * 127)),
      channel,
    }))
    this.addTrack(name, events, true)
  }

  toBytes() {
    const trackChunks = this._tracks.map(t => this._encodeTrack(t))
    const header = this._encodeHeader()
    const total = header.length + trackChunks.reduce((s, c) => s + c.length, 0)
    const result = new Uint8Array(total)
    result.set(header, 0)
    let offset = header.length
    for (const chunk of trackChunks) {
      result.set(chunk, offset)
      offset += chunk.length
    }
    return result
  }

  toBlob() {
    return new Blob([this.toBytes()], { type: 'audio/midi' })
  }

  download(filename = 'wubflipz-export.mid') {
    const blob = this.toBlob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  _encodeHeader() {
    const buf = new ArrayBuffer(14)
    const v = new DataView(buf)
    writeStr(v, 0, 'MThd')
    v.setUint32(4, 6, false)
    v.setUint16(8, this._tracks.length > 1 ? 1 : 0, false)
    v.setUint16(10, this._tracks.length, false)
    v.setUint16(12, this._tpb, false)
    return new Uint8Array(buf)
  }

  _encodeTrack(track) {
    const events = []
    const tempoUs = Math.round(60000000 / this._bpm)

    const tempoBytes = new Uint8Array([(tempoUs >> 16) & 0xFF, (tempoUs >> 8) & 0xFF, tempoUs & 0xFF])
    events.push(this._encodeMetaEvent(0, 0x51, tempoBytes))

    const nameBytes = strBytes(track.name || '')
    events.push(this._encodeMetaEvent(0, 0x03, nameBytes))

    const tsBytes = new Uint8Array([4, 2, 24, 8])
    events.push(this._encodeMetaEvent(0, 0x58, tsBytes))

    const sortedEvents = [...track.events].sort((a, b) => a.tick - b.tick)
    let lastTick = 0

    for (const ev of sortedEvents) {
      const delta = ev.tick - lastTick
      const vel = clamp(0, 127, ev.velocity || 100)
      const ch = clamp(0, 15, ev.channel || 0)
      const pitch = clamp(0, 127, ev.pitch || 60)

      if (track.isDrum) {
        events.push(this._encodeMIDIEvent(delta, 0x99, ch, pitch, vel))
        events.push(this._encodeMIDIEvent(Math.max(1, ev.duration), 0x89, ch, pitch, 0))
      } else {
        events.push(this._encodeMIDIEvent(delta, 0x90, ch, pitch, vel))
        events.push(this._encodeMIDIEvent(Math.max(1, ev.duration), 0x80, ch, pitch, 0))
      }
      lastTick = ev.tick
    }

    events.push(this._encodeMetaEvent(0, 0x2F, new Uint8Array(0)))

    const totalLen = events.reduce((s, e) => s + e.length, 0)
    const buf = new ArrayBuffer(8 + totalLen)
    const v = new DataView(buf)
    writeStr(v, 0, 'MTrk')
    v.setUint32(4, totalLen, false)
    const trackData = new Uint8Array(buf)
    let offset = 8
    for (const ev of events) {
      trackData.set(ev, offset)
      offset += ev.length
    }
    return trackData
  }

  _encodeMetaEvent(delta, type, data) {
    const deltaBytes = encodeVarLen(Math.max(0, delta))
    const lenBytes = encodeVarLen(data.length)
    const result = new Uint8Array(deltaBytes.length + 2 + lenBytes.length + data.length)
    let offset = 0
    result.set(deltaBytes, offset); offset += deltaBytes.length
    result[offset++] = 0xFF
    result[offset++] = type
    result.set(lenBytes, offset); offset += lenBytes.length
    result.set(data, offset)
    return result
  }

  _encodeMIDIEvent(delta, status, channel, data1, data2) {
    const deltaBytes = encodeVarLen(Math.max(0, delta))
    const result = new Uint8Array(deltaBytes.length + 3)
    let offset = 0
    result.set(deltaBytes, offset); offset += deltaBytes.length
    result[offset++] = status | (channel & 0x0F)
    result[offset++] = data1 & 0x7F
    result[offset++] = data2 & 0x7F
    return result
  }
}

function encodeVarLen(value) {
  if (value < 0) value = 0
  if (value === 0) return new Uint8Array([0])
  const bytes = []
  bytes.push(value & 0x7F)
  while (value > 0x7F) {
    value >>= 7
    bytes.push((value & 0x7F) | 0x80)
  }
  bytes.reverse()
  return new Uint8Array(bytes)
}

function writeStr(view, offset, str) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i))
  }
}

function strBytes(str) {
  const bytes = []
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)
    if (code < 128) bytes.push(code)
    else if (code < 2048) bytes.push(192 | (code >> 6), 128 | (code & 63))
    else bytes.push(224 | (code >> 12), 128 | ((code >> 6) & 63), 128 | (code & 63))
  }
  return new Uint8Array(bytes)
}

function clamp(min, max, val) {
  return Math.max(min, Math.min(max, val))
}

export function exportProjectToMIDI(project) {
  if (!project?.blueprint) throw new Error('No project to export')
  const writer = new MIDIWriter(project.blueprint.bpm)

  writer.addNoteTrack('Melody', project.notes, 0)
  writer.addNoteTrack('Bass', (project.bass || []).map(b => ({
    startBeat: b.startBeat,
    durationBeats: b.durationBeats,
    pitch: b.rootNote,
    velocity: b.intensity,
  })), 1)

  if (project.chords) {
    const chordNotes = []
    for (const c of project.chords) {
      for (const note of (c.notes || [])) {
        chordNotes.push({
          startBeat: c.startBeat,
          durationBeats: c.durationBeats,
          pitch: note,
          velocity: 0.5,
        })
      }
    }
    writer.addNoteTrack('Harmony', chordNotes, 2)
  }

  writer.addDrumTrack('Drums', project.drums)
  return writer
}
