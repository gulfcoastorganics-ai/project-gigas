import { SeededRandom, hashCombine } from './seededRandom.js'
import { DirectorEngine } from './director.js'
import { HarmonyGenerator } from './harmony.js'
import { DrumGenerator } from './drums.js'
import { BassGenerator } from './bass.js'
import { MelodyGenerator } from './melody.js'
import { TransitionGenerator } from './transitions.js'
import { getProfile } from '../profiles/profiles.js'
import { SongBlueprintSchema } from '../schemas/blueprint.js'

const MAX_HISTORY = 20

export class RegenerationEngine {
  constructor(options = {}) {
    this._director = options.director || new DirectorEngine()
    this._history = []
    this._currentIndex = -1
    this._pendingCommit = null
  }

  get history() { return this._history }
  get canUndo() { return this._currentIndex > 0 }
  get canRedo() { return this._currentIndex < this._history.length - 1 }

  snapshot(project) {
    return JSON.parse(JSON.stringify(project))
  }

  _initHistory(project) {
    if (this._history.length === 0) {
      this._history.push({
        state: this.snapshot(project),
        lineage: { version: 0, seed: project.blueprint?.seed || 0, timestamp: new Date().toISOString(), prompt: project.blueprint?.prompt || '', changes: [] },
      })
      this._currentIndex = 0
    }
  }

  async regenerate(project, request) {
    if (!project) throw new Error('No project loaded')
    if (!project.blueprint) throw new Error('Project has no blueprint')

    this._initHistory(project)

    const opSeed = request.seed ?? Date.now()
    const cleanRequest = this._normalizeRequest(request, project)
    const state = { idle: 'idle' }

    const result = await this._generateForScope(project, cleanRequest, opSeed, state)

    if (!result) {
      return { project: this.snapshot(project), changes: [], seed: opSeed }
    }

    const merged = this._mergeResult(project, result, cleanRequest, this.snapshot(project))

    if (cleanRequest.preserve.includes('seed') && merged.blueprint) {
      merged.blueprint = { ...merged.blueprint, seed: project.blueprint?.seed }
    }

    const lineageEntry = {
      version: this._currentIndex + 1,
      parentVersion: this._currentIndex >= 0 ? this._history[this._currentIndex]?.lineage?.version : undefined,
      seed: opSeed,
      parentSeed: project.blueprint?.seed,
      timestamp: new Date().toISOString(),
      prompt: project.blueprint?.prompt || '',
      changes: cleanRequest.change,
      scope: cleanRequest.scope,
      targetId: cleanRequest.targetId,
      instruction: cleanRequest.instruction,
      preserve: cleanRequest.preserve,
    }

    this._pushState(merged, lineageEntry)

    return { project: merged, changes: cleanRequest.change, seed: opSeed, lineage: lineageEntry }
  }

  _normalizeRequest(request, project) {
    const scope = request.scope || 'entire_song'
    const targetId = request.targetId
    const preserve = Array.isArray(request.preserve) ? [...request.preserve] : []
    const change = Array.isArray(request.change) ? [...request.change] : []

    if (scope === 'entire_song' && !targetId) {
      return { ...request, scope, targetId: project.id, preserve, change }
    }

    if (scope === 'section' && targetId) {
      const section = (project.blueprint?.sections || []).find(s =>
        s.id === targetId || s.type === targetId
      )
      if (!section) throw new Error(`Section not found: ${targetId}`)
      return { ...request, scope, targetId: section.id, preserve, change }
    }

    if (scope === 'track' && targetId) {
      const track = (project.tracks || []).find(t =>
        t.id === targetId || t.name?.toLowerCase() === targetId.toLowerCase()
      )
      if (!track) throw new Error(`Track not found: ${targetId}`)
      return { ...request, scope, targetId: track.id, preserve, change }
    }

    return { ...request, scope, targetId, preserve, change }
  }

