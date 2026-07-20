import fs from 'node:fs'
import { imageDimensions, mediaType, sha256 } from './source-ingestion.js'

export const MISTRAL_OCR_ENDPOINT = 'https://api.mistral.ai/v1/ocr'
export const MISTRAL_OCR_MODEL = 'mistral-ocr-4-0'

function redactedMessage(error) {
  return String(error?.message || error || '').replace(/Bearer\s+[^\s]+/gi, 'Bearer [REDACTED]').replace(/(api[_-]?key|authorization)[=:][^\s,}]+/gi, '$1=[REDACTED]')
}

function headerRecord(headers) {
  const result = {}
  for (const [key, value] of headers.entries()) {
    if (/authorization|api[-_]?key/i.test(key)) continue
    result[key] = value
  }
  return result
}

function rateLimitHeaders(headers) {
  return Object.fromEntries(Object.entries(headers).filter(([key]) => /rate|retry-after/i.test(key)))
}

export function retryDelayForAttempt(attempt, configured = '2000') {
  const values = String(configured).split(',').map(Number).filter((value) => Number.isFinite(value) && value >= 0)
  return values[attempt] || 2000
}

function classify(status, message = '') {
  const text = `${status} ${message}`.toLowerCase()
  if (/401|authentication|api key|unauthorized/.test(text)) return 'authentication_failure'
  if (/429|rate limit|quota/.test(text)) return 'rate_limited'
  if (/timeout|aborted/.test(text)) return 'request_timeout'
  if (/image|mime|document/.test(text) && Number(status) >= 400) return 'image_rejected'
  if (Number(status) >= 400) return `http_${status}`
  return 'provider_error'
}

function stripMarkdown(value) {
  return String(value || '').split(/\r?\n/).map((line) => line
    .replace(/^\s{0,3}#{1,6}\s+/, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[`*_~]/g, '')
    .trim()).filter(Boolean)
}

function pageLines(page) {
  const blocks = Array.isArray(page?.blocks) ? page.blocks : []
  const source = blocks.length
    ? blocks.filter((block) => !['image', 'table'].includes(String(block?.type || '').toLowerCase())).flatMap((block) => stripMarkdown(block.content || block.text || block.markdown).map((text) => ({ text, block })))
    : stripMarkdown(page?.markdown).map((text) => ({ text, block: null }))
  const pageConfidence = page?.confidence_scores?.average_page_confidence_score
  return source.map((entry, index) => {
    const confidence = entry.block?.confidence ?? entry.block?.confidence_score ?? pageConfidence ?? null
    return {
      n: index + 1,
      t: entry.text,
      c: confidence === null || confidence === undefined ? null : Number(confidence),
      u: confidence === null || confidence === undefined,
      i: false,
      p: false
    }
  })
}

export function mapMistralOcrResponse(body) {
  const pages = Array.isArray(body?.pages) ? body.pages : []
  const lines = pages.flatMap(pageLines)
  return {
    lines,
    blocks: pages.flatMap((page) => Array.isArray(page?.blocks) ? page.blocks : []),
    pages: pages.map((page) => ({ index: page.index ?? null, dimensions: page.dimensions ?? null, confidenceScores: page.confidence_scores ?? null })),
    usage: body?.usage_info || null,
    model: body?.model || null
  }
}

export function buildMistralOcrRequest({ imageBuffer, mime = 'image/jpeg', model = MISTRAL_OCR_MODEL } = {}) {
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) throw new Error('mistral_image_empty')
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) throw new Error(`mistral_unsupported_image_mime:${mime}`)
  return {
    model,
    document: { type: 'image_url', image_url: `data:${mime};base64,${imageBuffer.toString('base64')}` },
    include_blocks: true,
    confidence_scores_granularity: 'page'
  }
}

