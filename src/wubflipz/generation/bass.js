import { SeededRandom } from './seededRandom.js'
import { getProfile } from '../profiles/profiles.js'
import { getScalePitches, getChordNotes } from './harmony.js'

export class BassGenerator {
  constructor(seed) {
    this._rng = seed instanceof SeededRandom ? seed : new SeededRandom(seed)
  }

  generate(bpm, sections, chords, blueprint, profileId = 'dubstep') {
    const profile = getProfile(profileId) || getProfile('dubstep')
    const bassProfile = profile.bass
    const scale = blueprint.scale || 'minor'
    const keyMidi = this._keyToMidi(blueprint.key)

    const events = []
    let eventId = 0

    for (const section of sections) {
      const sectionRng = this._rng.child(`${section.id}-bass`)
      const sectionStart = section.startBar * 4
      const sectionEnd = sectionStart + section.lengthBars * 4
      const energy = section.energy

      const sectionChords = chords.filter(c =>
        c.startBeat >= sectionStart && c.startBeat < sectionEnd
      )

      if (sectionChords.length === 0) continue

      const phraseLengthBars = bassProfile.phraseLength || 2
      const phraseLengthBeats = phraseLengthBars * 4

      for (let beat = sectionStart; beat < sectionEnd; beat += phraseLengthBeats / 2) {
        const localBeat = beat - sectionStart
        const phrasePos = (localBeat % phraseLengthBeats) / phraseLengthBeats
        const chord = this._findChordAtBeat(sectionChords, beat) || sectionChords[0]
        if (!chord) continue

        const rootNote = chord.root - 12
        const articulation = this._pickArticulation(bassProfile.articulationWeights, sectionRng)
        const intensity = energy * (0.5 + sectionRng.nextFloat(0, 0.5))
        const duration = sectionRng.nextFloat(0.5, 2)

        let pitchMovement = undefined
        if (articulation === 'screech' || articulation === 'wobble') {
          const movementLen = sectionRng.nextInt(2, 4)
          pitchMovement = Array.from({ length: movementLen }, () =>
            sectionRng.nextInt(-5, 5)
          )
        }

        if (
          articulation === 'sub' &&
          chord.type &&
          chord.type.includes('min')
        ) {
          const octave = bassProfile.typicalOctave || 2
          events.push({
            id: `bass-${eventId++}`,
            trackId: 'bass',
            startBeat: beat,
            durationBeats: duration,
            rootNote: keyMidi + 12 * octave,
            soundId: articulation,
            articulation,
            intensity,
            modulationShape: sectionRng.pick(bassProfile.modulationShapes),
            pitchMovement,
          })
        }

        events.push({
          id: `bass-${eventId++}`,
          trackId: 'bass',
          startBeat: beat,
          durationBeats: duration,
          rootNote,
          soundId: articulation,
          articulation,
          intensity,
          modulationShape: sectionRng.pick(bassProfile.modulationShapes),
          pitchMovement,
        })

        if (
          bassProfile.syncopation > sectionRng.next() &&
          phrasePos < 0.75
        ) {
          const offNote = articulation === 'stab' ? rootNote + 7 : rootNote + 3
          events.push({
            id: `bass-${eventId++}`,
            trackId: 'bass',
            startBeat: beat + duration / 2,
            durationBeats: duration * 0.5,
            rootNote: offNote,
            soundId: 'stab',
            articulation: 'stab',
            intensity: intensity * 0.6,
            modulationShape: sectionRng.pick(bassProfile.modulationShapes),
          })
        }
      }
    }

    return events
  }

  _pickArticulation(weights, rng) {
    const entries = Object.entries(weights)
    const roll = rng.next()
    let cumulative = 0
    for (const [articulation, weight] of entries) {
      cumulative += weight
      if (roll <= cumulative) return articulation
    }
    return 'sub'
  }

  _findChordAtBeat(chords, beat) {
    for (const chord of chords) {
      if (beat >= chord.startBeat && beat < chord.startBeat + chord.durationBeats) {
        return chord
      }
    }
    return null
  }

  _keyToMidi(key) {
    const map = { 'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11 }
    return (map[key] || 0) + 48
  }

  checkKickCollisions(bassEvents, drumEvents) {
    const issues = []
    for (const bass of bassEvents) {
      const bassEnd = bass.startBeat + bass.durationBeats
      for (const drum of drumEvents) {
        if (drum.sound !== 'kick') continue
        if (drum.startBeat >= bass.startBeat && drum.startBeat < bassEnd) {
          if (bass.articulation !== 'sub') {
            issues.push({
              message: 'Bass kick collision',
              bassEvent: bass,
              drumEvent: drum,
              severity: 5,
            })
          }
        }
      }
    }
    return issues
  }
}
