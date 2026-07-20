import fs from 'node:fs'
import path from 'node:path'
import { root, sha256 } from './source-ingestion.js'

export const translationPolicy = { canonical: false, candidateOnly: true, reviewRequired: true, scholarlyVerified: false, transcriptionStatus: 'machine_candidate', translationStatus: 'machine_candidate', approvalStatus: 'unreviewed', promotionEligible: false }
export const terminalDispositions = new Set(['translated', 'intentionally_untranslated', 'source_ocr_corrupt', 'source_illegible', 'source_empty', 'source_duplicate', 'translation_rejected', 'human_review_required', 'failed_retryable', 'failed_terminal'])

export function loadTranslationSource(jobId, pages = Array.from({ length: 10 }, (_, i) => i + 20)) {
  return pages.map((page) => {
    const file = path.join(root, 'data/candidates/batches', jobId, `pages/page-${String(page).padStart(4, '0')}/page-candidate.json`)
    const source = JSON.parse(fs.readFileSync(file, 'utf8')); const completed = new Set(source.regions.filter((region) => region.lines?.length).map((region) => region.regionId))
    const seen = new Set(); const lines = []
    for (const line of source.lines || []) {
      const ids = (line.sources || []).filter((id) => completed.has(id)); const text = String(line.diplomaticLatin || '').trim()
      if (!line.lineId || !ids.length || !text || seen.has(line.lineId)) continue
      seen.add(line.lineId); lines.push({ sourceLineId: line.lineId, page, column: line.column, regionIds: ids, sequence: line.sequence, diplomaticLatin: line.diplomaticLatin, sourceConfidence: line.confidence ?? null, sourceUncertain: Boolean(line.reviewRequired || line.illegible || line.uncertainTokens?.length || line.alternatives?.length), sourceWarnings: [...(line.illegible ? ['source_illegible'] : []), ...(line.alternatives?.length ? ['source_reading_alternatives'] : [])] })
    }
    return { page, sourceId: source.sourceId, canvasId: source.canvasId, folioLabel: source.folioLabel || source.image?.folioLabel || null, image: source.image, sourceCandidatePath: path.relative(root, file), sourceCandidateSha256: sha256(fs.readFileSync(file)), sourceWarnings: source.plausibilityWarnings || [], failedRegions: source.failedRegions || [], lines }
  })
}

export function chunks(lines, size = 50) { const result = []; for (let i = 0; i < lines.length; i += size) result.push(lines.slice(i, i + size)); return result }

export function translationPrompt(lines) {
  const input = lines.map((line, index) => ({ k: `L${index + 1}`, latin: line.diplomaticLatin, uncertain: line.sourceUncertain }))
  return `Translate the supplied unverified OCR Latin line by line. Return JSON only as {"translations":[{"k":"L1","x":"expanded Latin","l":"literal English","r":"readable English","ec":0.0,"tc":0.0,"u":false,"w":[]}]}. Preserve every k exactly once. x cautiously expands likely medieval abbreviations without replacing the source; put uncertain expansions in square brackets. l follows Latin grammar and ambiguity closely. r is natural modern English faithful to l. Do not add commentary, teachings, passage identification, or context. Do not invent missing source. If a source is too corrupt to translate, return empty target strings, u:true, and explain briefly in w. Source uncertainty must remain uncertain. Input: ${JSON.stringify(input)}`
}

export function productionTranslationPrompt(targetLines, contextLines = []) {
  const targets = targetLines.map((line, index) => ({ k: `L${index + 1}`, latin: line.diplomaticLatin, uncertain: line.sourceUncertain }))
  const context = contextLines.map((line) => line.diplomaticLatin)
  return `Translate only the designated target lines from unverified medieval-Latin OCR. Context lines help resolve grammar but MUST NOT be emitted as translated records. Return JSON only as {"translations":[{"k":"L1","x":"expanded Latin","l":"literal English","r":"readable English","ec":0.0,"tc":0.0,"u":false,"w":[]}]}. Preserve every target k exactly once. x may cautiously expand visible medieval abbreviations; bracket uncertain expansions and never rewrite the diplomatic source. l follows Latin grammar and ambiguity closely. r is natural English faithful to l. Do not identify or reconstruct a known passage, add context, doctrine, commentary, or missing clauses. If OCR is too corrupt, return empty x/l/r, u:true, and a concise warning. Preserve source uncertainty. Context (not output targets): ${JSON.stringify(context)}. Targets: ${JSON.stringify(targets)}`
}

