import { createHash } from 'node:crypto'

const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const letters = /\p{L}/gu
const words = /[\p{L}\p{M}\p{N}]+/gu
const terminalPunctuation = /[.!?;:]\s*$/u
const abbreviationPattern = /(?:&|\b[pq]\b|q:|q;|\w+[qꝑꝓꝯ]$|[¯̃])/giu

export function lineEvidence(line, neighbors = { before: [], after: [] }) {
  const text = String(line.diplomaticLatin || '').trim(); const nonspace = text.replace(/\s/g, ''); const alphabetic = (text.match(letters) || []).length; const tokens = text.toLowerCase().match(words) || []; const uniqueRatio = tokens.length ? new Set(tokens).size / tokens.length : 0; const abbreviationIndicators = text.match(abbreviationPattern) || []; const warnings = [...(line.sourceWarnings || []), ...(line.warnings || [])].map(String)
  return { characterLength: text.length, alphabeticCharacterRatio: nonspace.length ? Number((alphabetic / nonspace.length).toFixed(3)) : 0, latinTokenIndicators: tokens.filter((token) => /(?:us|um|am|is|it|nt|re|ri|ae|ibus|que|q)$/u.test(token)).length, punctuationBoundary: terminalPunctuation.test(text), abbreviationIndicators, beginsMidSentence: Boolean(text && /^\p{Ll}/u.test(text)), endsMidSentence: Boolean(text && !terminalPunctuation.test(text)), neighboringBeforeIds: neighbors.before.map((item) => item.sourceLineId), neighboringAfterIds: neighbors.after.map((item) => item.sourceLineId), warnings, tokenCount: tokens.length, uniqueTokenRatio: Number(uniqueRatio.toFixed(3)) }
}

export function classifyUntranslatedLine(line, neighbors = { before: [], after: [] }) {
  const evidence = lineEvidence(line, neighbors); const text = String(line.diplomaticLatin || '').trim(); const warningText = evidence.warnings.join(' '); let revisedClassification; let rationale
  if (!text || evidence.alphabeticCharacterRatio < 0.15) { revisedClassification = 'nontext'; rationale = 'No meaningful alphabetic source content.' }
  else if (/source_illegible|illegible/i.test(warningText)) { revisedClassification = 'illegible'; rationale = 'The preserved source record explicitly marks the reading illegible.' }
  else if (evidence.tokenCount >= 10 && evidence.uniqueTokenRatio < 0.25) { revisedClassification = 'genuinely_corrupt'; rationale = 'The OCR contains pathological token repetition independent of grammatical context.' }
  else if (line.terminalDisposition === 'source_duplicate' && neighbors.before.some((item) => normalizeLatin(item.diplomaticLatin) === normalizeLatin(text))) { revisedClassification = 'duplicate'; rationale = 'The exact normalized reading duplicates an adjacent physical line.' }
  else if (/rubric|heading/i.test(warningText) || (/^[\p{Lu}\s.]+$/u.test(text) && text.length < 45)) { revisedClassification = 'heading_or_rubric'; rationale = 'Source warnings or short display-text form indicate a heading/rubric.' }
  else if (/marginal/i.test(warningText)) { revisedClassification = 'marginal_text'; rationale = 'The source record identifies marginal text.' }
  else if (evidence.abbreviationIndicators.length >= 2) { revisedClassification = 'abbreviation_heavy'; rationale = 'Alphabetic content is substantial but contains multiple abbreviation indicators.' }
  else if (evidence.beginsMidSentence || evidence.endsMidSentence || evidence.characterLength < 35) { revisedClassification = 'context_dependent_fragment'; rationale = 'The physical line is a sentence fragment whose syntax may cross neighboring lines.' }
  else if (evidence.alphabeticCharacterRatio >= 0.65) { revisedClassification = 'independently_translatable'; rationale = 'The line has substantial alphabetic content and a plausible independent boundary.' }
  else if (evidence.alphabeticCharacterRatio < 0.4) { revisedClassification = 'genuinely_corrupt'; rationale = 'Low alphabetic content remains unusable even with local context.' }
  else { revisedClassification = 'human_review_required'; rationale = 'Evidence is mixed and does not justify automatic translation.' }
  return { sourceLineId: line.sourceLineId, page: line.page, column: line.column, regionIds: line.regionIds || [], diplomaticLatin: line.diplomaticLatin, originalDisposition: line.terminalDisposition || null, providerRejectionReason: line.dispositionReason || '', revisedClassification, rationale, evidence, reviewRequired: true, canonical: false }
}

