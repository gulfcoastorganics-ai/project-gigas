import { SeededRandom } from './seededRandom.js'

const SCALE_INTERVALS = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  wholeTone: [0, 2, 4, 6, 8, 10],
  diminished: [0, 2, 3, 5, 6, 8, 9, 11],
  augmented: [0, 3, 4, 7, 8, 11],
}

const CHORD_TYPES = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  diminished: [0, 3, 6],
  augmented: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  dom7: [0, 4, 7, 10],
  dim7: [0, 3, 6, 9],
  m7b5: [0, 3, 6, 10],
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export function noteNameToMidi(name) {
  const match = name.toUpperCase().match(/^([A-G]#?)(\d)$/)
  if (!match) return 60
  const noteIdx = NOTE_NAMES.indexOf(match[1])
  const octave = parseInt(match[2])
  return noteIdx + (octave + 1) * 12
}

export function midiToNoteName(midi) {
  const octave = Math.floor(midi / 12) - 1
  const noteIdx = midi % 12
  return `${NOTE_NAMES[noteIdx]}${octave}`
}

export function getScalePitches(root, scale) {
  const intervals = SCALE_INTERVALS[scale] || SCALE_INTERVALS.minor
  const rootMidi = typeof root === 'number' ? root : noteNameToMidi(root + '3')
  return intervals.map(i => rootMidi + i)
}

export function getChordNotes(root, type) {
  const intervals = CHORD_TYPES[type] || CHORD_TYPES.major
  return intervals.map(i => root + i)
}

export class HarmonyGenerator {
  constructor(seed) {
    this._rng = seed instanceof SeededRandom ? seed : new SeededRandom(seed)
  }

  generateChordProgression(blueprint, profile) {
    const { key, scale, sections, bpm } = blueprint
    const rootMidi = noteNameToMidi(key + '3')
    const scalePitches = getScalePitches(rootMidi, scale)
    const progressions = profile.harmony.commonProgressions
    const progression = this._rng.pick(progressions)

    const chords = []
    const degreeMap = { 'i': 0, 'ii': 1, 'iii': 2, 'iv': 3, 'v': 4, 'vi': 5, 'vii': 6, 'I': 0, 'II': 1, 'III': 2, 'IV': 3, 'V': 4, 'VI': 5, 'VII': 6 }
    const romanNumerals = progression.split('-')

    for (const section of sections) {
      const sectionChords = []
      const beatsPerBar = 4
      const sectionBeats = section.lengthBars * beatsPerBar
      const chordLengthBeats = section.type === 'drop' ? 8 : section.type === 'build' ? 4 : 8
      const numChords = Math.max(1, Math.floor(sectionBeats / chordLengthBeats))
      const actualChordLength = sectionBeats / numChords

      for (let c = 0; c < numChords; c++) {
        const roman = romanNumerals[c % romanNumerals.length]
        const degree = degreeMap[roman]
        const isMajor = roman === roman.toUpperCase()
        const basePitch = scalePitches[degree] || scalePitches[0]

        let chordType
        if (roman === roman.toUpperCase()) {
          chordType = c % 4 === 3 ? 'maj7' : 'major'
          if (profile.harmony.susRate > this._rng.next()) {
            chordType = this._rng.pick(['sus2', 'sus4'])
          }
        } else {
          chordType = 'min7'
          if (profile.harmony.susRate > this._rng.next()) {
            chordType = this._rng.pick(['sus2', 'sus4'])
          }
        }

        const chordNotes = getChordNotes(basePitch, chordType)
        const startBeat = section.startBar * 4 + c * actualChordLength

        sectionChords.push({
          root: basePitch,
          type: chordType,
          notes: chordNotes,
          startBeat,
          durationBeats: actualChordLength,
          roman,
          tension: section.tension,
        })
      }

      chords.push(...sectionChords)
    }

    return chords
  }

  validateChordRange(chords, minMidi = 36, maxMidi = 84) {
    const issues = []
    for (const chord of chords) {
      for (const note of chord.notes) {
        if (note < minMidi || note > maxMidi) {
          issues.push({ message: `Note ${note} out of range`, chord })
        }
      }
    }
    return issues
  }

  checkOverlaps(chords) {
    const issues = []
    for (let i = 1; i < chords.length; i++) {
      const prev = chords[i - 1]
      const curr = chords[i]
      if (curr.startBeat < prev.startBeat + prev.durationBeats) {
        issues.push({ message: 'Chord overlap', chord1: prev, chord2: curr })
      }
    }
    return issues
  }
}