export function contextualChunks(lines, size = 50, contextCount = 2) {
  const result = []
  for (let start = 0; start < lines.length; start += size) {
    const targets = lines.slice(start, start + size); const before = lines.slice(Math.max(0, start - contextCount), start); const after = lines.slice(start + targets.length, start + targets.length + contextCount)
    result.push({ targets, context: [...before, ...after] })
  }
  return result
}

export function translationQualityWarnings(record) {
  const warnings = [...(record.warnings || [])]; const literal = String(record.literalEnglish || ''); const readable = String(record.readableEnglish || ''); const sourceWords = String(record.diplomaticLatin || '').trim().split(/\s+/).filter(Boolean).length
  if (literal && readable && literal.toLowerCase().replace(/\W+/g, ' ').trim() === readable.toLowerCase().replace(/\W+/g, ' ').trim()) warnings.push('literal_and_readable_identical')
  if (readable.split(/\s+/).filter(Boolean).length > sourceWords * 5 + 12) warnings.push('translation_length_implausible')
  if (warnings.some((warning) => /reconstruct|based on .*context|known passage|biblical parallel/i.test(warning))) warnings.push('contextual_reconstruction_review')
  return [...new Set(warnings)]
}

export function missingTranslationSourceLines(records, sourceLines) { const byId = new Map(sourceLines.map((line) => [line.sourceLineId, line])); return records.filter((line) => (!line.literalEnglish || !line.readableEnglish) && (!terminalDispositions.has(line.terminalDisposition) || (line.terminalDisposition === 'failed_retryable' && !line.retryExhausted && !line.queuedForRetry))).map((line) => byId.get(line.sourceLineId)).filter(Boolean) }

export function dispositionFromUntranslated(record, rejectionReason = '') {
  const source = String(record.diplomaticLatin || ''); const reason = `${rejectionReason} ${(record.warnings || []).join(' ')}`.trim(); const tokens = source.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []; const repeated = tokens.length >= 10 && new Set(tokens).size / tokens.length < 0.25
  if (!source.trim()) return 'source_empty'
  if ((record.sourceWarnings || []).includes('source_illegible') || /illegible|cannot be read/i.test(reason)) return 'source_illegible'
  if (repeated || /ocr (?:corruption|corrupt)|too corrupt|unreadable source|source.*corrupt/i.test(reason)) return 'source_ocr_corrupt'
  if (/duplicate/i.test(reason)) return 'source_duplicate'
  if (/human review/i.test(reason)) return 'human_review_required'
  return 'translation_rejected'
}

export function attachTerminalDisposition(record, { rejectionReason = '', failureClassification = null, retryExhausted = false, queuedForRetry = false } = {}) {
  if (record.literalEnglish && record.readableEnglish) return { ...record, terminalDisposition: 'translated', intentionallyUntranslated: false, retryExhausted: false, queuedForRetry: false }
  if (failureClassification) {
    const retryable = ['transport_failure', 'request_timeout', 'rate_limited', 'provider_error', 'empty_response'].includes(failureClassification)
    return { ...record, terminalDisposition: retryable ? 'failed_retryable' : 'failed_terminal', intentionallyUntranslated: false, retryExhausted: retryable && retryExhausted, queuedForRetry: retryable && queuedForRetry, dispositionReason: failureClassification, reviewRequired: true }
  }
  const terminalDisposition = dispositionFromUntranslated(record, rejectionReason)
  return { ...record, terminalDisposition, intentionallyUntranslated: true, retryExhausted: false, queuedForRetry: false, dispositionReason: rejectionReason || terminalDisposition, reviewRequired: true }
}