export async function invokeMistralOcr({ imagePath, expectedImageHash, requestId = `mistral-ocr-${Date.now()}`, timeoutMs = 180000, model = MISTRAL_OCR_MODEL, fetchImpl = globalThis.fetch } = {}) {
  const startedAt = new Date().toISOString()
  const started = Date.now()
  const apiKey = process.env.MISTRAL_API_KEY || ''
  const base = { provider: 'mistral-ocr', model, requestedModel: model, actualRoutedModel: model, requestId, startedAt, retryCount: 0, canonical: false, candidateOnly: true, reviewRequired: true }
  if (!apiKey) return { ...base, status: 'blocked', failureClassification: 'credential_missing', error: 'MISTRAL_API_KEY is not configured', completedAt: new Date().toISOString(), durationMs: Date.now() - started }
  let buffer
  try { buffer = fs.readFileSync(imagePath) } catch (error) { return { ...base, status: 'blocked', failureClassification: 'image_not_sent', error: redactedMessage(error), completedAt: new Date().toISOString(), durationMs: Date.now() - started } }
  const mime = mediaType(imagePath)
  const dimensions = imageDimensions(buffer, mime)
  const imageHash = sha256(buffer)
  if (expectedImageHash && imageHash !== expectedImageHash) return { ...base, status: 'blocked', failureClassification: 'image_hash_mismatch', error: 'image hash mismatch', sourceImageSha256: imageHash, completedAt: new Date().toISOString(), durationMs: Date.now() - started }
  let body
  try { body = buildMistralOcrRequest({ imageBuffer: buffer, mime, model }) } catch (error) { return { ...base, status: 'blocked', failureClassification: 'image_rejected', error: redactedMessage(error), sourceImageSha256: imageHash, completedAt: new Date().toISOString(), durationMs: Date.now() - started } }
  const rawBody = JSON.stringify(body)
  const requestPayloadHash = sha256(Buffer.from(JSON.stringify({ ...body, document: { type: 'image_url', image_url: `data:${mime};base64:[BYTES]` } })))
  const common = { ...base, sourceImageSha256: imageHash, transmittedImageSha256: imageHash, transmittedImageMime: mime, transmittedImageBytes: buffer.length, transmittedImageDimensions: dimensions, requestPayloadHash, requestFieldNames: Object.keys(body) }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let response
  let rawResponse = ''
  let headers = {}
  try {
    response = await fetchImpl(MISTRAL_OCR_ENDPOINT, { method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', accept: 'application/json' }, body: rawBody, signal: controller.signal })
    headers = headerRecord(response.headers)
    rawResponse = (await response.text()).replaceAll(apiKey, '[REDACTED]')
    const responseId = headers['x-request-id'] || headers['request-id'] || headers['x-generation-id'] || null
    let parsed = null
    try { parsed = rawResponse ? JSON.parse(rawResponse) : null } catch {}
    const providerError = parsed?.error || null
    if (!response.ok) return { ...common, status: 'blocked', failureClassification: classify(response.status, providerError?.message || rawResponse), error: redactedMessage(providerError?.message || `provider_http_${response.status}`), httpStatus: response.status, responseHeaders: headers, rateLimitHeaders: rateLimitHeaders(headers), providerResponseId: responseId, rawProviderResponse: rawResponse, rawResponse, rawProviderResponseHash: sha256(Buffer.from(rawResponse)), completedAt: new Date().toISOString(), durationMs: Date.now() - started }
    if (!rawResponse) return { ...common, status: 'blocked', failureClassification: 'provider_empty_response', error: 'empty OCR response', httpStatus: response.status, responseHeaders: headers, rateLimitHeaders: rateLimitHeaders(headers), rawProviderResponse: '', rawResponse: '', rawProviderResponseHash: '', completedAt: new Date().toISOString(), durationMs: Date.now() - started }
    if (!parsed) return { ...common, status: 'blocked', failureClassification: 'provider_non_json_response', error: 'OCR response was not JSON', httpStatus: response.status, responseHeaders: headers, rawProviderResponse: rawResponse, rawResponse, rawProviderResponseHash: sha256(Buffer.from(rawResponse)), completedAt: new Date().toISOString(), durationMs: Date.now() - started }
    const mapped = mapMistralOcrResponse(parsed)
    return { ...common, status: mapped.lines.length ? 'completed' : 'blocked', failureClassification: mapped.lines.length ? null : 'provider_empty_response', error: mapped.lines.length ? null : 'OCR response contained no text lines', httpStatus: response.status, responseHeaders: headers, rateLimitHeaders: rateLimitHeaders(headers), providerResponseId: responseId, actualRoutedModel: parsed.model || model, usage: parsed.usage_info || null, providerEnvelope: parsed, parsedOutput: { lines: mapped.lines }, blocks: mapped.blocks, pageMetadata: mapped.pages, rawProviderResponse: rawResponse, rawResponse, rawProviderResponseHash: sha256(Buffer.from(rawResponse)), completedAt: new Date().toISOString(), durationMs: Date.now() - started }
  } catch (error) {
    const classification = error?.name === 'AbortError' ? 'request_timeout' : classify(null, error?.message)
    return { ...common, status: 'blocked', failureClassification: classification, error: redactedMessage(error), httpStatus: response?.status ?? null, responseHeaders: headers, rawProviderResponse: rawResponse, rawResponse, rawProviderResponseHash: rawResponse ? sha256(Buffer.from(rawResponse)) : '', completedAt: new Date().toISOString(), durationMs: Date.now() - started }
  } finally { clearTimeout(timer) }
}

export async function invokeMistralOcrWithRetry(options = {}) {
  const attempts = []
  const maxAttempts = Number(options.maxAttempts || 2)
  const configuredDelays = options.retryDelaysMs || process.env.GIGAS_MISTRAL_RETRY_DELAYS_MS || '2000'
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = await invokeMistralOcr(options)
    attempts.push(result)
    const retryable = ['request_timeout', 'provider_empty_response', 'http_500', 'http_502', 'http_503', 'http_504', 'provider_error'].includes(result.failureClassification)
    if (result.status === 'completed' || !retryable || attempt + 1 >= maxAttempts) return { ...result, retryCount: attempt, attempts: attempts.map((entry) => ({ status: entry.status, failureClassification: entry.failureClassification || null, httpStatus: entry.httpStatus ?? null, providerResponseId: entry.providerResponseId || null, rawResponse: entry.rawResponse || '', rawResponseHash: entry.rawProviderResponseHash || '' })) }
    const retryAfter = Number(result.rateLimitHeaders?.['retry-after'] || 0)
    const delay = Math.max(retryDelayForAttempt(attempt, configuredDelays), Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 0)
    await new Promise((resolve) => setTimeout(resolve, delay))
  }
  return attempts.at(-1)
}
