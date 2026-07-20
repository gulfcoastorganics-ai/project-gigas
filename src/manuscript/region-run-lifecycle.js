import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export const terminalStates = new Set(['completed', 'blocked'])

export function atomicWriteJson(file, value) {
  const temp = `${file}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const fd = fs.openSync(temp, 'w')
  try { fs.writeFileSync(fd, JSON.stringify(value, null, 2) + '\n'); fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
  fs.renameSync(temp, file)
}

export function sha256Text(value) { return crypto.createHash('sha256').update(String(value)).digest('hex') }

export function safeError(error) {
  const cause = error?.cause
  return { name: error?.name || 'Error', message: String(error?.message || error), code: error?.code || '', causeName: cause?.name || '', causeMessage: cause?.message || '' }
}

export function classifyTransportFailure(result = {}, error = null) {
  if (result.failureClassification) return result.failureClassification
  const status = Number(result.httpStatus)
  if (status >= 400 && status <= 599) return `http_${status >= 500 ? '5xx' : status}`
  const text = `${error?.name || ''} ${error?.code || ''} ${error?.message || ''}`.toLowerCase()
  if (/credential|api key|unauthori/.test(text)) return 'credential_missing'
  if (/abort|timeout/.test(text)) return error?.name === 'AbortError' ? 'request_aborted' : 'request_timeout'
  if (/dns|enotfound|getaddrinfo/.test(text)) return 'network_dns_failure'
  if (/tls|certificate|ssl/.test(text)) return 'tls_failure'
  if (/connect|econn|fetch failed|network/.test(text)) return 'network_connection_failure'
  if (result.status === 'failed' && !result.rawProviderResponse) return 'provider_empty_response'
  return 'unexpected_exception'
}

export function redactExcerpt(value, limit = 1200) {
  return String(value || '').replace(/(bearer\s+)[^\s"']+/gi, '$1[REDACTED]').replace(/(api[_-]?key|token|secret)\s*[:=]\s*["']?[^\s,"'}]+/gi, '$1=[REDACTED]').slice(0, limit)
}

export function transportRecord(result = {}, error = null, stage = 'region-transcription') {
  const startedAt = result.startedAt || new Date().toISOString()
  const finishedAt = result.completedAt || new Date().toISOString()
  const durationMs = Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt))
  return { status: result.status === 'completed' ? 'completed' : 'blocked', stage, failureClassification: classifyTransportFailure(result, error), provider: result.provider || '', requestedModel: result.model || '', actualRoutedModel: result.actualRoutedModel || result.model || '', httpStatus: result.httpStatus ?? null, providerRequestId: result.responseId || result.providerResponseId || '', retryCount: result.retryCount || 0, startedAt, finishedAt, durationMs, rawProviderResponse: result.rawProviderResponse || '', rawProviderResponseHash: result.rawProviderResponseHash || '', safeError: error ? safeError(error) : { name: '', message: result.error || '', code: '', causeName: '', causeMessage: '' }, responseHeaders: result.responseHeaders || {}, providerErrorCode: result.providerErrorCode || null, providerErrorMessage: result.providerErrorMessage || null, redactedResponseExcerpt: redactExcerpt(result.rawProviderResponse || result.error || '') }
}

export function nextState(current, next) {
  const allowed = { prepared: ['request_started', 'blocked'], request_started: ['response_received', 'blocked'], response_received: ['response_parsed', 'blocked'], response_parsed: ['candidate_validated', 'blocked'], candidate_validated: ['completed', 'blocked'] }
  if (terminalStates.has(current) || !allowed[current]?.includes(next)) throw new Error(`invalid_state_transition:${current}->${next}`)
  return next
}

export async function durableRun({ initial, runFile, invoke, normalize = async () => ({}) }) {
  let state = { ...initial, state: 'prepared', canonical: false, candidateOnly: true, reviewRequired: true }
  const persist = () => atomicWriteJson(runFile, state)
  persist()
  try {
    state = { ...state, state: nextState(state.state, 'request_started'), requestStartedAt: new Date().toISOString() }; persist()
    const response = await invoke()
    let providerRequestId = response.providerRequestId || response.responseId || ''
    if (!providerRequestId && response.rawProviderResponse) { try { providerRequestId = JSON.parse(response.rawProviderResponse)?.id || '' } catch {} }
    state = { ...state, ...response, providerRequestId, state: nextState(state.state, 'response_received'), responseReceivedAt: new Date().toISOString() }; persist()
    if (response.status !== 'completed') throw Object.assign(new Error(response.error || 'provider request failed'), { transportResult: response })
    state = { ...state, state: nextState(state.state, 'response_parsed'), responseParsedAt: new Date().toISOString() }; persist()
    const candidate = await normalize(response)
    state = { ...state, ...candidate, state: nextState(state.state, 'candidate_validated'), candidateValidatedAt: new Date().toISOString() }; persist()
    state = { ...state, state: nextState(state.state, 'completed'), finishedAt: new Date().toISOString() }; persist(); return state
  } catch (error) {
    const response = error.transportResult || {}
    state = { ...state, ...response, state: 'blocked', lastSuccessfulState: state.state, failureClassification: classifyTransportFailure(response, error), safeError: safeError(error), finishedAt: new Date().toISOString(), canonical: false, candidateOnly: true, reviewRequired: true }
    try { persist() } catch (writeError) { state = { ...state, artifactWriteFailure: safeError(writeError) }; try { persist() } catch {} }
    return state
  }
}
