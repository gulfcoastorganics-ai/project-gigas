const ORDINALS = { first: 0, second: 1, third: 2, fourth: 3, last: -1 }
const SECTION_TYPES = ['intro', 'verse', 'build', 'drop', 'break', 'bridge', 'outro']
const TRACK_ROLES = ['drums', 'bass', 'harmony', 'melody', 'lead', 'pad', 'fx']

export class IntentInterpreter {
  constructor(options = {}) {
    this._provider = options.provider || null
  }

  parse(instruction, project) {
    const trimmed = instruction.trim().toLowerCase()
    let plans = []

    const deterministic = this._tryDeterministic(trimmed, project)
    if (deterministic) {
      return { plans: [deterministic], fallbackUsed: false }
    }

    if (this._provider) {
      return this._tryAI(instruction, project)
    }

    return {
      plans: [{
        id: crypto.randomUUID(),
        originalInstruction: instruction,
        intent: 'unknown',
        scope: 'entire_song',
        targetIds: [],
        operations: [{ type: 'regenerate', params: {} }],
        preserve: [],
        change: ['all'],
        confidence: 0.3,
        warnings: ['Could not parse instruction deterministically and no AI provider available'],
        requiresConfirmation: true,
      }],
      fallbackUsed: false,
    }
  }

  _tryDeterministic(instruction, project) {
    const checks = [
      () => this._matchMakeDropHeavier(instruction, project),
      () => this._matchKeepDrumsChangeBass(instruction, project),
      () => this._matchAddBarsBefore(instruction, project),
      () => this._matchMakeIntroDarker(instruction, project),
      () => this._matchSimplify(instruction, project),
      () => this._matchAddSilenceBeforeDrop(instruction, project),
      () => this._matchMakeDropLessRepetitive(instruction, project),
      () => this._matchChangeGenre(instruction, project),
      () => this._matchCreateOneMinute(instruction, project),
      () => this._matchRegenerateBars(instruction, project),
      () => this._matchUseVariationRhythm(instruction, project),
      () => this._matchKeepEverythingExcept(instruction, project),
      () => this._matchMakeBuildupLonger(instruction, project),
    ]

    for (const check of checks) {
      const result = check()
      if (result) return result
    }

    return null
  }

  _resolveSection(project, ordinal, type) {
    const sections = project?.blueprint?.sections || []
    const matching = sections.filter(s => s.type === type)
    if (matching.length === 0) return null
    if (ordinal === -1) return matching[matching.length - 1]
    return matching[ordinal] || null
  }

  _resolveOrdinal(text) {
    for (const [word, idx] of Object.entries(ORDINALS)) {
      if (text.includes(word)) return idx
    }
    return 0
  }

  _resolveSectionType(text) {
    for (const type of SECTION_TYPES) {
      if (text.includes(type)) return type
    }
    return null
  }

  _resolveTrackRole(text) {
    for (const role of TRACK_ROLES) {
      if (text.includes(role)) return role
    }
    return null
  }

  _matchMakeDropHeavier(instruction, project) {
    const m = instruction.match(/(?:make\s+)?(?:the\s+)?(first|second|third|last)?\s*(drop)\s+(heavier|more\s+intense|harder)/)
    if (!m) return null
    const ord = m[1] ? (ORDINALS[m[1]] ?? 0) : 0
    const type = m[2]
    const target = this._resolveSection(project, ord, type)
    return this._buildPlan(instruction, 'make_heavier', 'section', target ? [target.id] : [], ['drums'], ['bass', 'harmony', 'melody'], 0.9, [])
  }

  _matchKeepDrumsChangeBass(instruction, project) {
    if (!instruction.includes('keep the drums')) return null
    if (!instruction.includes('change the bass') && !instruction.includes('change bass')) return null
    const target = project?.tracks?.find(t => t.type === 'bass' || t.id === 'bass')
    return this._buildPlan(instruction, 'change_bass', 'track', target ? [target.id] : [], ['drums', 'harmony', 'melody'], ['bass'], 0.95, [])
  }

