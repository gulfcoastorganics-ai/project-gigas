import nodeTest from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { resolveCandidatePage } from '../src/manuscript/external-source.js'
import { createPagePreview } from '../src/manuscript/first-page-runtime.js'
import { invokeVisionModel, invokeVisionModelSafe } from '../src/manuscript/vision-provider-runtime.js'
import { sha256 } from '../src/manuscript/source-ingestion.js'

const test = (name, options, handler) => typeof options === 'function' ? nodeTest(name, { concurrency: false }, options) : nodeTest(name, { concurrency: false, ...options }, handler)

const sourceId = 'external-459e4da71e7fd69d189a8196c9d9a9beb03026e4bbbdce06b37dec39a74981a0'
const sourceRoot = path.join(process.cwd(), 'data/candidates/external-sources', sourceId)
const sourceReceiptPath = path.join(sourceRoot, 'source-receipt.json')
const candidateSelectionPath = path.join(sourceRoot, 'candidate-page-selection.json')
const externalCorpusReady = fs.existsSync(sourceReceiptPath) && fs.existsSync(candidateSelectionPath)
const externalCorpusOptions = { skip: externalCorpusReady ? false : 'external manuscript corpus receipt/selection is not present in this checkout' }

test('candidate page resolver rejects a wrong source and automatically repairs a wrong page', externalCorpusOptions, () => {
  assert.throws(() => resolveCandidatePage('external-d8f10668664574fbfb498c4387cb01a8df3ae03cf7cfaa5b7085826c22ee4880', 1))
  const repaired = resolveCandidatePage(sourceId, 2)
  assert.equal(repaired.page, 2)
})

test('preview is generated from the resolved source page', externalCorpusOptions, () => {
  const result = createPagePreview(sourceId, 1)
  assert.equal(result.preview.sourceId, sourceId)
  assert.ok(fs.existsSync(result.preview.previewPath))
  assert.equal(result.preview.sha256, result.imageHash)
})

test('page reselection regenerates page 2 and page 100 records', externalCorpusOptions, () => {
  const page2 = resolveCandidatePage(sourceId, 2)
  assert.equal(page2.sourceId, sourceId)
  assert.equal(page2.page, 2)
  const page100 = resolveCandidatePage(sourceId, 100)
  assert.equal(page100.sourceId, sourceId)
  assert.equal(page100.page, 100)
})

test('provider failure preserves response body and classifies authentication errors', async () => {
  const old = { provider: process.env.GIGAS_VISION_PROVIDER, model: process.env.GIGAS_VISION_MODEL, key: process.env.GIGAS_VISION_API_KEY, retries: process.env.GIGAS_VISION_MAX_RETRIES, refresh: process.env.GIGAS_VISION_CAPABILITY_REFRESH }
  process.env.GIGAS_VISION_PROVIDER = 'openrouter'
  process.env.GIGAS_VISION_MODEL = 'openrouter/vision-test'
  process.env.GIGAS_VISION_API_KEY = 'test-secret'
  process.env.GIGAS_VISION_MAX_RETRIES = '0'
  process.env.GIGAS_VISION_CAPABILITY_REFRESH = '1'
  const oldFetch = globalThis.fetch
  globalThis.fetch = async (url) => url.endsWith('/models') ? new Response(JSON.stringify({ data: [{ id: 'openrouter/vision-test', architecture: { input_modalities: ['text', 'image'] } }] }), { status: 200 }) : new Response('unauthorized-body', { status: 401, headers: { 'x-request-id': 'request-test' } })
  const imagePath = path.join(process.cwd(), 'public/folios/real/002r.jpg')
  const result = await invokeVisionModel({ imagePath, expectedImageHash: sha256(fs.readFileSync(imagePath)), prompt: 'test', requestId: 'stabilization-test' })
  globalThis.fetch = oldFetch
  assert.equal(result.failureClassification, 'authentication_failure')
  assert.equal(result.rawResponse, 'unauthorized-body')
  assert.equal(result.responseId, 'request-test')
  Object.assign(process.env, { GIGAS_VISION_PROVIDER: old.provider, GIGAS_VISION_MODEL: old.model, GIGAS_VISION_API_KEY: old.key, GIGAS_VISION_MAX_RETRIES: old.retries, GIGAS_VISION_CAPABILITY_REFRESH: old.refresh })
})

test('JP2 is converted locally and OpenRouter receives PNG bytes', externalCorpusOptions, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gigas-jp2-decoder-'))
  const decoder = path.join(dir, 'decoder.mjs')
  fs.writeFileSync(decoder, 'import fs from "node:fs"; const out=process.argv[process.argv.indexOf("--output")+1]; const b=Buffer.alloc(124); Buffer.from([137,80,78,71,13,10,26,10]).copy(b); b.writeUInt32BE(120,16); b.writeUInt32BE(120,20); fs.writeFileSync(out,b)\n')
  const old = { decoder: process.env.GIGAS_JP2_DECODER, script: process.env.GIGAS_JP2_DECODER_SCRIPT, provider: process.env.GIGAS_VISION_PROVIDER, model: process.env.GIGAS_VISION_MODEL, key: process.env.GIGAS_VISION_API_KEY, retries: process.env.GIGAS_VISION_MAX_RETRIES, refresh: process.env.GIGAS_VISION_CAPABILITY_REFRESH }
  process.env.GIGAS_JP2_DECODER = process.execPath
  process.env.GIGAS_JP2_DECODER_SCRIPT = decoder
  process.env.GIGAS_VISION_PROVIDER = 'openrouter'
  process.env.GIGAS_VISION_MODEL = 'openrouter/vision-compatible'
  process.env.GIGAS_VISION_API_KEY = 'test-secret'
  process.env.GIGAS_VISION_MAX_RETRIES = '0'
  process.env.GIGAS_VISION_CAPABILITY_REFRESH = '1'
  const oldFetch = globalThis.fetch
  let payload
  globalThis.fetch = async (url, init) => {
    if (url.endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: 'openrouter/vision-compatible', architecture: { input_modalities: ['text', 'image'] } }] }), { status: 200 })
    payload = JSON.parse(init.body)
    return new Response(JSON.stringify({ id: 'png-test', model: 'openrouter/vision-compatible', choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200 })
  }
  const jp2 = path.join(process.cwd(), 'data/candidates/folio-images', sourceId, 'folio-source-page-0100.jp2')
  const expected = JSON.parse(fs.readFileSync(candidateSelectionPath, 'utf8')).imageSha256
  const result = await invokeVisionModelSafe({ imagePath: jp2, expectedImageHash: expected, prompt: 'test', requestId: 'png-test' })
  globalThis.fetch = oldFetch
  assert.equal(result.status, 'completed')
  assert.equal(result.originalImageMime, 'image/jp2')
  assert.equal(result.transmittedImageMime, 'image/png')
  assert.notEqual(result.originalImageHash, result.transmittedImageHash)
  assert.match(payload.messages[0].content[1].image_url.url, /^data:image\/png;base64,/)
  Object.assign(process.env, { GIGAS_JP2_DECODER: old.decoder, GIGAS_JP2_DECODER_SCRIPT: old.script, GIGAS_VISION_PROVIDER: old.provider, GIGAS_VISION_MODEL: old.model, GIGAS_VISION_API_KEY: old.key, GIGAS_VISION_MAX_RETRIES: old.retries, GIGAS_VISION_CAPABILITY_REFRESH: old.refresh })
})
