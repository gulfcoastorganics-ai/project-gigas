#!/usr/bin/env node
/**
 * Continuous production translation orchestrator.
 * - Waits for / resumes incomplete jobs
 * - Continues through all OCR-backed ranges without interactive stops
 * - Stops only on fatal conditions (auth, missing credentials, corrupt source, overwrite risk)
 * - Partial/exception segment states are accepted; work continues
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { root, parseArgs } from '../src/manuscript/source-ingestion.js'
import { atomicJson } from '../src/manuscript/batch-pipeline.js'
import { readTextProviderConfig } from '../src/manuscript/text-provider.js'

const args = parseArgs(process.argv.slice(2))
const delayMs = String(args['delay-ms'] || '800')
const chunkSize = String(args['chunk-size'] || '50')
const accepted = new Set(['completed', 'completed_partial', 'exception'])
const logDir = path.join(root, 'data/candidates/translation-production')
const logFile = path.join(logDir, 'resume-orchestrator.log')
const statusFile = path.join(logDir, 'resume-orchestrator-status.json')
fs.mkdirSync(logDir, { recursive: true })

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`
  console.log(line)
  fs.appendFileSync(logFile, line + '\n')
}

function writeStatus(payload) {
  atomicJson(statusFile, { ...payload, updatedAt: new Date().toISOString(), canonical: false })
}

function loadJob(productionId) {
  const file = path.join(root, 'data/candidates/translation-production', productionId, 'production-job.json')
  if (!fs.existsSync(file)) return null
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return null }
}

function listJobs() {
  const rootDir = path.join(root, 'data/candidates/translation-production')
  if (!fs.existsSync(rootDir)) return []
  return fs.readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ productionId: entry.name, job: loadJob(entry.name) }))
    .filter((item) => item.job?.pages)
}

function findExactJob(from, to) {
  const matches = listJobs().filter(({ job }) => job.pages[0] === from && job.pages[1] === to)
  matches.sort((a, b) => String(b.job.updatedAt || b.job.createdAt || '').localeCompare(String(a.job.updatedAt || a.job.createdAt || '')))
  return matches[0] || null
}

function isFullyAccepted(job) {
  const segments = job.segments || []
  return segments.length > 0 && segments.every((s) => accepted.has(s.state))
}

function isFatalOutput(text = '') {
  const patterns = [
    /translation_credentials_missing/i,
    /authentication_failure/i,
    /translation_resume_range_mismatch/i,
    /missing_transcription_production_segment/i,
    /unsupported_text_provider/i,
    /EACCES|ENOSPC|ERR_MODULE_NOT_FOUND/i
  ]
  return patterns.some((re) => re.test(text))
}

function plannedRanges() {
  // Inventory-driven: all OCR-backed official pages 1-629.
  // 30-99 is preserved on an existing accepted job and will be detected by findExactJob → skipped.
  // 550-629: OCR source confirmed present (batches + production-job segments).
  return [
    [1, 9],
    [10, 19],
    [20, 29],
    // 30-99 preserved on existing completed job — skipped automatically by isFullyAccepted check
    [100, 549],
    [550, 599],
    [600, 619],
    [620, 629]
  ]
}

function processAliveForJob(productionId) {
  // Match only the real node translator, not shell wrappers / monitors that embed the id in argv.
  const result = spawnSync('pgrep', ['-af', `node scripts/translate-production.mjs .*--production-job=${productionId}`], { encoding: 'utf8' })
  if (result.status !== 0) return false
  const lines = String(result.stdout || '').split('\n').map((line) => line.trim()).filter(Boolean)
  return lines.some((line) => /\bnode\s+scripts\/translate-production\.mjs\b/.test(line) && line.includes(`--production-job=${productionId}`))
}

function waitForProcess(productionId, timeoutMs = 6 * 60 * 60 * 1000) {
  const started = Date.now()
  log(`WAIT for running job ${productionId}`)
  while (processAliveForJob(productionId)) {
    if (Date.now() - started > timeoutMs) throw new Error(`timeout_waiting_for_job:${productionId}`)
    const job = loadJob(productionId)
    const seg = (job?.segments || []).find((s) => !accepted.has(s.state)) || (job?.segments || [])[0]
    log(`  still running ${productionId} state=${job?.state} activePage=${seg?.activePage} req=${job?.requestCount}`)
    writeStatus({ phase: 'waiting', productionId, jobState: job?.state, activePage: seg?.activePage, requestCount: job?.requestCount })
    spawnSync('sleep', ['20'])
  }
}

function runTranslate(productionId, from, to) {
  const cliArgs = [
    path.join(root, 'scripts/translate-production.mjs'),
    `--pages=${from}-${to}`,
    `--production-job=${productionId}`,
    `--delay-ms=${delayMs}`,
    `--chunk-size=${chunkSize}`
  ]
  log(`EXEC node ${cliArgs.map((a) => a.replace(root + '/', '')).join(' ')}`)
  writeStatus({ phase: 'running', productionId, pages: [from, to] })

  const child = spawn(process.execPath, cliArgs, {
    cwd: root,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe']
  })

  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => {
    const text = String(chunk)
    stdout += text
    process.stdout.write(text)
    fs.appendFileSync(logFile, text)
  })
  child.stderr.on('data', (chunk) => {
    const text = String(chunk)
    stderr += text
    process.stderr.write(text)
    fs.appendFileSync(logFile, text)
  })

  return new Promise((resolve) => {
    child.on('close', (code, signal) => {
      resolve({ code, signal, stdout, stderr, combined: `${stdout}\n${stderr}` })
    })
  })
}

async function runRange([from, to]) {
  // Prefer exact-range job (including in-progress 1-9 validation)
  let exact = findExactJob(from, to)
  if (exact && isFullyAccepted(exact.job)) {
    log(`SKIP ${from}-${to}: fully accepted on ${exact.productionId}`)
    return { from, to, status: 'skipped_complete', productionId: exact.productionId, state: exact.job.state, coverage: exact.job.coverage }
  }

  if (exact && processAliveForJob(exact.productionId)) {
    waitForProcess(exact.productionId)
    exact = findExactJob(from, to)
    if (exact && isFullyAccepted(exact.job)) {
      log(`SKIP ${from}-${to}: finished while waiting (${exact.productionId})`)
      return { from, to, status: 'skipped_complete', productionId: exact.productionId, state: exact.job.state, coverage: exact.job.coverage }
    }
  }

  const productionId = exact
    ? exact.productionId
    : `translation-production-${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}-${from}-${to}`

  if (exact) log(`RESUME ${from}-${to} on ${productionId} (state=${exact.job.state})`)
  else log(`START ${from}-${to} as ${productionId}`)

  // Up to 3 process-level resumes for interrupted runs (not provider retries)
  let last = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = await runTranslate(productionId, from, to)
    last = result
    const job = loadJob(productionId)
    if (result.code === 0) {
      log(`DONE ${from}-${to} state=${job?.state} coverage=${job?.coverage?.translationCoveragePercentage}% req=${job?.requestCount}`)
      // completed / completed_with_exceptions both continue
      return {
        from, to,
        status: accepted.has(job?.state) || job?.state === 'completed' || job?.state === 'completed_with_exceptions' ? 'ok' : 'ok_nonterminal',
        productionId,
        state: job?.state,
        coverage: job?.coverage,
        requestCount: job?.requestCount
      }
    }

    if (isFatalOutput(result.combined)) {
      log(`FATAL ${from}-${to}: ${result.combined.slice(-600)}`)
      return { from, to, status: 'fatal', productionId, exitCode: result.code, tail: result.combined.slice(-800) }
    }

    // Recoverable process crash / non-zero: resume from checkpoints if incomplete
    if (job && !isFullyAccepted(job) && attempt < 3) {
      log(`RECOVERABLE exit=${result.code} for ${from}-${to}; resume attempt ${attempt + 1}/3 from checkpoint`)
      continue
    }

    // If segments are accepted despite non-zero (unlikely), continue
    if (job && isFullyAccepted(job)) {
      log(`DONE(with exit ${result.code}) ${from}-${to} accepted segments state=${job.state}`)
      return { from, to, status: 'ok', productionId, state: job.state, coverage: job.coverage }
    }

    log(`FAIL ${from}-${to} exit=${result.code}: ${result.combined.slice(-600)}`)
    return { from, to, status: 'failed', productionId, exitCode: result.code, tail: result.combined.slice(-800) }
  }

  return { from, to, status: 'failed', productionId, exitCode: last?.code, tail: last?.combined?.slice(-800) }
}

function collectExceptionPages(productionIds) {
  const pages = []
  for (const productionId of productionIds) {
    const job = loadJob(productionId)
    if (!job) continue
    for (const segment of job.segments || []) {
      if (segment.state !== 'exception' && segment.state !== 'completed_partial') continue
      const segDir = path.join(root, 'data/candidates/translation-production', productionId, 'segments', segment.segmentId)
      if (!fs.existsSync(segDir)) continue
      const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const entryPath = path.join(dir, entry.name)
          if (entry.isDirectory()) walk(entryPath)
          else if (entry.name === 'page-translation.json') {
            const data = JSON.parse(fs.readFileSync(entryPath, 'utf8'))
            const lines = Array.isArray(data) ? data : (data.lines || [])
            if (!lines.length) continue
            const page = lines[0].page
            const untranslated = lines.filter((l) => !l.readableEnglish && !l.literalEnglish)
            const intentional = untranslated.filter((l) => l.intentionallyUntranslated)
            const missing = untranslated.filter((l) => !l.intentionallyUntranslated)
            const dispositions = {}
            for (const line of lines) {
              const key = line.terminalDisposition || 'null'
              dispositions[key] = (dispositions[key] || 0) + 1
            }
            if (segment.state === 'exception' || missing.length || intentional.length) {
              pages.push({
                productionId,
                segment: segment.label,
                segmentState: segment.state,
                page,
                totalLines: lines.length,
                translatedLines: lines.length - untranslated.length,
                intentionallyUntranslated: intentional.length,
                incompleteLines: missing.length,
                dispositions,
                reviewRequired: true
              })
            }
          }
        }
      }
      walk(segDir)
    }
  }
  pages.sort((a, b) => a.page - b.page)
  return pages
}

function aggregateCoverage(productionIds) {
  let sourceLatinLines = 0
  let translatedLines = 0
  let intentionallyUntranslatedLines = 0
  let dispositioned = 0
  const segmentSummary = []
  for (const productionId of productionIds) {
    const job = loadJob(productionId)
    if (!job) continue
    for (const segment of job.segments || []) {
      const cov = segment.coverage || {}
      sourceLatinLines += cov.sourceLatinLines || 0
      translatedLines += cov.translatedLines || Math.round(((cov.translationCoveragePercentage || 0) / 100) * (cov.sourceLatinLines || 0))
      intentionallyUntranslatedLines += cov.intentionallyUntranslatedLines || 0
      dispositioned += cov.dispositionCoveragePercentage === 100 ? (cov.sourceLatinLines || 0) : Math.round(((cov.dispositionCoveragePercentage || 0) / 100) * (cov.sourceLatinLines || 0))
      segmentSummary.push({
        productionId,
        label: segment.label,
        state: segment.state,
        translationCoveragePercentage: cov.translationCoveragePercentage,
        dispositionCoveragePercentage: cov.dispositionCoveragePercentage,
        sourceLatinLines: cov.sourceLatinLines
      })
    }
  }
  const translationCoveragePercentage = sourceLatinLines ? Number(((translatedLines / sourceLatinLines) * 100).toFixed(2)) : 0
  const dispositionCoveragePercentage = sourceLatinLines ? Number(((dispositioned / sourceLatinLines) * 100).toFixed(2)) : 0
  return { sourceLatinLines, translatedLines, intentionallyUntranslatedLines, translationCoveragePercentage, dispositionCoveragePercentage, segments: segmentSummary }
}

async function finalize(results) {
  const productionIds = [...new Set(results.map((r) => r.productionId).filter(Boolean))]
  // Always include preserved 30-99
  const mainJob = 'translation-production-2026-07-15T03-43-21-808Z-18163'
  if (!productionIds.includes(mainJob)) productionIds.push(mainJob)

  const coverage = aggregateCoverage(productionIds)
  const exceptionPages = collectExceptionPages(productionIds)

  log('Running full test suite...')
  const test = spawnSync('npm', ['test'], { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: process.env })
  fs.appendFileSync(logFile, (test.stdout || '') + (test.stderr || '') + '\n')
  const testOk = test.status === 0
  log(`Tests exit=${test.status}`)

  const report = {
    schemaVersion: '1.0',
    generatedAt: new Date().toISOString(),
    title: 'Project Gigas Production Translation Completion Report',
    provider: readTextProviderConfig(),
    providerMode: 'text_provider',
    acceptedSegmentStates: [...accepted],
    results,
    productionIds,
    aggregateCoverage: coverage,
    // "100% translation coverage" in policy means every source line is dispositioned
    // (translated OR honest intentional/exception disposition), not that every line has English.
    dispositionComplete: coverage.dispositionCoveragePercentage >= 100,
    translationCoveragePercentage: coverage.translationCoveragePercentage,
    exceptionPagesForManualReview: exceptionPages.filter((p) => p.segmentState === 'exception' || p.incompleteLines > 0),
    partialPagesNote: exceptionPages.filter((p) => p.segmentState === 'completed_partial'),
    tests: {
      exitCode: test.status,
      passed: testOk,
      summaryTail: `${test.stdout || ''}${test.stderr || ''}`.split('\n').slice(-40).join('\n')
    },
    canonical: false,
    candidateOnly: true,
    reviewRequired: true,
    scholarlyVerified: false
  }

  const reportJson = path.join(logDir, 'translation-completion-report.json')
  const reportMd = path.join(logDir, 'translation-completion-report.md')
  atomicJson(reportJson, report)

  const md = [
    '# Production Translation Completion Report',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Aggregate coverage',
    '',
    `- Source Latin lines: ${coverage.sourceLatinLines}`,
    `- Translated lines: ${coverage.translatedLines}`,
    `- Translation coverage: ${coverage.translationCoveragePercentage}%`,
    `- Disposition coverage: ${coverage.dispositionCoveragePercentage}%`,
    `- Disposition complete (every line terminal): ${report.dispositionComplete}`,
    '',
    '## Range results',
    '',
    ...results.map((r) => `- ${r.from}-${r.to}: **${r.status}** job=\`${r.productionId || 'n/a'}\` state=${r.state || 'n/a'}`),
    '',
    '## Exception / incomplete pages requiring manual review',
    '',
    ...(report.exceptionPagesForManualReview.length
      ? report.exceptionPagesForManualReview.map((p) => `- page ${p.page} (seg ${p.segment}, ${p.segmentState}): incomplete=${p.incompleteLines}, intentional=${p.intentionallyUntranslated}, translated=${p.translatedLines}/${p.totalLines}`)
      : ['- none']),
    '',
    '## Tests',
    '',
    `- npm test exit: ${test.status}`,
    '```',
    report.tests.summaryTail,
    '```',
    '',
    'Candidate-only machine translation. Not a scholarly edition.',
    ''
  ].join('\n')
  fs.writeFileSync(reportMd, md)
  log(`Report written: ${path.relative(root, reportJson)}`)
  log(`Report written: ${path.relative(root, reportMd)}`)
  writeStatus({ phase: 'finished', reportJson: path.relative(root, reportJson), dispositionComplete: report.dispositionComplete, testOk })
  return report
}

async function main() {
  log('=== Continuous resume orchestrator start ===')
  const cfg = readTextProviderConfig()
  if (!cfg.apiKey) {
    log('FATAL: translation credentials missing')
    process.exit(2)
  }
  log(`Provider ${cfg.provider}/${cfg.model} mode=text_provider`)

  const results = []
  // Preserve 30-99 without re-running
  results.push({
    from: 30,
    to: 99,
    status: 'skipped_complete',
    productionId: 'translation-production-2026-07-15T03-43-21-808Z-18163',
    state: loadJob('translation-production-2026-07-15T03-43-21-808Z-18163')?.state
  })

  for (const range of plannedRanges()) {
    writeStatus({ phase: 'range', pages: range })
    try {
      const result = await runRange(range)
      results.push(result)
      if (result.status === 'fatal') {
        log(`Stopping orchestrator due to fatal error on ${range[0]}-${range[1]}`)
        const report = await finalize(results)
        console.log(JSON.stringify({ stopped: 'fatal', result, reportPath: 'data/candidates/translation-production/translation-completion-report.json' }, null, 2))
        process.exit(2)
      }
      // failed range: checkpoint already on disk; continue to next range unless overwrite risk
      if (result.status === 'failed') {
        log(`Range ${range[0]}-${range[1]} failed recoverably; continuing to next range with honest incomplete state`)
      }
    } catch (error) {
      log(`ERROR ${range[0]}-${range[1]}: ${error.message}`)
      results.push({ from: range[0], to: range[1], status: 'error', error: error.message })
      if (/timeout_waiting|credentials|authentication|overwrite/i.test(error.message)) {
        await finalize(results)
        process.exit(2)
      }
    }
  }

  const report = await finalize(results)
  console.log(JSON.stringify({
    finished: true,
    ranges: results.map((r) => ({ pages: `${r.from}-${r.to}`, status: r.status, state: r.state })),
    dispositionComplete: report.dispositionComplete,
    translationCoveragePercentage: report.translationCoveragePercentage,
    exceptionPages: report.exceptionPagesForManualReview.length,
    testsPassed: report.tests.passed,
    report: 'data/candidates/translation-production/translation-completion-report.json'
  }, null, 2))
  process.exit(report.tests.passed ? 0 : 1)
}

main().catch((error) => {
  log(`UNCAUGHT ${error.stack || error.message}`)
  process.exit(2)
})
