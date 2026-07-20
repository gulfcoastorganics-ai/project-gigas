import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { productionSegments, productionSegmentsForRange, productionPolicy, mistralEnvironment, usableRegionRate } from '../src/manuscript/production-job.js'

test('production job is split into seven ten-page segments', () => { assert.deepEqual(productionSegments, [[30, 39], [40, 49], [50, 59], [60, 69], [70, 79], [80, 89], [90, 99]]); assert.equal(productionPolicy.concurrency, 1) })
test('Mistral environment removes stale Gemini and generic model settings', () => { const env = mistralEnvironment({ GIGAS_VISION_MODEL: 'gemini-3-flash-preview', GIGAS_GEMINI_THINKING_LEVEL: 'minimal', GIGAS_MISTRAL_OCR_MODEL: 'mistral-ocr-4-0' }); assert.equal(env.GIGAS_VISION_PROVIDER, 'mistral-ocr'); assert.equal(env.GIGAS_MISTRAL_OCR_MODEL, 'mistral-ocr-4-0'); assert.equal(env.GIGAS_VISION_MODEL, undefined); assert.equal(env.GIGAS_GEMINI_THINKING_LEVEL, undefined) })
test('incompatible Mistral model is rejected', () => { assert.throws(() => mistralEnvironment({ GIGAS_MISTRAL_OCR_MODEL: 'gemini-3-flash-preview' }), /incompatible_mistral_ocr_model/) })
test('usable region gate is deterministic', () => { assert.equal(usableRegionRate({ pages: [{ regions: [{ state: 'completed' }, { state: 'failed' }] }] }), .5) })
test('production ranges are split into ten-page segments', () => { assert.deepEqual(productionSegmentsForRange(100, 199), Array.from({ length: 10 }, (_, i) => [100 + i * 10, 109 + i * 10])) })
test('production policy separates segment and overall continuation gates', () => { assert.equal(productionPolicy.minimumUsableRegionRate, .85); assert.equal(productionPolicy.minimumOverallUsableRegionRate, .9) })
test('production OCR avoids a redundant semantic triage request on the dedicated OCR route', () => { const controller = fs.readFileSync('scripts/transcribe-production.mjs', 'utf8'); const worker = fs.readFileSync('scripts/transcribe-batch.mjs', 'utf8'); assert.match(controller, /GIGAS_DETERMINISTIC_PAGE_SEGMENTATION: '1'/); assert.match(worker, /deterministic_two_column_production_v1/); assert.match(worker, /text presence is determined from verified crop OCR results/) })
