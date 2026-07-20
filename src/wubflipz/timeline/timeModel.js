let _pixelsPerBeat = 40
let _snapEnabled = true
let _snapDivision = 0.25
let _bpm = 140
let _timeSigNumerator = 4
let _timeSigDenominator = 4

export function configureTimeModel(opts = {}) {
  if (opts.pixelsPerBeat !== undefined) _pixelsPerBeat = opts.pixelsPerBeat
  if (opts.snapEnabled !== undefined) _snapEnabled = opts.snapEnabled
  if (opts.snapDivision !== undefined) _snapDivision = opts.snapDivision
  if (opts.bpm !== undefined) _bpm = opts.bpm
  if (opts.timeSignature !== undefined) {
    _timeSigNumerator = opts.timeSignature[0]
    _timeSigDenominator = opts.timeSignature[1]
  }
}

export function getPixelsPerBeat() { return _pixelsPerBeat }

export function beatToPixels(beats) {
  return beats * _pixelsPerBeat
}

export function pixelsToBeat(pixels) {
  return pixels / _pixelsPerBeat
}

export function barToBeats(bars) {
  return bars * _timeSigNumerator
}

export function beatsToBar(beats) {
  return beats / _timeSigNumerator
}

export function beatToSeconds(beats, bpm = _bpm) {
  return (beats / bpm) * 60
}

export function secondsToBeat(seconds, bpm = _bpm) {
  return (seconds / 60) * bpm
}

export function snapToGrid(value, division = _snapDivision) {
  if (!_snapEnabled) return value
  return Math.round(value / division) * division
}

export function quantizeEvent(event, division = 0.25) {
  return {
    ...event,
    startBeat: Math.round(event.startBeat / division) * division,
    durationBeats: Math.max(0.25, Math.round(event.durationBeats / division) * division),
  }
}

export function snapToBar(beats) {
  const barBeats = _timeSigNumerator
  return Math.round(beats / barBeats) * barBeats
}

export function getTimeSig() {
  return [_timeSigNumerator, _timeSigDenominator]
}

export function setPixelsPerBeat(ppb) {
  _pixelsPerBeat = Math.max(10, Math.min(200, ppb))
  return _pixelsPerBeat
}

export function setSnapEnabled(enabled) {
  _snapEnabled = enabled
  return _snapEnabled
}

export function setSnapDivision(division) {
  _snapDivision = division
  return _snapDivision
}

export function beatToString(beats) {
  const bar = Math.floor(beats / _timeSigNumerator)
  const beat = Math.floor(beats % _timeSigNumerator) + 1
  const sixteenth = Math.floor(((beats % 1) * 4)) + 1
  return `${bar + 1}.${beat}.${sixteenth}`
}

export function getTimelineWidth(totalBeats) {
  return Math.ceil(totalBeats * _pixelsPerBeat)
}

export function getSnapDivision() { return _snapDivision }
export function getSnapEnabled() { return _snapEnabled }
