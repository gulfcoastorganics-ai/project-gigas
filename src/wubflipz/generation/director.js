import { SeededRandom, hashCombine, createSeededFromPrompt } from './seededRandom.js'
import { SongBlueprintSchema, repairBlueprint } from '../schemas/blueprint.js'
import { getProfile, getAllProfiles } from '../profiles/profiles.js'

const CACHE = new Map()
const CACHE_MAX = 50

export class DirectorEngine {
  constructor(options = {}) {
    this._provider = options.provider || null
    this._cacheEnabled = options.cacheEnabled !== false
    this._timeoutMs = options.timeoutMs || 15000
    this._abortController = null
  }

  cancel() {
    if (this._abortController) {
      this._abortController.abort()
      this._abortController = null
    }
  }

  async generate(prompt, settings = {}) {
    const seed = settings.seed ?? hashCombine(prompt, JSON.stringify(settings))
    const cacheKey = `${prompt}:${seed}:${JSON.stringify(settings)}`

    if (this._cacheEnabled && CACHE.has(cacheKey)) {
      return CACHE.get(cacheKey)
    }

    this._abortController = new AbortController()
    const signal = this._abortController.signal

    let blueprint
    try {
      if (this._provider && settings.useAI !== false) {
        blueprint = await this._tryAI(prompt, settings, seed, signal)
      } else {
        throw new Error('AI provider not available')
      }
    } catch (err) {
      if (err.name === 'AbortError') throw err
      blueprint = this._generateLocal(prompt, settings, seed)
    }

    const result = SongBlueprintSchema.parse(blueprint)

    if (this._cacheEnabled) {
      CACHE.set(cacheKey, result)
      if (CACHE.size > CACHE_MAX) {
        const firstKey = CACHE.keys().next().value
        CACHE.delete(firstKey)
      }
    }

    this._abortController = null
    return result
  }

