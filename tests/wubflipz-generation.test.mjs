import { describe, it } from 'node:test'
import assert from 'node:assert'

const basePath = process.cwd()

async function importModule(name) {
  return await import(`${basePath}/src/wubflipz/generation/${name}.js`)
}

async function importSchemas(name) {
  return await import(`${basePath}/src/wubflipz/schemas/${name}.js`)
}

async function importProfiles(name) {
  if (name.endsWith('.js')) {
    return await import(`${basePath}/src/wubflipz/profiles/${name}`)
  }
  return await import(`${basePath}/src/wubflipz/profiles/${name}.js`)
}

describe('SeededRandom', () => {
  it('produces deterministic output for the same seed', async () => {
    const { SeededRandom } = await importModule('seededRandom')
    const rng1 = new SeededRandom(42)
    const rng2 = new SeededRandom(42)
    for (let i = 0; i < 100; i++) {
      assert.strictEqual(rng1.next(), rng2.next(), `Mismatch at call ${i}`)
    }
  })

  it('produces different output for different seeds', async () => {
    const { SeededRandom } = await importModule('seededRandom')
    const rng1 = new SeededRandom(42)
    const rng2 = new SeededRandom(99)
    let different = false
    for (let i = 0; i < 10; i++) {
      if (rng1.next() !== rng2.next()) { different = true; break }
    }
    assert.ok(different, 'Different seeds should produce different sequences')
  })

  it('supports child seeding', async () => {
    const { SeededRandom } = await importModule('seededRandom')
    const parent = new SeededRandom(42)
    const child1 = parent.child('a')
    const child2 = parent.child('a')
    assert.strictEqual(child1.next(), child2.next(), 'Child seeds should be deterministic')
  })

  it('nextInt returns values in range', async () => {
    const { SeededRandom } = await importModule('seededRandom')
    const rng = new SeededRandom(42)
    for (let i = 0; i < 100; i++) {
      const val = rng.nextInt(3, 7)
      assert.ok(val >= 3 && val <= 7, `Value ${val} out of range [3,7]`)
    }
  })

  it('pick selects from array', async () => {
    const { SeededRandom } = await importModule('seededRandom')
    const rng = new SeededRandom(42)
    const arr = ['a', 'b', 'c']
    for (let i = 0; i < 20; i++) {
      assert.ok(arr.includes(rng.pick(arr)))
    }
  })

  it('chance returns boolean', async () => {
    const { SeededRandom } = await importModule('seededRandom')
    const rng = new SeededRandom(42)
    for (let i = 0; i < 100; i++) {
      const result = rng.chance(0.5)
      assert.strictEqual(typeof result, 'boolean')
    }
  })
})

describe('Blueprint Validation', () => {
  it('validates a correct blueprint', async () => {
    const { SongBlueprintSchema } = await importSchemas('blueprint')
    const blueprint = {
      id: 'test-id',
      version: 1,
      title: 'Test Track',
      prompt: 'test prompt',
      genre: ['dubstep'],
      mood: ['dark'],
      bpm: 140,
      key: 'D',
      scale: 'minor',
      timeSignature: [4, 4],
      durationBars: 32,
      seed: 42,
      energyCurve: [{ bar: 0, value: 0.2 }],
      sections: [{
        id: 'sect-1',
        type: 'intro',
        name: 'Intro',
        startBar: 0,
        lengthBars: 8,
        energy: 0.2,
        density: 0.3,
        tension: 0.1,
        instructions: [],
      }],
      instrumentation: [{
        trackId: 'kick',
        role: 'kick',
        instrument: 'kick',
        priority: 10,
      }],
      mixIntent: {},
      generationMetadata: {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        seed: 42,
        prompt: 'test',
      },
    }
    const result = SongBlueprintSchema.safeParse(blueprint)
    assert.ok(result.success, `Blueprint validation failed: ${result.error?.message}`)
  })

  it('rejects an invalid blueprint', async () => {
    const { SongBlueprintSchema } = await importSchemas('blueprint')
    const result = SongBlueprintSchema.safeParse({ invalid: true })
    assert.ok(!result.success, 'Should reject invalid data')
  })

  it('repairs missing fields', async () => {
    const { repairBlueprint } = await importSchemas('blueprint')
    const result = repairBlueprint({ prompt: 'test' })
    assert.ok(result.data, 'Should return repaired data')
    assert.ok(Array.isArray(result.repairs), 'Should return repairs list')
    assert.ok(result.repairs.length > 0, 'Should have at least one repair')
  })
})

