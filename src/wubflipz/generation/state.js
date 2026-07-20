export const States = {
  IDLE: 'idle',
  PLANNING: 'planning',
  GENERATING: 'generating',
  VALIDATING: 'validating',
  COMMITTING: 'committing',
  PLAYING: 'playing',
  RENDERING: 'rendering',
  SAVING: 'saving',
  CANCELING: 'canceling',
  ERROR: 'error',
}

const VALID_TRANSITIONS = {
  [States.IDLE]: [States.PLANNING, States.GENERATING, States.PLAYING, States.SAVING, States.ERROR],
  [States.PLANNING]: [States.GENERATING, States.IDLE, States.ERROR, States.CANCELING],
  [States.GENERATING]: [States.VALIDATING, States.IDLE, States.ERROR, States.CANCELING],
  [States.VALIDATING]: [States.COMMITTING, States.IDLE, States.ERROR, States.CANCELING],
  [States.COMMITTING]: [States.IDLE, States.SAVING, States.ERROR, States.CANCELING],
  [States.PLAYING]: [States.IDLE, States.ERROR],
  [States.RENDERING]: [States.IDLE, States.SAVING, States.ERROR, States.CANCELING],
  [States.SAVING]: [States.IDLE, States.ERROR],
  [States.CANCELING]: [States.IDLE, States.ERROR],
  [States.ERROR]: [States.IDLE, States.PLANNING],
}

export class AppState {
  constructor() {
    this._state = States.IDLE
    this._version = 0
    this._requestVersion = 0
    this._listeners = new Set()
    this._mutex = null
  }

  get state() { return this._state }
  get version() { return this._version }
  get requestVersion() { return this._requestVersion }

  onChange(callback) {
    this._listeners.add(callback)
    return () => this._listeners.delete(callback)
  }

  canTransitionTo(newState) {
    const allowed = VALID_TRANSITIONS[this._state]
    return allowed ? allowed.includes(newState) : false
  }

  transitionTo(newState) {
    if (!this.canTransitionTo(newState)) {
      console.warn(`Invalid state transition: ${this._state} -> ${newState}`)
      return false
    }
    const oldState = this._state
    this._state = newState
    if (newState === States.GENERATING || newState === States.COMMITTING) {
      this._version++
    }
    for (const cb of this._listeners) {
      try { cb(newState, oldState) } catch {}
    }
    return true
  }

  nextRequestVersion() {
    return ++this._requestVersion
  }

  isCurrentRequest(version) {
    return version === this._requestVersion
  }

  async acquireMutex(name) {
    while (this._mutex === name) {
      await new Promise(r => setTimeout(r, 10))
    }
    this._mutex = name
  }

  releaseMutex(name) {
    if (this._mutex === name) {
      this._mutex = null
    }
  }

  reset() {
    this._state = States.IDLE
    this._mutex = null
  }
}

export function createOperationGuard(state, operationName) {
  let cancelled = false
  const requestVersion = state.nextRequestVersion()

  return {
    requestVersion,
    isCancelled: () => cancelled || !state.isCurrentRequest(requestVersion),
    cancel: () => { cancelled = true },
    check: () => {
      if (cancelled || !state.isCurrentRequest(requestVersion)) {
        throw new DOMException(`${operationName} cancelled`, 'AbortError')
      }
    },
  }
}