  _matchAddBarsBefore(instruction, project) {
    const m = instruction.match(/add\s+(\d+)\s+bars?\s+before\s+(?:the\s+)?(\w+)/)
    if (!m) return null
    const count = parseInt(m[1])
    const targetType = this._resolveSectionType(m[2])
    if (!targetType) return null
    const target = this._resolveSection(project, 0, targetType)
    return this._buildPlan(instruction, 'add_bars', 'section', target ? [target.id] : [], [], ['structure'], 0.85, [`Adding ${count} bars before ${targetType}`], true)
  }

  _matchMakeIntroDarker(instruction, project) {
    if (!instruction.includes('intro')) return null
    if (!instruction.includes('darker') && !instruction.includes('minimal') && !instruction.includes('dark')) return null
    const target = this._resolveSection(project, 0, 'intro')
    return this._buildPlan(instruction, 'change_mood', 'section', target ? [target.id] : [], [], ['energy', 'density', 'instrumentation'], 0.8, ['Reducing energy and density, changing to darker instrumentation'])
  }

  _matchSimplify(instruction, project) {
    const m = instruction.match(/simplify\s+(?:the\s+)?(\w+)/)
    if (!m) return null
    const role = this._resolveTrackRole(m[1])
    if (!role) return null
    const target = project?.tracks?.find(t => t.type === role || t.name?.toLowerCase() === role)
    return this._buildPlan(instruction, 'simplify', 'track', target ? [target.id] : [], ['drums', 'bass', 'harmony'], [role], 0.85, [`Simplifying ${role}`])
  }

  _matchAddSilenceBeforeDrop(instruction, project) {
    if (!instruction.includes('silence') && !instruction.includes('rest')) return null
    if (!instruction.includes('drop')) return null
    const target = this._resolveSection(project, 0, 'drop')
    return this._buildPlan(instruction, 'add_silence', 'section', target ? [target.id] : [], [], ['arrangement'], 0.75, ['Adding silence before drop section'], true)
  }

  _matchMakeDropLessRepetitive(instruction, project) {
    if (!instruction.includes('repetitive') && !instruction.includes('repetition')) return null
    if (!instruction.includes('drop') && !instruction.includes('final')) return null
    const ord = instruction.includes('final') ? -1 : 0
    const target = this._resolveSection(project, ord, 'drop')
    return this._buildPlan(instruction, 'reduce_repetition', 'section', target ? [target.id] : [], ['drums'], ['melody', 'bass'], 0.8, ['Increasing melody and bass variation in drop'])
  }

  _matchChangeGenre(instruction, project) {
    const genres = ['dubstep', 'riddim', 'drum and bass', 'dnb', 'trap', 'wave', 'melodic dubstep', 'cinematic']
    for (const genre of genres) {
      if (instruction.includes(`into ${genre}`) || instruction.includes(`to ${genre}`) || instruction.includes(`as ${genre}`)) {
        return this._buildPlan(instruction, 'change_genre', 'entire_song', [], ['drums', 'bass'], ['all'], 0.9, [`Converting to ${genre}`], true)
      }
    }
    return null
  }

  _matchCreateOneMinute(instruction, project) {
    if (!instruction.includes('one minute') && !instruction.includes('one-minute') && !instruction.includes('1 minute') && !instruction.includes('60 second') && !instruction.includes('shorter version')) return null
    return this._buildPlan(instruction, 'change_length', 'entire_song', [], [], ['duration', 'structure'], 0.85, ['Truncating to approximately 60 seconds'], true)
  }