export function mergeRecoveredTranslationRecords(records, recoveredRecords, history) {
  const recoveredById = new Map(recoveredRecords.map((line) => [line.sourceLineId, line]))
  return records.map((record) => { const recovered = recoveredById.get(record.sourceLineId); if (!recovered) return record; const merged = { ...recovered, sourceConfidence: record.sourceConfidence, sourceUncertain: record.sourceUncertain, sourceWarnings: record.sourceWarnings, warnings: [...new Set([...(record.warnings || []).filter((warning) => warning !== 'translation_missing'), ...(recovered.warnings || [])])], translationProvider: history.provider, translationModel: history.model, rawResponseHash: history.rawResponseHash, promptHash: history.promptHash, attemptHistory: [...(record.attemptHistory || []), history] }; return attachTerminalDisposition(merged, { rejectionReason: recovered.providerRejectionReason || '' }) })
}

const englishHint = /\b(the|and|of|to|in|that|with|for|was|is|are|from|his|her|their|shall|made|said)\b/i
export function normalizeTranslationChunk(raw, sourceLines) {
  const values = Array.isArray(raw?.translations) ? raw.translations : []; const byKey = new Map(values.map((value) => [value?.k, value])); const findings = []; const records = []
  for (let index = 0; index < sourceLines.length; index++) {
    const source = sourceLines[index]; const key = `L${index + 1}`; const value = byKey.get(key)
    if (!value) { findings.push({ issue: 'missing_translation', sourceLineId: source.sourceLineId }); records.push({ ...source, expandedLatin: '', literalEnglish: '', readableEnglish: '', expansionConfidence: 0, translationConfidence: 0, uncertain: true, warnings: [...source.sourceWarnings, 'translation_missing'], providerRejectionReason: 'provider omitted target line' }); continue }
    const expandedLatin = typeof value.x === 'string' ? value.x.trim() : ''; const literalEnglish = typeof value.l === 'string' ? value.l.trim() : ''; const readableEnglish = typeof value.r === 'string' ? value.r.trim() : ''
    const warnings = [...source.sourceWarnings, ...(Array.isArray(value.w) ? value.w.map(String) : [])]; let uncertain = Boolean(source.sourceUncertain || value.u)
    if (!expandedLatin) warnings.push('expanded_latin_missing')
    if (!literalEnglish || !readableEnglish) { warnings.push('translation_missing'); uncertain = true }
    if ((literalEnglish && !englishHint.test(literalEnglish)) || (readableEnglish && !englishHint.test(readableEnglish))) warnings.push('possible_untranslated_latin')
    const sourceNumbers = source.diplomaticLatin.match(/\b(?:\d+|[xivlcdm]+)\b/gi) || []; if (sourceNumbers.length && !sourceNumbers.some((token) => `${expandedLatin} ${literalEnglish} ${readableEnglish}`.toLowerCase().includes(token.toLowerCase()))) warnings.push('number_traceability_review')
    records.push({ sourceLineId: source.sourceLineId, page: source.page, column: source.column, regionIds: source.regionIds, sequence: source.sequence, diplomaticLatin: source.diplomaticLatin, expandedLatin, literalEnglish, readableEnglish, sourceConfidence: source.sourceConfidence, expansionConfidence: Number.isFinite(Number(value.ec)) ? Math.max(0, Math.min(1, Number(value.ec))) : 0, translationConfidence: Number.isFinite(Number(value.tc)) ? Math.max(0, Math.min(1, Number(value.tc))) : 0, uncertain, warnings: [...new Set(warnings)], providerRejectionReason: !literalEnglish || !readableEnglish ? (Array.isArray(value.w) ? value.w.map(String).join('; ') : 'provider returned no translation') : '' })
  }
  for (const key of byKey.keys()) if (!/^L\d+$/.test(key) || Number(key.slice(1)) < 1 || Number(key.slice(1)) > sourceLines.length) findings.push({ issue: 'invented_source_key', key })
  const ids = records.map((record) => record.sourceLineId); if (new Set(ids).size !== ids.length) findings.push({ issue: 'duplicate_source_line_id' })
  return { records, findings, valid: !findings.some((finding) => finding.issue === 'invented_source_key') }
}

