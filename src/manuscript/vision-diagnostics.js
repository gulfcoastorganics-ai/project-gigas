import fs from 'node:fs'
import { sha256, imageDimensions, mediaType } from './source-ingestion.js'

export function validateImagePayload({ buffer, mime, dimensions, expectedHash = null, requireDimensions = true } = {}) {
  const errors = []
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) errors.push('empty_image_payload')
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) errors.push('unsupported_image_mime')
  if (requireDimensions && (!dimensions?.width || !dimensions?.height)) errors.push('missing_image_dimensions')
  if (buffer && expectedHash && sha256(buffer) !== expectedHash) errors.push('transmitted_hash_mismatch')
  return { valid: errors.length === 0, errors, sha256: buffer?.length ? sha256(buffer) : '', byteCount: buffer?.length || 0 }
}

export function verifyDataUrl(dataUrl, expectedMime, expectedHash) {
  const prefix = `data:${expectedMime};base64,`
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith(prefix)) return { valid: false, errors: ['incorrect_data_url_prefix'] }
  const encoded = dataUrl.slice(prefix.length)
  if (!encoded) return { valid: false, errors: ['empty_data_url_payload'] }
  let buffer
  try { buffer = Buffer.from(encoded, 'base64') } catch { return { valid: false, errors: ['invalid_base64'] } }
  const result = validateImagePayload({ buffer, mime: expectedMime, expectedHash, requireDimensions: false })
  if (buffer.toString('base64') !== encoded.replace(/\s/g, '')) result.errors.push('invalid_base64')
  return { ...result, valid: result.errors.length === 0, buffer }
}

export function verifyImageFile(file, expectedHash = null) {
  const buffer = fs.readFileSync(file)
  const mime = mediaType(file)
  const dimensions = imageDimensions(buffer, mime)
  return { file, mime, dimensions, ...validateImagePayload({ buffer, mime, dimensions, expectedHash }) }
}

export function cropCoordinates(width, height) {
  const bands = [
    ['top', 0, 0.30],
    ['upper-middle', 0.20, 0.55],
    ['lower-middle', 0.45, 0.80],
    ['bottom', 0.70, 1]
  ]
  return bands.map(([identity, y, end]) => ({ identity, x: 0, y: Math.round(height * y), width, height: Math.round(height * (end - y)) }))
}

export function validateCrop(crop, width, height) {
  return Number.isInteger(crop.x) && Number.isInteger(crop.y) && Number.isInteger(crop.width) && Number.isInteger(crop.height) && crop.x >= 0 && crop.y >= 0 && crop.width > 0 && crop.height > 0 && crop.x + crop.width <= width && crop.y + crop.height <= height
}

export function applicationPolicy(candidate, sourceContext) {
  const forbidden = ['canonical', 'candidateOnly', 'blocked', 'reviewRequired', 'scholarlyVerified', 'approvalStatus', 'adjudicationStatus', 'canonicalPromotionEligibility']
  const assertions = {}
  for (const key of forbidden) if (candidate && Object.hasOwn(candidate, key)) assertions[key] = candidate[key]
  const findings = Object.entries(assertions).filter(([key, value]) => {
    const expected = { canonical: false, candidateOnly: true, blocked: true, reviewRequired: true, scholarlyVerified: false }[key]
    return expected !== undefined && value !== expected
  }).map(([field, value]) => ({ field, value, issue: 'forbidden_provider_policy_assertion' }))
  return {
    assertions,
    findings,
    trusted: { canonical: false, candidateOnly: true, blocked: true, reviewRequired: true, scholarlyVerified: false, sourceId: sourceContext.sourceId, sourcePage: sourceContext.sourcePage }
  }
}

export function confidenceAssessment(candidate) {
  const lines = Array.isArray(candidate?.lines) ? candidate.lines.length : 0
  const regions = Array.isArray(candidate?.regions) ? candidate.regions.length : 0
  const visible = candidate?.sourceAssessment?.visibleManuscriptText === true
  const modelConfidence = Number.isFinite(candidate?.overallConfidence) ? candidate.overallConfidence : null
  const warnings = []
  if (lines === 0 && modelConfidence === 1) warnings.push('zero_lines_perfect_confidence')
  if (!visible) warnings.push('visible_text_is_unresolved_hypothesis')
  return {
    imageUsabilityConfidence: visible ? 0.5 : 0.5,
    visibleTextConfidence: visible ? 0.5 : 0.5,
    layoutConfidence: regions ? 0.5 : 0,
    transcriptionConfidence: lines ? Math.min(modelConfidence ?? 0, 0.99) : 0,
    overallCandidateConfidence: lines ? Math.min(modelConfidence ?? 0, 0.99) : 0,
    modelReportedOverallConfidence: modelConfidence,
    warnings
  }
}

export function visibleTextDisagreement(primary, independent) {
  const a = primary?.sourceAssessment?.visibleManuscriptText
  const b = independent?.sourceAssessment?.visibleManuscriptText
  if (typeof a !== 'boolean' || typeof b !== 'boolean' || a === b) return null
  return { issue: 'visible_text_disagreement', primaryAssessment: a, independentAssessment: b, resolution: 'unresolved', reviewRequired: true }
}
