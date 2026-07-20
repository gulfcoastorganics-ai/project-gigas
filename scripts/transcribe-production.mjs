import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { parseArgs, root } from '../src/manuscript/source-ingestion.js'
import { batchRoot, jobDirectory, loadJob, batchSummary, storageSnapshot, atomicJson } from '../src/manuscript/batch-pipeline.js'
import { officialSource, validateOfficialInventory, syncMetadata, listPages } from '../src/manuscript/official-source.js'
import { productionSegments, productionSegmentsForRange, productionPolicy, segmentLabel, usableRegionRate, mistralEnvironment } from '../src/manuscript/production-job.js'
import { pruneVerifiedReconstructableCrops } from '../src/manuscript/candidate-maintenance.js'

const args = parseArgs(process.argv.slice(2))
const sourceId = args['source-id'] || 'external-459e4da71e7fd69d189a8196c9d9a9beb03026e4bbbdce06b37dec39a74981a0'
const requested = String(args.pages || '30-99')
const rangeMatch = requested.match(/^(\d+)-(\d+)$/)
if (!rangeMatch || Number(rangeMatch[1]) < 1 || Number(rangeMatch[2]) < Number(rangeMatch[1])) throw new Error('invalid_production_range')
const requestedRange = [Number(rangeMatch[1]), Number(rangeMatch[2])]
const productionId = args['production-job'] || `production-${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`
const productionDir = path.join(root, 'data/candidates/production-jobs', productionId)
const productionFile = path.join(productionDir, 'production-job.json')

function now() { return new Date().toISOString() }
function save(job) { job.updatedAt = now(); atomicJson(productionFile, job); atomicJson(path.join(root, 'data/candidates/production-jobs/latest.json'), { productionId: job.productionId, path: path.relative(root, productionFile), updatedAt: job.updatedAt, canonical: false, candidateOnly: true }) }
function runSegment(range, env, existingJobId = null) {
  return new Promise((resolve, reject) => {
    const childArgs = existingJobId ? [`--job=${existingJobId}`] : [`--pages=${range[0]}-${range[1]}`]
    const child = spawn(process.execPath, [path.join(root, 'scripts/transcribe-batch.mjs'), ...childArgs], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''; let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('error', reject)
    child.on('close', (code) => {
      const start = stdout.indexOf('{\n  "jobId"')
      let summary = null
      if (start >= 0) { try { summary = JSON.parse(stdout.slice(start)) } catch {} }
      if (!summary || code !== 0) return reject(Object.assign(new Error(summary?.blocker || `segment_exit_${code}`), { stdout, stderr, code, summary }))
      resolve({ summary, stdout, stderr })
    })
  })
}
function findResumableJob(range) {
  if (!fs.existsSync(batchRoot)) return null
  const candidates = fs.readdirSync(batchRoot).map((id) => { try { return loadJob(id) } catch { return null } }).filter(Boolean)
  return candidates.filter((job) => job.pagesRequested?.[0] === range[0] && job.pagesRequested?.at(-1) === range[1] && ['preparing', 'running', 'partial'].includes(job.state)).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0]?.jobId || null
}
function overallRate(job) {
  const totals = job.segments.reduce((result, segment) => { const attempted = segment.summary?.regionsAttempted || 0; const usable = segment.summary?.regionsSucceeded || 0; result.attempted += attempted; result.usable += usable; return result }, { attempted: 0, usable: 0 })
  return totals.attempted ? totals.usable / totals.attempted : 0
}
function exportSegment(segmentJobId) {
  const destination = path.join(root, 'exports/batch-transcriptions', segmentJobId)
  fs.mkdirSync(destination, { recursive: true })
  const job = loadJob(segmentJobId)
  const pages = []
  for (const page of job.pages || []) {
    const source = path.join(jobDirectory(segmentJobId), `pages/page-${String(page.page).padStart(4, '0')}/page-candidate.json`)
    if (!fs.existsSync(source)) continue
    const target = path.join(destination, `pages/page-${String(page.page).padStart(4, '0')}/page-candidate.json`)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(source, target)
    pages.push({ page: page.page, state: page.state, lines: page.lines || 0, coverage: page.coverage ?? 0, candidate: path.relative(destination, target) })
  }
  atomicJson(path.join(destination, 'export-manifest.json'), { schemaVersion: '2.0', jobId: segmentJobId, exportedAt: now(), sourceJobPath: path.relative(root, jobDirectory(segmentJobId)), pages, rawEvidenceRetainedAtSource: true, canonical: false, candidateOnly: true, reviewRequired: true })
  return destination
}

