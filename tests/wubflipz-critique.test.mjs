import { describe, it } from 'node:test'
import assert from 'node:assert'

const basePath = process.cwd()

function createProject(overrides = {}) {
  return {
    id: 'test',
    title: 'Test',
    blueprint: {
      bpm: 140, key: 'D', scale: 'minor', genre: ['dubstep'], mood: ['dark'],
      prompt: 'dark ritual dubstep at 140 BPM',
      durationBars: 32, seed: 42,
      sections: [
        { id: 's1', type: 'intro', name: 'Intro', startBar: 0, lengthBars: 8, energy: 0.2, density: 0.3, tension: 0.1, instructions: [] },
        { id: 's2', type: 'build', name: 'Build', startBar: 8, lengthBars: 8, energy: 0.6, density: 0.5, tension: 0.7, instructions: [] },
        { id: 's3', type: 'drop', name: 'Drop', startBar: 16, lengthBars: 8, energy: 0.9, density: 0.9, tension: 0.3, instructions: [] },
        { id: 's4', type: 'outro', name: 'Outro', startBar: 24, lengthBars: 8, energy: 0.2, density: 0.2, tension: 0, instructions: [] },
      ],
      instrumentation: [], mixIntent: {}, generationMetadata: {},
    },
    drums: [
      { id: 'd1', trackId: 'kick', sound: 'kick', startBeat: 0, durationBeats: 0.25, velocity: 0.9 },
      { id: 'd2', trackId: 'snare', sound: 'snare', startBeat: 2, durationBeats: 0.25, velocity: 0.8 },
      { id: 'd3', trackId: 'kick', sound: 'kick', startBeat: 4, durationBeats: 0.25, velocity: 0.9 },
      { id: 'd4', trackId: 'snare', sound: 'snare', startBeat: 6, durationBeats: 0.25, velocity: 0.8 },
    ],
    bass: [
      { id: 'b1', trackId: 'bass', startBeat: 0, durationBeats: 2, rootNote: 38, articulation: 'sub', intensity: 0.7 },
    ],
    notes: [
      { id: 'n1', trackId: 'lead', pitch: 62, startBeat: 0, durationBeats: 0.5, velocity: 0.7 },
      { id: 'n2', trackId: 'lead', pitch: 65, startBeat: 1, durationBeats: 0.5, velocity: 0.6 },
    ],
    tracks: [],
    ...overrides,
  }
}

