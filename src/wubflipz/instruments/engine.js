export class AudioEngine {
  constructor() {
    this._ctx = null
    this._masterGain = null
    this._tracks = new Map()
    this._playing = false
    this._scheduledNodes = []
    this._startTime = 0
    this._currentBeat = 0
    this._bpm = 140
    this._intervalId = null
    this._onBeat = null
  }

  get ctx() { return this._ctx }
  get playing() { return this._playing }
  get currentBeat() { return this._currentBeat }
  get bpm() { return this._bpm }

  setOnBeat(callback) {
    this._onBeat = callback
  }

  setCurrentBeat(beat) {
    this._currentBeat = beat
  }

  ensureContext() {
    if (!this._ctx) {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)()
      this._masterGain = this._ctx.createGain()
      this._masterGain.gain.value = 0.8
      this._masterGain.connect(this._ctx.destination)
    }
    if (this._ctx.state === 'suspended') {
      this._ctx.resume()
    }
    return this._ctx
  }

  getMasterGain() { return this._masterGain }

  createTrackGain() {
    this.ensureContext()
    const gain = this._ctx.createGain()
    gain.gain.value = 1
    gain.connect(this._masterGain)
    return gain
  }

  createChannel(name, gainNode) {
    this._tracks.set(name, { gain: gainNode || this.createTrackGain() })
  }

  getTrackGain(name) {
    return this._tracks.get(name)?.gain || this._masterGain
  }

  setBpm(bpm) {
    this._bpm = bpm
  }

  schedulePlay(note, timeOffset = 0) {
    this.ensureContext()
    const beatDuration = 60 / this._bpm
    const startTime = this._ctx.currentTime + timeOffset + (note.startBeat * beatDuration)
    const duration = note.durationBeats * beatDuration

    if (note.type === 'synth' || note.articulation) {
      return this._playSynthNote(note, startTime, duration)
    }

    const osc = this._ctx.createOscillator()
    const noteGain = this._ctx.createGain()
    const trackGain = this.getTrackGain(note.trackId || 'master')

    osc.connect(noteGain)
    noteGain.connect(trackGain)

    if (note.pitch !== undefined) {
      osc.frequency.value = 440 * Math.pow(2, (note.pitch - 69) / 12)
    }

    osc.type = 'sawtooth'
    noteGain.gain.setValueAtTime(note.velocity || 0.5, startTime)
    noteGain.gain.exponentialRampToValueAtTime(0.001, startTime + duration)

    osc.start(startTime)
    osc.stop(startTime + duration + 0.1)

    this._scheduledNodes.push(osc)
    return { osc, gain: noteGain }
  }

  _playSynthNote(note, startTime, duration) {
    this.ensureContext()
    const ctx = this._ctx
    const trackGain = this.getTrackGain(note.trackId || 'master')
    const frequency = 440 * Math.pow(2, (note.pitch - 69) / 12)

    const oscCount = note.articulation === 'sub' ? 1 : 2
    const oscillators = []

    for (let i = 0; i < oscCount; i++) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      const filter = ctx.createBiquadFilter()

      osc.connect(gain)
      gain.connect(filter)
      filter.connect(trackGain)

      if (note.articulation === 'growl') {
        osc.type = 'sawtooth'
        filter.type = 'lowpass'
        filter.frequency.setValueAtTime(800, startTime)
        filter.frequency.linearRampToValueAtTime(4000, startTime + duration * 0.5)
        filter.frequency.linearRampToValueAtTime(200, startTime + duration)
        filter.Q.value = 2
        const lfo = ctx.createOscillator()
        const lfoGain = ctx.createGain()
        lfo.frequency.value = 5
        lfoGain.gain.value = 200
        lfo.connect(lfoGain)
        lfoGain.connect(filter.frequency)
        lfo.start(startTime)
        lfo.stop(startTime + duration + 0.1)
        this._scheduledNodes.push(lfo)
      } else if (note.articulation === 'wobble') {
        osc.type = 'sawtooth'
        filter.type = 'lowpass'
        filter.frequency.value = 2000
        filter.Q.value = 5
        const lfo = ctx.createOscillator()
        const lfoGain = ctx.createGain()
        lfo.frequency.value = 2 + note.intensity * 6
        lfoGain.gain.value = 1500
        lfo.connect(lfoGain)
        lfoGain.connect(filter.frequency)
        lfo.start(startTime)
        lfo.stop(startTime + duration + 0.1)
        this._scheduledNodes.push(lfo)
      } else if (note.articulation === 'screech') {
        osc.type = 'square'
        filter.type = 'highpass'
        filter.frequency.value = 2000
        filter.Q.value = 3
      } else if (note.articulation === 'stab') {
        osc.type = 'sawtooth'
        filter.type = 'bandpass'
        filter.frequency.value = 1000
        filter.Q.value = 8
      } else {
        osc.type = 'sine'
        filter.type = 'lowpass'
        filter.frequency.value = 2000
      }

      osc.frequency.value = frequency + (i === 1 ? 0.5 : 0)
      gain.gain.setValueAtTime(note.velocity || 0.4, startTime)
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration)

      const detune = (i - 0.5) * (note.articulation === 'screech' ? 10 : 3)
      osc.detune.value = detune

      osc.start(startTime)
      osc.stop(startTime + duration + 0.1)
      oscillators.push(osc)
      this._scheduledNodes.push(osc)
      this._scheduledNodes.push(gain)
      this._scheduledNodes.push(filter)
    }

    return oscillators
  }

  playKick(startTime) {
    this.ensureContext()
    const ctx = this._ctx
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    const trackGain = this.getTrackGain('kick')

    osc.connect(gain)
    gain.connect(trackGain)

    osc.type = 'sine'
    osc.frequency.setValueAtTime(150, startTime)
    osc.frequency.exponentialRampToValueAtTime(30, startTime + 0.1)

    gain.gain.setValueAtTime(1, startTime)
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3)

    osc.start(startTime)
    osc.stop(startTime + 0.4)
    this._scheduledNodes.push(osc)
  }

  playSnare(startTime) {
    this.ensureContext()
    const ctx = this._ctx
    const noise = ctx.createBufferSource()
    const bufferSize = ctx.sampleRate * 0.1
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize)
    }
    noise.buffer = buffer

    const gain = ctx.createGain()
    const filter = ctx.createBiquadFilter()
    const trackGain = this.getTrackGain('snare')

    noise.connect(filter)
    filter.connect(gain)
    gain.connect(trackGain)

    filter.type = 'highpass'
    filter.frequency.value = 200

    gain.gain.setValueAtTime(0.8, startTime)
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.2)

    noise.start(startTime)
    noise.stop(startTime + 0.3)
    this._scheduledNodes.push(noise)

    const tone = ctx.createOscillator()
    const toneGain = ctx.createGain()
    tone.connect(toneGain)
    toneGain.connect(trackGain)
    tone.type = 'sine'
    tone.frequency.value = 180
    toneGain.gain.setValueAtTime(0.5, startTime)
    toneGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.1)
    tone.start(startTime)
    tone.stop(startTime + 0.15)
    this._scheduledNodes.push(tone)
  }

  playHat(startTime, isOpen = false) {
    this.ensureContext()
    const ctx = this._ctx
    const bufferSize = ctx.sampleRate * (isOpen ? 0.3 : 0.05)
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, isOpen ? 1 : 3)
    }
    const noise = ctx.createBufferSource()
    noise.buffer = buffer

    const filter = ctx.createBiquadFilter()
    const gain = ctx.createGain()
    const trackGain = this.getTrackGain('hat')

    noise.connect(filter)
    filter.connect(gain)
    gain.connect(trackGain)

    filter.type = 'highpass'
    filter.frequency.value = isOpen ? 5000 : 8000
    gain.gain.value = isOpen ? 0.3 : 0.4

    noise.start(startTime)
    noise.stop(startTime + (isOpen ? 0.35 : 0.1))
    this._scheduledNodes.push(noise)
  }

  scheduleDrumEvent(event, timeOffset) {
    this.ensureContext()
    const beatDuration = 60 / this._bpm
    const startTime = this._ctx.currentTime + timeOffset + (event.startBeat * beatDuration)

    switch (event.sound) {
      case 'kick': this.playKick(startTime); break
      case 'snare': case 'clap': this.playSnare(startTime); break
      case 'closed_hat': this.playHat(startTime, false); break
      case 'open_hat': this.playHat(startTime, true); break
    }
  }

  scheduleAll(notes, drumEvents, bassEvents, timeOffset = 0.1) {
    this.ensureContext()
    this.clearScheduled()

    for (const note of notes) {
      this.schedulePlay(note, timeOffset)
    }

    for (const drum of drumEvents) {
      this.scheduleDrumEvent(drum, timeOffset)
    }

    for (const bass of bassEvents) {
      this.schedulePlay({
        ...bass,
        pitch: bass.rootNote,
        type: 'synth',
        articulation: bass.articulation,
        velocity: bass.intensity,
        trackId: bass.trackId || 'bass',
      }, timeOffset)
    }
  }

  clearScheduled() {
    for (const node of this._scheduledNodes) {
      try { node.stop?.() } catch {}
      try { node.disconnect?.() } catch {}
    }
    this._scheduledNodes = []
  }

  play() {
    this.ensureContext()
    if (this._playing) return
    this._playing = true
    this._startTime = this._ctx.currentTime
    this._currentBeat = 0

    this._intervalId = setInterval(() => {
      if (!this._playing) return
      this._currentBeat++
      if (this._onBeat) this._onBeat(this._currentBeat)
    }, (60 / this._bpm) * 1000)
  }

  stop() {
    this._playing = false
    this._currentBeat = 0
    if (this._intervalId) {
      clearInterval(this._intervalId)
      this._intervalId = null
    }
    this.clearScheduled()
  }

  dispose() {
    this.stop()
    if (this._ctx) {
      this._ctx.close()
      this._ctx = null
    }
    this._tracks.clear()
    this._masterGain = null
  }
}

let _instance = null
export function getAudioEngine() {
  if (!_instance) _instance = new AudioEngine()
  return _instance
}