  async _generateForScope(project, request, opSeed, state) {
    const scope = request.scope
    const targetId = request.targetId
    const blueprint = project.blueprint
    const profile = getProfile((blueprint.genre || [])[0]) || getProfile('dubstep')
    const rng = new SeededRandom(opSeed)

    if (scope === 'entire_song') {
      const newBlueprint = await this._director.generate(blueprint.prompt, {
        genre: blueprint.genre[0],
        bpm: blueprint.bpm,
        key: blueprint.key,
        scale: blueprint.scale,
        seed: opSeed,
        useAI: false,
      })
      const harmonyGen = new HarmonyGenerator(rng.child('harmony'))
      const chords = harmonyGen.generateChordProgression(newBlueprint, profile)
      const drumGen = new DrumGenerator(rng.child('drums'))
      const drums = drumGen.generate(newBlueprint.bpm, newBlueprint.sections, blueprint.genre[0])
      const bassGen = new BassGenerator(rng.child('bass'))
      const bass = bassGen.generate(newBlueprint.bpm, newBlueprint.sections, chords, newBlueprint, blueprint.genre[0])
      const melGen = new MelodyGenerator(rng.child('melody'))
      const notes = melGen.generate(newBlueprint, chords, blueprint.genre[0])
      const transGen = new TransitionGenerator(rng.child('transitions'))
      const transitions = transGen.generate(newBlueprint.sections, newBlueprint)

      return { blueprint: newBlueprint, chords, drums, bass, notes, transitions, tracks: project.tracks }
    }

    if (scope === 'section') {
      const sectionIdx = (blueprint.sections || []).findIndex(s => s.id === targetId)
      if (sectionIdx === -1) return null
      const section = blueprint.sections[sectionIdx]

      const newSections = blueprint.sections.map((s, i) =>
        i === sectionIdx ? { ...s, energy: Math.min(1, s.energy + 0.1), density: Math.min(1, s.density + 0.1) } : s
      )
      const newBlueprint = { ...blueprint, sections: newSections }

      const harmonyGen = new HarmonyGenerator(rng.child('harmony'))
      const newChords = harmonyGen.generateChordProgression(newBlueprint, profile)
      const chords = (project.chords || []).filter(c =>
        c.startBeat < section.startBar * 4 || c.startBeat >= (section.startBar + section.lengthBars) * 4
      ).concat(
        newChords.filter(c =>
          c.startBeat >= section.startBar * 4 && c.startBeat < (section.startBar + section.lengthBars) * 4
        )
      )

      const drumGen = new DrumGenerator(rng.child('drums'))
      const newDrums = drumGen.generate(blueprint.bpm, [section], blueprint.genre[0])
      const drums = (project.drums || []).filter(d =>
        d.startBeat < section.startBar * 4 || d.startBeat >= (section.startBar + section.lengthBars) * 4
      ).concat(newDrums)

      const bassGen = new BassGenerator(rng.child('bass'))
      const sectionChords = chords.filter(c =>
        c.startBeat >= section.startBar * 4 && c.startBeat < (section.startBar + section.lengthBars) * 4
      )
      const newBass = bassGen.generate(blueprint.bpm, [section], sectionChords, newBlueprint, blueprint.genre[0])
      const bass = (project.bass || []).filter(b =>
        b.startBeat < section.startBar * 4 || b.startBeat >= (section.startBar + section.lengthBars) * 4
      ).concat(newBass)

      const melGen = new MelodyGenerator(rng.child('melody'))
      const newNotes = melGen.generate(newBlueprint, chords, blueprint.genre[0])
      const notes = (project.notes || []).filter(n =>
        n.startBeat < section.startBar * 4 || n.startBeat >= (section.startBar + section.lengthBars) * 4
      ).concat(
        newNotes.filter(n =>
          n.startBeat >= section.startBar * 4 && n.startBeat < (section.startBar + section.lengthBars) * 4
        )
      )

      return { blueprint: newBlueprint, chords, drums, bass, notes, tracks: project.tracks }
    }

    if (scope === 'track') {
      const track = (project.tracks || []).find(t => t.id === targetId)
      if (!track) return null
      const trackType = track.type

      if (trackType === 'drum' || track.id === 'kick' || track.id === 'snare' || track.id === 'hat') {
        const trackIds = [track.id]
        const existingDrums = (project.drums || []).filter(d => !trackIds.includes(d.trackId))
        const drumGen = new DrumGenerator(rng.child('drums'))
        const newDrums = drumGen.generate(blueprint.bpm, blueprint.sections, blueprint.genre[0])
        const drums = existingDrums.concat(newDrums.filter(d => trackIds.includes(d.trackId)))
        return { chords: project.chords, drums, bass: project.bass, notes: project.notes, tracks: project.tracks }
      }

      if (trackType === 'bass' || track.id === 'bass') {
        const harmonyGen = new HarmonyGenerator(rng.child('harmony'))
        const chords = harmonyGen.generateChordProgression(blueprint, profile)
        const bassGen = new BassGenerator(rng.child('bass'))
        const bass = bassGen.generate(blueprint.bpm, blueprint.sections, chords, blueprint, blueprint.genre[0])
        return { chords, drums: project.drums, bass, notes: project.notes, tracks: project.tracks }
      }

      if (trackType === 'melody' || track.id === 'lead') {
        const harmonyGen = new HarmonyGenerator(rng.child('harmony'))
        const chords = harmonyGen.generateChordProgression(blueprint, profile)
        const melGen = new MelodyGenerator(rng.child('melody'))
        const notes = melGen.generate(blueprint, chords, blueprint.genre[0])
        return { chords, drums: project.drums, bass: project.bass, notes, tracks: project.tracks }
      }

      if (trackType === 'harmony' || track.id === 'chords') {
        const harmonyGen = new HarmonyGenerator(rng.child('harmony'))
        const chords = harmonyGen.generateChordProgression(blueprint, profile)
        return { chords, drums: project.drums, bass: project.bass, notes: project.notes, tracks: project.tracks }
      }
    }

    return null
  }

