import { createHash } from 'node:crypto'

const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const redact = (value, secret = '') => String(value || '').replaceAll(secret || '\u0000', '[REDACTED]').replace(/(?:AIza|sk-)[A-Za-z0-9_-]{12,}/g, '[REDACTED]')

export function readTextProviderConfig(env = process.env) {
  const provider = env.GIGAS_TRANSLATION_PROVIDER || (env.GEMINI_API_KEY ? 'gemini' : env.OPENROUTER_API_KEY ? 'openrouter' : env.MISTRAL_API_KEY ? 'mistral' : '')
  const model = env.GIGAS_TRANSLATION_MODEL || (provider === 'gemini' ? 'gemini-2.5-flash' : provider === 'openrouter' ? 'mistralai/mistral-small-2603' : 'mistral-small-2603')
  const apiKeyEnv = provider === 'gemini' ? 'GEMINI_API_KEY' : provider === 'openrouter' ? 'OPENROUTER_API_KEY' : provider === 'mistral' ? 'MISTRAL_API_KEY' : ''
  return { provider, model, apiKeyEnv, apiKey: env[apiKeyEnv] || '', timeoutMs: Number(env.GIGAS_TRANSLATION_TIMEOUT_MS || 180000), maxOutputTokens: Number(env.GIGAS_TRANSLATION_MAX_OUTPUT_TOKENS || 16384) }
}

export const translationResponseSchema = {
  type: 'object', required: ['translations'], additionalProperties: false,
  properties: { translations: { type: 'array', items: { type: 'object', required: ['k', 'x', 'l', 'r', 'ec', 'tc', 'u', 'w'], additionalProperties: false, properties: {
    k: { type: 'string' }, x: { type: 'string' }, l: { type: 'string' }, r: { type: 'string' },
    ec: { type: 'number', minimum: 0, maximum: 1 }, tc: { type: 'number', minimum: 0, maximum: 1 }, u: { type: 'boolean' },
    w: { type: 'array', items: { type: 'string' } }
  } } } }
}

export function buildTextRequest({ provider, model, apiKey, prompt, maxOutputTokens = 16384 }) {
  if (provider === 'gemini') { const thinkingConfig = /^gemini-3(?:\.|-)/.test(model) ? { thinkingLevel: 'minimal' } : { thinkingBudget: 0 }; return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
    body: { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', responseJsonSchema: translationResponseSchema, temperature: 0, candidateCount: 1, maxOutputTokens, thinkingConfig } }
  } }
  if (provider === 'openrouter') return {
    url: 'https://openrouter.ai/api/v1/chat/completions', headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: { model, messages: [{ role: 'user', content: prompt }], temperature: 0, max_tokens: maxOutputTokens, response_format: { type: 'json_object' } }
  }
  if (provider === 'mistral') return {
    url: 'https://api.mistral.ai/v1/chat/completions', headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: { model, messages: [{ role: 'user', content: prompt }], temperature: 0, max_tokens: maxOutputTokens, response_format: { type: 'json_object' } }
  }
  throw new Error('unsupported_text_provider')
}

function extractAssistant(provider, envelope) {
  if (provider === 'gemini') return envelope?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || ''
  return envelope?.choices?.[0]?.message?.content || ''
}

function classify(status, error, body) {
  if (error?.name === 'AbortError') return 'request_timeout'
  if (error) return 'transport_failure'
  if (status === 401 || status === 403) return 'authentication_failure'
  if (status === 429) return 'rate_limited'
  if (status >= 500) return 'provider_error'
  if (status >= 400) return 'invalid_request'
  if (!body) return 'empty_response'
  return null
}

export async function invokeTextModel({ prompt, requestId, config = readTextProviderConfig(), fetchImpl = fetch } = {}) {
  const startedAt = new Date().toISOString(); const started = Date.now()
  const base = { provider: config.provider, requestedModel: config.model, actualModel: config.model, requestId, startedAt, canonical: false }
  if (!config.apiKey) return { ...base, status: 'blocked', failureClassification: 'credential_missing', apiKeyEnv: config.apiKeyEnv, finishedAt: new Date().toISOString(), durationMs: 0, rawProviderResponse: '', rawProviderResponseHash: '' }
  let request
  try { request = buildTextRequest({ ...config, prompt }) } catch (error) { return { ...base, status: 'blocked', failureClassification: 'request_serialization_failed', safeError: { name: error.name, message: error.message }, finishedAt: new Date().toISOString(), durationMs: Date.now() - started, rawProviderResponse: '', rawProviderResponseHash: '' } }
  const safePayload = JSON.stringify(request.body); const requestPayloadHash = sha256(safePayload); const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), config.timeoutMs)
  try {
    const response = await fetchImpl(request.url, { method: 'POST', headers: request.headers, body: safePayload, signal: controller.signal })
    const raw = await response.text(); const headers = Object.fromEntries(response.headers.entries()); const rawHash = raw ? sha256(raw) : ''
    let envelope = null; try { envelope = raw ? JSON.parse(raw) : null } catch {}
    const responseId = headers['x-request-id'] || envelope?.id || null; const failure = classify(response.status, null, raw)
    const common = { ...base, status: failure ? 'blocked' : 'completed', failureClassification: failure, httpStatus: response.status, providerResponseId: responseId, actualModel: envelope?.model || config.model, responseHeaders: Object.fromEntries(Object.entries(headers).filter(([key]) => /^(x-request-id|x-ratelimit|retry-after)/i.test(key))), rawProviderResponse: redact(raw, config.apiKey), rawProviderResponseHash: rawHash, providerEnvelope: envelope, providerEnvelopeHash: envelope ? sha256(JSON.stringify(envelope)) : '', usage: envelope?.usageMetadata || envelope?.usage || null, requestPayloadHash, finishedAt: new Date().toISOString(), durationMs: Date.now() - started }
    if (failure) return common
    const assistantContent = extractAssistant(config.provider, envelope); let parsedOutput = null
    try { parsedOutput = assistantContent ? JSON.parse(assistantContent.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim()) : null } catch {}
    return { ...common, status: parsedOutput ? 'completed' : 'blocked', failureClassification: parsedOutput ? null : assistantContent ? 'malformed_json' : 'empty_response', assistantContent, assistantContentHash: assistantContent ? sha256(assistantContent) : '', parsedOutput, parsedOutputHash: parsedOutput ? sha256(JSON.stringify(parsedOutput)) : '' }
  } catch (error) {
    return { ...base, status: 'blocked', failureClassification: classify(null, error), safeError: { name: error.name, message: redact(error.message, config.apiKey) }, requestPayloadHash, rawProviderResponse: '', rawProviderResponseHash: '', finishedAt: new Date().toISOString(), durationMs: Date.now() - started }
  } finally { clearTimeout(timer) }
}
