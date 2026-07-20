import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { root, parseArgs } from '../src/manuscript/source-ingestion.js'
import { atomicJson } from '../src/manuscript/batch-pipeline.js'

const args = parseArgs(process.argv.slice(2))
const command = args._?.[0] || args.command || 'list'
const queueDir = path.join(root, 'data/candidates/exceptions')
const queueFile = path.join(queueDir, 'queue.json')
const sourceId = 'external-459e4da71e7fd69d189a8196c9d9a9beb03026e4bbbdce06b37dec39a74981a0'
const jobs = { 59: 'batch-2026-07-14T06-16-22-751Z-27469', 105: 'batch-2026-07-14T07-55-13-447Z-30959' }
const now = () => new Date().toISOString()
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')) }
function collect() {
  const records = []; const previous = fs.existsSync(queueFile) ? readJson(queueFile) : { exceptions: [] }; const previousByRegion = new Map((previous.exceptions || []).map((item) => [item.regionId, item]))
  const jobsByPage = new Map(Object.entries(jobs))
  const batchRoot = path.join(root, 'data/candidates/batches')
  const discovered = []
  for (const jobId of fs.existsSync(batchRoot) ? fs.readdirSync(batchRoot).filter((id) => id.startsWith('batch-')) : []) {
    try {
      const candidate = readJson(path.join(batchRoot, jobId, 'job.json')); discovered.push({ jobId, candidate })
    } catch {}
  }
  discovered.sort((a, b) => String(b.candidate.updatedAt || b.candidate.createdAt).localeCompare(String(a.candidate.updatedAt || a.candidate.createdAt)))
  for (const { jobId, candidate } of discovered) for (const page of candidate.pages || []) if (!jobsByPage.has(String(page.page))) jobsByPage.set(String(page.page), jobId)
  const jobEntries = [...jobsByPage.entries()]
  const seen = new Set()
  for (const [pageText, jobId] of jobEntries) {
    const pageNumber = Number(pageText); const jobRoot = path.join(root, 'data/candidates/batches', jobId)
    const job = readJson(path.join(jobRoot, 'job.json')); const page = job.pages.find((item) => item.page === pageNumber)
    for (const failure of page?.failures || []) {
      const regionId = failure.regionId; if (!regionId) continue; const regionDir = path.join(jobRoot, `pages/page-${String(pageNumber).padStart(4, '0')}/regions`, regionId)
      const regionFile = path.join(regionDir, 'region.json'); if (!fs.existsSync(regionFile)) continue
      const region = readJson(regionFile); const attemptsDir = path.join(regionDir, 'attempts')
      const attempts = fs.existsSync(attemptsDir) ? fs.readdirSync(attemptsDir).sort().map((name) => ({ name, files: fs.readdirSync(path.join(attemptsDir, name)).sort() })) : []
      if (seen.has(regionId)) continue
      seen.add(regionId)
      const prior = previousByRegion.get(regionId); const retryExhausted = pageNumber === 59 || page.regions.find((item) => item.regionId === regionId)?.retryExhausted
      const priorResolution = prior?.resolutionStatus && prior.resolutionStatus !== 'unresolved' ? prior.resolutionStatus : null
      records.push({ schemaVersion: '1.0', sourceId, page: pageNumber, folioLabel: region.folioLabel || null, canvasId: region.canvasId, regionId, cropUrl: region.cropUrl, cropCoordinates: region.nativeBox || null, cropSha256: region.crop?.sha256 || null, attempts, failureClassifications: [...new Set([failure.classification, ...attempts.map((attempt) => attempt.name)])], httpStatuses: prior?.httpStatuses || [], responseHashes: prior?.responseHashes || [], lastAttemptedAt: failure.attemptedAt || prior?.lastAttemptedAt || null, retryStatus: retryExhausted ? 'retry_exhausted' : 'retryable', humanInspectionStatus: prior?.humanInspectionStatus || 'required', resolutionStatus: priorResolution || (retryExhausted ? 'human_review_required' : 'retryable'), effectOnPageCoverage: page.coverage, canonical: false, reviewRequired: true, jobId })
    }
  }
  fs.mkdirSync(queueDir, { recursive: true }); const queue = { schemaVersion: '1.0', generatedAt: now(), sourceId, canonical: false, exceptions: records }; atomicJson(queueFile, queue); return queue
}
function load() { return fs.existsSync(queueFile) ? readJson(queueFile) : collect() }
if (command === 'list' || command === 'report') { console.log(JSON.stringify(collect(), null, 2)); process.exit(0) }
if (command === 'inspect') { const page = Number(args.page); console.log(JSON.stringify(collect().exceptions.filter((item) => item.page === page), null, 2)); process.exit(0) }
if (command === 'resolve') { const page = Number(args.page); const status = String(args.status || 'human_review_required'); const queue = load(); for (const item of queue.exceptions.filter((entry) => entry.page === page)) { item.resolutionStatus = status; item.humanInspectionStatus = status === 'resolved' ? 'complete' : 'required' } atomicJson(queueFile, queue); console.log(JSON.stringify({ queueFile, page, status, canonical: false }, null, 2)); process.exit(0) }
if (command === 'retry') {
  const page = Number(args.page); if (page === 59) throw new Error('page_59_retry_forbidden_in_this_sprint')
  let jobId = jobs[page]
  if (!jobId) {
    const batchRoot = path.join(root, 'data/candidates/batches')
    for (const candidate of fs.existsSync(batchRoot) ? fs.readdirSync(batchRoot).filter((id) => id.startsWith('batch-')).sort().reverse() : []) {
      try { const manifest = readJson(path.join(batchRoot, candidate, 'job.json')); if (manifest.pages?.some((item) => item.page === page)) { jobId = candidate; break } } catch {}
    }
  }
  if (!jobId) throw new Error('exception_page_not_registered')
  const child = spawn(process.execPath, [path.join(root, 'scripts/retry-regions.mjs'), `--job=${jobId}`], { cwd: root, env: { ...process.env, GIGAS_VISION_PROVIDER: 'mistral-ocr', GIGAS_MISTRAL_OCR_MODEL: 'mistral-ocr-4-0', GIGAS_MISTRAL_MAX_ATTEMPTS: '3', GIGAS_MISTRAL_RETRY_DELAYS_MS: '5000,15000,45000' }, stdio: 'inherit' })
  child.on('close', (code) => { collect(); process.exit(code || 0) })
} else throw new Error(`unknown_exception_command:${command}`)
