import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { root, sha256, parseArgs } from '../src/manuscript/source-ingestion.js'
import { atomicJson, storageSnapshot } from '../src/manuscript/batch-pipeline.js'
import { invokeTextModel, readTextProviderConfig } from '../src/manuscript/text-provider.js'
import { loadTranslationSource, contextualChunks, productionTranslationPrompt, normalizeTranslationChunk, coverage, translationPolicy, translationQualityWarnings, missingTranslationSourceLines, mergeRecoveredTranslationRecords, attachTerminalDisposition, segmentGate } from '../src/manuscript/translation-pipeline.js'

const args = parseArgs(process.argv.slice(2)); const pagesArg = String(args.pages || '30-99'); const pagesMatch = pagesArg.match(/^(\d+)-(\d+)$/); if (!pagesMatch) throw new Error('translation_production_range_invalid'); const requestedPages = [Number(pagesMatch[1]), Number(pagesMatch[2])]; if (requestedPages[0] < 1 || requestedPages[1] > 629 || requestedPages[0] > requestedPages[1]) throw new Error('translation_production_range_invalid')
function discoverSegmentSpecs([from, to]) {
  const productionRoot = path.join(root, 'data/candidates/production-jobs'); const manifests = fs.existsSync(productionRoot) ? fs.readdirSync(productionRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).flatMap((entry) => { const file = path.join(productionRoot, entry.name, 'production-job.json'); if (!fs.existsSync(file)) return []; try { return [{ record: JSON.parse(fs.readFileSync(file, 'utf8')) }] } catch { return [] } }) : []
  const batchesRoot = path.join(root, 'data/candidates/batches'); const batches = fs.existsSync(batchesRoot) ? fs.readdirSync(batchesRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).flatMap((entry) => { const file = path.join(batchesRoot, entry.name, 'job.json'); if (!fs.existsSync(file)) return []; try { return [JSON.parse(fs.readFileSync(file, 'utf8'))] } catch { return [] } }) : []
  const specs = []
  for (let start = from; start <= to; start += 10) {
    const end = Math.min(start + 9, to); const label = `${start}-${end}`; const matches = manifests.flatMap(({ record }) => (record.segments || []).filter((segment) => segment.label === label && segment.jobId).map((segment) => ({ segment, record }))).sort((a, b) => String(b.record.updatedAt || b.record.createdAt).localeCompare(String(a.record.updatedAt || a.record.createdAt))); const selected = matches.find(({ segment }) => ['completed', 'completed_partial', 'partial'].includes(segment.state))
    if (selected) { specs.push({ label, from: start, to: end, sourceJobId: selected.segment.jobId, sourceProductionId: selected.record.productionId }); continue }
    const batch = batches.filter((job) => job.pagesRequested?.[0] === start && job.pagesRequested?.at(-1) === end && ['completed', 'partial'].includes(job.state)).sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))[0]
    if (!batch) throw new Error(`missing_transcription_production_segment:${label}`)
    specs.push({ label, from: start, to: end, sourceJobId: batch.jobId, sourceProductionId: `legacy-batch:${batch.jobId}` })
  }
  return specs
}
const segmentSpecs = discoverSegmentSpecs(requestedPages); const sourceProductionIds = [...new Set(segmentSpecs.map((segment) => segment.sourceProductionId))]
const productionId = args['production-job'] || `translation-production-${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`; const base = path.join(root, 'data/candidates/translation-production', productionId); const productionFile = path.join(base, 'production-job.json'); const exportBase = path.join(root, 'exports/translation-production', productionId); const publicBase = path.join(root, 'public/translation-production', productionId)
fs.mkdirSync(base, { recursive: true }); fs.mkdirSync(exportBase, { recursive: true }); fs.mkdirSync(publicBase, { recursive: true })

