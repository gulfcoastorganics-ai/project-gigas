import { SeededRandom } from './seededRandom.js'

export class TransitionGenerator {
  constructor(seed) {
    this._rng = seed instanceof SeededRandom ? seed : new SeededRandom(seed)
  }

  generate(sections, blueprint) {
    const events = []
    let eventId = 0

    for (let i = 0; i < sections.length - 1; i++) {
      const current = sections[i]
      const next = sections[i + 1]
      const sectionRng = this._rng.child(`${current.id}-trans`)

      const currentEnd = (current.startBar + current.lengthBars) * 4
      const isPreDrop = next.type === 'drop'
      const isPreBuild = next.type === 'build'

      if (isPreDrop && sectionRng.chance(0.8)) {
        const riserLength = sectionRng.nextInt(2, 4) * 4
        events.push({
          id: `trans-${eventId++}`,
          type: 'riser',
          startBeat: currentEnd - riserLength,
          durationBeats: riserLength,
          intensity: 1,
        })

        events.push({
          id: `trans-${eventId++}`,
          type: 'impact',
          startBeat: currentEnd,
          durationBeats: 1,
          intensity: 0.9,
        })

        if (sectionRng.chance(0.3)) {
          events.push({
            id: `trans-${eventId++}`,
            type: 'silence',
            startBeat: currentEnd - 0.5,
            durationBeats: 0.5,
            intensity: 0,
          })
        }
      }

      if (isPreBuild && sectionRng.chance(0.5)) {
        events.push({
          id: `trans-${eventId++}`,
          type: 'drumFill',
          startBeat: currentEnd - 2,
          durationBeats: 2,
          intensity: 0.6,
        })
      }

      if (current.energy < next.energy) {
        events.push({
          id: `trans-${eventId++}`,
          type: 'filterSweep',
          startBeat: currentEnd - 4,
          durationBeats: 4,
          intensity: Math.abs(next.energy - current.energy),
        })
      }
    }

    events.push({
      id: `trans-${eventId++}`,
      type: 'downlifter',
      startBeat: (sections[sections.length - 1].startBar + sections[sections.length - 1].lengthBars - 4) * 4,
      durationBeats: 4,
      intensity: 0.5,
    })

    return events
  }
}
