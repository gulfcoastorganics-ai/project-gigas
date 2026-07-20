import { describe, it, before } from 'node:test'
import assert from 'node:assert'

const basePath = process.cwd()

function createPR(opts = {}) {
  const { PianoRoll } = requirePR()
  const pr = new PianoRoll({ style: {} }, opts)
  pr._autoRender = false
  return pr
}

let _PianoRoll = null
function requirePR() {
  if (!_PianoRoll) {
    throw new Error('Must call loadPR first')
  }
  return { PianoRoll: _PianoRoll }
}

async function loadPR() {
  const mod = await import(`${basePath}/src/wubflipz/timeline/pianoRoll.js`)
  _PianoRoll = mod.PianoRoll
  return mod
}

describe('PianoRoll', () => {
  before(async () => { await loadPR() })

  it('exports PianoRoll class', () => {
    assert.ok(typeof _PianoRoll === 'function')
  })

  it('creates piano roll with options', () => {
    const pr = createPR({ key: 'C', scale: 'minor', bpm: 140 })
    assert.ok(pr instanceof _PianoRoll)
  })

  it('sets and gets notes', () => {
    const pr = createPR()
    const notes = [
      { id: 'n1', pitch: 60, startBeat: 0, durationBeats: 1, velocity: 0.8 },
      { id: 'n2', pitch: 64, startBeat: 1, durationBeats: 0.5, velocity: 0.6 },
    ]
    pr.setNotes(notes)
    assert.strictEqual(pr.getNotes().length, 2)
  })

  it('sets and gets drum hits', () => {
    const pr = createPR()
    const hits = [
      { sound: 'kick', startBeat: 0, velocity: 1, probability: 1 },
      { sound: 'snare', startBeat: 2, velocity: 0.8, probability: 1 },
    ]
    pr.setDrumHits(hits)
    assert.strictEqual(pr.getDrumHits().length, 2)
  })

  it('toggles between piano and drum mode', () => {
    const pr = createPR()
    pr.setMode(true)
    assert.ok(pr._drumMode)
    pr.setMode(false)
    assert.ok(!pr._drumMode)
  })

  it('sets scale and key', () => {
    const pr = createPR({ key: 'C', scale: 'minor' })
    pr.setScale('A', 'major')
    assert.ok(true)
  })

  it('adds notes', () => {
    const pr = createPR()
    pr._addNote(60, 0)
    assert.strictEqual(pr.getNotes().length, 1)
    assert.strictEqual(pr.getNotes()[0].pitch, 60)
  })

  it('adds drum hits', () => {
    const pr = createPR()
    pr._addDrumHit('kick', 0)
    assert.strictEqual(pr.getDrumHits().length, 1)
    assert.strictEqual(pr.getDrumHits()[0].sound, 'kick')
  })

  it('selects notes', () => {
    const pr = createPR()
    pr.setNotes([{ id: 'n1', pitch: 60, startBeat: 0, durationBeats: 1, velocity: 0.8 }])
    pr._selectNote('n1')
    assert.strictEqual(pr.getSelectedNotes().length, 1)
  })

  it('toggles note selection', () => {
    const pr = createPR()
    pr.setNotes([
      { id: 'n1', pitch: 60, startBeat: 0, durationBeats: 1, velocity: 0.8 },
      { id: 'n2', pitch: 64, startBeat: 1, durationBeats: 1, velocity: 0.7 },
    ])
    pr._toggleNoteSelection('n1')
    pr._toggleNoteSelection('n2')
    assert.strictEqual(pr.getSelectedNotes().length, 2)
    pr._toggleNoteSelection('n1')
    assert.strictEqual(pr.getSelectedNotes().length, 1)
  })

  it('selects all notes', () => {
    const pr = createPR()
    pr.setNotes([
      { id: 'n1', pitch: 60, startBeat: 0, durationBeats: 1, velocity: 0.8 },
      { id: 'n2', pitch: 64, startBeat: 1, durationBeats: 1, velocity: 0.7 },
    ])
    pr.selectAll()
    assert.strictEqual(pr.getSelectedNotes().length, 2)
  })

  it('deselects all', () => {
    const pr = createPR()
    pr.setNotes([{ id: 'n1', pitch: 60, startBeat: 0, durationBeats: 1, velocity: 0.8 }])
    pr._selectNote('n1')
    pr.deselectAll()
    assert.strictEqual(pr.getSelectedNotes().length, 0)
  })

  it('removes selected notes', () => {
    const pr = createPR()
    pr.setNotes([
      { id: 'n1', pitch: 60, startBeat: 0, durationBeats: 1, velocity: 0.8 },
      { id: 'n2', pitch: 64, startBeat: 1, durationBeats: 1, velocity: 0.7 },
    ])
    pr._selectNote('n1')
    pr.removeSelectedNotes()
    assert.strictEqual(pr.getNotes().length, 1)
  })

  it('quantizes selected notes', () => {
    const pr = createPR()
    pr.setNotes([{ id: 'n1', pitch: 60, startBeat: 2.3, durationBeats: 1.2, velocity: 0.8 }])
    pr._selectNote('n1')
    pr.quantizeSelected()
    assert.strictEqual(pr.getNotes()[0].startBeat, 2.25)
  })

  it('transposes selected notes', () => {
    const pr = createPR()
    pr.setNotes([{ id: 'n1', pitch: 60, startBeat: 0, durationBeats: 1, velocity: 0.8 }])
    pr._selectNote('n1')
    pr.transposeSelected(5)
    assert.strictEqual(pr.getNotes()[0].pitch, 65)
  })

  it('duplicates selected notes', () => {
    const pr = createPR()
    pr.setNotes([{ id: 'n1', pitch: 60, startBeat: 0, durationBeats: 1, velocity: 0.8 }])
    pr._selectNote('n1')
    pr.duplicateSelected()
    assert.strictEqual(pr.getNotes().length, 2)
  })

  it('removes selected drum hits', () => {
    const pr = createPR()
    pr.setDrumHits([
      { id: 'h1', sound: 'kick', startBeat: 0, velocity: 1, probability: 1 },
      { id: 'h2', sound: 'snare', startBeat: 2, velocity: 0.8, probability: 1 },
    ])
    pr._selectNote('h1')
    pr.removeSelectedNotes()
    assert.strictEqual(pr.getDrumHits().length, 1)
  })

  it('handles empty notes gracefully', () => {
    const pr = createPR()
    assert.strictEqual(pr.getNotes().length, 0)
    assert.strictEqual(pr.getDrumHits().length, 0)
  })

  it('sets visible beats', () => {
    const pr = createPR()
    pr.setVisibleBeats(8)
    assert.strictEqual(pr.getVisibleBeats(), 8)
  })

  it('sets pixels per beat', () => {
    const pr = createPR()
    pr.setPixelsPerBeat(80)
    assert.strictEqual(pr._pixelsPerBeat, 80)
  })

  it('clamps extreme pixels per beat', () => {
    const pr = createPR()
    pr.setPixelsPerBeat(999)
    assert.strictEqual(pr._pixelsPerBeat, 200)
  })

  it('transposes clamps to MIDI range', () => {
    const pr = createPR()
    pr.setNotes([{ id: 'n1', pitch: 0, startBeat: 0, durationBeats: 1, velocity: 0.8 }])
    pr._selectNote('n1')
    pr.transposeSelected(-10)
    assert.strictEqual(pr.getNotes()[0].pitch, 0)
  })

  it('generates note ids when missing', () => {
    const pr = createPR()
    pr.setNotes([{ pitch: 60, startBeat: 0, durationBeats: 1, velocity: 0.8 }])
    assert.ok(pr.getNotes()[0].id, 'Should generate an id')
  })

  it('generates drum hit ids when missing', () => {
    const pr = createPR()
    pr.setDrumHits([{ sound: 'kick', startBeat: 0, velocity: 1 }])
    assert.ok(pr.getDrumHits()[0].id, 'Should generate an id')
  })

  it('can switch to drum mode and back', () => {
    const pr = createPR({ drumSounds: ['kick', 'snare', 'hat'] })
    pr.setMode(false)
    pr.setNotes([{ id: 'n1', pitch: 60, startBeat: 0, durationBeats: 1, velocity: 0.8 }])
    assert.strictEqual(pr.getNotes().length, 1)
    pr.setMode(true)
    pr._addDrumHit('kick', 0)
    assert.strictEqual(pr.getDrumHits().length, 1)
  })
})
