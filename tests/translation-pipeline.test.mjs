import test from 'node:test'
import assert from 'node:assert/strict'
import { buildTextRequest, invokeTextModel, translationResponseSchema } from '../src/manuscript/text-provider.js'
import { normalizeTranslationChunk, coverage, translationPolicy, translationPrompt } from '../src/manuscript/translation-pipeline.js'

const source = [{ sourceLineId: 'line-1', page: 20, column: 'left', regionIds: ['region-1'], sequence: 1, diplomaticLatin: 'dixit dns', sourceConfidence: null, sourceUncertain: true, sourceWarnings: ['ocr_warning'] }]
const config = { provider: 'gemini', model: 'gemini-2.5-flash', apiKeyEnv: 'GEMINI_API_KEY', apiKey: 'secret-key', timeoutMs: 1000, maxOutputTokens: 16384 }
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'x-request-id': 'req-1' } })

test('Gemini text request is text-only and uses structured JSON', () => {
  const request = buildTextRequest({ ...config, prompt: 'translate' })
  assert.equal(request.body.contents[0].parts.length, 1)
  assert.equal(request.body.contents[0].parts[0].text, 'translate')
  assert.equal(request.body.generationConfig.responseMimeType, 'application/json')
  assert.deepEqual(request.body.generationConfig.responseJsonSchema, translationResponseSchema)
  assert.equal(JSON.stringify(request.body).includes('inline_data'), false)
})
test('Gemini 3 translation uses minimal thinking rather than thinkingBudget', () => { const request = buildTextRequest({ ...config, model: 'gemini-3-flash-preview', prompt: 'translate' }); assert.deepEqual(request.body.generationConfig.thinkingConfig, { thinkingLevel: 'minimal' }); assert.equal(JSON.stringify(request.body).includes('thinkingBudget'), false) })
test('Mistral translation uses direct chat JSON without OCR or image input', () => { const request = buildTextRequest({ provider: 'mistral', model: 'mistral-small-2603', apiKey: 'secret', prompt: 'translate', maxOutputTokens: 8192 }); assert.equal(request.url, 'https://api.mistral.ai/v1/chat/completions'); assert.equal(request.body.model, 'mistral-small-2603'); assert.deepEqual(request.body.response_format, { type: 'json_object' }); assert.equal(JSON.stringify(request.body).includes('image_url'), false); assert.equal(JSON.stringify(request.body).includes('mistral-ocr'), false) })

test('provider preserves raw response and never persists credential', async () => {
  const body = { candidates: [{ content: { parts: [{ text: '{"translations":[]}' }] } }], usageMetadata: { totalTokenCount: 2 } }
  const result = await invokeTextModel({ prompt: 'translate', requestId: 't1', config, fetchImpl: async () => response(body) })
  assert.equal(result.status, 'completed'); assert.match(result.rawProviderResponseHash, /^[a-f0-9]{64}$/)
  assert.doesNotMatch(JSON.stringify(result), /secret-key/); assert.deepEqual(result.parsedOutput, { translations: [] })
})

test('normalization aligns all English to source identity and propagates uncertainty', () => {
  const result = normalizeTranslationChunk({ translations: [{ k: 'L1', x: 'dixit dominus', l: 'the Lord said', r: 'The Lord said.', ec: .7, tc: .8, u: false, w: [] }] }, source)
  assert.equal(result.records[0].sourceLineId, 'line-1'); assert.equal(result.records[0].diplomaticLatin, 'dixit dns')
  assert.equal(result.records[0].uncertain, true); assert.equal(result.records[0].warnings.includes('ocr_warning'), true)
  assert.equal(result.records[0].literalEnglish, 'the Lord said'); assert.equal(result.valid, true)
})

test('missing translations are retained as failed aligned lines, never silently dropped', () => {
  const result = normalizeTranslationChunk({ translations: [] }, source)
  assert.equal(result.records.length, 1); assert.equal(result.records[0].literalEnglish, '')
  assert.equal(result.records[0].warnings.includes('translation_missing'), true)
  const metrics = coverage(result.records); assert.equal(metrics.sourceLatinLines, 1); assert.equal(metrics.expandedLatinLines, 0); assert.equal(metrics.literalEnglishLines, 0); assert.equal(metrics.readableEnglishLines, 0); assert.equal(metrics.untranslatedLines, 1); assert.equal(metrics.translationCoveragePercentage, 0); assert.equal(metrics.dispositionCoveragePercentage, 0)
})

test('invented source keys fail validation', () => { const result = normalizeTranslationChunk({ translations: [{ k: 'L2', x: '', l: '', r: '', ec: 0, tc: 0, u: true, w: [] }] }, source); assert.equal(result.valid, false); assert.ok(result.findings.some((x) => x.issue === 'invented_source_key')) })
test('prompt keeps expansion, literal, and readable layers separate', () => { const prompt = translationPrompt(source); assert.match(prompt, /x cautiously expands/); assert.match(prompt, /l follows Latin grammar/); assert.match(prompt, /r is natural modern English/); assert.doesNotMatch(prompt, /image|pixels/i) })
test('translation policy is candidate-only and noncanonical', () => { assert.equal(translationPolicy.canonical, false); assert.equal(translationPolicy.candidateOnly, true); assert.equal(translationPolicy.reviewRequired, true); assert.equal(translationPolicy.promotionEligible, false) })
