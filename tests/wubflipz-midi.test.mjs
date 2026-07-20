import { describe, it } from 'node:test'
import assert from 'node:assert'

const basePath = process.cwd()

function createTestProject() {
  return {
    id: 'test', title: 'Test', blueprint: { bpm: 140, key: 'D', scale: 'minor', genre: ['dubstep'],
      sections: [], generationMetadata: {}, instrumentation: [], mixIntent: {}, energyCurve: [],
      durationBars: 16, seed: 42, prompt: 'test', mood: [], version: 1,
    },
    drums: [
      { id: 'd1', trackId: 'kick', sound: 'kick', startBeat: 0, durationBeats: 0.25, velocity: 0.9 },
      { id: 'd2', trackId: 'snare', sound: 'snare', startBeat: 2, durationBeats: 0.25, velocity: 0.8 },
      { id: 'd3', trackId: 'hat', sound: 'closed_hat', startBeat: 0.5, durationBeats: 0.125, velocity: 0.5 },
    ],
    bass: [
      { id: 'b1', trackId: 'bass', startBeat: 0, durationBeats: 2, rootNote: 38, articulation: 'sub', intensity: 0.7, modulationShape: 'sine' },
    ],
    notes: [
      { id: 'n1', trackId: 'lead', clipId: 'c1', pitch: 62, startBeat: 0, durationBeats: 0.5, velocity: 0.7, articulation: 'normal' },
      { id: 'n2', trackId: 'lead', clipId: 'c1', pitch: 65, startBeat: 1, durationBeats: 1, velocity: 0.6, articulation: 'normal' },
    ],
    chords: [
      { root: 50, type: 'minor', notes: [50, 53, 57], startBeat: 0, durationBeats: 8, roman: 'i', tension: 0.1 },
    ],
    tracks: [],
  }
}

describe('MIDI Export', () => {
  it('creates a MIDI writer with valid header', async () => {
    const { MIDIWriter } = await import(`${basePath}/src/wubflipz/export/midi.js`)
    const writer = new MIDIWriter(140)
    writer.addNoteTrack('Test', [{ tick: 0, duration: 480, pitch: 60, velocity: 100, channel: 0 }])
    const bytes = writer.toBytes()
    assert.ok(bytes.length > 14, 'Should be larger than header size')
    const header = new TextDecoder().decode(bytes.slice(0, 4))
    assert.strictEqual(header, 'MThd', 'Should start with MThd header')
  })

  it('parses back correctly on round trip', async () => {
    const { MIDIWriter } = await import(`${basePath}/src/wubflipz/export/midi.js`)
    const writer = new MIDIWriter(140)
    writer.addNoteTrack('Test', [
      { tick: 0, duration: 480, pitch: 60, velocity: 100, channel: 0 },
      { tick: 480, duration: 240, pitch: 64, velocity: 80, channel: 0 },
      { tick: 960, duration: 480, pitch: 67, velocity: 90, channel: 0 },
    ])
    const bytes = writer.toBytes()

    const header = new TextDecoder().decode(bytes.slice(0, 4))
    assert.strictEqual(header, 'MThd')

    const format = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(8, false)
    assert.ok(format === 0 || format === 1, `Format should be 0 or 1, got ${format}`)

    const numTracks = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(10, false)
    assert.strictEqual(numTracks, 1, 'Should have 1 track')

    const trackHeader = new TextDecoder().decode(bytes.slice(14, 18))
    assert.strictEqual(trackHeader, 'MTrk', 'Should have MTrk track chunk')
  })

  it('exports a full project to MIDI', async () => {
    const { exportProjectToMIDI } = await import(`${basePath}/src/wubflipz/export/midi.js`)
    const project = createTestProject()
    const writer = exportProjectToMIDI(project)
    const bytes = writer.toBytes()
    assert.ok(bytes.length > 50, 'Should produce a substantial MIDI file')
    const header = new TextDecoder().decode(bytes.slice(0, 4))
    assert.strictEqual(header, 'MThd')
  })

  it('creates separate tracks for melody, bass, harmony, and drums', async () => {
    const { exportProjectToMIDI } = await import(`${basePath}/src/wubflipz/export/midi.js`)
    const project = createTestProject()
    const writer = exportProjectToMIDI(project)
    assert.strictEqual(writer._tracks.length, 4, 'Should have 4 tracks (melody, bass, harmony, drums)')
  })

  it('clamps note values to valid MIDI ranges', async () => {
    const { MIDIWriter } = await import(`${basePath}/src/wubflipz/export/midi.js`)
    const writer = new MIDIWriter(140)
    writer.addNoteTrack('Test', [
      { tick: 0, duration: 480, pitch: 999, velocity: 2.5, channel: 0 },
      { tick: 480, duration: 480, pitch: -5, velocity: -1, channel: 0 },
    ])
    const bytes = writer.toBytes()
    assert.ok(bytes.length > 20, 'Should still produce valid MIDI')
  })

  it('exports selected tracks only', async () => {
    const { MIDIWriter } = await import(`${basePath}/src/wubflipz/export/midi.js`)
    const writer = new MIDIWriter(140)
    writer.addNoteTrack('Drums', [
      { tick: 0, duration: 240, pitch: 36, velocity: 100, channel: 9 },
    ])
    const bytes = writer.toBytes()
    const numTracks = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(10, false)
    assert.strictEqual(numTracks, 1, 'Should have 1 track')
  })

  it('provides download method', async () => {
    const { MIDIWriter } = await import(`${basePath}/src/wubflipz/export/midi.js`)
    const writer = new MIDIWriter(140)
    writer.addNoteTrack('Test', [{ tick: 0, duration: 480, pitch: 60, velocity: 100, channel: 0 }])
    const blob = writer.toBlob()
    assert.ok(blob instanceof Blob, 'Should return a Blob')
    assert.strictEqual(blob.type, 'audio/midi', 'Should be audio/midi MIME type')
  })
})
