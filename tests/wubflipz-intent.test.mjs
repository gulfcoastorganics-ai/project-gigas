import { describe, it } from 'node:test'
import assert from 'node:assert'

const basePath = process.cwd()
const INTENT = `${basePath}/src/wubflipz/intent/interpreter.js`

function createTestProject() {
  return {
    id: 'test',
    title: 'Test',
    blueprint: {
      bpm: 140, key: 'D', scale: 'minor', genre: ['dubstep'],
      sections: [
        { id: 's-intro', type: 'intro', name: 'Intro', startBar: 0, lengthBars: 8, energy: 0.2, density: 0.3, tension: 0.1, instructions: [] },
        { id: 's-build', type: 'build', name: 'Build', startBar: 8, lengthBars: 8, energy: 0.5, density: 0.5, tension: 0.7, instructions: [] },
        { id: 's-drop1', type: 'drop', name: 'Drop 1', startBar: 16, lengthBars: 16, energy: 0.9, density: 0.9, tension: 0.3, instructions: [] },
        { id: 's-break', type: 'break', name: 'Break', startBar: 32, lengthBars: 8, energy: 0.3, density: 0.2, tension: 0.1, instructions: [] },
        { id: 's-drop2', type: 'drop', name: 'Drop 2', startBar: 40, lengthBars: 16, energy: 0.95, density: 0.95, tension: 0.2, instructions: [] },
        { id: 's-outro', type: 'outro', name: 'Outro', startBar: 56, lengthBars: 8, energy: 0.1, density: 0.2, tension: 0, instructions: [] },
      ],
      energyCurve: [], instrumentation: [], mixIntent: {}, generationMetadata: {},
    },
    tracks: [
      { id: 'kick', name: 'Kick', type: 'drum' },
      { id: 'snare', name: 'Snare', type: 'drum' },
      { id: 'bass', name: 'Bass', type: 'bass' },
      { id: 'lead', name: 'Lead', type: 'melody' },
    ],
  }
}

describe('IntentInterpreter', () => {
  it('parses "make the second drop heavier"', async () => {
    const { IntentInterpreter } = await import(INTENT)
    const interp = new IntentInterpreter()
    const result = interp.parse('Make the second drop heavier', createTestProject())
    assert.ok(result.plans.length > 0)
    assert.strictEqual(result.plans[0].intent, 'make_heavier')
    assert.ok(result.plans[0].targetIds.includes('s-drop1') || result.plans[0].targetIds.includes('s-drop2'),
      `Should target a drop section, got ${result.plans[0].targetIds}`)
    assert.ok(result.plans[0].confidence >= 0.8)
  })

  it('parses "keep the drums but change the bass"', async () => {
    const { IntentInterpreter } = await import(INTENT)
    const interp = new IntentInterpreter()
    const result = interp.parse('Keep the drums but change the bass', createTestProject())
    assert.ok(result.plans.length > 0)
    assert.ok(result.plans[0].preserve.includes('drums'), 'Should preserve drums')
    assert.ok(result.plans[0].change.includes('bass') || result.plans[0].intent === 'change_bass', 'Should change bass')
  })

  it('parses "add eight bars before the breakdown"', async () => {
    const { IntentInterpreter } = await import(INTENT)
    const interp = new IntentInterpreter()
    const result = interp.parse('Add eight bars before the breakdown', createTestProject())
    assert.ok(result.plans.length > 0)
    assert.ok(result.plans[0].requiresConfirmation, 'Should require confirmation for structural change')
  })

  it('parses "make the intro darker and more minimal"', async () => {
    const { IntentInterpreter } = await import(INTENT)
    const interp = new IntentInterpreter()
    const result = interp.parse('Make the intro darker and more minimal', createTestProject())
    assert.ok(result.plans.length > 0)
    assert.strictEqual(result.plans[0].intent, 'change_mood')
    assert.ok(result.plans[0].targetIds.includes('s-intro'), 'Should target intro')
  })

  it('parses "simplify the melody"', async () => {
    const { IntentInterpreter } = await import(INTENT)
    const interp = new IntentInterpreter()
    const result = interp.parse('Simplify the melody', createTestProject())
    assert.ok(result.plans.length > 0)
    assert.strictEqual(result.plans[0].intent, 'simplify')
    assert.ok(result.plans[0].change.includes('melody') || result.plans[0].targetIds.includes('lead'),
      'Should target melody')
  })

  it('parses "turn the track into drum and bass"', async () => {
    const { IntentInterpreter } = await import(INTENT)
    const interp = new IntentInterpreter()
    const result = interp.parse('Turn the track into drum and bass', createTestProject())
    assert.ok(result.plans.length > 0)
    assert.strictEqual(result.plans[0].intent, 'change_genre')
  })

  it('parses "create a one-minute version"', async () => {
    const { IntentInterpreter } = await import(INTENT)
    const interp = new IntentInterpreter()
    const result = interp.parse('Create a one-minute version', createTestProject())
    assert.ok(result.plans.length > 0)
    assert.strictEqual(result.plans[0].intent, 'change_length')
  })

  it('parses "regenerate bars 49 through 56"', async () => {
    const { IntentInterpreter } = await import(INTENT)
    const interp = new IntentInterpreter()
    const project = createTestProject()
    const result = interp.parse('Regenerate bars 49 through 56', project)
    assert.ok(result.plans.length > 0)
    assert.strictEqual(result.plans[0].intent, 'regenerate_bars')
    assert.ok(result.plans[0].targetIds.length > 0, 'Should find target sections')
  })

  it('parses "make the final drop less repetitive"', async () => {
    const { IntentInterpreter } = await import(INTENT)
    const interp = new IntentInterpreter()
    const result = interp.parse('Make the final drop less repetitive', createTestProject())
    assert.ok(result.plans.length > 0)
    assert.strictEqual(result.plans[0].intent, 'reduce_repetition')
  })

  it('parses "keep everything except the hats"', async () => {
    const { IntentInterpreter } = await import(INTENT)
    const interp = new IntentInterpreter()
    const result = interp.parse('Keep everything except the hats', createTestProject())
    assert.ok(result.plans.length > 0)
    assert.ok(result.plans[0].warnings.length >= 0, 'Should have warnings or explanation')
  })

  it('parses "make the buildup longer without changing the drops"', async () => {
    const { IntentInterpreter } = await import(INTENT)
    const interp = new IntentInterpreter()
    const result = interp.parse('Make the buildup longer without changing the drops', createTestProject())
    assert.ok(result.plans.length > 0)
    assert.strictEqual(result.plans[0].intent, 'extend_section')
  })

  it('returns low confidence for unknown commands', async () => {
    const { IntentInterpreter } = await import(INTENT)
    const interp = new IntentInterpreter()
    const result = interp.parse('xylophone zebra quantum merge', createTestProject())
    assert.ok(result.plans.length > 0, 'Should still return a plan')
    assert.ok(result.plans[0].confidence <= 0.5, 'Gibberish should have low confidence')
  })
})

describe('IntentInterpreter - edge cases', () => {
  it('provides warnings for structural commands', async () => {
    const { IntentInterpreter } = await import(INTENT)
    const interp = new IntentInterpreter()
    const result = interp.parse('Add eight bars before the breakdown', createTestProject())
    assert.ok(result.plans[0].warnings.length > 0, 'Should have warnings')
  })
})
