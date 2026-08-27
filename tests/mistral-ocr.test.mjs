import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildMistralOcrRequest, invokeMistralOcr, mapMistralOcrResponse, retryDelayForAttempt, MISTRAL_OCR_ENDPOINT, MISTRAL_OCR_MODEL } from '../src/manuscript/mistral-ocr-provider.js'

const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gigas-mistral-ocr-'))
const crop = path.join(fixtureDir, 'crop.jpg')
const onePixelJpeg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EH//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EH//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EH//2Q==', 'base64')
fs.writeFileSync(crop, onePixelJpeg)

const originalKey = process.env.MISTRAL_API_KEY
test('targeted retry schedule supports 5/15/45 seconds', () => { assert.deepEqual([0, 1, 2].map((attempt) => retryDelayForAttempt(attempt, '5000,15000,45000')), [5000, 15000, 45000]) })
function fakeResponse(body, status = 200, headers = {}) { return { ok: status >= 200 && status < 300, status, headers: new Headers(headers), text: async () => typeof body === 'string' ? body : JSON.stringify(body) } }

test('Mistral OCR request uses the dedicated endpoint and image data URL', () => {
  const request = buildMistralOcrRequest({ imageBuffer: Buffer.from('jpeg'), mime: 'image/jpeg' })
  assert.equal(MISTRAL_OCR_ENDPOINT, 'https://api.mistral.ai/v1/ocr')
  assert.equal(request.model, MISTRAL_OCR_MODEL)
  assert.equal(request.document.type, 'image_url')
  assert.match(request.document.image_url, /^data:image\/jpeg;base64,/)
  assert.equal(request.include_blocks, true)
})

test('Mistral OCR uses its OCR model independently of stale vision model settings', () => {
  const request = buildMistralOcrRequest({ imageBuffer: Buffer.from('jpeg'), mime: 'image/jpeg' })
  assert.equal(request.model, 'mistral-ocr-4-0')
})

test('missing Mistral credential blocks without network', async () => {
  delete process.env.MISTRAL_API_KEY
  const result = await invokeMistralOcr({ imagePath: crop, fetchImpl: async () => { throw new Error('must not call') } })
  assert.equal(result.failureClassification, 'credential_missing')
  if (originalKey) process.env.MISTRAL_API_KEY = originalKey
})

test('successful OCR maps blocks and preserves nullable confidence', async () => {
  process.env.MISTRAL_API_KEY = 'secret-test-key'
  let sent
  const result = await invokeMistralOcr({
    imagePath: crop,
    fetchImpl: async (url, init) => {
      sent = { url, init }
      return fakeResponse({
        model: MISTRAL_OCR_MODEL,
        pages: [{ index: 0, markdown: 'arma\nuerba', dimensions: { width: 100, height: 80 }, blocks: [{ type: 'text', content: 'arma\nuerba', top_left_x: 1, top_left_y: 2, bottom_right_x: 90, bottom_right_y: 70 }] }],
        usage_info: { pages_processed: 1 }
      }, 200, { 'x-request-id': 'req-1', 'x-ratelimit-remaining': '9' })
    }
  })
  assert.equal(sent.url, MISTRAL_OCR_ENDPOINT)
  assert.equal(JSON.parse(sent.init.body).document.type, 'image_url')
  assert.equal(result.status, 'completed')
  assert.equal(result.parsedOutput.lines.length, 2)
  assert.equal(result.parsedOutput.lines[0].c, null)
  assert.equal(result.parsedOutput.lines[0].u, true)
  assert.equal(result.providerResponseId, 'req-1')
  assert.equal(result.rateLimitHeaders['x-ratelimit-remaining'], '9')
  assert.equal(result.rawProviderResponseHash.length, 64)
})

test('Mistral errors preserve raw response and redact credentials', async () => {
  process.env.MISTRAL_API_KEY = 'secret-test-key'
  const result = await invokeMistralOcr({ imagePath: crop, fetchImpl: async () => fakeResponse({ error: { message: 'bad key Bearer secret-test-key' } }, 401, { 'x-request-id': 'req-401' }) })
  assert.equal(result.failureClassification, 'authentication_failure')
  assert.equal(result.providerResponseId, 'req-401')
  assert.match(result.rawProviderResponse, /bad key/)
  assert.doesNotMatch(JSON.stringify(result), /secret-test-key/)
})

test('Mistral timeout is classified safely', async () => {
  process.env.MISTRAL_API_KEY = 'secret-test-key'
  const result = await invokeMistralOcr({ imagePath: crop, timeoutMs: 5, fetchImpl: async (_url, init) => await new Promise((resolve, reject) => init.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e) })) })
  assert.equal(result.failureClassification, 'request_timeout')
  assert.equal(result.rawProviderResponseHash, '')
})

test('OCR markdown is not retained as formatting in line content', () => {
  const result = mapMistralOcrResponse({ pages: [{ markdown: '# arma\n**uir**', blocks: [] }] })
  assert.deepEqual(result.lines.map((line) => line.t), ['arma', 'uir'])
})

test.after(() => {
  if (originalKey) process.env.MISTRAL_API_KEY = originalKey
  else delete process.env.MISTRAL_API_KEY
  fs.rmSync(fixtureDir, { recursive: true, force: true })
})