async function ensureInventory(range) {
  try { return validateOfficialInventory(range[0], range[1]) } catch (error) {
    if (error.message !== 'official_inventory_invalid' && error.message !== 'official_inventory_missing') throw error
    const stale = path.join(root, 'data/sources/manifests', `${officialSource.sourceId}-page-inventory.json`)
    if (fs.existsSync(stale)) fs.renameSync(stale, `${stale}.stale-${Date.now()}`)
    await syncMetadata()
    listPages()
    return validateOfficialInventory(range[0], range[1])
  }
}

fs.mkdirSync(productionDir, { recursive: true })
let production
if (fs.existsSync(productionFile)) production = JSON.parse(fs.readFileSync(productionFile, 'utf8'))
else {
  const ranges = requestedRange[0] === 30 && requestedRange[1] === 99 ? productionSegments : productionSegmentsForRange(requestedRange[0], requestedRange[1])
  production = { schemaVersion: '1.0', productionId, sourceId, pagesRequested: requestedRange, state: 'queued', createdAt: now(), updatedAt: now(), currentSegment: null, segments: ranges.map((range) => ({ label: segmentLabel(range), from: range[0], to: range[1], state: 'queued', jobId: null, exportPath: null, usableRegionRate: null, storage: null })), ...productionPolicy }
  save(production)
}
if (production.productionId !== productionId) throw new Error(`production_manifest_id_mismatch:${production.productionId}:${productionId}`)
production.minimumUsableRegionRate = 0.85
production.minimumOverallUsableRegionRate = 0.9
const env = mistralEnvironment(process.env)
for (const segment of production.segments) {
  if (['completed', 'completed_partial'].includes(segment.state)) continue
  try { production.inventory = await ensureInventory([segment.from, segment.to]); save(production) } catch (error) { production.state = 'paused_inventory'; production.blocker = error.message; production.currentSegment = segment.label; production.inventoryError = error.details || null; save(production); break }
  const storage = storageSnapshot()
  segment.storage = storage
  if (storage.freeBytes < storage.pauseBelowBytes) { production.state = 'paused_storage'; production.blocker = 'insufficient_storage'; production.currentSegment = segment.label; save(production); break }
  production.state = 'running'; production.currentSegment = segment.label; segment.state = 'running'; save(production)
  try {
    if (!segment.jobId) segment.jobId = findResumableJob([segment.from, segment.to])
    const run = await runSegment([segment.from, segment.to], { ...env, GIGAS_VISION_PROVIDER: 'mistral-ocr', GIGAS_MISTRAL_OCR_MODEL: 'mistral-ocr-4-0', GIGAS_MISTRAL_MAX_ATTEMPTS: '2', GIGAS_REQUEST_DELAY_MS: '2000', GIGAS_DETERMINISTIC_PAGE_SEGMENTATION: '1' }, segment.jobId)
    const summary = run.summary
    const job = loadJob(summary.jobId)
    segment.jobId = summary.jobId
    segment.exportPath = exportSegment(summary.jobId)
    segment.usableRegionRate = usableRegionRate(job)
    segment.summary = batchSummary(job)
    segment.state = segment.usableRegionRate >= 0.85 ? 'completed' : 'completed_partial'
    delete segment.error
    atomicJson(path.join(productionDir, `segment-${segment.label}.json`), { ...segment, stdout: run.stdout, stderr: run.stderr })
    segment.cropPruning = pruneVerifiedReconstructableCrops({ roots: [jobDirectory(summary.jobId)] })
    save(production)
    if (overallRate(production) < 0.9 && production.segments.filter((entry) => entry.summary).length > 1) { production.state = 'paused_quality'; production.blocker = 'overall_usable_region_rate_below_90_percent'; save(production); break }
  } catch (error) {
    segment.state = error.summary?.state === 'paused_authentication' ? 'paused_authentication' : 'failed'
    segment.error = { message: error.message, code: error.code || null, stderr: error.stderr || '' }
    production.state = segment.state === 'paused_authentication' ? 'paused_authentication' : 'partial'
    save(production)
    break
  }
}
if (production.segments.every((segment) => ['completed', 'completed_partial'].includes(segment.state))) production.state = production.segments.some((segment) => segment.state === 'completed_partial') ? 'completed_with_exceptions' : 'completed'
save(production)
console.log(JSON.stringify({ productionId: production.productionId, productionPath: productionFile, state: production.state, currentSegment: production.currentSegment, segments: production.segments.map(({ label, state, jobId, usableRegionRate, exportPath }) => ({ label, state, jobId, usableRegionRate, exportPath })), resumeCommand: `GIGAS_VISION_PROVIDER=mistral-ocr GIGAS_MISTRAL_OCR_MODEL=mistral-ocr-4-0 npm run transcribe:production -- --production-job=${production.productionId} --pages=${production.pagesRequested[0]}-${production.pagesRequested[1]}` }, null, 2))
