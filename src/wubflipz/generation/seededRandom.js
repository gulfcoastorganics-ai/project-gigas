export class SeededRandom {
  constructor(seed) {
    this._seed = seed
    this._state = seed
    this._callCount = 0
  }

  get seed() { return this._seed }
  get callCount() { return this._callCount }

  reset() {
    this._state = this._seed
    this._callCount = 0
  }

  child(extra) {
    return new SeededRandom(hashCombine(this._seed, extra))
  }

  next() {
    this._state = (this._state * 1664525 + 1013904223) & 0xFFFFFFFF
    this._callCount++
    return (this._state >>> 0) / 0xFFFFFFFF
  }

  nextInt(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min
  }

  nextFloat(min, max) {
    return this.next() * (max - min) + min
  }

  pick(arr) {
    return arr[this.nextInt(0, arr.length - 1)]
  }

  shuffle(arr) {
    const result = [...arr]
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      [result[i], result[j]] = [result[j], result[i]]
    }
    return result
  }

  chance(probability) {
    return this.next() < probability
  }

  gaussian(mean = 0, std = 1) {
    const u1 = this.next()
    const u2 = this.next()
    return mean + std * Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2)
  }

  toJSON() {
    return { seed: this._seed, state: this._state, callCount: this._callCount }
  }
}

export function hashCombine(base, extra) {
  let hash = (typeof base === 'number' ? base : stringHash(String(base))) | 0
  const extraStr = typeof extra === 'number' ? String(extra) : String(extra ?? '')
  for (let i = 0; i < extraStr.length; i++) {
    hash = ((hash << 5) - hash) + extraStr.charCodeAt(i)
    hash = hash & hash
  }
  return Math.abs(hash) || 1
}

function stringHash(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash = hash & hash
  }
  return Math.abs(hash) || 1
}

export function createSeededFromPrompt(prompt, settings = {}, seedOverride) {
  const baseSeed = seedOverride ?? hashCombine(
    stringHash(prompt),
    `${settings.genre || ''}:${settings.bpm || ''}:${settings.key || ''}:${settings.scale || ''}`
  )
  return new SeededRandom(baseSeed)
}
