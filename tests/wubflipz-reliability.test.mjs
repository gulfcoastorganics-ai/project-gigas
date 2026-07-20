import { describe, it } from 'node:test'
import assert from 'node:assert'

const basePath = process.cwd()

describe('AppState', () => {
  it('starts in idle state', async () => {
    const { AppState, States } = await import(`${basePath}/src/wubflipz/generation/state.js`)
    const state = new AppState()
    assert.strictEqual(state.state, States.IDLE)
  })

  it('transitions between valid states', async () => {
    const { AppState, States } = await import(`${basePath}/src/wubflipz/generation/state.js`)
    const state = new AppState()
    assert.ok(state.transitionTo(States.GENERATING))
    assert.strictEqual(state.state, States.GENERATING)
    assert.ok(state.transitionTo(States.VALIDATING))
    assert.strictEqual(state.state, States.VALIDATING)
    assert.ok(state.transitionTo(States.IDLE))
    assert.strictEqual(state.state, States.IDLE)
  })

  it('rejects invalid transitions', async () => {
    const { AppState, States } = await import(`${basePath}/src/wubflipz/generation/state.js`)
    const state = new AppState()
    assert.ok(!state.transitionTo(States.VALIDATING), 'Cannot go directly to validating from idle')
    assert.strictEqual(state.state, States.IDLE)
  })

  it('increments version on generating', async () => {
    const { AppState, States } = await import(`${basePath}/src/wubflipz/generation/state.js`)
    const state = new AppState()
    const v1 = state.version
    state.transitionTo(States.GENERATING)
    assert.ok(state.version > v1, 'Version should increment')
  })

  it('tracks request versions', async () => {
    const { AppState, States } = await import(`${basePath}/src/wubflipz/generation/state.js`)
    const state = new AppState()
    const v1 = state.nextRequestVersion()
    const v2 = state.nextRequestVersion()
    assert.ok(v2 > v1, 'Request versions should increase')
    assert.ok(state.isCurrentRequest(v2), 'Latest request should be current')
    assert.ok(!state.isCurrentRequest(v1), 'Old request should not be current')
  })

  it('supports mutex locking', async () => {
    const { AppState } = await import(`${basePath}/src/wubflipz/generation/state.js`)
    const state = new AppState()
    await state.acquireMutex('test')
    state.releaseMutex('test')
    assert.ok(true, 'Mutex should not deadlock')
  })

  it('notifies listeners on state change', async () => {
    const { AppState, States } = await import(`${basePath}/src/wubflipz/generation/state.js`)
    const state = new AppState()
    let notified = false
    state.onChange((newState) => {
      if (newState === States.GENERATING) notified = true
    })
    state.transitionTo(States.GENERATING)
    assert.ok(notified, 'Listener should be notified')
  })
})

describe('OperationGuard', () => {
  it('detects cancellation', async () => {
    const { createOperationGuard, AppState } = await import(`${basePath}/src/wubflipz/generation/state.js`)
    const state = new AppState()
    const guard = createOperationGuard(state, 'test')
    guard.cancel()
    assert.ok(guard.isCancelled(), 'Should be cancelled')
  })

  it('throws on check after cancellation', async () => {
    const { createOperationGuard, AppState } = await import(`${basePath}/src/wubflipz/generation/state.js`)
    const state = new AppState()
    const guard = createOperationGuard(state, 'test')
    guard.cancel()
    assert.throws(() => guard.check(), /cancelled/)
  })
})

describe('ReliabilityGuard', () => {
  it('rejects excessive events', async () => {
    const { ReliabilityGuard } = await import(`${basePath}/src/wubflipz/generation/reliability.js`)
    const guard = new ReliabilityGuard()
    assert.throws(() => guard.checkEventCount(new Array(20000)), /exceeds limit/)
  })

  it('passes acceptable event counts', async () => {
    const { ReliabilityGuard } = await import(`${basePath}/src/wubflipz/generation/reliability.js`)
    const guard = new ReliabilityGuard()
    guard.checkEventCount([1, 2, 3])
    assert.ok(true, 'Should not throw')
  })

  it('rejects excessive render durations', async () => {
    const { ReliabilityGuard } = await import(`${basePath}/src/wubflipz/generation/reliability.js`)
    const guard = new ReliabilityGuard()
    assert.throws(() => guard.checkRenderDuration(600), /exceeds/)
  })

  it('detects stale responses', async () => {
    const { ReliabilityGuard } = await import(`${basePath}/src/wubflipz/generation/reliability.js`)
    const guard = new ReliabilityGuard()
    const sg = guard.createStaleGuard()
    sg.consume()
    assert.ok(sg.isStale(), 'Should be stale after consume')
  })

  it('limits arrays', async () => {
    const { ReliabilityGuard } = await import(`${basePath}/src/wubflipz/generation/reliability.js`)
    const guard = new ReliabilityGuard()
    const large = new Array(50000).fill(0)
    const limited = guard.limitArray(large, 100)
    assert.strictEqual(limited.length, 100)
  })

  it('validates JSON', async () => {
    const { ReliabilityGuard } = await import(`${basePath}/src/wubflipz/generation/reliability.js`)
    const guard = new ReliabilityGuard()
    assert.ok(guard.validateJSON('{"a":1}').valid)
    assert.ok(!guard.validateJSON('invalid').valid)
  })

  it('enforces cache size', async () => {
    const { ReliabilityGuard } = await import(`${basePath}/src/wubflipz/generation/reliability.js`)
    const guard = new ReliabilityGuard()
    const cache = new Map()
    for (let i = 0; i < 50; i++) cache.set(`k${i}`, i)
    guard.enforceCacheSize(cache, 10)
    assert.strictEqual(cache.size, 10)
  })
})

describe('AudioGuard', () => {
  it('prevents double playback', async () => {
    const { AudioGuard } = await import(`${basePath}/src/wubflipz/generation/reliability.js`)
    const guard = new AudioGuard()
    guard.setPlaying(true)
    assert.throws(() => guard.checkDoublePlayback(), /Already playing/)
  })

  it('allows single playback', async () => {
    const { AudioGuard } = await import(`${basePath}/src/wubflipz/generation/reliability.js`)
    const guard = new AudioGuard()
    guard.checkDoublePlayback()
    assert.ok(true, 'Should not throw when not playing')
  })

  it('tracks context registration', async () => {
    const { AudioGuard } = await import(`${basePath}/src/wubflipz/generation/reliability.js`)
    const guard = new AudioGuard()
    const ctx = { close: () => {} }
    guard.registerContext(ctx)
    assert.strictEqual(guard._activeContexts.size, 1)
    guard.unregisterContext(ctx)
    assert.strictEqual(guard._activeContexts.size, 0)
  })
})
