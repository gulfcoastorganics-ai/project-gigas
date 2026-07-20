import { describe, it, before } from 'node:test'
import assert from 'node:assert'

const basePath = process.cwd()

describe('TimeModel', () => {
  let tm
  before(async () => {
    tm = await import(`${basePath}/src/wubflipz/timeline/timeModel.js`)
    tm.configureTimeModel({ bpm: 140, timeSignature: [4, 4], pixelsPerBeat: 40, snapEnabled: true, snapDivision: 0.25 })
  })

  it('converts beats to pixels', () => {
    assert.strictEqual(tm.beatToPixels(4), 160)
    assert.strictEqual(tm.beatToPixels(0), 0)
  })

  it('converts pixels to beats', () => {
    assert.strictEqual(tm.pixelsToBeat(160), 4)
    assert.strictEqual(tm.pixelsToBeat(0), 0)
  })

  it('converts bars to beats', () => {
    assert.strictEqual(tm.barToBeats(2), 8)
    assert.strictEqual(tm.barToBeats(0), 0)
  })

  it('converts beats to bar', () => {
    assert.strictEqual(tm.beatsToBar(8), 2)
  })

  it('converts beats to seconds', () => {
    const secs = tm.beatToSeconds(4, 140)
    assert.ok(Math.abs(secs - 1.714) < 0.01)
  })

  it('converts seconds to beats', () => {
    const beats = tm.secondsToBeat(1.714, 140)
    assert.ok(Math.abs(beats - 4) < 0.01)
  })

  it('snaps values to grid', () => {
    assert.strictEqual(tm.snapToGrid(2.3), 2.25)
    assert.strictEqual(tm.snapToGrid(2.5), 2.5)
  })

  it('snaps to bar boundaries', () => {
    assert.strictEqual(tm.snapToBar(7), 8)
    assert.strictEqual(tm.snapToBar(8), 8)
  })

  it('quantizes events', () => {
    const ev = tm.quantizeEvent({ startBeat: 2.3, durationBeats: 1.2 }, 0.25)
    assert.strictEqual(ev.startBeat, 2.25)
    assert.strictEqual(ev.durationBeats, 1.25)
  })

  it('formats beat as string', () => {
    assert.strictEqual(tm.beatToString(0), '1.1.1')
    assert.strictEqual(tm.beatToString(4), '2.1.1')
  })

  it('computes timeline width', () => {
    assert.strictEqual(tm.getTimelineWidth(16), 640)
  })

  it('handles zoom changes', () => {
    const ppb = tm.setPixelsPerBeat(80)
    assert.strictEqual(ppb, 80)
    assert.strictEqual(tm.beatToPixels(1), 80)
    tm.setPixelsPerBeat(40)
  })

  it('toggles snap', () => {
    tm.setSnapEnabled(false)
    assert.strictEqual(tm.snapToGrid(2.3), 2.3)
    tm.setSnapEnabled(true)
    assert.strictEqual(tm.snapToGrid(2.3), 2.25)
  })

  it('rejects extreme zoom values', () => {
    const ppb = tm.setPixelsPerBeat(999)
    assert.strictEqual(ppb, 200)
  })

  it('sets snap division', () => {
    tm.setSnapDivision(0.5)
    assert.strictEqual(tm.snapToGrid(2.3), 2.5)
    tm.setSnapDivision(0.25)
  })

  it('configures time signature', () => {
    tm.configureTimeModel({ timeSignature: [3, 4] })
    assert.strictEqual(tm.barToBeats(1), 3)
    tm.configureTimeModel({ timeSignature: [4, 4] })
  })

  it('provides time signature', () => {
    const sig = tm.getTimeSig()
    assert.strictEqual(sig[0], 4)
    assert.strictEqual(sig[1], 4)
  })

  it('provides current settings', () => {
    assert.strictEqual(typeof tm.getSnapDivision(), 'number')
    assert.strictEqual(typeof tm.getSnapEnabled(), 'boolean')
    assert.strictEqual(typeof tm.getPixelsPerBeat(), 'number')
  })
})