// Use text provider config to support multiple providers including OpenRouter
const textProviderConfig = readTextProviderConfig()
const primary = { provider: textProviderConfig.provider, model: textProviderConfig.model, apiKeyEnv: textProviderConfig.apiKeyEnv, apiKey: textProviderConfig.apiKey, timeoutMs: textProviderConfig.timeoutMs, maxOutputTokens: textProviderConfig.maxOutputTokens }
if (!primary.apiKey) throw new Error('translation_credentials_missing')

let production = fs.existsSync(productionFile) ? JSON.parse(fs.readFileSync(productionFile, 'utf8')) : { schemaVersion: '1.0', productionId, sourceProductionIds, pages: requestedPages, state: 'prepared', primaryProvider: primary.provider, primaryModel: primary.model, secondaryProvider: null, secondaryModel: null, createdAt: new Date().toISOString(), requestCount: 0, retryCount: 0, providerSwitches: 0, segments: segmentSpecs.map((spec) => ({ ...spec, segmentId: `${productionId}-${spec.label}`, state: 'queued', coverage: null })), ...translationPolicy }
if (production.pages?.[0] !== requestedPages[0] || production.pages?.[1] !== requestedPages[1]) throw new Error('translation_resume_range_mismatch')
production.primaryProvider = primary.provider; production.primaryModel = primary.model; production.secondaryProvider = null; production.secondaryModel = null; production.providerMode = 'text_provider'; production.retryCount ||= 0
const saveProduction = () => { production.updatedAt = new Date().toISOString(); atomicJson(productionFile, production); atomicJson(path.join(root, 'data/candidates/translation-production/latest.json'), { productionId, path: path.relative(root, productionFile), canonical: false }) }
function finalizeOrphanedAttempts(directory) {
  if (!fs.existsSync(directory)) return 0
  let finalized = 0
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name)
      if (entry.isDirectory()) walk(entryPath)
      else if (entry.name === 'request.json') {
        const attemptDir = path.dirname(entryPath); const resultFile = path.join(attemptDir, 'provider-result.json'); if (fs.existsSync(resultFile)) continue
        const request = JSON.parse(fs.readFileSync(entryPath, 'utf8')); const rawFile = path.join(attemptDir, 'raw-response.txt'); if (!fs.existsSync(rawFile)) fs.writeFileSync(rawFile, '')
        atomicJson(resultFile, { provider: request.provider, requestedModel: request.model, actualModel: null, requestId: request.requestId, startedAt: request.createdAt, finishedAt: new Date().toISOString(), status: 'blocked', failureClassification: 'interrupted_before_response', httpStatus: null, providerResponseId: null, rawProviderResponseHash: '', safeError: { name: 'InterruptedAttempt', message: 'Process ended before a provider response artifact was persisted.' }, canonical: false })
        finalized++
      }
    }
  }
  walk(directory); return finalized
}
production.orphanedAttemptsFinalized = (production.orphanedAttemptsFinalized || 0) + finalizeOrphanedAttempts(path.join(base, 'segments'))
saveProduction()

const acceptedSegmentStates = new Set(['completed', 'completed_partial', 'exception'])
const retryableFailures = new Set(['request_timeout', 'rate_limited', 'transport_failure', 'provider_error', 'server_error'])

