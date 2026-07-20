import fs from 'node:fs'
import path from 'node:path'
import { parseArgs, root, sha256 } from '../src/manuscript/source-ingestion.js'
import { streamDownload, sourceStoragePreflight } from '../src/manuscript/official-source.js'
import { batchPolicy, jobDirectory, loadJob, saveJob, validateBatchImage, mergeRegionCandidates, writePageCandidate, atomicJson } from '../src/manuscript/batch-pipeline.js'
import { extractAssistant, parseSalvage, normalizeSalvage } from '../src/manuscript/batch-recovery.js'
import { invokeMistralOcrWithRetry } from '../src/manuscript/mistral-ocr-provider.js'

const args = parseArgs(process.argv.slice(2))
const jobId = args.job
if (!jobId || typeof jobId !== 'string') throw new Error('job_required')
const job = loadJob(jobId)
const now = () => new Date().toISOString()
const targets = []
for (const page of job.pages) {
  for (const record of page.regions || []) {
    if (record.state === 'completed') continue
    const regionDir = path.join(jobDirectory(jobId), `pages/page-${String(page.page).padStart(4, '0')}/regions`, record.regionId)
    const regionFile = path.join(regionDir, 'region.json')
    const candidateFile = path.join(regionDir, 'candidate.json')
    if (!fs.existsSync(regionFile) || fs.existsSync(candidateFile)) continue
    targets.push({ page, record, regionDir, region: JSON.parse(fs.readFileSync(regionFile, 'utf8')) })
  }
}
const failures = []
for (const target of targets) {
  const cropPath = path.join(target.regionDir, 'crop.jpg')
  const attemptRoot = path.join(target.regionDir, 'attempts', `targeted-${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`)
  fs.mkdirSync(attemptRoot, { recursive: true })
  try {
    let crop
    try { crop = validateBatchImage(cropPath, target.region.crop?.sha256 || null) } catch (error) {
      if (!['page_image_hash_mismatch', 'invalid_page_image'].includes(error.message) && error.code !== 'ENOENT' || !target.region.cropUrl) throw error
      if (fs.existsSync(cropPath)) fs.renameSync(cropPath, path.join(target.regionDir, `crop-invalid-${Date.now()}.jpg`))
      sourceStoragePreflight(20 * 1024 ** 2, 'page')
      await streamDownload(target.region.cropUrl, cropPath, 0)
      crop = validateBatchImage(cropPath, target.region.crop?.sha256 || null)
    }
    const result = await invokeMistralOcrWithRetry({ imagePath: cropPath, expectedImageHash: crop.sha256, requestId: `${jobId}-${target.record.regionId}-targeted`, timeoutMs: Number(process.env.GIGAS_VISION_TIMEOUT_MS || 180000), model: process.env.GIGAS_MISTRAL_OCR_MODEL || 'mistral-ocr-4-0', maxAttempts: Number(process.env.GIGAS_MISTRAL_MAX_ATTEMPTS || 4), retryDelaysMs: process.env.GIGAS_MISTRAL_RETRY_DELAYS_MS || '5000,15000,45000' })
    job.requestCount += 1; job.retryCount += Number(result.retryCount || 0)
    for (const [index, attempt] of (result.attempts || []).entries()) {
      const dir = path.join(attemptRoot, `attempt-${String(index + 1).padStart(2, '0')}`); fs.mkdirSync(dir, { recursive: true })
      if (attempt.rawResponse) fs.writeFileSync(path.join(dir, 'raw-response.txt'), attempt.rawResponse)
      atomicJson(path.join(dir, 'provider-response.json'), { ...attempt, rawResponse: attempt.rawResponse ? '[see raw-response.txt]' : '' })
    }
    if (result.rawResponse) fs.writeFileSync(path.join(attemptRoot, 'raw-response.txt'), result.rawResponse)
    atomicJson(path.join(attemptRoot, 'provider-result.json'), { ...result, rawResponse: result.rawResponse ? '[see raw-response.txt]' : '' })
    const parsed = result.parsedOutput || (result.rawResponse ? parseSalvage(extractAssistant(result.rawResponse).content).parsed : null)
    const normalized = parsed ? normalizeSalvage(parsed, target.region) : { candidate: null, findings: [] }
    if (!normalized.candidate) throw Object.assign(new Error(result.error || result.failureClassification || 'no_usable_lines'), { classification: result.failureClassification || 'provider_empty_response' })
    const candidate = { ...normalized.candidate, applicationPolicy: batchPolicy, retryRecovered: true, retryAttemptCount: (result.retryCount || 0) + 1, retryFailureClassifications: (result.attempts || []).map((attempt) => attempt.failureClassification).filter(Boolean) }
    atomicJson(path.join(target.regionDir, 'candidate.json'), candidate)
    target.record.state = 'completed'; target.record.lines = candidate.lines.length; target.record.retryRecovered = true; target.record.retryAttempts = (result.retryCount || 0) + 1; target.page.failures = (target.page.failures || []).filter((failure) => failure.regionId !== target.record.regionId)
  } catch (error) {
    const failure = { classification: error.classification || error.message, message: error.message, retryExhausted: true, attemptedAt: now() }
    atomicJson(path.join(attemptRoot, 'failure.json'), failure)
    target.record.state = 'retryable_failed'; target.record.failure = failure; target.record.retryExhausted = true
    target.page.failures = (target.page.failures || []).filter((item) => item.regionId !== target.record.regionId); target.page.failures.push({ regionId: target.record.regionId, ...failure }); failures.push({ page: target.page.page, regionId: target.record.regionId, ...failure })
  }
  saveJob(job)
}