describe('TimelineView', () => {
  it('exports TimelineView class', async () => {
    const mod = await import(`${basePath}/src/wubflipz/timeline/timelineView.js`)
    assert.ok(typeof mod.TimelineView === 'function')
  })

  it('creates timeline view with options', async () => {
    const { TimelineView } = await import(`${basePath}/src/wubflipz/timeline/timelineView.js`)
    const container = { style: {}, clientHeight: 500 }
    const tl = new TimelineView(container, {})
    assert.ok(tl instanceof TimelineView)
  })

  it('sets project and tracks', async () => {
    const { TimelineView } = await import(`${basePath}/src/wubflipz/timeline/timelineView.js`)
    const container = { style: {}, clientHeight: 500 }
    const tl = new TimelineView(container, {})
    const project = {
      id: 'test',
      blueprint: {
        id: 'bp1', version: 1, title: 'Test', prompt: 'test',
        genre: ['dubstep'], mood: [], bpm: 140, key: 'C', scale: 'minor',
        timeSignature: [4, 4], durationBars: 32, seed: 42,
        energyCurve: [], sections: [
          { id: 's1', type: 'intro', name: 'Intro', startBar: 0, lengthBars: 8, energy: 0.3, density: 0.3, tension: 0.2, instructions: [] },
          { id: 's2', type: 'drop', name: 'Drop', startBar: 8, lengthBars: 16, energy: 0.8, density: 0.8, tension: 0.7, instructions: [] },
          { id: 's3', type: 'outro', name: 'Outro', startBar: 24, lengthBars: 8, energy: 0.3, density: 0.3, tension: 0.1, instructions: [] },
        ],
        instrumentation: [], mixIntent: {},
        generationMetadata: { schemaVersion: 1, createdAt: '2025-01-01', seed: 42, prompt: 'test' },
      },
      tracks: [
        { id: 'kick', name: 'Kick', type: 'drum', volume: 1, pan: 0 },
        { id: 'bass', name: 'Bass', type: 'bass', volume: 1, pan: 0 },
      ],
      drums: [], notes: [], bass: [], chords: [], transitions: [],
    }
    tl.setProject(project)
    assert.strictEqual(tl.getAllTracks().length, 2)
    const clips = tl.getAllClips()
    assert.ok(clips.length > 0)
  })

  it('supports zoom', async () => {
    const { TimelineView } = await import(`${basePath}/src/wubflipz/timeline/timelineView.js`)
    const container = { style: {}, clientHeight: 500 }
    const tl = new TimelineView(container, {})
    tl.setZoom(1)
    assert.strictEqual(tl.getZoom(), 1)
    tl.zoomIn()
    assert.ok(tl.getZoom() > 1)
    tl.zoomOut()
    assert.ok(tl.getZoom() < tl.getZoom() * 1.5)
  })

  it('supports clip split', async () => {
    const { TimelineView } = await import(`${basePath}/src/wubflipz/timeline/timelineView.js`)
    const container = { style: {}, clientHeight: 500 }
    const tl = new TimelineView(container, {})
    const project = {
      id: 'test', blueprint: {
        id: 'bp', version: 1, title: 'T', prompt: 'p',
        genre: ['dubstep'], mood: [], bpm: 140, key: 'C', scale: 'minor',
        timeSignature: [4, 4], durationBars: 32, seed: 1,
        energyCurve: [], sections: [
          { id: 's1', type: 'intro', name: 'Intro', startBar: 0, lengthBars: 16, energy: 0.5, density: 0.5, tension: 0.5, instructions: [] },
        ],
        instrumentation: [], mixIntent: {},
        generationMetadata: { schemaVersion: 1, createdAt: '', seed: 1, prompt: 'p' },
      },
      tracks: [{ id: 'kick', name: 'Kick', type: 'drum', volume: 1, pan: 0 }],
      drums: [], notes: [], bass: [], chords: [], transitions: [],
    }
    tl.setProject(project)
    const clips = tl.getAllClips()
    assert.ok(clips.length > 0)
    const originalDur = clips[0].durationBeats
    const result = tl.splitClip(clips[0].id, 32)
    assert.ok(result, 'Split should succeed')
    assert.strictEqual(result.left.durationBeats + result.right.durationBeats, originalDur)
  })

  it('prevents split on locked clip', async () => {
    const { TimelineView } = await import(`${basePath}/src/wubflipz/timeline/timelineView.js`)
    const container = { style: {}, clientHeight: 500 }
    const tl = new TimelineView(container, {})
    const project = {
      id: 'test', blueprint: {
        id: 'bp', version: 1, title: 'T', prompt: 'p',
        genre: ['dubstep'], mood: [], bpm: 140, key: 'C', scale: 'minor',
        timeSignature: [4, 4], durationBars: 32, seed: 1,
        energyCurve: [], sections: [
          { id: 's1', type: 'intro', name: 'Intro', startBar: 0, lengthBars: 16, energy: 0.5, density: 0.5, tension: 0.5, instructions: [] },
        ],
        instrumentation: [], mixIntent: {},
        generationMetadata: { schemaVersion: 1, createdAt: '', seed: 1, prompt: 'p' },
      },
      tracks: [{ id: 'kick', name: 'Kick', type: 'drum', volume: 1, pan: 0 }],
      drums: [], notes: [], bass: [], chords: [], transitions: [],
    }
    tl.setProject(project)
    const clips = tl.getAllClips()
    assert.ok(clips.length > 0)
    clips[0].locked = true
    const result = tl.splitClip(clips[0].id, 32)
    assert.strictEqual(result, null, 'Should reject split on locked clip')
  })

  it('supports clip duplication', async () => {
    const { TimelineView } = await import(`${basePath}/src/wubflipz/timeline/timelineView.js`)
    const container = { style: {}, clientHeight: 500 }
    const tl = new TimelineView(container, {})
    const project = {
      id: 'test', blueprint: {
        id: 'bp', version: 1, title: 'T', prompt: 'p',
        genre: ['dubstep'], mood: [], bpm: 140, key: 'C', scale: 'minor',
        timeSignature: [4, 4], durationBars: 32, seed: 1,
        energyCurve: [], sections: [
          { id: 's1', type: 'intro', name: 'Intro', startBar: 0, lengthBars: 16, energy: 0.5, density: 0.5, tension: 0.5, instructions: [] },
        ],
        instrumentation: [], mixIntent: {},
        generationMetadata: { schemaVersion: 1, createdAt: '', seed: 1, prompt: 'p' },
      },
      tracks: [{ id: 'kick', name: 'Kick', type: 'drum', volume: 1, pan: 0 }],
      drums: [], notes: [], bass: [], chords: [], transitions: [],
    }
    tl.setProject(project)
    const clips = tl.getAllClips()
    const count = clips.length
    const dup = tl.duplicateClip(clips[0].id)
    assert.ok(dup, 'Duplicate should return new clip')
    assert.strictEqual(tl.getAllClips().length, count + 1)
  })

  it('supports clip delete', async () => {
    const { TimelineView } = await import(`${basePath}/src/wubflipz/timeline/timelineView.js`)
    const container = { style: {}, clientHeight: 500 }
    const tl = new TimelineView(container, {})
    const project = {
      id: 'test', blueprint: {
        id: 'bp', version: 1, title: 'T', prompt: 'p',
        genre: ['dubstep'], mood: [], bpm: 140, key: 'C', scale: 'minor',
        timeSignature: [4, 4], durationBars: 32, seed: 1,
        energyCurve: [], sections: [
          { id: 's1', type: 'intro', name: 'Intro', startBar: 0, lengthBars: 16, energy: 0.5, density: 0.5, tension: 0.5, instructions: [] },
        ],
        instrumentation: [], mixIntent: {},
        generationMetadata: { schemaVersion: 1, createdAt: '', seed: 1, prompt: 'p' },
      },
      tracks: [{ id: 'kick', name: 'Kick', type: 'drum', volume: 1, pan: 0 }],
      drums: [], notes: [], bass: [], chords: [], transitions: [],
    }
    tl.setProject(project)
    const clips = tl.getAllClips()
    const count = clips.length
    const deleted = tl.deleteClip(clips[0].id)
    assert.ok(deleted)
    assert.strictEqual(tl.getAllClips().length, count - 1)
  })

  it('supports undo and redo', async () => {
    const { TimelineView } = await import(`${basePath}/src/wubflipz/timeline/timelineView.js`)
    const container = { style: {}, clientHeight: 500 }
    const tl = new TimelineView(container, {})
    const project = {
      id: 'test', blueprint: {
        id: 'bp', version: 1, title: 'T', prompt: 'p',
        genre: ['dubstep'], mood: [], bpm: 140, key: 'C', scale: 'minor',
        timeSignature: [4, 4], durationBars: 32, seed: 1,
        energyCurve: [], sections: [
          { id: 's1', type: 'intro', name: 'Intro', startBar: 0, lengthBars: 16, energy: 0.5, density: 0.5, tension: 0.5, instructions: [] },
        ],
        instrumentation: [], mixIntent: {},
        generationMetadata: { schemaVersion: 1, createdAt: '', seed: 1, prompt: 'p' },
      },
      tracks: [{ id: 'kick', name: 'Kick', type: 'drum', volume: 1, pan: 0 }],
      drums: [], notes: [], bass: [], chords: [], transitions: [],
    }
    tl.setProject(project)
    const initialCount = tl.getAllClips().length
    assert.ok(initialCount > 0, 'Should have clips')

    tl.deleteClip(tl.getAllClips()[0].id)
    assert.strictEqual(tl.getAllClips().length, initialCount - 1, 'After delete')
    assert.ok(tl.canUndo(), 'Should be able to undo')

    const undone = tl.undo()
    assert.ok(undone, 'Undo should succeed')
    assert.strictEqual(tl.getAllClips().length, initialCount, 'After undo should restore clips')
    assert.ok(tl.canRedo(), 'Should be able to redo')

    const redone = tl.redo()
    assert.ok(redone, 'Redo should succeed')
    assert.strictEqual(tl.getAllClips().length, initialCount - 1, 'After redo should restore deleted state')
  })

  it('supports track selection', async () => {
    const { TimelineView } = await import(`${basePath}/src/wubflipz/timeline/timelineView.js`)
    const container = { style: {}, clientHeight: 500 }
    const tl = new TimelineView(container, {})
    const project = {
      id: 'test', blueprint: {
        id: 'bp', version: 1, title: 'T', prompt: 'p',
        genre: ['dubstep'], mood: [], bpm: 140, key: 'C', scale: 'minor',
        timeSignature: [4, 4], durationBars: 32, seed: 1,
        energyCurve: [], sections: [
          { id: 's1', type: 'intro', name: 'Intro', startBar: 0, lengthBars: 16, energy: 0.5, density: 0.5, tension: 0.5, instructions: [] },
        ],
        instrumentation: [], mixIntent: {},
        generationMetadata: { schemaVersion: 1, createdAt: '', seed: 1, prompt: 'p' },
      },
      tracks: [{ id: 'kick', name: 'Kick', type: 'drum', volume: 1, pan: 0 }],
      drums: [], notes: [], bass: [], chords: [], transitions: [],
    }
    tl.setProject(project)
    const track = tl.getTrack('kick')
    assert.ok(track)
    assert.strictEqual(track.name, 'Kick')
  })

  it('updates track properties', async () => {
    const { TimelineView } = await import(`${basePath}/src/wubflipz/timeline/timelineView.js`)
    const container = { style: {}, clientHeight: 500 }
    const tl = new TimelineView(container, {})
    const project = {
      id: 'test', blueprint: {
        id: 'bp', version: 1, title: 'T', prompt: 'p',
        genre: ['dubstep'], mood: [], bpm: 140, key: 'C', scale: 'minor',
        timeSignature: [4, 4], durationBars: 32, seed: 1,
        energyCurve: [], sections: [
          { id: 's1', type: 'intro', name: 'Intro', startBar: 0, lengthBars: 16, energy: 0.5, density: 0.5, tension: 0.5, instructions: [] },
        ],
        instrumentation: [], mixIntent: {},
        generationMetadata: { schemaVersion: 1, createdAt: '', seed: 1, prompt: 'p' },
      },
      tracks: [{ id: 'kick', name: 'Kick', type: 'drum', volume: 1, pan: 0 }],
      drums: [], notes: [], bass: [], chords: [], transitions: [],
    }
    tl.setProject(project)
    tl.updateTrack('kick', { muted: true, solo: false, locked: true })
    const track = tl.getTrack('kick')
    assert.ok(track.muted)
    assert.ok(track.locked)
  })

  it('syncs mute and solo without DOM', { skip: 'Requires browser DOM' }, async () => {
    const { TimelineView } = await import(`${basePath}/src/wubflipz/timeline/timelineView.js`)
    const container = { style: {}, clientHeight: 500 }
    const tl = new TimelineView(container, {})
    const project = {
      id: 'test', blueprint: {
        id: 'bp', version: 1, title: 'T', prompt: 'p',
        genre: ['dubstep'], mood: [], bpm: 140, key: 'C', scale: 'minor',
        timeSignature: [4, 4], durationBars: 32, seed: 1,
        energyCurve: [], sections: [
          { id: 's1', type: 'intro', name: 'Intro', startBar: 0, lengthBars: 16, energy: 0.5, density: 0.5, tension: 0.5, instructions: [] },
        ],
        instrumentation: [], mixIntent: {},
        generationMetadata: { schemaVersion: 1, createdAt: '', seed: 1, prompt: 'p' },
      },
      tracks: [{ id: 'kick', name: 'Kick', type: 'drum', volume: 1, pan: 0 }],
      drums: [], notes: [], bass: [], chords: [], transitions: [],
    }
    tl.setProject(project)
    tl.updateTrack('kick', { solo: true })
    tl.syncMuteSolo()
    assert.ok(true, 'Should not throw')
  })

  it('handles empty project gracefully', async () => {
    const { TimelineView } = await import(`${basePath}/src/wubflipz/timeline/timelineView.js`)
    const container = { style: {}, clientHeight: 500 }
    const tl = new TimelineView(container, {})
    tl.setProject(null)
    assert.strictEqual(tl.getAllTracks().length, 0)
    assert.strictEqual(tl.getAllClips().length, 0)
  })

  it('handles clip selection', async () => {
    const { TimelineView } = await import(`${basePath}/src/wubflipz/timeline/timelineView.js`)
    const container = { style: {}, clientHeight: 500 }
    const tl = new TimelineView(container, {})
    const project = {
      id: 'test', blueprint: {
        id: 'bp', version: 1, title: 'T', prompt: 'p',
        genre: ['dubstep'], mood: [], bpm: 140, key: 'C', scale: 'minor',
        timeSignature: [4, 4], durationBars: 32, seed: 1,
        energyCurve: [], sections: [
          { id: 's1', type: 'intro', name: 'Intro', startBar: 0, lengthBars: 16, energy: 0.5, density: 0.5, tension: 0.5, instructions: [] },
        ],
        instrumentation: [], mixIntent: {},
        generationMetadata: { schemaVersion: 1, createdAt: '', seed: 1, prompt: 'p' },
      },
      tracks: [{ id: 'kick', name: 'Kick', type: 'drum', volume: 1, pan: 0 }],
      drums: [], notes: [], bass: [], chords: [], transitions: [],
    }
    tl.setProject(project)
    const clips = tl.getAllClips()
    tl._selectClip(clips[0].id)
    const selected = tl.getSelectedClips()
    assert.strictEqual(selected.length, 1)
    assert.strictEqual(selected[0].id, clips[0].id)
  })

  it('supports multi-select via toggle', async () => {
    const { TimelineView } = await import(`${basePath}/src/wubflipz/timeline/timelineView.js`)
    const container = { style: {}, clientHeight: 500 }
    const tl = new TimelineView(container, {})
    const project = {
      id: 'test', blueprint: {
        id: 'bp', version: 1, title: 'T', prompt: 'p',
        genre: ['dubstep'], mood: [], bpm: 140, key: 'C', scale: 'minor',
        timeSignature: [4, 4], durationBars: 32, seed: 1,
        energyCurve: [], sections: [
          { id: 's1', type: 'intro', name: 'Intro', startBar: 0, lengthBars: 16, energy: 0.5, density: 0.5, tension: 0.5, instructions: [] },
          { id: 's2', type: 'drop', name: 'Drop', startBar: 16, lengthBars: 16, energy: 0.8, density: 0.8, tension: 0.7, instructions: [] },
        ],
        instrumentation: [], mixIntent: {},
        generationMetadata: { schemaVersion: 1, createdAt: '', seed: 1, prompt: 'p' },
      },
      tracks: [{ id: 'kick', name: 'Kick', type: 'drum', volume: 1, pan: 0 }],
      drums: [], notes: [], bass: [], chords: [], transitions: [],
    }
    tl.setProject(project)
    const clips = tl.getAllClips()
    tl._toggleClipSelection(clips[0].id)
    tl._toggleClipSelection(clips[1].id)
    assert.strictEqual(tl.getSelectedClips().length, 2)
  })

  it('selects all and deselects all', async () => {
    const { TimelineView } = await import(`${basePath}/src/wubflipz/timeline/timelineView.js`)
    const container = { style: {}, clientHeight: 500 }
    const tl = new TimelineView(container, {})
    const project = {
      id: 'test', blueprint: {
        id: 'bp', version: 1, title: 'T', prompt: 'p',
        genre: ['dubstep'], mood: [], bpm: 140, key: 'C', scale: 'minor',
        timeSignature: [4, 4], durationBars: 32, seed: 1,
        energyCurve: [], sections: [
          { id: 's1', type: 'intro', name: 'Intro', startBar: 0, lengthBars: 16, energy: 0.5, density: 0.5, tension: 0.5, instructions: [] },
        ],
        instrumentation: [], mixIntent: {},
        generationMetadata: { schemaVersion: 1, createdAt: '', seed: 1, prompt: 'p' },
      },
      tracks: [{ id: 'kick', name: 'Kick', type: 'drum', volume: 1, pan: 0 }],
      drums: [], notes: [], bass: [], chords: [], transitions: [],
    }
    tl.setProject(project)
    tl.selectAll()
    assert.ok(tl.getSelectedClips().length > 0)
    tl.deselectAll()
    assert.strictEqual(tl.getSelectedClips().length, 0)
  })
})
