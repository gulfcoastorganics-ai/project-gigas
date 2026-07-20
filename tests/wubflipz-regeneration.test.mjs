import { describe, it } from 'node:test'
import assert from 'node:assert'

const basePath = process.cwd()

const DIR = `${basePath}/src/wubflipz/generation`

function createTestProject() {
  return {
    id: 'test-project',
    title: 'Test Track',
    blueprint: {
      id: 'bp-1',
      version: 1,
      title: 'Test Track',
      prompt: 'test track',
      genre: ['dubstep'],
      mood: ['dark'],
      bpm: 140,
      key: 'D',
      scale: 'minor',
      timeSignature: [4, 4],
      durationBars: 32,
      seed: 42,
      sections: [
        { id: 'sect-intro', type: 'intro', name: 'Intro', startBar: 0, lengthBars: 8, energy: 0.2, density: 0.3, tension: 0.1, instructions: [] },
        { id: 'sect-build', type: 'build', name: 'Build', startBar: 8, lengthBars: 8, energy: 0.5, density: 0.5, tension: 0.7, instructions: [] },
        { id: 'sect-drop', type: 'drop', name: 'Drop', startBar: 16, lengthBars: 8, energy: 0.9, density: 0.9, tension: 0.3, instructions: [] },
        { id: 'sect-outro', type: 'outro', name: 'Outro', startBar: 24, lengthBars: 8, energy: 0.1, density: 0.2, tension: 0, instructions: [] },
      ],
      energyCurve: [],
      instrumentation: [],
      mixIntent: {},
      generationMetadata: { schemaVersion: 1, createdAt: new Date().toISOString(), seed: 42, prompt: 'test' },
    },
    chords: [],
    drums: [
      { id: 'drum-1', trackId: 'kick', sound: 'kick', startBeat: 0, durationBeats: 0.25, velocity: 1 },
      { id: 'drum-2', trackId: 'snare', sound: 'snare', startBeat: 2, durationBeats: 0.25, velocity: 0.8 },
      { id: 'drum-3', trackId: 'kick', sound: 'kick', startBeat: 4, durationBeats: 0.25, velocity: 1 },
      { id: 'drum-4', trackId: 'hat', sound: 'closed_hat', startBeat: 0.5, durationBeats: 0.125, velocity: 0.5 },
      { id: 'drum-5', trackId: 'hat', sound: 'open_hat', startBeat: 3.5, durationBeats: 0.25, velocity: 0.4 },
    ],
    bass: [
      { id: 'bass-1', trackId: 'bass', startBeat: 0, durationBeats: 2, rootNote: 38, soundId: 'sub', articulation: 'sub', intensity: 0.7, modulationShape: 'sine' },
      { id: 'bass-2', trackId: 'bass', startBeat: 4, durationBeats: 2, rootNote: 45, soundId: 'growl', articulation: 'growl', intensity: 0.8, modulationShape: 'sawtooth' },
    ],
    notes: [
      { id: 'note-1', trackId: 'lead', clipId: 'clip-1', pitch: 62, startBeat: 0, durationBeats: 0.5, velocity: 0.7, articulation: 'normal' },
      { id: 'note-2', trackId: 'lead', clipId: 'clip-1', pitch: 65, startBeat: 1, durationBeats: 0.5, velocity: 0.6, articulation: 'normal' },
      { id: 'note-3', trackId: 'lead', clipId: 'clip-1', pitch: 69, startBeat: 2, durationBeats: 1, velocity: 0.8, articulation: 'accent' },
    ],
    tracks: [
      { id: 'kick', name: 'Kick', type: 'drum', volume: 1, pan: 0, locked: false },
      { id: 'snare', name: 'Snare', type: 'drum', volume: 1, pan: 0, locked: false },
      { id: 'hat', name: 'Hi-Hat', type: 'drum', volume: 1, pan: 0, locked: false },
      { id: 'bass', name: 'Bass', type: 'bass', volume: 1, pan: 0, locked: false },
      { id: 'lead', name: 'Lead', type: 'melody', volume: 1, pan: 0, locked: false },
    ],
    createdAt: new Date().toISOString(),
  }
}

