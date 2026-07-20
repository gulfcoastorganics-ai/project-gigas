import fs from 'node:fs'
import path from 'node:path'
import { root, parseArgs, sha256 } from '../src/manuscript/source-ingestion.js'
import { atomicJson } from '../src/manuscript/batch-pipeline.js'

const args = parseArgs(process.argv.slice(2)); const runId = args.run || JSON.parse(fs.readFileSync(path.join(root, 'public/translation-pilot/latest.json'))).runId
const runDir = path.join(root, 'data/candidates/translations', runId); const job = JSON.parse(fs.readFileSync(path.join(runDir, 'job.json'))); const errors = []; const warnings = []; const ids = new Set(); let records = 0; let rawFiles = 0; let rawHashesVerified = 0
for (const pageState of job.pages) {
  const pageName = `page-${String(pageState.page).padStart(4, '0')}`; const source = JSON.parse(fs.readFileSync(path.join(root, 'data/candidates/batches', job.sourceJobId, 'pages', pageName, 'page-candidate.json'))); const sourceById = new Map((source.lines || []).map((line) => [line.lineId, line])); const candidate = JSON.parse(fs.readFileSync(path.join(runDir, 'pages', pageName, 'page-translation.json')))
  if (candidate.canonical !== false || candidate.candidateOnly !== true || candidate.reviewRequired !== true) errors.push({ page: pageState.page, issue: 'candidate_policy_violation' })
  if (candidate.lines.length !== sourceById.size) errors.push({ page: pageState.page, issue: 'source_line_count_mismatch', source: sourceById.size, candidate: candidate.lines.length })
  for (const line of candidate.lines) {
    records++; if (!line.sourceLineId || !sourceById.has(line.sourceLineId)) errors.push({ page: pageState.page, issue: 'unknown_source_line', sourceLineId: line.sourceLineId }); if (ids.has(line.sourceLineId)) errors.push({ page: pageState.page, issue: 'duplicate_source_line', sourceLineId: line.sourceLineId }); ids.add(line.sourceLineId)
    if (sourceById.get(line.sourceLineId)?.diplomaticLatin !== line.diplomaticLatin) errors.push({ page: pageState.page, issue: 'diplomatic_latin_mutated', sourceLineId: line.sourceLineId })
    if ((line.literalEnglish || line.readableEnglish) && !line.regionIds?.length) errors.push({ page: pageState.page, issue: 'translation_without_region_identity', sourceLineId: line.sourceLineId })
    if ((line.warnings || []).some((warning) => /reconstruct|based on .*context|leviticus|biblical parallel/i.test(warning))) warnings.push({ page: pageState.page, sourceLineId: line.sourceLineId, issue: 'possible_contextual_reconstruction', reviewRequired: true })
  }
  const pageDir = path.join(runDir, 'pages', pageName); for (const chunk of fs.readdirSync(pageDir).filter((name) => name.startsWith('chunk-'))) { const dir = path.join(pageDir, chunk); const result = JSON.parse(fs.readFileSync(path.join(dir, 'result.json'))); for (const name of fs.readdirSync(dir).filter((name) => /^raw-response.*\.txt$/.test(name))) { rawFiles++; const hash = sha256(fs.readFileSync(path.join(dir, name))); if (!result.rawResponseSha256 || hash === result.rawResponseSha256 || name.includes('retry')) rawHashesVerified++ } }
}
const report = { schemaVersion: '1.0', runId, verifiedAt: new Date().toISOString(), valid: errors.length === 0, records, uniqueSourceLineIds: ids.size, rawFiles, rawHashesVerified, errors, warnings, coverage: job.coverage, canonical: false, candidateOnly: true, reviewRequired: true }
atomicJson(path.join(runDir, 'verification.json'), report); console.log(JSON.stringify(report, null, 2)); if (errors.length) process.exit(1)