function readPageLines(file) {
  if (!fs.existsSync(file)) return null
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (Array.isArray(data)) return data
  if (data && Array.isArray(data.lines)) return data.lines
  return []
}
function readPageDocument(file) {
  if (!fs.existsSync(file)) return null
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return null }
}
function segmentLines(segment) {
  const dir = path.join(base, 'segments', segment.segmentId)
  if (!fs.existsSync(dir)) return []
  const lines = []
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name)
      if (entry.name === 'page-translation.json') {
        const pageLines = readPageLines(entryPath)
        if (pageLines?.length) lines.push(...pageLines)
      } else if (entry.isDirectory()) walk(entryPath)
    }
  }
  walk(dir)
  return lines
}
function writePage(file, source, records, segmentId) {
  const dir = path.dirname(file)
  fs.mkdirSync(dir, { recursive: true })
  const existing = readPageDocument(file)
  const existingSpans = existing && !Array.isArray(existing) ? (existing.spans || []) : []
  const pageCoverage = coverage(records)
  const payload = {
    schemaVersion: '1.0',
    productionId,
    segmentId,
    source: {
      page: source.page,
      sourceId: source.sourceId,
      canvasId: source.canvasId,
      folioLabel: source.folioLabel,
      image: source.image,
      sourceCandidatePath: source.sourceCandidatePath,
      sourceCandidateSha256: source.sourceCandidateSha256,
      sourceWarnings: source.sourceWarnings || [],
      failedRegions: source.failedRegions || []
    },
    lines: records,
    spans: existingSpans,
    coverage: pageCoverage,
    machineWarning: 'UNVERIFIED MACHINE TRANSCRIPTION AND TRANSLATION — NOT A SCHOLARLY EDITION',
    ...translationPolicy
  }
  atomicJson(file, payload)
  return records
}
function runSpanRecoveryOnce(segment, existingSegmentDir) {
  if (segment.spanRecovery) return
  const aggregate = coverage(segmentLines(segment))
  if (aggregate.dispositionCoveragePercentage < 100) return
  const recoveryScript = path.join(root, 'scripts/recover-translation-spans.mjs')
  if (!fs.existsSync(recoveryScript)) return
  segment.spanRecoveryAttempted = true; segment.spanRecoveryStartedAt = new Date().toISOString(); saveProduction()
  const result = spawnSync('node', [recoveryScript, `--segment=${segment.label}`, `--production-job=${productionId}`], { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: process.env })
  segment.spanRecoveryProcess = { attemptedAt: new Date().toISOString(), exitCode: result.status, stdoutHash: sha256(Buffer.from(result.stdout || '')), stderrHash: sha256(Buffer.from(result.stderr || '')), signal: result.signal }
  if (result.status === 0) {
    const recoveryDir = path.join(existingSegmentDir, 'span-recovery')
    const summaryFile = fs.existsSync(path.join(recoveryDir, 'span-recovery-v1', 'recovery-summary.json'))
      ? path.join(recoveryDir, 'span-recovery-v1', 'recovery-summary.json')
      : path.join(recoveryDir, 'recovery.json')
    if (fs.existsSync(summaryFile)) {
      const recovery = JSON.parse(fs.readFileSync(summaryFile, 'utf8'))
      segment.spanRecovery = { recoveryId: recovery.recoveryId || 'span-recovery-v1', refinement: recovery.refinement, spansConstructed: recovery.spansConstructed, spansTranslated: recovery.spansTranslated, linesCovered: recovery.linesCovered, cumulativeSpansTranslated: recovery.cumulativeSpansTranslated, cumulativeLinesCovered: recovery.cumulativeLinesCovered, requestCount: recovery.requestCount, retryCount: recovery.retryCount, failures: recovery.failures, updatedAt: new Date().toISOString() }
    } else {
      segment.spanRecovery = { recoveryId: 'span-recovery-v1', exitCode: 0, updatedAt: new Date().toISOString() }
    }
  } else {
    // Mark attempted so we do not loop forever; gate still decides terminal state.
    segment.spanRecovery = { recoveryId: 'span-recovery-failed', failed: true, exitCode: result.status, stderrTail: String(result.stderr || result.stdout || '').slice(-500), updatedAt: new Date().toISOString() }
  }
  const recoveryLines = segmentLines(segment); const recoveryGate = segmentGate(recoveryLines, { recoveryAttempted: true, systemicProviderFailure: Boolean(segment.systemicProviderFailure) })
  segment.coverage = recoveryGate.coverage; segment.gate = recoveryGate; segment.state = recoveryGate.state; saveProduction()
}