  _mergeResult(project, result, request, snapshot) {
    const merged = { ...project }
    const preserve = request.preserve || []
    const change = request.change || []

    if (result.blueprint && !preserve.includes('blueprint')) {
      merged.blueprint = result.blueprint
    }

    if (result.chords && !preserve.includes('harmony')) {
      merged.chords = result.chords
    }

    if (result.drums && !preserve.includes('drums')) {
      merged.drums = result.drums
    }

    if (result.bass && !preserve.includes('bass')) {
      merged.bass = result.bass
    }

    if (result.notes && !preserve.includes('melody')) {
      merged.notes = result.notes
    }

    if (result.tracks) {
      merged.tracks = result.tracks
    }

    return merged
  }

  _pushState(newState, lineageEntry) {
    if (this._currentIndex < this._history.length - 1) {
      this._history = this._history.slice(0, this._currentIndex + 1)
    }
    this._history.push({ state: this.snapshot(newState), lineage: lineageEntry })
    if (this._history.length > MAX_HISTORY + 1) {
      this._history.shift()
      this._currentIndex--
    }
    this._currentIndex = this._history.length - 1
  }

  undo() {
    if (!this.canUndo) return null
    this._currentIndex--
    const entry = this._history[this._currentIndex]
    return { project: this.snapshot(entry.state), lineage: entry.lineage }
  }

  redo() {
    if (!this.canRedo) return null
    this._currentIndex++
    const entry = this._history[this._currentIndex]
    return { project: this.snapshot(entry.state), lineage: entry.lineage }
  }

  getCurrentLineage() {
    if (this._currentIndex >= 0 && this._currentIndex < this._history.length) {
      return this._history[this._currentIndex].lineage
    }
    return null
  }

  getLineageHistory() {
    return this._history.slice(0, this._currentIndex + 1).map(e => e.lineage)
  }

  async generateThreeVariations(project) {
    if (!project?.blueprint) throw new Error('No project')
    const baseSeed = project.blueprint.seed || Date.now()
    const variations = []
    for (let i = 0; i < 3; i++) {
      const varSeed = hashCombine(baseSeed, `variation-${i}`)
      const req = {
        scope: 'entire_song',
        instruction: `Variation ${i + 1}`,
        preserve: [],
        change: ['all'],
        seed: varSeed,
      }
      const result = await this.regenerate(project, req)
      variations.push({ index: i, seed: varSeed, project: result.project })
    }
    return variations
  }

  async extendSection(project, sectionId, extraBars) {
    if (!project?.blueprint) throw new Error('No project')
    const sections = project.blueprint.sections || []
    const idx = sections.findIndex(s => s.id === sectionId)
    if (idx === -1) throw new Error('Section not found')
    const newSections = sections.map((s, i) =>
      i === idx ? { ...s, lengthBars: s.lengthBars + extraBars } : s
    )
    const newBlueprint = { ...project.blueprint, sections: newSections, durationBars: project.blueprint.durationBars + extraBars }
    return { ...project, blueprint: newBlueprint }
  }

  async shortenSection(project, sectionId, reduceBars) {
    if (!project?.blueprint) throw new Error('No project')
    const sections = project.blueprint.sections || []
    const idx = sections.findIndex(s => s.id === sectionId)
    if (idx === -1) throw new Error('Section not found')
    const newSections = sections.map((s, i) =>
      i === idx ? { ...s, lengthBars: Math.max(2, s.lengthBars - reduceBars) } : s
    )
    const newDuration = project.blueprint.durationBars - (sections[idx].lengthBars - newSections[idx].lengthBars)
    const newBlueprint = { ...project.blueprint, sections: newSections, durationBars: newDuration }
    return { ...project, blueprint: newBlueprint }
  }
}