const affectedPageNumbers = new Set(targets.map((target) => target.page.page))
for (const page of job.pages) {
  const regionRoot = path.join(jobDirectory(jobId), `pages/page-${String(page.page).padStart(4, '0')}/regions`)
  const hasCandidate = fs.existsSync(regionRoot) && fs.readdirSync(regionRoot).some((entry) => fs.existsSync(path.join(regionRoot, entry, 'candidate.json')))
  if ((page.regions.length === 0 || (page.failures || []).some((failure) => !failure.regionId)) && hasCandidate) affectedPageNumbers.add(page.page)
}
for (const page of job.pages.filter((item) => affectedPageNumbers.has(item.page))) {
  const dir = path.join(jobDirectory(jobId), `pages/page-${String(page.page).padStart(4, '0')}`)
  const regionRoot = path.join(dir, 'regions'); const regions = []; const regionDirs = fs.existsSync(regionRoot) ? fs.readdirSync(regionRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => path.join(regionRoot, entry.name)).sort() : []
  for (const regionDir of regionDirs) { const regionFile = path.join(regionDir, 'region.json'); const candidateFile = path.join(regionDir, 'candidate.json'); if (fs.existsSync(regionFile) && fs.existsSync(candidateFile)) { const region = JSON.parse(fs.readFileSync(regionFile, 'utf8')); const candidate = JSON.parse(fs.readFileSync(candidateFile, 'utf8')); regions.push({ ...region, state: 'completed', candidate }) } }
  // Rebuild the job's region index from the durable region directories. This
  // removes stale duplicate records and repairs pages whose earlier worker
  // exited after writing candidates but before updating job.json.
  page.regions = regions.map((region) => ({ regionId: region.regionId, state: 'completed', lines: region.candidate.lines.length }))
  page.failures = (page.failures || []).filter((failure) => {
    if (!failure.regionId) return regions.length < regionDirs.length
    return regions.every((region) => region.regionId !== failure.regionId)
  })
  const merged = mergeRegionCandidates(regions); const pageCandidate = fs.existsSync(path.join(dir, 'page-candidate.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'page-candidate.json'), 'utf8')) : {}
  const rebuilt = { ...pageCandidate, regions: regions.map((region) => ({ regionId: region.regionId, cropUrl: region.cropUrl, cropSha256: region.crop?.sha256 || null, column: region.column, nativeBox: region.nativeBox, lines: region.candidate.lines })), lines: merged.lines, disagreements: merged.disagreements, failedRegions: page.failures, coverage: regionDirs.length ? regions.length / regionDirs.length : 0, retryRecoveredRegions: regions.filter((region) => region.candidate.retryRecovered).map((region) => region.regionId), ...batchPolicy }
  writePageCandidate(job, page.page, rebuilt); atomicJson(path.join(dir, 'page-package.json'), rebuilt); page.lines = rebuilt.lines.length; page.coverage = rebuilt.coverage; page.state = page.failures?.length || regions.length < regionDirs.length ? 'partial' : 'completed'
}
job.state = job.pages.some((page) => page.state === 'partial') ? 'partial' : 'completed'; saveJob(job)
console.log(JSON.stringify({ jobId, targetedRegions: targets.length, recovered: targets.length - failures.length, failures, requestCount: job.requestCount, retryCount: job.retryCount, state: job.state }, null, 2))
