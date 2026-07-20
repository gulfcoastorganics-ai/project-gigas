const MAX_EVENT_COUNT = 10000
const MAX_CACHE_SIZE = 100
const MAX_HISTORY_SIZE = 50
const MAX_RENDER_SECONDS = 300
const STALE_TIMEOUT_MS = 30000

export class ReliabilityGuard {
  constructor() {
    this._teardown = false
    this._generationCount = 0
    this._playCount = 0
    this._cacheSizes = new Map()
  }

  checkTeardown() {
    if (this._teardown) throw new Error('Application is being torn down')
  }

  markTeardown() {
    this._teardown = true
  }

  checkEventCount(events) {
    if (events.length > MAX_EVENT_COUNT) {
      throw new Error(`Event count ${events.length} exceeds limit of ${MAX_EVENT_COUNT}`)
    }
  }

  checkRenderDuration(seconds) {
    if (seconds > MAX_RENDER_SECONDS) {
      throw new Error(`Render duration ${seconds}s exceeds ${MAX_RENDER_SECONDS}s limit`)
    }
  }

  enforceCacheSize(cache, maxSize = MAX_CACHE_SIZE) {
    if (cache.size > maxSize) {
      const toDelete = cache.size - maxSize
      const keys = cache.keys()
      for (let i = 0; i < toDelete; i++) {
        cache.delete(keys.next().value)
      }
    }
  }

  trackGeneration() {
    this._generationCount++
    return this._generationCount
  }

  trackPlayback() {
    this._playCount++
    return this._playCount
  }

  createStaleGuard() {
    const id = Date.now() + Math.random()
    let consumed = false
    return {
      id,
      isStale: () => consumed,
      consume: () => { consumed = true },
      check: (expectedId) => {
        if (consumed || id !== expectedId) {
          throw new DOMException('Stale response discarded', 'AbortError')
        }
      },
    }
  }

  createTimeout(ms = STALE_TIMEOUT_MS) {
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true }, ms)
    return {
      isExpired: () => timedOut,
      cancel: () => { clearTimeout(timer); timedOut = true },
      check: () => { if (timedOut) throw new DOMException('Operation timed out', 'TimeoutError') },
    }
  }

  validateJSON(text) {
    try {
      const result = JSON.parse(text)
      return { valid: true, data: result }
    } catch (err) {
      return { valid: false, error: err.message }
    }
  }

  limitArray(arr, max = MAX_EVENT_COUNT) {
    if (arr.length > max) {
      return arr.slice(0, max)
    }
    return arr
  }
}

export class AudioGuard {
  constructor() {
    this._activeContexts = new Set()
    this._activeWorkers = new Set()
    this._playing = false
  }

  get isPlaying() { return this._playing }

  registerContext(ctx) {
    this._activeContexts.add(ctx)
    return this._activeContexts.size
  }

  unregisterContext(ctx) {
    this._activeContexts.delete(ctx)
    try { ctx.close() } catch {}
  }

  cleanupAllContexts() {
    for (const ctx of this._activeContexts) {
      try { ctx.close() } catch {}
    }
    this._activeContexts.clear()
  }

  registerWorker(w) {
    this._activeWorkers.add(w)
  }

  unregisterWorker(w) {
    this._activeWorkers.delete(w)
    try { w.terminate() } catch {}
  }

  cleanupAllWorkers() {
    for (const w of this._activeWorkers) {
      try { w.terminate() } catch {}
    }
    this._activeWorkers.clear()
  }

  setPlaying(v) {
    this._playing = v
  }

  checkDoublePlayback() {
    if (this._playing) {
      throw new Error('Already playing — stop first')
    }
  }
}