describe('CritiqueEngine', () => {
  it('analyzes a project and returns issues', async () => {
    const { CritiqueEngine } = await import(`${basePath}/src/wubflipz/critique/critique.js`)
    const engine = new CritiqueEngine()
    const issues = engine.analyze(createProject())
    assert.ok(Array.isArray(issues), 'Should return array')
  })

  it('detects missing kicks', async () => {
    const { CritiqueEngine } = await import(`${basePath}/src/wubflipz/critique/critique.js`)
    const engine = new CritiqueEngine()
    const project = createProject({ drums: [] })
    const issues = engine.analyze(project)
    const kickIssue = issues.find(i => i.type === 'missing_kicks')
    assert.ok(kickIssue, 'Should detect missing kicks')
    assert.ok(kickIssue.severity >= 7, 'Missing kicks should be high severity')
  })

  it('detects missing snares', async () => {
    const { CritiqueEngine } = await import(`${basePath}/src/wubflipz/critique/critique.js`)
    const engine = new CritiqueEngine()
    const project = createProject({ drums: [{ id: 'd1', trackId: 'kick', sound: 'kick', startBeat: 0, durationBeats: 0.25, velocity: 0.9 }] })
    const issues = engine.analyze(project)
    const snareIssue = issues.find(i => i.type === 'missing_snares')
    assert.ok(snareIssue, 'Should detect missing snares')
  })

  it('detects flat energy curve between sections', async () => {
    const { CritiqueEngine } = await import(`${basePath}/src/wubflipz/critique/critique.js`)
    const engine = new CritiqueEngine()
    const project = createProject()
    project.blueprint.sections = project.blueprint.sections.map(s => ({ ...s, energy: 0.5 }))
    const issues = engine.analyze(project)
    const flatIssue = issues.find(i => i.type === 'flat_energy')
    assert.ok(flatIssue, 'Should detect flat energy')
  })

  it('detects similar drops', async () => {
    const { CritiqueEngine } = await import(`${basePath}/src/wubflipz/critique/critique.js`)
    const engine = new CritiqueEngine()
    const project = createProject()
    project.blueprint.sections = [
      { id: 's1', type: 'drop', name: 'Drop 1', startBar: 0, lengthBars: 8, energy: 0.9, density: 0.9, tension: 0.3, instructions: [] },
      { id: 's2', type: 'drop', name: 'Drop 2', startBar: 8, lengthBars: 8, energy: 0.9, density: 0.9, tension: 0.3, instructions: [] },
    ]
    const issues = engine.analyze(project)
    const similarDropIssue = issues.find(i => i.type === 'similar_drops')
    assert.ok(similarDropIssue, 'Should detect similar drops')
  })

  it('detects scale violations', async () => {
    const { CritiqueEngine } = await import(`${basePath}/src/wubflipz/critique/critique.js`)
    const engine = new CritiqueEngine()
    const project = createProject()
    project.notes = [
      { id: 'n1', trackId: 'lead', pitch: 60, startBeat: 0, durationBeats: 0.5, velocity: 0.7 },
      { id: 'n2', trackId: 'lead', pitch: 61, startBeat: 1, durationBeats: 0.5, velocity: 0.6 },
      { id: 'n3', trackId: 'lead', pitch: 63, startBeat: 2, durationBeats: 0.5, velocity: 0.6 },
      { id: 'n4', trackId: 'lead', pitch: 64, startBeat: 3, durationBeats: 0.5, velocity: 0.6 },
      { id: 'n5', trackId: 'lead', pitch: 66, startBeat: 4, durationBeats: 0.5, velocity: 0.6 },
    ]
    project.blueprint.key = 'C'
    project.blueprint.scale = 'major'
    // C major scale: C=60, D=62, E=64, F=65, G=67, A=69, B=71
    // Notes 61, 63, 66 are violations
    const issues = engine.analyze(project)
    const scaleIssue = issues.find(i => i.type === 'scale_violations')
    assert.ok(scaleIssue, 'Should detect scale violations')
  })

  it('returns safe repairs only', async () => {
    const { CritiqueEngine } = await import(`${basePath}/src/wubflipz/critique/critique.js`)
    const engine = new CritiqueEngine()
    const project = createProject({ drums: [] })
    const issues = engine.analyze(project)
    const safe = engine.getSafeRepairs(issues)
    assert.ok(Array.isArray(safe), 'Should return array of safe repairs')
  })

  it('filters by severity', async () => {
    const { CritiqueEngine } = await import(`${basePath}/src/wubflipz/critique/critique.js`)
    const engine = new CritiqueEngine()
    const project = createProject({ drums: [] })
    const issues = engine.analyze(project)
    const filtered = engine.filterBySeverity(issues, 5)
    for (const issue of filtered) {
      assert.ok(issue.severity >= 5, `Issue ${issue.type} has severity ${issue.severity} but should be >= 5`)
    }
  })

  it('detects peak clipping', async () => {
    const { CritiqueEngine } = await import(`${basePath}/src/wubflipz/critique/critique.js`)
    const engine = new CritiqueEngine()
    const project = createProject()
    project.drums[0].velocity = 1.5
    const issues = engine.analyze(project)
    const clipping = issues.find(i => i.type === 'peak_clipping')
    assert.ok(clipping, 'Should detect peak clipping')
  })

  it('detects missing outro', async () => {
    const { CritiqueEngine } = await import(`${basePath}/src/wubflipz/critique/critique.js`)
    const engine = new CritiqueEngine()
    const project = createProject()
    project.blueprint.sections = project.blueprint.sections.filter(s => s.type !== 'outro')
    const issues = engine.analyze(project)
    const missingOutro = issues.find(i => i.type === 'missing_outro')
    assert.ok(missingOutro, 'Should detect missing outro')
  })
})