export function coverage(lines) {
  const expanded = lines.filter((line) => line.expandedLatin || line.spanTranslationValid).length; const literal = lines.filter((line) => line.literalEnglish || line.spanTranslationValid).length; const readable = lines.filter((line) => line.readableEnglish || line.spanTranslationValid).length; const translated = lines.filter((line) => (line.literalEnglish && line.readableEnglish) || (line.coveredBySpanId && line.spanTranslationValid)).length; const disposed = lines.filter((line) => terminalDispositions.has(line.terminalDisposition)).length; const byDisposition = {}
  for (const line of lines) { const key = line.terminalDisposition || 'undisposed'; byDisposition[key] = (byDisposition[key] || 0) + 1 }
  return { sourceLatinLines: lines.length, expandedLatinLines: expanded, literalEnglishLines: literal, readableEnglishLines: readable, untranslatedLines: lines.length - translated, intentionallyUntranslatedLines: lines.filter((line) => line.intentionallyUntranslated).length, failedRetryableLines: lines.filter((line) => line.terminalDisposition === 'failed_retryable').length, failedTerminalLines: lines.filter((line) => line.terminalDisposition === 'failed_terminal').length, failedLines: lines.filter((line) => line.terminalDisposition === 'failed_retryable' || line.terminalDisposition === 'failed_terminal').length, translationCoveragePercentage: lines.length ? Number((100 * translated / lines.length).toFixed(2)) : 0, expansionCoveragePercentage: lines.length ? Number((100 * expanded / lines.length).toFixed(2)) : 0, dispositionCoveragePercentage: lines.length ? Number((100 * disposed / lines.length).toFixed(2)) : 0, dispositions: byDisposition }
}

export function segmentGate(lines, { recoveryAttempted = false, systemicProviderFailure = false } = {}) {
  const metrics = coverage(lines); const ids = lines.map((line) => line.sourceLineId); const sourceIdentityValid = ids.every(Boolean) && new Set(ids).size === ids.length; const latinIntegrityValid = lines.every((line) => typeof line.diplomaticLatin === 'string' && line.diplomaticLatin.length > 0); const retryableAccountedFor = lines.filter((line) => line.terminalDisposition === 'failed_retryable').every((line) => line.retryExhausted || line.queuedForRetry); const terminalReasonsComplete = lines.every((line) => line.terminalDisposition && (line.terminalDisposition === 'translated' || line.dispositionReason || line.preSpanDispositionReason || line.providerRejectionReason || line.sourceWarnings?.length || line.warnings?.length))
  const integrityValid = sourceIdentityValid && latinIntegrityValid; let state = 'running'
  if (!integrityValid || metrics.dispositionCoveragePercentage < 100 || systemicProviderFailure || metrics.translationCoveragePercentage < 65) state = 'paused_systemic_failure'
  else if (!retryableAccountedFor) state = 'paused_retryable'
  else if (metrics.translationCoveragePercentage >= 80) state = 'completed'
  else if (metrics.translationCoveragePercentage >= 75 && recoveryAttempted && terminalReasonsComplete) state = 'completed_partial'
  else if (recoveryAttempted) state = 'exception'
  const operationallyComplete = state === 'completed' || state === 'completed_partial'
  return { state, operationallyComplete, partial: state === 'completed_partial', recoveryAttempted, sourceIdentityValid, latinIntegrityValid, terminalReasonsComplete, retryableAccountedFor, coverage: metrics, blockers: [...(metrics.translationCoveragePercentage < 80 ? ['translation_coverage_below_80'] : []), ...(metrics.dispositionCoveragePercentage < 100 ? ['disposition_coverage_below_100'] : []), ...(!sourceIdentityValid ? ['source_identity_invalid'] : []), ...(!latinIntegrityValid ? ['diplomatic_latin_invalid'] : []), ...(!terminalReasonsComplete ? ['terminal_reasons_incomplete'] : []), ...(!retryableAccountedFor ? ['retryable_failures_unaccounted'] : []), ...(systemicProviderFailure ? ['systemic_provider_failure'] : [])] }
}