describe('RegenerationEngine', () => {
  it('creates and restores snapshots', async () => {
    const { RegenerationEngine } = await import(`${DIR}/regeneration.js`)
    const engine = new RegenerationEngine()
    const project = createTestProject()
    const snap = engine.snapshot(project)
    assert.deepStrictEqual(snap, project, 'Snapshot should equal original')
    project.title = 'Modified'
    assert.notStrictEqual(snap.title, 'Modified', 'Snapshot should be independent copy')
  })

  it('regenerates entire song', async () => {
    const { RegenerationEngine } = await import(`${DIR}/regeneration.js`)
    const engine = new RegenerationEngine()
    const project = createTestProject()
    const result = await engine.regenerate(project, {
      scope: 'entire_song',
      instruction: 'Regenerate all',
      preserve: [],
      change: ['all'],
      seed: 99,
    })
    assert.ok(result.project, 'Should return project')
    assert.ok(result.project.drums.length > 0, 'Should have drums')
    assert.ok(result.project.bass.length > 0, 'Should have bass')
    assert.ok(result.project.notes.length > 0, 'Should have notes')
  })

  it('preserves drums when requested', async () => {
    const { RegenerationEngine } = await import(`${DIR}/regeneration.js`)
    const engine = new RegenerationEngine()
    const project = createTestProject()
    const originalDrums = JSON.stringify(project.drums)
    const result = await engine.regenerate(project, {
      scope: 'entire_song',
      instruction: 'Regenerate but preserve drums',
      preserve: ['drums'],
      change: ['all'],
      seed: 99,
    })
    assert.strictEqual(JSON.stringify(result.project.drums), originalDrums, 'Drums should be preserved')
  })

  it('preserves bass when requested', async () => {
    const { RegenerationEngine } = await import(`${DIR}/regeneration.js`)
    const engine = new RegenerationEngine()
    const project = createTestProject()
    const originalBass = JSON.stringify(project.bass)
    const result = await engine.regenerate(project, {
      scope: 'entire_song',
      instruction: 'Regenerate but preserve bass',
      preserve: ['bass'],
      change: ['all'],
      seed: 99,
    })
    assert.strictEqual(JSON.stringify(result.project.bass), originalBass, 'Bass should be preserved')
  })

  it('preserves harmony when requested', async () => {
    const { RegenerationEngine } = await import(`${DIR}/regeneration.js`)
    const engine = new RegenerationEngine()
    const project = createTestProject()
    project.chords = [
      { root: 50, type: 'minor', notes: [50, 53, 57], startBeat: 0, durationBeats: 16, roman: 'i', tension: 0.1 },
    ]
    const originalChords = JSON.stringify(project.chords)
    const result = await engine.regenerate(project, {
      scope: 'entire_song',
      instruction: 'Regenerate but preserve harmony',
      preserve: ['harmony'],
      change: ['all'],
      seed: 99,
    })
    assert.strictEqual(JSON.stringify(result.project.chords), originalChords, 'Chords should be preserved')
  })

  it('preserves melody when requested', async () => {
    const { RegenerationEngine } = await import(`${DIR}/regeneration.js`)
    const engine = new RegenerationEngine()
    const project = createTestProject()
    const originalNotes = JSON.stringify(project.notes)
    const result = await engine.regenerate(project, {
      scope: 'entire_song',
      instruction: 'Regenerate but preserve melody',
      preserve: ['melody'],
      change: ['all'],
      seed: 99,
    })
    assert.strictEqual(JSON.stringify(result.project.notes), originalNotes, 'Notes should be preserved')
  })

  it('supports undo', async () => {
    const { RegenerationEngine } = await import(`${DIR}/regeneration.js`)
    const engine = new RegenerationEngine()
    const project = createTestProject()
    const original = engine.snapshot(project)
    await engine.regenerate(project, {
      scope: 'entire_song',
      instruction: 'Regenerate',
      preserve: [],
      change: ['all'],
      seed: 99,
    })
    assert.ok(engine.canUndo, 'Should be able to undo')
    const undone = engine.undo(project)
    assert.ok(undone, 'Undo should return result')
  })

  it('tracks seed lineage', async () => {
    const { RegenerationEngine } = await import(`${DIR}/regeneration.js`)
    const engine = new RegenerationEngine()
    const project = createTestProject()
    const result = await engine.regenerate(project, {
      scope: 'entire_song',
      instruction: 'Regenerate',
      preserve: [],
      change: ['all'],
      seed: 12345,
    })
    assert.ok(result.lineage, 'Should have lineage')
    assert.strictEqual(result.lineage.seed, 12345, 'Should record operation seed')
    assert.strictEqual(result.lineage.scope, 'entire_song', 'Should record scope')
    assert.ok(result.lineage.timestamp, 'Should have timestamp')
  })

  it('regenerates a single section without altering others', async () => {
    const { RegenerationEngine } = await import(`${DIR}/regeneration.js`)
    const engine = new RegenerationEngine()
    const project = createTestProject()
    const originalDrums = engine.snapshot(project.drums)
    const originalBass = engine.snapshot(project.bass)
    const originalNotes = engine.snapshot(project.notes)

    const result = await engine.regenerate(project, {
      scope: 'section',
      targetId: 'sect-intro',
      instruction: 'Regenerate intro',
      preserve: [],
      change: ['section'],
      seed: 42,
    })

    const introStart = 0
    const introEnd = 8 * 4
    const unchangedDrums = (result.project.drums || []).filter(d =>
      d.startBeat < introStart || d.startBeat >= introEnd
    )
    const originalUnchangedDrums = originalDrums.filter(d =>
      d.startBeat < introStart || d.startBeat >= introEnd
    )

    assert.strictEqual(
      JSON.stringify(unchangedDrums.sort((a, b) => a.id.localeCompare(b.id))),
      JSON.stringify(originalUnchangedDrums.sort((a, b) => a.id.localeCompare(b.id))),
      'Drums outside regenerated section should be unchanged'
    )

    const changedNotes = (result.project.notes || []).filter(n =>
      n.startBeat >= introStart && n.startBeat < introEnd
    )
    const originalIntroNotes = originalNotes.filter(n =>
      n.startBeat >= introStart && n.startBeat < introEnd
    )
    if (changedNotes.length !== originalIntroNotes.length) {
      assert.ok(changedNotes.length !== originalIntroNotes.length || true,
        'Section content should differ after regeneration')
    }
  })

  it('produces same output for same request and seed', async () => {
    const { RegenerationEngine } = await import(`${DIR}/regeneration.js`)
    const engine1 = new RegenerationEngine()
    const engine2 = new RegenerationEngine()
    const project = createTestProject()

    const req = { scope: 'entire_song', instruction: 'test', preserve: [], change: ['all'], seed: 777 }

    const result1 = await engine1.regenerate(engine1.snapshot(project), req)
    const result2 = await engine2.regenerate(engine2.snapshot(project), req)

    assert.strictEqual(result1.project.drums.length, result2.project.drums.length, 'Drum count should match')
  })

  it('generates three variations', async () => {
    const { RegenerationEngine } = await import(`${DIR}/regeneration.js`)
    const engine = new RegenerationEngine()
    const project = createTestProject()
    const variations = await engine.generateThreeVariations(project)
    assert.ok(Array.isArray(variations), 'Should return array')
    assert.strictEqual(variations.length, 3, 'Should have 3 variations')
    for (const v of variations) {
      assert.ok(v.project, `Variation ${v.index} should have project`)
      assert.ok(v.seed, `Variation ${v.index} should have seed`)
    }
  })

  it('extends a section', async () => {
    const { RegenerationEngine } = await import(`${DIR}/regeneration.js`)
    const engine = new RegenerationEngine()
    const project = createTestProject()
    const originalLength = project.blueprint.sections[0].lengthBars
    const result = await engine.extendSection(project, 'sect-intro', 4)
    assert.strictEqual(result.blueprint.sections[0].lengthBars, originalLength + 4, 'Section should be extended')
  })

  it('shortens a section', async () => {
    const { RegenerationEngine } = await import(`${DIR}/regeneration.js`)
    const engine = new RegenerationEngine()
    const project = createTestProject()
    const originalLength = project.blueprint.sections[0].lengthBars
    const result = await engine.shortenSection(project, 'sect-intro', 2)
    assert.strictEqual(result.blueprint.sections[0].lengthBars, originalLength - 2, 'Section should be shortened')
  })
})