  _matchRegenerateBars(instruction, project) {
    const m = instruction.match(/regenerate\s+bars?\s+(\d+)\s+through\s+(\d+)/)
    if (!m) return null
    const startBar = parseInt(m[1])
    const endBar = parseInt(m[2])
    const sections = project?.blueprint?.sections || []
    const targetSections = sections.filter(s =>
      (s.startBar >= startBar && s.startBar < endBar) ||
      (s.startBar < endBar && s.startBar + s.lengthBars > startBar)
    )
    return this._buildPlan(instruction, 'regenerate_bars', 'section', targetSections.map(s => s.id), [], ['all'], 0.9, [`Regenerating bars ${startBar}-${endBar}`])
  }

  _matchUseVariationRhythm(instruction, project) {
    const m = instruction.match(/variation\s+(one|two|three|\d+)/i)
    if (!m) return null
    return this._buildPlan(instruction, 'use_variation', 'entire_song', [], [], ['all'], 0.5, ['Attempting to apply variation pattern'], true)
  }

  _matchKeepEverythingExcept(instruction, project) {
    const m = instruction.match(/keep\s+everything\s+except\s+(?:the\s+)?(\w+)/)
    if (!m) return null
    const preserve = ['drums', 'bass', 'harmony', 'melody', 'sound_design', 'mix']
    const exception = m[1]
    const filtered = preserve.filter(p => !p.includes(exception) && !exception.includes(p))
    return this._buildPlan(instruction, 'selective_change', 'entire_song', [], filtered, [exception], 0.8, [`Changing ${exception} while preserving everything else`])
  }

  _matchMakeBuildupLonger(instruction, project) {
    if (!instruction.includes('buildup') && !instruction.includes('build up') && !instruction.includes('build')) return null
    if (!instruction.includes('longer')) return null
    const target = this._resolveSection(project, 0, 'build')
    return this._buildPlan(instruction, 'extend_section', 'section', target ? [target.id] : [], ['drums'], ['structure'], 0.8, ['Extending buildup section'], true)
  }

  _buildPlan(instruction, intent, scope, targetIds, preserve, change, confidence, warnings, requiresConfirmation = false) {
    return {
      id: crypto.randomUUID(),
      originalInstruction: instruction,
      intent,
      scope,
      targetIds,
      operations: [{ type: intent, params: { preserve, change } }],
      preserve,
      change,
      confidence,
      warnings,
      requiresConfirmation,
    }
  }

  async _tryAI(instruction, project) {
    const systemPrompt = `You are an AI that converts natural-language music editing commands into structured edit plans.
Respond with JSON only, no explanation.
Schema:
{
  "id": "uuid",
  "originalInstruction": "the command",
  "intent": "short intent name",
  "scope": "entire_song|section|track|clip|sound|automation|mix|transition",
  "targetIds": ["id1"],
  "operations": [{"type": "operation", "params": {}}],
  "preserve": ["drums"],
  "change": ["bass"],
  "confidence": 0.9,
  "warnings": [],
  "requiresConfirmation": false
}`

    const prompt = `Project: ${JSON.stringify({
      sections: project?.blueprint?.sections?.map(s => ({ id: s.id, name: s.name, type: s.type })) || [],
      tracks: project?.tracks?.map(t => ({ id: t.id, name: t.name, type: t.type })) || [],
      bpm: project?.blueprint?.bpm,
      key: project?.blueprint?.key,
      genre: project?.blueprint?.genre,
    })}
Command: "${instruction}"
Respond with only valid JSON.`

    try {
      const response = await this._provider.generate({
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }],
        temperature: 0.3,
      })
      const text = typeof response === 'string' ? response : response.content
      const json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}')
      return { plans: [json], fallbackUsed: true }
    } catch {
      return {
        plans: [{
          id: crypto.randomUUID(),
          originalInstruction: instruction,
          intent: 'unknown',
          scope: 'entire_song',
          targetIds: [],
          operations: [],
          preserve: [],
          change: ['all'],
          confidence: 0.2,
          warnings: ['AI interpretation failed'],
          requiresConfirmation: true,
        }],
        fallbackUsed: true,
      }
    }
  }
}
