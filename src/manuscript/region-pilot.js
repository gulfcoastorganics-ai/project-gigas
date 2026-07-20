import { sha256 } from './source-ingestion.js'

export const regionPolicy = { canonical: false, candidateOnly: true, reviewRequired: true, scholarlyVerified: false, transcriptionStatus: 'machine_candidate', expansionStatus: 'not_attempted', translationStatus: 'not_attempted', approvalStatus: 'unreviewed', adjudicationStatus: 'none', promotionEligible: false }
export function validateRegionBounds(box, width = 2400, height = 4231) { const errors = []; for (const key of ['x', 'y', 'width', 'height']) if (!Number.isInteger(box?.[key]) || box[key] < 0) errors.push(`invalid_${key}`); if (!box?.width || !box?.height || box.x + box.width > width || box.y + box.height > height) errors.push('region_outside_source_bounds'); return errors }
export function buildIiifRegionUrl(service, box, size = '1600,', sourceWidth = null, sourceHeight = null) { const width = sourceWidth || (box.x + box.width > 2400 ? 5900 : 2400); const height = sourceHeight || (box.y + box.height > 4231 ? 10400 : 4231); const errors = validateRegionBounds(box, width, height); if (errors.length) throw new Error(errors.join('; ')); return `${service.replace(/\/$/, '')}/${box.x},${box.y},${box.width},${box.height}/${size}/0/default.jpg` }
export function normalizeRegionCandidate(candidate, context) {
  const forbidden = ['canonical', 'candidateOnly', 'reviewRequired', 'scholarlyVerified', 'transcriptionStatus', 'expansionStatus', 'translationStatus', 'approvalStatus', 'adjudicationStatus', 'promotionEligible', 'english', 'translation', 'expandedLatin']
  const assertions = Object.fromEntries(forbidden.filter((key) => Object.hasOwn(candidate || {}, key)).map((key) => [key, candidate[key]]))
  const findings = Object.keys(assertions).map((field) => ({ field, issue: 'forbidden_provider_assertion', value: assertions[field] }))
  const value = candidate && typeof candidate === 'object' ? { ...candidate } : {}
  for (const key of forbidden) delete value[key]
  const errors = []
  if (!value.regionAssessment || typeof value.regionAssessment.containsVisibleText !== 'boolean') errors.push('invalid_regionAssessment')
  if (!Array.isArray(value.lines)) errors.push('lines_must_be_array')
  const lineIds = new Set()
  for (const [index, line] of (value.lines || []).entries()) {
    if (!line.lineId || lineIds.has(line.lineId)) errors.push('duplicate_or_missing_line_id')
    lineIds.add(line.lineId)
    if (line.sequence !== index) errors.push('line_sequence_not_stable')
    if (!line.illegible && !String(line.diplomaticLatin || '').trim()) errors.push(`empty_reading_line_${index}`)
    if (!Number.isFinite(line.confidence) || line.confidence < 0 || line.confidence > 1) errors.push(`invalid_confidence_line_${index}`)
    if (line.uncertainTokens && !Array.isArray(line.uncertainTokens)) errors.push(`invalid_uncertain_tokens_line_${index}`)
  }
  const text = JSON.stringify(value)
  if (/\b(the|and|of|with|translation|english)\b/i.test(text)) findings.push({ issue: 'possible_english_content', reviewRequired: true })
  return { candidate: { ...value, ...regionPolicy, sourceId: context.sourceId, sourcePage: context.sourcePage, regionId: context.regionId }, findings, errors }
}

export function requestIntegrity({ originalHash, regionHash, transmittedHash, payloadHash, bytes, mime, dimensions, box }) {
  return { originalImageSha256: originalHash, regionImageSha256: regionHash, transmittedImageSha256: transmittedHash, requestPayloadHash: payloadHash, transmittedBytes: bytes, transmittedMime: mime, transmittedDimensions: dimensions, cropCoordinates: box, decodedDataUrlSha256: transmittedHash, valid: Boolean(originalHash && regionHash && regionHash === transmittedHash && payloadHash && bytes > 0 && mime === 'image/jpeg') }
}

export function regionCandidateHash(candidate) { return sha256(Buffer.from(JSON.stringify(candidate))) }