export function normalizeLatin(value) { return String(value || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim() }

const eligible = new Set(['context_dependent_fragment', 'abbreviation_heavy', 'heading_or_rubric', 'marginal_text', 'independently_translatable'])
export function buildTranslationSpans(lines, classifications, { maxLines = 12, contextLines = 2 } = {}) {
  const classificationById = new Map(classifications.map((item) => [item.sourceLineId, item])); const spans = []; let current = []
  const flush = () => { if (!current.length) return; const first = current[0]; const last = current.at(-1); const sourceLineIds = current.map((line) => line.sourceLineId); const start = lines.findIndex((line) => line.sourceLineId === first.sourceLineId); const end = lines.findIndex((line) => line.sourceLineId === last.sourceLineId); const before = lines.slice(Math.max(0, start - contextLines), start).filter((line) => line.page === first.page && line.column === first.column); const after = lines.slice(end + 1, end + 1 + contextLines).filter((line) => line.page === first.page && line.column === first.column); const joined = current.map((line, index) => `[L${index + 1}] ${line.diplomaticLatin}`).join('\n'); const spanId = `span-${String(first.page).padStart(4, '0')}-${first.column}-${sha256(sourceLineIds.join('\n')).slice(0, 12)}`; spans.push({ spanId, page: first.page, column: first.column, sourceLineIds, exactDiplomaticLines: current.map((line) => line.diplomaticLatin), diplomaticLatinWithBoundaries: joined, neighboringContextIds: [...before, ...after].map((line) => line.sourceLineId), neighboringContext: [...before, ...after].map((line) => line.diplomaticLatin), regionIds: [...new Set(current.flatMap((line) => line.regionIds || []))], sourceWarnings: [...new Set(current.flatMap((line) => line.sourceWarnings || []))], constructionRationale: 'Contiguous untranslated physical lines in one page/column with compatible reading order; line boundaries retained as [L#].', canonical: false, reviewRequired: true }); current = [] }
  for (const line of lines) { const classification = classificationById.get(line.sourceLineId); const canUse = classification && eligible.has(classification.revisedClassification) && !line.literalEnglish && !line.readableEnglish && !line.coveredBySpanId; const previous = current.at(-1); const contiguous = !previous || (previous.page === line.page && previous.column === line.column && Number(line.sequence) >= Number(previous.sequence)); if (!canUse || !contiguous || current.length >= maxLines) flush(); if (canUse) { if (current.length && (classification.revisedClassification === 'heading_or_rubric' || terminalPunctuation.test(previous.diplomaticLatin))) flush(); current.push(line); if (classification.revisedClassification === 'heading_or_rubric' || terminalPunctuation.test(line.diplomaticLatin) || current.length >= maxLines) flush() } }
  flush(); return spans
}

export function spanTranslationPrompt(span) {
  return `Translate one bounded span of unverified medieval-Latin OCR as a grammatical unit. Return JSON only as {"spanId":"${span.spanId}","expandedLatin":"","literalEnglish":"","readableEnglish":"","sourceUsable":true,"uncertain":false,"warnings":[]}. Preserve spanId exactly. Use only the supplied Latin. Do not identify or reconstruct a known biblical or historical passage. Do not add omitted names, clauses, commentary, or teachings. Preserve uncertainty and expand abbreviations cautiously. If the span remains unintelligible, set sourceUsable:false and leave all three text fields empty. Do not claim word-by-word mapping where syntax crosses physical lines. Physical line boundaries are marked [L#]. Context is not a translation target. Context: ${JSON.stringify(span.neighboringContext)}. Span: ${JSON.stringify(span.diplomaticLatinWithBoundaries)}`
}

const englishHint = /\b(the|and|of|to|in|that|with|for|was|is|are|from|his|her|their|shall|made|said|he|she|they|we|you|may|have|had|will|were)\b/i
export function validateSpanTranslation(raw, span) {
  const findings = []; if (!raw || typeof raw !== 'object') return { valid: false, findings: [{ issue: 'span_response_missing' }], candidate: null }
  if (raw.spanId !== span.spanId) findings.push({ issue: 'span_id_mismatch', expected: span.spanId, actual: raw.spanId })
  const expandedLatin = typeof raw.expandedLatin === 'string' ? raw.expandedLatin.trim() : ''; const literalEnglish = typeof raw.literalEnglish === 'string' ? raw.literalEnglish.trim() : ''; const readableEnglish = typeof raw.readableEnglish === 'string' ? raw.readableEnglish.trim() : ''; const sourceUsable = raw.sourceUsable === true
  if (sourceUsable && (!expandedLatin || !literalEnglish || !readableEnglish)) findings.push({ issue: 'usable_span_missing_layer' })
  if ((literalEnglish && !englishHint.test(literalEnglish)) || (readableEnglish && !englishHint.test(readableEnglish))) findings.push({ issue: 'english_validation_failed' })
  if (`${literalEnglish} ${readableEnglish}`.split(/\s+/).length > span.diplomaticLatinWithBoundaries.split(/\s+/).length * 5 + 30) findings.push({ issue: 'translation_length_implausible' })
  if (/\b(?:this passage|the bible|scripture says|according to)\b/i.test(`${literalEnglish} ${readableEnglish}`)) findings.push({ issue: 'unsupported_reconstruction' })
  if (literalEnglish && readableEnglish && normalizeLatin(literalEnglish) === normalizeLatin(readableEnglish)) findings.push({ issue: 'literal_and_readable_identical', warning: true })
  const fatal = findings.some((item) => !item.warning); const candidate = { spanId: span.spanId, sourceLineIds: span.sourceLineIds, expandedLatin, literalEnglish, readableEnglish, sourceUsable, uncertain: Boolean(raw.uncertain), warnings: [...new Set([...(Array.isArray(raw.warnings) ? raw.warnings.map(String) : []), ...findings.map((item) => item.issue)])], translationStatus: sourceUsable && !fatal ? 'machine_candidate' : 'not_translated', canonical: false, candidateOnly: true, reviewRequired: true, scholarlyVerified: false, promotionEligible: false }
  return { valid: sourceUsable && !fatal, findings, candidate }
}

export function applySpanCoverage(lines, spanCandidate) {
  const ids = new Set(spanCandidate.sourceLineIds); return lines.map((line) => ids.has(line.sourceLineId) ? { ...line, preSpanDisposition: line.preSpanDisposition || line.terminalDisposition || null, preSpanDispositionReason: line.preSpanDispositionReason || line.dispositionReason || '', coveredBySpanId: spanCandidate.spanId, translationCoverage: 'covered_by_span', independentLineTranslation: null, spanTranslationValid: true, terminalDisposition: 'translated', intentionallyUntranslated: false, retryExhausted: false, queuedForRetry: false, dispositionReason: 'covered by validated span translation', reviewRequired: true } : line)
}