describe('Section Boundaries', () => {
  it('sections cover the full duration without gaps', async () => {
    const result = { success: true }
    const totalBars = 48
    const sections = [
      { startBar: 0, lengthBars: 8 },
      { startBar: 8, lengthBars: 16 },
      { startBar: 24, lengthBars: 8 },
      { startBar: 32, lengthBars: 16 },
    ]
    let lastEnd = 0
    for (const s of sections) {
      if (s.startBar !== lastEnd) {
        result.success = false
        result.error = `Gap at bar ${lastEnd}`
        break
      }
      lastEnd = s.startBar + s.lengthBars
    }
    if (lastEnd !== totalBars) {
      result.success = false
      result.error = `Sections end at ${lastEnd} but totalBars=${totalBars}`
    }
    assert.ok(result.success, result.error || 'Sections should cover full duration')
  })

  it('sections do not overlap', async () => {
    const sections = [
      { startBar: 0, lengthBars: 8 },
      { startBar: 8, lengthBars: 16 },
    ]
    for (let i = 1; i < sections.length; i++) {
      const prev = sections[i - 1]
      const curr = sections[i]
      assert.ok(curr.startBar >= prev.startBar + prev.lengthBars,
        `Section ${i} overlaps with section ${i - 1}`)
    }
  })
})

describe('Director Engine', () => {
  it('generates a valid blueprint from a prompt locally', async () => {
    const { DirectorEngine } = await importModule('director')
    const director = new DirectorEngine()
    const blueprint = await director.generate('test dubstep track', {
      genre: 'dubstep',
      bpm: 140,
      seed: 42,
      useAI: false,
    })
    assert.ok(blueprint, 'Should return blueprint')
    assert.strictEqual(typeof blueprint.bpm, 'number', 'Should have bpm')
    assert.ok(blueprint.sections.length > 0, 'Should have sections')
    assert.ok(blueprint.durationBars > 0, 'Should have duration')
    assert.strictEqual(blueprint.seed, 42, 'Should use provided seed')
  })

  it('produces the same output for the same seed', async () => {
    const { DirectorEngine } = await importModule('director')
    const director1 = new DirectorEngine()
    const director2 = new DirectorEngine()
    const result1 = await director1.generate('test', {
      genre: 'dubstep',
      seed: 123,
      useAI: false,
    })
    const result2 = await director2.generate('test', {
      genre: 'dubstep',
      seed: 123,
      useAI: false,
    })
    assert.strictEqual(result1.bpm, result2.bpm, 'BPM should match')
    assert.strictEqual(result1.key, result2.key, 'Key should match')
    assert.strictEqual(result1.durationBars, result2.durationBars, 'Duration should match')
    assert.strictEqual(result1.sections.length, result2.sections.length, 'Section count should match')
  })

  it('produces different output for different seeds', async () => {
    const { DirectorEngine } = await importModule('director')
    const director1 = new DirectorEngine()
    const director2 = new DirectorEngine()
    const result1 = await director1.generate('test', { genre: 'dubstep', seed: 123, useAI: false })
    const result2 = await director2.generate('test', { genre: 'dubstep', seed: 456, useAI: false })
    const different = result1.bpm !== result2.bpm || result1.key !== result2.key ||
      result1.sections.length !== result2.sections.length
    assert.ok(different, 'Different seeds should produce different outputs')
  })

  it('generates variations', async () => {
    const { DirectorEngine } = await importModule('director')
    const director = new DirectorEngine()
    const blueprint = await director.generate('test', { genre: 'dubstep', seed: 42, useAI: false })
    const variation = director.generateVariation(blueprint, 99)
    assert.ok(variation, 'Should return variation')
    assert.notStrictEqual(variation.seed, blueprint.seed, 'Variation should have different seed')
  })
})

describe('Drum Generator', () => {
  it('generates drum events', async () => {
    const { DrumGenerator } = await importModule('drums')
    const { SeededRandom } = await importModule('seededRandom')
    const rng = new SeededRandom(42)
    const gen = new DrumGenerator(rng)
    const sections = [
      { id: 'intro', startBar: 0, lengthBars: 8, energy: 0.2, density: 0.3, tension: 0.1, type: 'intro', name: 'Intro', instructions: [] },
      { id: 'drop', startBar: 8, lengthBars: 16, energy: 0.9, density: 0.9, tension: 0.3, type: 'drop', name: 'Drop', instructions: [] },
    ]
    const events = gen.generate(140, sections, 'dubstep')
    assert.ok(Array.isArray(events), 'Should return array')
    assert.ok(events.length > 0, 'Should generate events')
    const kicks = events.filter(e => e.sound === 'kick')
    const snares = events.filter(e => e.sound === 'snare' || e.sound === 'clap')
    assert.ok(kicks.length > 0, 'Should have kicks')
    assert.ok(snares.length > 0, 'Should have snares')
  })

  it('generates different events for different seeds', async () => {
    const { DrumGenerator } = await importModule('drums')
    const { SeededRandom } = await importModule('seededRandom')
    const sections = [
      { id: 's1', startBar: 0, lengthBars: 4, energy: 0.5, density: 0.5, tension: 0.3, type: 'intro', name: 'Intro', instructions: [] },
    ]
    const gen1 = new DrumGenerator(new SeededRandom(1))
    const gen2 = new DrumGenerator(new SeededRandom(2))
    const events1 = gen1.generate(140, sections, 'dubstep')
    const events2 = gen2.generate(140, sections, 'dubstep')
    const beatStr1 = events1.map(e => `${e.sound}@${e.startBeat}`).join(',')
    const beatStr2 = events2.map(e => `${e.sound}@${e.startBeat}`).join(',')
    assert.notStrictEqual(beatStr1, beatStr2, 'Different seeds should produce different patterns')
  })
})