  async _tryAI(prompt, settings, seed, signal) {
    const systemPrompt = `You are an AI music producer. Generate a song blueprint as JSON matching this schema exactly:
{
  "id": "uuid",
  "version": 1,
  "title": "song title",
  "prompt": "original prompt",
  "genre": ["genre"],
  "mood": ["mood1", "mood2"],
  "bpm": 140,
  "key": "C",
  "scale": "minor",
  "timeSignature": [4, 4],
  "durationBars": 32,
  "seed": ${seed},
  "energyCurve": [{"bar": 0, "value": 0.2}, {"bar": 16, "value": 0.9}],
  "sections": [
    {"id": "uuid", "type": "intro", "name": "Intro", "startBar": 0, "lengthBars": 8, "energy": 0.2, "density": 0.3, "tension": 0.1, "instructions": ["minimal"]}
  ],
  "instrumentation": [
    {"trackId": "track-kick", "role": "kick", "instrument": "kick", "polyphony": 1, "priority": 10},
    {"trackId": "track-snare", "role": "snare", "instrument": "snare", "polyphony": 1, "priority": 9},
    {"trackId": "track-bass", "role": "bass", "instrument": "bass", "polyphony": 4, "priority": 8},
    {"trackId": "track-chords", "role": "harmony", "instrument": "pad", "polyphony": 6, "priority": 5},
    {"trackId": "track-lead", "role": "melody", "instrument": "lead", "polyphony": 2, "priority": 6}
  ],
  "mixIntent": {"targetLUFS": -14, "headroom": 6, "stereoWidth": 0.8, "reverbAmount": 0.2, "subBassLevel": 0.7, "kickLevel": 0.8, "snareLevel": 0.6, "leadLevel": 0.5, "padLevel": 0.4, "bassLevel": 0.7},
  "generationMetadata": {"schemaVersion": 1, "createdAt": "ISO date", "seed": ${seed}, "prompt": "original prompt"}
}
Rules:
- durationBars should result in 60-90 seconds at the given BPM
- Sections must cover all bars from 0 to durationBars
- Energy curve must have entries at section boundaries
- Respond with ONLY valid JSON, no markdown or explanation`

    const response = await this._provider.generate({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Generate a ${settings.genre || 'electronic'} track blueprint for: "${prompt}"${settings.mood ? ` Mood: ${settings.mood}` : ''}${settings.bpm ? ` BPM: ${settings.bpm}` : ''}${settings.key ? ` Key: ${settings.key}` : ''}` },
      ],
      signal,
      temperature: 0.7,
    })

    const text = typeof response === 'string' ? response : response.content
    const json = this._extractJSON(text)
    return repairBlueprint(json).data
  }

  _extractJSON(text) {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found in AI response')
    return JSON.parse(jsonMatch[0])
  }

  _generateLocal(prompt, settings, seed) {
    const rng = createSeededFromPrompt(prompt, settings, seed)
    const genres = settings.genre ? [settings.genre] : ['dubstep']
    const profiles = genres.map(g => getProfile(g) || getProfile('dubstep')).filter(Boolean)
    const primaryProfile = profiles[0]

    const bpm = settings.bpm || rng.nextInt(primaryProfile.bpmRange[0], primaryProfile.bpmRange[1])
    const key = settings.key || rng.pick(primaryProfile.preferredKeys)
    const scale = settings.scale || rng.pick(primaryProfile.preferredScales)

    const barsForSeconds = (seconds, bpm) => Math.ceil((seconds / 60) * bpm / 4)
    const targetSeconds = settings.lengthSec || rng.nextInt(60, 90)
    const durationBars = Math.max(16, barsForSeconds(targetSeconds, bpm))

    const sections = this._buildSections(primaryProfile, durationBars, rng)
    const energyCurve = this._buildEnergyCurve(sections)

    const trackId = (name) => `track-${name}-${seed.toString(36).slice(0, 4)}`

    return {
      id: crypto.randomUUID(),
      version: 1,
      title: settings.title || prompt.slice(0, 40),
      prompt,
      genre: genres,
      mood: settings.mood ? [settings.mood] : ['neutral'],
      bpm,
      key,
      scale,
      timeSignature: [4, 4],
      durationBars,
      seed,
      energyCurve,
      sections,
      instrumentation: [
        { trackId: trackId('kick'), role: 'kick', instrument: 'kick', polyphony: 1, priority: 10 },
        { trackId: trackId('snare'), role: 'snare', instrument: 'snare', polyphony: 1, priority: 9 },
        { trackId: trackId('hat'), role: 'hat', instrument: 'hat', polyphony: 1, priority: 8 },
        { trackId: trackId('bass'), role: 'bass', instrument: 'bass', polyphony: 4, priority: 7 },
        { trackId: trackId('chords'), role: 'harmony', instrument: 'pad', polyphony: 6, priority: 5 },
        { trackId: trackId('lead'), role: 'melody', instrument: 'lead', polyphony: 2, priority: 6 },
        { trackId: trackId('fx'), role: 'fx', instrument: 'fx', polyphony: 2, priority: 4 },
      ],
      mixIntent: {
        targetLUFS: -14, headroom: 6, stereoWidth: 0.8, reverbAmount: 0.2,
        subBassLevel: 0.7, kickLevel: 0.8, snareLevel: 0.6, leadLevel: 0.5, padLevel: 0.4, bassLevel: 0.7,
      },
      generationMetadata: {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        modelUsed: 'local',
        seed,
        prompt,
        generationTimeMs: 0,
        provider: 'local',
      },
    }
  }

  _buildSections(profile, totalBars, rng) {
    const templates = profile.sectionTemplates
    const totalTemplateBars = templates.reduce((s, t) => s + t.lengthBars, 0)
    const scaleFactor = totalBars / totalTemplateBars
    const sections = []
    let currentBar = 0

    for (const template of templates) {
      const lengthBars = Math.max(2, Math.round(template.lengthBars * scaleFactor))
      const id = `sect-${rng.seed}-${currentBar}`
      const energyVariation = rng.nextFloat(-0.05, 0.05)
      sections.push({
        id,
        type: template.type,
        name: template.type.charAt(0).toUpperCase() + template.type.slice(1),
        startBar: currentBar,
        lengthBars,
        energy: Math.max(0, Math.min(1, template.energy + energyVariation)),
        density: Math.max(0, Math.min(1, template.density + rng.nextFloat(-0.05, 0.05))),
        tension: Math.max(0, Math.min(1, template.tension + rng.nextFloat(-0.05, 0.05))),
        instructions: [],
      })
      currentBar += lengthBars
    }

    if (currentBar < totalBars) {
      const last = sections[sections.length - 1]
      last.lengthBars += totalBars - currentBar
    } else if (currentBar > totalBars) {
      sections[sections.length - 1].lengthBars -= currentBar - totalBars
      if (sections[sections.length - 1].lengthBars < 2) sections.pop()
    }

    return sections
  }

  _buildEnergyCurve(sections) {
    const curve = []
    for (const section of sections) {
      curve.push({ bar: section.startBar, value: section.energy })
      curve.push({ bar: section.startBar + section.lengthBars, value: section.energy })
    }
    return curve
  }

  generateVariation(blueprint, variationSeed) {
    const settings = {
      genre: blueprint.genre[0],
      bpm: blueprint.bpm,
      key: blueprint.key,
      scale: blueprint.scale,
      seed: variationSeed,
      lengthSec: Math.round((blueprint.durationBars * 4 / blueprint.bpm) * 60),
    }
    return this._generateLocal(blueprint.prompt, settings, variationSeed)
  }
}

export function createDirector(options = {}) {
  return new DirectorEngine(options)
}
