import { getScalePitches } from '../generation/harmony.js'

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export class CritiqueEngine {
  constructor(options = {}) {
    this._llm = options.llm || null
  }

  analyze(project) {
    const issues = []
    const bp = project?.blueprint

    if (!bp) return issues

    this._analyzeArrangement(project, issues)
    this._analyzeComposition(project, issues)
    this._analyzeRhythm(project, issues)
    this._analyzeMix(project, issues)
    this._analyzePromptAdherence(project, issues)

    issues.sort((a, b) => b.severity - a.severity)
    return issues
  }

  _analyzeArrangement(project, issues) {
    const sections = project.blueprint?.sections || []
    if (sections.length < 3) {
      issues.push(this._issue('arrangement', 'too_few_sections', 7, 0.95,
        `Only ${sections.length} sections — consider adding more for variety`, { sectionIds: sections.map(s => s.id) },
        { scope: 'entire_song', instruction: 'Add more sections for variety', preserve: ['drums', 'bass'], change: ['structure'] }, true))
    }

    const energyValues = sections.map(s => s.energy)
    for (let i = 1; i < energyValues.length; i++) {
      if (Math.abs(energyValues[i] - energyValues[i - 1]) < 0.05) {
        issues.push(this._issue('arrangement', 'flat_energy', 5, 0.8,
          `Low energy contrast between section ${i} and ${i + 1}`, { sectionIds: [sections[i - 1].id, sections[i].id] },
          { scope: 'section', targetId: sections[i].id, instruction: 'Increase energy contrast', preserve: [], change: ['energy'] }, true))
      }
    }

    if (sections.length >= 2) {
      const drops = sections.filter(s => s.type === 'drop')
      if (drops.length >= 2) {
        const energyDiff = Math.abs(drops[0].energy - drops[1].energy)
        if (energyDiff < 0.05) {
          issues.push(this._issue('arrangement', 'similar_drops', 6, 0.85,
            'Drops have nearly identical energy — differentiate them', { sectionIds: drops.map(d => d.id) },
            { scope: 'section', targetId: drops[1].id, instruction: 'Make second drop more intense', preserve: ['drums'], change: ['energy', 'density'] }, true))
        }
      }
    }

    const hasOutro = sections.some(s => s.type === 'outro')
    if (!hasOutro && sections.length > 2) {
      issues.push(this._issue('arrangement', 'missing_outro', 3, 0.7,
        'No outro section — track ends abruptly', {}, null, true))
    }

    const hasBuild = sections.some(s => s.type === 'build')
    const hasDrop = sections.some(s => s.type === 'drop')
    if (hasBuild && !hasDrop) {
      issues.push(this._issue('arrangement', 'missing_drop', 7, 0.9,
        'Build section without a drop — add a drop after the build', {}, null, true))
    }

    if (sections.length > 0) {
      const longest = sections.reduce((a, b) => a.lengthBars > b.lengthBars ? a : b)
      if (longest.lengthBars > 32) {
        issues.push(this._issue('arrangement', 'excessive_section_length', 4, 0.8,
          `Section "${longest.name}" is ${longest.lengthBars} bars — consider shortening`, { sectionIds: [longest.id] },
          { scope: 'section', targetId: longest.id, instruction: 'Shorten section for better pacing', preserve: [], change: ['structure'] }, true))
      }
    }
  }

  _analyzeComposition(project, issues) {
    const notes = project.notes || []
    const chords = project.chords || []
    const bp = project.blueprint
    if (!bp) return

    if (notes.length > 0) {
      const pitches = notes.map(n => n.pitch)
      const minPitch = Math.min(...pitches)
      const maxPitch = Math.max(...pitches)

      if (minPitch < 24 || maxPitch > 108) {
        issues.push(this._issue('composition', 'invalid_range', 6, 0.9,
          `Notes range from ${minPitch} to ${maxPitch} — some notes outside playable range`, { metrics: { minPitch, maxPitch } },
          null, true))
      }

      const scalePitches = getScalePitches(
        this._keyToMidi(bp.key),
        bp.scale
      )
      const scaleSet = new Set(scalePitches)
      const scaleViolations = notes.filter(n => !scaleSet.has(n.pitch % 12))
      if (scaleViolations.length > notes.length * 0.2) {
        issues.push(this._issue('composition', 'scale_violations', 5, 0.85,
          `${scaleViolations.length}/${notes.length} notes violate ${bp.key} ${bp.scale} scale`, { metrics: { violations: scaleViolations.length, total: notes.length } },
          { scope: 'entire_song', instruction: `Enforce ${bp.key} ${bp.scale} scale`, preserve: ['drums'], change: ['melody'] }, true))
      }

      let largeLeaps = 0
      for (let i = 1; i < notes.length; i++) {
        if (Math.abs(notes[i].pitch - notes[i - 1].pitch) > 12) largeLeaps++
      }
      if (largeLeaps > notes.length * 0.15) {
        issues.push(this._issue('composition', 'excessive_leaps', 4, 0.75,
          `${largeLeaps} large melodic leaps — consider smoother motion`, { metrics: { largeLeaps, total: notes.length } },
          null, true))
      }
    }

    if (notes.length > 50) {
      issues.push(this._issue('composition', 'overcrowded', 3, 0.7,
        `${notes.length} note events — consider reducing density for clarity`, { metrics: { noteCount: notes.length } },
        null, true))
    }
  }

  _analyzeRhythm(project, issues) {
    const drums = project.drums || []
    const bass = project.bass || []
    const sections = project.blueprint?.sections || []

    const kicks = drums.filter(d => d.sound === 'kick')
    const snares = drums.filter(d => d.sound === 'snare' || d.sound === 'clap')

    if (kicks.length === 0) {
      issues.push(this._issue('rhythm', 'missing_kicks', 8, 0.95,
        'No kick drums detected — add kick patterns', {}, null, true))
    }

    if (snares.length === 0) {
      issues.push(this._issue('rhythm', 'missing_snares', 7, 0.9,
        'No snare/clap detected — add snare anchors', {}, null, true))
    }

    for (const b of bass) {
      const collisions = kicks.filter(k =>
        Math.abs(k.startBeat - b.startBeat) < 0.25 &&
        b.articulation !== 'sub'
      )
      if (collisions.length > 0) {
        issues.push(this._issue('rhythm', 'kick_bass_collision', 6, 0.85,
          `Bass ${b.articulation} collides with kick at beat ${b.startBeat}`, { barRange: [Math.floor(b.startBeat / 4), Math.floor(b.startBeat / 4)] },
          { scope: 'track', targetId: 'bass', instruction: 'Reduce bass-kick collisions', preserve: ['drums'], change: ['bass'] }, true))
        break
      }
    }

    if (sections.length > 0) {
      const sectionBeats = sections.reduce((sum, s) => sum + s.lengthBars * 4, 0)
      if (drums.length < sectionBeats * 0.1) {
        issues.push(this._issue('rhythm', 'sparse_drums', 3, 0.7,
          'Drums are very sparse — consider adding more variety', {}, null, true))
      }

      const hasFills = drums.some(d =>
        d.sound === 'tom' || d.sound === 'crash'
      )
      if (!hasFills && sections.some(s => s.type === 'build')) {
        issues.push(this._issue('rhythm', 'missing_fills', 4, 0.75,
          'No drum fills detected — add fills before drops', {}, null, true))
      }
    }
  }

  _analyzeMix(project, issues) {
    const drums = project.drums || []
    const notes = project.notes || []
    const bass = project.bass || []

    const allVelocities = [...drums.map(d => d.velocity), ...notes.map(n => n.velocity), ...bass.map(b => b.intensity)]
    if (allVelocities.length > 0) {
      const maxVel = Math.max(...allVelocities)
      if (maxVel > 1.0) {
        issues.push(this._issue('mix', 'peak_clipping', 7, 0.9,
          `Peak velocity ${maxVel.toFixed(2)} exceeds maximum — reduce levels`, { metrics: { peakVelocity: maxVel } },
          { scope: 'mix', instruction: 'Reduce master gain to prevent clipping', preserve: [], change: ['mix'] }, true))
      }

      const avgVel = allVelocities.reduce((a, b) => a + b, 0) / allVelocities.length
      if (avgVel < 0.2) {
        issues.push(this._issue('mix', 'too_quiet', 5, 0.8,
          `Average velocity ${avgVel.toFixed(2)} is very low — increase levels`, {},
          { scope: 'mix', instruction: 'Increase overall levels', preserve: [], change: ['mix'] }, true))
      }
    }

    if (notes.length > 30 && bass.length > 5) {
      const notePitches = notes.map(n => n.pitch)
      const lowNotes = notePitches.filter(p => p < 48)
      if (lowNotes.length > 5) {
        issues.push(this._issue('mix', 'sub_bass_overlap', 4, 0.7,
          `${lowNotes.length} low notes overlap with bass range — consider filtering`, {},
          null, true))
      }
    }
  }

  _analyzePromptAdherence(project, issues) {
    const bp = project.blueprint
    if (!bp?.prompt) return

    const prompt = bp.prompt.toLowerCase()
    const constraints = []

    const bpmMatch = prompt.match(/(\d+)\s*bpm/i)
    if (bpmMatch) {
      const requestedBpm = parseInt(bpmMatch[1])
      if (Math.abs(bp.bpm - requestedBpm) > 5) {
        constraints.push(`Requested BPM ${requestedBpm}, got ${bp.bpm}`)
      }
    }

    const genres = ['dubstep', 'riddim', 'trap', 'dnb', 'drum and bass', 'wave', 'cinematic', 'melodic']
    for (const genre of genres) {
      if (prompt.includes(genre)) {
        const projectGenres = (bp.genre || []).map(g => g.toLowerCase())
        if (!projectGenres.some(g => g.includes(genre) || genre.includes(g))) {
          constraints.push(`Prompt mentions "${genre}" but project genre doesn't match`)
        }
      }
    }

    if (prompt.includes('dark') && !(bp.mood || []).some(m => m.toLowerCase().includes('dark'))) {
      constraints.push('Prompt requests dark mood')
    }

    if (constraints.length > 0) {
      issues.push(this._issue('adherence', 'prompt_deviation', 5, 0.7,
        `Prompt adherence issues: ${constraints.join('; ')}`, {},
        { scope: 'entire_song', instruction: 'Better align with prompt', preserve: [], change: ['all'] }, true))
    }
  }

  _issue(category, type, severity, confidence, message, evidence, suggestedRepair, autoRepairSafe) {
    return {
      id: `critique-${category}-${type}-${Date.now()}`,
      category,
      type,
      severity,
      confidence,
      message,
      evidence: {
        sectionIds: evidence?.sectionIds || [],
        trackIds: evidence?.trackIds || [],
        clipIds: evidence?.clipIds || [],
        barRange: evidence?.barRange || null,
        metrics: evidence?.metrics || {},
      },
      suggestedRepair: suggestedRepair ? {
        scope: suggestedRepair.scope || 'entire_song',
        targetId: suggestedRepair.targetId,
        instruction: suggestedRepair.instruction || '',
        preserve: suggestedRepair.preserve || [],
        change: suggestedRepair.change || ['all'],
        seed: Date.now(),
      } : undefined,
      autoRepairSafe,
    }
  }

  _keyToMidi(key) {
    const idx = NOTE_NAMES.indexOf(key)
    return idx >= 0 ? idx + 48 : 60
  }

  filterBySeverity(issues, minSeverity = 0) {
    return issues.filter(i => i.severity >= minSeverity)
  }

  getSafeRepairs(issues) {
    return issues.filter(i => i.autoRepairSafe && i.suggestedRepair)
  }
}