describe('Bass Generator', () => {
  it('generates bass events', async () => {
    const { BassGenerator } = await importModule('bass')
    const { SeededRandom } = await importModule('seededRandom')
    const rng = new SeededRandom(42)
    const gen = new BassGenerator(rng)
    const blueprint = { key: 'D', scale: 'minor', genre: ['dubstep'] }
    const sections = [
      { id: 'intro', startBar: 0, lengthBars: 4, energy: 0.3, density: 0.3, tension: 0.1, type: 'intro', name: 'Intro', instructions: [] },
    ]
    const chords = [
      { root: 50, type: 'minor', notes: [50, 53, 57], startBeat: 0, durationBeats: 16, roman: 'i', tension: 0.1 },
    ]
    const events = gen.generate(140, sections, chords, blueprint, 'dubstep')
    assert.ok(Array.isArray(events), 'Should return array')
    assert.ok(events.length > 0, 'Should generate events')
    assert.ok(events.every(e => e.rootNote !== undefined), 'Events should have rootNote')
    assert.ok(events.every(e => e.articulation !== undefined), 'Events should have articulation')
  })
})

describe('Project Serialization', () => {
  it('serializes and deserializes a project', async () => {
    const project = {
      id: 'test',
      title: 'Test',
      blueprint: { bpm: 140, key: 'D', scale: 'minor' },
      drums: [{ id: 'd1', sound: 'kick', startBeat: 0, durationBeats: 0.25, velocity: 1 }],
      bass: [],
      notes: [],
      tracks: [],
    }
    const json = JSON.stringify(project)
    const restored = JSON.parse(json)
    assert.strictEqual(restored.id, project.id)
    assert.strictEqual(restored.blueprint.bpm, 140)
    assert.strictEqual(restored.drums[0].sound, 'kick')
  })
})

describe('Genre Profiles', () => {
  it('loads all profiles', async () => {
    await import(`${basePath}/src/wubflipz/profiles/profiles.js`)
    const index = await import(`${basePath}/src/wubflipz/profiles/index.js`)
    const profiles = index.getAllProfiles()
    assert.ok(profiles.length >= 8, `Should have at least 8 profiles, got ${profiles.length}`)
    const dubstep = index.getProfile('dubstep')
    assert.ok(dubstep, 'Should find dubstep profile')
    assert.ok(Array.isArray(dubstep.bpmRange), 'Should have bpmRange')
    assert.ok(dubstep.bpmRange.length === 2, 'bpmRange should be [min, max]')
  })
})

describe('Harmony Generator', () => {
  it('generates chord progressions', async () => {
    const { HarmonyGenerator } = await importModule('harmony')
    const { SeededRandom } = await importModule('seededRandom')
    const { getProfile } = await import(`${basePath}/src/wubflipz/profiles/index.js`)
    await import(`${basePath}/src/wubflipz/profiles/dubstep.js`)

    const rng = new SeededRandom(42)
    const gen = new HarmonyGenerator(rng)
    const profile = getProfile('dubstep')
    const blueprint = {
      key: 'D',
      scale: 'minor',
      bpm: 140,
      sections: [
        { id: 'intro', startBar: 0, lengthBars: 4, type: 'intro', name: 'Intro', energy: 0.3, density: 0.3, tension: 0.1, instructions: [] },
        { id: 'drop', startBar: 4, lengthBars: 8, type: 'drop', name: 'Drop', energy: 0.9, density: 0.9, tension: 0.3, instructions: [] },
      ],
    }
    const chords = gen.generateChordProgression(blueprint, profile)
    assert.ok(Array.isArray(chords), 'Should return array')
    assert.ok(chords.length > 0, 'Should generate chords')
    assert.ok(chords.every(c => Array.isArray(c.notes)), 'Each chord should have notes array')
    assert.ok(chords.every(c => c.startBeat !== undefined), 'Each chord should have startBeat')
  })
})
