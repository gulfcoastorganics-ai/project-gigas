import test from 'node:test'
import assert from 'node:assert/strict'
import { applicationPolicy, confidenceAssessment, cropCoordinates, validateCrop, validateImagePayload, verifyDataUrl } from '../src/manuscript/vision-diagnostics.js'

test('empty and malformed image payloads are rejected', () => {
  assert.equal(validateImagePayload({ buffer: Buffer.alloc(0), mime: 'image/jpeg', dimensions: null }).valid, false)
  assert.equal(validateImagePayload({ buffer: Buffer.from('not-an-image'), mime: 'text/plain', dimensions: { width: 1, height: 1 } }).valid, false)
})

test('data URL must contain image bytes with matching MIME and hash', () => {
  const bytes = Buffer.from('valid-test-bytes')
  const hash = import('../src/manuscript/source-ingestion.js').then(({ sha256 }) => sha256(bytes))
  return hash.then((expected) => {
    const good = verifyDataUrl(`data:image/jpeg;base64,${bytes.toString('base64')}`, 'image/jpeg', expected)
    assert.equal(good.valid, true)
    assert.equal(verifyDataUrl('data:image/png;base64,' + bytes.toString('base64'), 'image/jpeg', expected).valid, false)
    assert.equal(verifyDataUrl('data:image/jpeg;base64,', 'image/jpeg', expected).valid, false)
  })
})

test('policy assertions cannot override application ownership', () => {
  const result = applicationPolicy({ canonical: true, blocked: false, reviewRequired: false }, { sourceId: 's', sourcePage: 10 })
  assert.equal(result.trusted.canonical, false)
  assert.equal(result.trusted.blocked, true)
  assert.equal(result.trusted.reviewRequired, true)
  assert.equal(result.findings.length, 3)
})

test('zero lines never produce perfect transcription confidence', () => {
  const result = confidenceAssessment({ sourceAssessment: { visibleManuscriptText: false }, regions: [], lines: [], overallConfidence: 1 })
  assert.equal(result.transcriptionConfidence, 0)
  assert.ok(result.warnings.includes('zero_lines_perfect_confidence'))
})

test('diagnostic crop coordinates remain within the source image', () => {
  for (const crop of cropCoordinates(2400, 4231)) assert.equal(validateCrop(crop, 2400, 4231), true)
})