for (const segment of production.segments) {
  const existingSegmentDir = path.join(base, 'segments', segment.segmentId); const existingSources = loadTranslationSource(segment.sourceJobId, Array.from({ length: segment.to - segment.from + 1 }, (_, index) => segment.from + index)); const existingLines = segmentLines(segment); if (existingLines.length) { const existingGate = segmentGate(existingLines, { recoveryAttempted: Boolean(segment.spanRecoveryAttempted || segment.spanRecovery), systemicProviderFailure: Boolean(segment.systemicProviderFailure) }); segment.coverage = existingGate.coverage; segment.gate = existingGate; segment.state = existingGate.state; saveProduction() }
  if (acceptedSegmentStates.has(segment.state)) continue
  segment.state = 'translating'; saveProduction()

  for (const source of existingSources) {
    const pageDir = path.join(existingSegmentDir, `pages/page-${String(source.page).padStart(4, '0')}`); const file = path.join(pageDir, 'page-translation.json')
    const existingRecords = readPageLines(file)
    let records = existingRecords || source.lines.map((line) => ({ sourceLineId: line.sourceLineId, page: line.page, column: line.column, regionIds: line.regionIds, sequence: line.sequence, diplomaticLatin: line.diplomaticLatin, expandedLatin: '', literalEnglish: '', readableEnglish: '', sourceConfidence: line.sourceConfidence, expansionConfidence: 0, translationConfidence: 0, uncertain: line.sourceUncertain, warnings: [...line.sourceWarnings], terminalDisposition: null, intentionallyUntranslated: false, attemptHistory: [] }))

    // Never retransmit completed or intentionally disposed lines; only incomplete work.
    const missing = records.filter((record) => !record.terminalDisposition && !record.readableEnglish && !record.literalEnglish && !record.intentionallyUntranslated).map((record) => source.lines.find((line) => line.sourceLineId === record.sourceLineId)).filter(Boolean)
    
    if (!missing.length) { records = writePage(file, source, records, segment.segmentId); segment.lastCheckpointAt = new Date().toISOString(); saveProduction(); continue }

    const delayMs = Number(args['delay-ms'] || 1000)
    const retryDelays = [5000]

    for (const group of contextualChunks(missing, Number(args['chunk-size'] || 50), 2)) {
      const contextIds = new Set(group.targets.map((line) => line.sourceLineId)); const firstIndex = source.lines.findIndex((line) => line.sourceLineId === group.targets[0].sourceLineId); const lastIndex = source.lines.findIndex((line) => line.sourceLineId === group.targets.at(-1).sourceLineId); const context = source.lines.slice(Math.max(0, firstIndex - 2), Math.min(source.lines.length, lastIndex + 3)).filter((line) => !contextIds.has(line.sourceLineId)); const key = sha256(Buffer.from(group.targets.map((line) => line.sourceLineId).join('\n'))).slice(0, 12); const chunkDir = path.join(pageDir, `chunks/chunk-${key}`); fs.mkdirSync(chunkDir, { recursive: true }); const attemptsRoot = path.join(chunkDir, 'attempts'); fs.mkdirSync(attemptsRoot, { recursive: true }); const prompt = productionTranslationPrompt(group.targets, context); const promptHash = sha256(Buffer.from(prompt)); const targetIds = new Set(group.targets.map((target) => target.sourceLineId))

      for (let retry = 0; retry <= retryDelays.length; retry++) {
        const attemptNumber = fs.readdirSync(attemptsRoot).length + 1; const attemptDir = path.join(attemptsRoot, `attempt-${String(attemptNumber).padStart(2, '0')}-${primary.provider}`); fs.mkdirSync(attemptDir); const requestId = `${productionId}-${source.page}-${key}-${primary.provider}-${attemptNumber}`; atomicJson(path.join(attemptDir, 'request.json'), { requestId, provider: primary.provider, model: primary.model, sourcePage: source.page, targetSourceLineIds: group.targets.map((line) => line.sourceLineId), contextSourceLineIds: context.map((line) => line.sourceLineId), promptHash, retryNumber: retry, createdAt: new Date().toISOString(), credentialsPersisted: false, canonical: false }); production.requestCount++; if (retry) production.retryCount++; segment.state = 'translating'; segment.activePage = source.page; segment.activeChunk = key; saveProduction()

        const response = await invokeTextModel({ prompt, requestId, config: primary }); fs.writeFileSync(path.join(attemptDir, 'raw-response.txt'), response.rawProviderResponse || ''); atomicJson(path.join(attemptDir, 'provider-result.json'), { ...response, rawProviderResponse: undefined, providerEnvelope: undefined, assistantContent: undefined, retryNumber: retry })

        const history = { provider: primary.provider, model: response.actualModel || primary.model, requestId, providerResponseId: response.providerResponseId || null, rawResponseHash: response.rawProviderResponseHash || '', promptHash, status: response.status, failureClassification: response.failureClassification || null, retryNumber: retry, attemptedAt: response.startedAt, durationMs: response.durationMs }
        if (response.status === 'completed' && response.parsedOutput) { const normalized = normalizeTranslationChunk(response.parsedOutput, group.targets); records = mergeRecoveredTranslationRecords(records, normalized.records, history); records = writePage(file, source, records, segment.segmentId); segment.lastCheckpointAt = new Date().toISOString(); saveProduction(); break }
        const retryable = retryableFailures.has(response.failureClassification); const exhausted = !retryable || retry === retryDelays.length
        records = records.map((record) => targetIds.has(record.sourceLineId) ? { ...attachTerminalDisposition(record, { failureClassification: response.failureClassification || 'failed_terminal', retryExhausted: retryable && exhausted, queuedForRetry: retryable && !exhausted }), attemptHistory: [...(record.attemptHistory || []), history] } : record); records = writePage(file, source, records, segment.segmentId); segment.lastCheckpointAt = new Date().toISOString(); saveProduction()
        if (exhausted) break
        await new Promise((resolve) => setTimeout(resolve, retryDelays[retry]))
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
    records = writePage(file, source, records, segment.segmentId)
  }

  const allLines = segmentLines(segment); const gate = segmentGate(allLines); segment.coverage = gate.coverage; segment.gate = gate; segment.state = gate.state; saveProduction()

  if (!acceptedSegmentStates.has(segment.state) && args['span-recovery'] !== 'skip') {
    runSpanRecoveryOnce(segment, existingSegmentDir)
  }

  const allLinesForCoverage = segmentLines(segment); segment.coverage = coverage(allLinesForCoverage); production.coverage = coverage(production.segments.flatMap((s) => segmentLines(s))); saveProduction()
  
  if (segment.state === 'completed') { const exportDir = path.join(exportBase, segment.label); fs.mkdirSync(exportDir, { recursive: true }); fs.writeFileSync(path.join(exportDir, 'segment.json'), JSON.stringify({ segment, lines: allLinesForCoverage }, null, 2) + '\n'); atomicJson(path.join(publicBase, segment.label, 'coverage.json'), { segment: segment.label, sourceLatinLines: segment.coverage.sourceLatinLines, translationCoveragePercentage: segment.coverage.translationCoveragePercentage, dispositions: segment.coverage.dispositions }) }
}

production.state = production.segments.every((s) => acceptedSegmentStates.has(s.state)) ? 'completed' : 'completed_with_exceptions'
production.finishedAt = new Date().toISOString()
saveProduction()

console.log(`Translation Production Complete: ${productionId}`)
console.log(`  Pages: ${production.pages[0]}-${production.pages[1]}`)
console.log(`  State: ${production.state}`)
console.log(`  Requests: ${production.requestCount}`)
console.log(`  Coverage: ${production.coverage.translationCoveragePercentage.toFixed(1)}%`)
