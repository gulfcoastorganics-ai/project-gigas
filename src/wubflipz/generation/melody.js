import { SeededRandom } from './seededRandom.js'
import { getProfile } from '../profiles/profiles.js'
import { getScalePitches } from './harmony.js'

export class MelodyGenerator {
  constructor(seed) {
    this._rng = seed instanceof SeededRandom ? seed : new SeededRandom(seed)
  }

  generate(blueprint, chords, profileId = 'dubstep') {
    const profile = getProfile(profileId) || getProfile('dubstep')
    const melProfile = profile.melody
    const { key, scale, sections } = blueprint
    const keyMidi = this._keyToMidi(key)
    const scalePitches = getScalePitches(keyMidi, scale)

    const events = []
    let eventId = 0

    for (const section of sections) {
      const sectionRng = this._rng.child(`mel-${section.id}`)
      const sectionStart = section.startBar * 4
      const sectionEnd = sectionStart + section.lengthBars * 4
      const density = melProfile.density * (0.5 + section.density * 0.5)
      const octaveRange = melProfile.octaveRange || [4, 6]

      const sectionChords = chords.filter(c =>
        c.startBeat >= sectionStart && c.startBeat < sectionEnd
      )

      let motif = []
      const motifLength = sectionRng.nextInt(2, 4)
      for (let i = 0; i < motifLength; i++) {
        const octave = sectionRng.nextInt(octaveRange[0], octaveRange[1])
        const pitch = scalePitches[sectionRng.nextInt(0, scalePitches.length - 1)] + 12 * (octave - 3)
        motif.push(pitch)
      }

      for (let beat = sectionStart; beat < sectionEnd; beat += 0.5) {
        if (sectionRng.next() > density) continue
        if (melProfile.restProbability > sectionRng.next()) continue

        const barPos = (beat - sectionStart) % 8
        let pitch

        if (motif.length > 0 && sectionRng.chance(melProfile.repetitionRate)) {
          const motifIdx = Math.floor((beat - sectionStart) / 2) % motif.length
          pitch = motif[motifIdx] || motif[0]
        } else {
          const octave = sectionRng.nextInt(octaveRange[0], octaveRange[1])
          pitch = scalePitches[sectionRng.nextInt(0, scalePitches.length - 1)] + 12 * (octave - 3)
        }

        if (barPos === 7 || barPos === 7.5) {
          pitch = scalePitches[0] + 12 * (octaveRange[0] - 3)
        }

        const articulation = sectionRng.pick(['normal', 'normal', 'normal', 'accent', 'legato', 'staccato'])
        const duration = articulation === 'staccato' ? 0.25 : articulation === 'legato' ? 1 : 0.5

        events.push({
          id: `mel-${eventId++}`,
          trackId: 'lead',
          clipId: `clip-lead-${section.id}`,
          pitch,
          startBeat: beat,
          durationBeats: duration,
          velocity: 0.5 + sectionRng.nextFloat(0, 0.4),
          articulation,
        })
      }
    }

    return events
  }

  _keyToMidi(key) {
    const map = { 'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11 }
    return (map[key] || 0) + 48
  }
}
