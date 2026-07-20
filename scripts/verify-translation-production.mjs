import fs from 'node:fs'
import path from 'node:path'
import { root, parseArgs, sha256 } from '../src/manuscript/source-ingestion.js'
import { atomicJson } from '../src/manuscript/batch-pipeline.js'

const args = parseArgs(process.argv.slice(2))
const latestFile = path.join(root, 'public/translation-production/latest.json')
const productionId = args.job || args.run || JSON.parse(fs.readFileSync(latestFile, 'utf8')).productionId
const productionDir = path.join(root, 'data/candidates/translation-production', productionId)
const production = JSON.parse(fs.readFileSync(path.join(productionDir, 'production-job.json'), 'utf8'))
const errors = []
const warnings = []
const sourceIds = new Set()
let records = 0
let translated = 0
let rawFiles = 0
let rawHashesVerified = 0
let attemptsWithoutResponseBody = 0
let requestFiles = 0

for (const segment of production.segments || []) {
  const segmentDir = path.join(productionDir, 'segments', segment.segmentId)
  const pagesDir = path.join(segmentDir, 'pages')
  if (!fs.existsSync(pagesDir)) continue
  for (const pageEntry of fs.readdirSync(pagesDir, { withFileTypes: true })) {
    if (!pageEntry.isDirectory()) continue
    const pageDir = path.join(pagesDir, pageEntry.name)
    const candidateFile = path.join(pageDir, 'page-translation.json')
    if (!fs.existsSync(candidateFile)) continue
    const candidate = JSON.parse(fs.readFileSync(candidateFile, 'utf8'))
    const sourcePath = path.join(root, candidate.source.sourceCandidatePath)
    const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'))
    const sourceById = new Map((source.lines || []).map((line) => [line.lineId, line]))
    if (candidate.canonical !== false || candidate.candidateOnly !== true || candidate.reviewRequired !== true || candidate.promotionEligible !== false) {
      errors.push({ page: candidate.source.page, issue: 'candidate_policy_violation' })
    }
    if (candidate.lines.length !== sourceById.size) errors.push({ page: candidate.source.page, issue: 'source_line_count_mismatch', source: sourceById.size, candidate: candidate.lines.length })
    for (const line of candidate.lines) {
      records++
      if (!line.sourceLineId || !sourceById.has(line.sourceLineId)) errors.push({ page: candidate.source.page, issue: 'unknown_source_line', sourceLineId: line.sourceLineId })
      if (sourceIds.has(line.sourceLineId)) errors.push({ page: candidate.source.page, issue: 'duplicate_source_line', sourceLineId: line.sourceLineId })
      sourceIds.add(line.sourceLineId)
      if (sourceById.get(line.sourceLineId)?.diplomaticLatin !== line.diplomaticLatin) errors.push({ page: candidate.source.page, issue: 'diplomatic_latin_mutated', sourceLineId: line.sourceLineId })
      if ((line.literalEnglish && line.readableEnglish) || (line.coveredBySpanId && line.spanTranslationValid)) {
        translated++
        if (!line.regionIds?.length) errors.push({ page: candidate.source.page, issue: 'translation_without_region_identity', sourceLineId: line.sourceLineId })
      }
      if ((line.warnings || []).some((warning) => /reconstruct|based on .*context|biblical parallel/i.test(String(warning)))) warnings.push({ page: candidate.source.page, sourceLineId: line.sourceLineId, issue: 'possible_contextual_reconstruction', reviewRequired: true })
    }
    const spansById = new Map((candidate.spans || []).map((span) => [span.spanId, span]))
    for (const span of candidate.spans || []) { const linked = span.sourceLineIds.map((id) => candidate.lines.find((line) => line.sourceLineId === id)); if (linked.some((line) => !line)) errors.push({ page: candidate.source.page, issue: 'span_unknown_source_line', spanId: span.spanId }); if (linked.some((line) => line && (line.page !== span.page || line.column !== span.column))) errors.push({ page: candidate.source.page, issue: 'span_crosses_page_or_column', spanId: span.spanId }) }
    for (const line of candidate.lines.filter((item) => item.coveredBySpanId)) if (!spansById.has(line.coveredBySpanId)) errors.push({ page: candidate.source.page, issue: 'covered_line_missing_span', sourceLineId: line.sourceLineId, spanId: line.coveredBySpanId })
    const attempts = []
    const walk = (directory) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const entryPath = path.join(directory, entry.name)
        if (entry.isDirectory()) walk(entryPath)
        else if (entry.name === 'provider-result.json') attempts.push(entryPath)
        else if (entry.name === 'request.json') requestFiles++
      }
    }
    walk(pageDir)
    for (const resultFile of attempts) {
      const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'))
      const rawFile = path.join(path.dirname(resultFile), 'raw-response.txt')
      if (!fs.existsSync(rawFile)) {
        errors.push({ page: candidate.source.page, issue: 'raw_response_missing', resultFile: path.relative(root, resultFile) })
        continue
      }
      rawFiles++
      const raw = fs.readFileSync(rawFile)
      if (raw.length === 0 && !result.rawProviderResponseHash) attemptsWithoutResponseBody++
      else if (result.rawProviderResponseHash === sha256(raw)) rawHashesVerified++
      else errors.push({ page: candidate.source.page, issue: 'raw_response_hash_mismatch', resultFile: path.relative(root, resultFile) })
    }
  }
  const recoveryRoot = path.join(segmentDir, 'span-recovery')
  if (fs.existsSync(recoveryRoot)) {
    const attemptResults = []; const walkRecovery = (directory) => { for (const entry of fs.readdirSync(directory, { withFileTypes: true })) { const entryPath = path.join(directory, entry.name); if (entry.isDirectory()) walkRecovery(entryPath); else if (entry.name === 'request.json') requestFiles++; else if (entry.name === 'provider-result.json') attemptResults.push(entryPath) } }; walkRecovery(recoveryRoot)
    for (const resultFile of attemptResults) { const result = JSON.parse(fs.readFileSync(resultFile, 'utf8')); const rawFile = path.join(path.dirname(resultFile), 'raw-response.txt'); if (!fs.existsSync(rawFile)) { errors.push({ issue: 'span_raw_response_missing', resultFile: path.relative(root, resultFile) }); continue } rawFiles++; const raw = fs.readFileSync(rawFile); if (raw.length === 0 && !result.rawProviderResponseHash) attemptsWithoutResponseBody++; else if (result.rawProviderResponseHash === sha256(raw)) rawHashesVerified++; else errors.push({ issue: 'span_raw_response_hash_mismatch', resultFile: path.relative(root, resultFile) }) }
  }
}

const report = {
  schemaVersion: '1.0',
  productionId,
  verifiedAt: new Date().toISOString(),
  valid: errors.length === 0,
  state: production.state,
  records,
  translated,
  uniqueSourceLineIds: sourceIds.size,
  rawFiles,
  requestFiles,
  rawHashesVerified,
  attemptsWithoutResponseBody,
  errors,
  warnings,
  canonical: false,
  candidateOnly: true,
  reviewRequired: true
}
if (requestFiles !== rawFiles) report.errors.push({ issue: 'request_result_count_mismatch', requestFiles, resultFiles: rawFiles })
report.valid = report.errors.length === 0
atomicJson(path.join(productionDir, 'verification.json'), report)
console.log(JSON.stringify(report, null, 2))
if (errors.length) process.exit(1)
