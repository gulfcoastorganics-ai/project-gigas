import { SeededRandom } from './seededRandom.js'
import { getProfile } from '../profiles/profiles.js'

const KICK_PATTERNS = {
  halfTime: (beats) => {
    const kicks = []
    for (let beat = 0; beat < beats; beat++) {
      const barBeat = beat % 8
      if (barBeat === 0 || barBeat === 4) kicks.push(beat)
    }
    return kicks
  },
  fourOnFloor: (beats) => {
    const kicks = []
    for (let beat = 0; beat < beats; beat++) {
      if (beat % 2 === 0) kicks.push(beat)
    }
    return kicks
  },
  dnb: (beats) => {
    const kicks = []
    for (let beat = 0; beat < beats; beat++) {
      if (beat % 2 === 0) kicks.push(beat)
    }
    return kicks
  },
  trap: (beats) => {
    const kicks = []
    for (let beat = 0; beat < beats; beat++) {
      if (beat % 8 === 0 || beat % 8 === 2 || beat % 8 === 6) kicks.push(beat)
    }
    return kicks
  },
  polyrhythm: (beats) => {
    const kicks = []
    for (let beat = 0; beat < beats; beat++) {
      if (beat % 3 === 0 || beat % 5 === 0) kicks.push(beat)
    }
    return kicks
  },
}

const SNARE_PLACEMENTS = {
  '3': (beats) => {
    const snares = []
    for (let beat = 0; beat < beats; beat++) {
      if (beat % 8 === 4) snares.push(beat)
    }
    return snares
  },
  '2_4': (beats) => {
    const snares = []
    for (let beat = 0; beat < beats; beat++) {
      if (beat % 4 === 1 || beat % 4 === 3) snares.push(beat)
    }
    return snares
  },
}

const HAT_PATTERNS = {
  '8th': (beats, rng) => {
    const hats = []
    for (let beat = 0; beat < beats; beat++) {
      const sub = 2
      for (let s = 0; s < sub; s++) {
        hats.push(beat + s / sub)
      }
    }
    return hats
  },
  '16th': (beats, rng) => {
    const hats = []
    for (let beat = 0; beat < beats; beat++) {
      for (let s = 0; s < 4; s++) {
        if (s === 0 || s === 2 || rng.chance(0.3)) {
          hats.push(beat + s / 4)
        }
      }
    }
    return hats
  },
  '32nd': (beats, rng) => {
    const hats = []
    for (let beat = 0; beat < beats; beat++) {
      for (let s = 0; s < 8; s++) {
        if (s === 0 || s === 4 || rng.chance(0.2)) {
          hats.push(beat + s / 8)
        }
      }
    }
    return hats
  },
}

export class DrumGenerator {
  constructor(seed) {
    this._rng = seed instanceof SeededRandom ? seed : new SeededRandom(seed)
  }

  generate(bpm, sections, profileId = 'dubstep') {
    const profile = getProfile(profileId) || getProfile('dubstep')
    const groove = profile.groove

    const events = []
    let eventId = 0

    for (const section of sections) {
      const sectionStartBeat = section.startBar * 4
      const sectionEndBeat = sectionStartBeat + section.lengthBars * 4
      const sectionBeats = section.lengthBars * 4
      const sectionRng = this._rng.child(`${section.id}`)

      const energy = section.energy
      const density = section.density

      const kickPattern = KICK_PATTERNS[groove.kickPattern] || KICK_PATTERNS.halfTime
      const kickBeats = kickPattern(sectionBeats)
      for (const beat of kickBeats) {
        const vel = energy * (0.7 + sectionRng.nextFloat(0, groove.velocityHumanization * 2))
        const hasGhost = groove.ghostNoteDensity > sectionRng.next()
        if (hasGhost) {
          events.push({
            id: `drum-${eventId++}`,
            trackId: 'kick',
            sound: 'kick',
            startBeat: sectionStartBeat + beat + sectionRng.nextFloat(-groove.microtimingAmount, groove.microtimingAmount),
            durationBeats: 0.25,
            velocity: Math.min(1, vel * 0.4),
          })
        }
        events.push({
          id: `drum-${eventId++}`,
          trackId: 'kick',
          sound: 'kick',
          startBeat: sectionStartBeat + beat,
          durationBeats: 0.25,
          velocity: Math.min(1, vel),
        })
      }

      const snareFn = SNARE_PLACEMENTS[groove.snarePlacement] || SNARE_PLACEMENTS['3']
      const snareBeats = snareFn(sectionBeats)
      for (const beat of snareBeats) {
        const vel = energy * 0.85
        events.push({
          id: `drum-${eventId++}`,
          trackId: 'snare',
          sound: sectionRng.chance(0.3) ? 'clap' : 'snare',
          startBeat: sectionStartBeat + beat + sectionRng.nextFloat(-groove.microtimingAmount, groove.microtimingAmount),
          durationBeats: 0.25,
          velocity: Math.min(1, vel + sectionRng.nextFloat(0, groove.velocityHumanization)),
        })
      }

      const hatFn = HAT_PATTERNS[groove.hatSubdivision] || HAT_PATTERNS['16th']
      const hatBeats = hatFn(sectionBeats, sectionRng)
      for (const beat of hatBeats) {
        const isClosed = sectionRng.chance(0.85)
        const vel = density * (isClosed ? 0.5 : 0.6)
        events.push({
          id: `drum-${eventId++}`,
          trackId: 'hat',
          sound: isClosed ? 'closed_hat' : 'open_hat',
          startBeat: sectionStartBeat + beat + sectionRng.nextFloat(-groove.microtimingAmount, groove.microtimingAmount),
          durationBeats: isClosed ? 0.125 : 0.25,
          velocity: Math.min(1, vel + sectionRng.nextFloat(0, groove.velocityHumanization)),
        })
      }

      if (section.type === 'build' && sectionRng.chance(0.6)) {
        const fillBeats = [0, 1, 2, 3].map(i => sectionEndBeat - 2 + i * 0.5)
        for (const beat of fillBeats) {
          events.push({
            id: `drum-${eventId++}`,
            trackId: 'snare',
            sound: sectionRng.pick(['snare', 'tom', 'clap']),
            startBeat: beat,
            durationBeats: 0.25,
            velocity: 0.5 + sectionRng.nextFloat(0, 0.3),
          })
        }
      }
    }

    return events
  }
}
