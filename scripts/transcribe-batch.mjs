import fs from 'node:fs'
import path from 'node:path'
import { parseArgs, root, sha256, writeJson, imageDimensions, mediaType } from '../src/manuscript/source-ingestion.js'
import { officialSource, listPages, streamDownload, sourceStoragePreflight } from '../src/manuscript/official-source.js'
import { invokeVisionModelSafe } from '../src/manuscript/vision-provider-runtime.js'
import { batchRoot, batchPolicy, buildBatchJob, jobDirectory, jobFile, loadJob, saveJob, updatePage, mapDisplayToNative, segmentColumns, mergeRegionCandidates, plausibilityWarnings, validateBatchImage, pageManifest, batchSummary, writePageCandidate, writeFailure, storageSnapshot, atomicJson, parsePageRange } from '../src/manuscript/batch-pipeline.js'
import { compactRegionPrompt, compactRegionSchema, extractAssistant, parseSalvage, normalizeSalvage } from '../src/manuscript/batch-recovery.js'
import { invokeMistralOcrWithRetry } from '../src/manuscript/mistral-ocr-provider.js'

const args = parseArgs(process.argv.slice(2))
const sourceId = args['source-id'] || officialSource.sourceId
const pagesArg = args.pages || args.page
const provider = process.env.GIGAS_VISION_PROVIDER || 'openrouter'
const model = provider === 'mistral-ocr' ? (process.env.GIGAS_MISTRAL_OCR_MODEL || 'mistral-ocr-4-0') : (process.env.GIGAS_VISION_MODEL || 'google/gemma-4-26b-a4b-it:free')
if (provider === 'mistral-ocr' && model !== 'mistral-ocr-4-0') throw new Error('incompatible_mistral_ocr_model')

function now() { return new Date().toISOString() }
function json(file, value) { atomicJson(file, value) }
function pageDir(job, page) { return path.join(jobDirectory(job.jobId), `pages/page-${String(page).padStart(4, '0')}`) }
function regionPrompt() { return compactRegionPrompt }
function triagePrompt() { return `Inspect only the supplied official manuscript page image and return JSON with pageAssessment: containsVisibleText, orientationCorrect, columnsDetected, estimatedTextBounds, rubrication, decorations, pageType, imageQuality, limitations. This is triage only: do not transcribe or translate. Do not use prior knowledge. If uncertain, state the limitation.` }
const triageSchema = { required: ['pageAssessment'] }
const regionSchema = compactRegionSchema
const calibrationPointer = path.join(root, 'data/candidates/production-jobs/quality-calibration-latest.json')
let qualityCalibration = null
if (fs.existsSync(calibrationPointer)) {
  try {
    const pointer = JSON.parse(fs.readFileSync(calibrationPointer, 'utf8'))
    qualityCalibration = JSON.parse(fs.readFileSync(path.join(root, pointer.path), 'utf8'))
  } catch {}
}

async function invokeRegionProvider(options) {
  if ((process.env.GIGAS_VISION_PROVIDER || '').toLowerCase() === 'mistral-ocr') {
    return invokeMistralOcrWithRetry({ imagePath: options.imagePath, expectedImageHash: options.expectedImageHash, requestId: options.requestId, timeoutMs: options.timeoutMs, model: process.env.GIGAS_MISTRAL_OCR_MODEL || 'mistral-ocr-4-0', maxAttempts: Number(process.env.GIGAS_MISTRAL_MAX_ATTEMPTS || 2) })
  }
  return invokeVisionModelSafe(options)
}

function persistProviderResult(dir, name, result) {
  fs.mkdirSync(dir, { recursive: true })
  if (result.rawResponse) fs.writeFileSync(path.join(dir, 'raw-response.txt'), result.rawResponse)
  json(path.join(dir, 'provider-result.json'), { ...result, rawResponse: result.rawResponse ? '[see raw-response.txt]' : '' })
  if (Array.isArray(result.attempts)) result.attempts.forEach((attempt, index) => {
    const attemptDir = path.join(dir, `attempt-${String(index + 1).padStart(2, '0')}`); fs.mkdirSync(attemptDir, { recursive: true })
    if (attempt.rawResponse) fs.writeFileSync(path.join(attemptDir, 'raw-response.txt'), attempt.rawResponse)
    json(path.join(attemptDir, 'provider-response.json'), { ...attempt, rawResponse: attempt.rawResponse ? '[see raw-response.txt]' : '' })
  })
  if (result.rawResponse) json(path.join(dir, 'raw-response-manifest.json'), { name, sha256: sha256(Buffer.from(result.rawResponse)), bytes: Buffer.byteLength(result.rawResponse), provider: result.provider, model: result.actualRoutedModel || result.model, responseId: result.responseId || null, httpStatus: result.httpStatus ?? null })
}

function inventoryPage(pages, page) { const entry = pages.find((item) => item.sourcePage === page); if (!entry) throw new Error(`source_page_not_found:${page}`); return entry }

async function ensurePageImage(job, page, inventory) {
  const dir = pageDir(job, page); fs.mkdirSync(dir, { recursive: true })
  const target = path.join(dir, 'page-image.jpg')
  const preserved = path.join(root, 'data/sources/pages', sourceId, `source-page-${String(page).padStart(4, '0')}.jpg`)
  if (!fs.existsSync(target) && page === 10 && fs.existsSync(preserved)) fs.copyFileSync(preserved, target)
  if (!fs.existsSync(target)) {
    const url = `${inventory.imageServiceId}/full/2400,/0/default.jpg`
    sourceStoragePreflight(40 * 1024 ** 2, 'page')
    const downloaded = await streamDownload(url, target, 0)
    json(path.join(dir, 'download.json'), { sourceId, page, url, ...downloaded, retrievedAt: now(), canonical: false })
  }
  const image = validateBatchImage(target)
  json(path.join(dir, 'page-image.manifest.json'), pageManifest({ sourceId, page, inventory, image, url: `${inventory.imageServiceId}/full/2400,/0/default.jpg`, nativeDimensions: { width: inventory.width, height: inventory.height } }))
  return { path: target, image }
}

function normalizeTriage(result) { const raw = result.parsedOutput?.pageAssessment || result.parsedOutput || {}; return { containsVisibleText: raw.containsVisibleText ?? raw.visibleText ?? null, orientationCorrect: raw.orientationCorrect ?? null, columnsDetected: Number(raw.columnsDetected || 2), estimatedTextBounds: raw.estimatedTextBounds || null, pageType: raw.pageType || 'manuscript_folio', rubrication: raw.rubrication || [], decorations: raw.decorations || [], imageQuality: raw.imageQuality || '', limitations: raw.limitations || [], providerResult: { status: result.status, failureClassification: result.failureClassification || null, responseId: result.responseId || null, rawResponseHash: result.rawProviderResponseHash || (result.rawResponse ? sha256(Buffer.from(result.rawResponse)) : '') } } }

function normalizeRegion(result, region) {
  if (!result.parsedOutput) return null
  const value = result.parsedOutput
  const normalized = normalizeSalvage(value, region)
  if (!normalized.candidate) return null
  return { ...normalized.candidate, applicationPolicy: batchPolicy, regionIdentity: region }
}

async function processPage(job, page, pages) {
  const item = updatePage(job, page, { state: 'preparing', startedAt: now() }); const inventory = inventoryPage(pages, page); const dir = pageDir(job, page)
  try {
    const pageImage = await ensurePageImage(job, page, inventory)
    item.state = 'triaging'; saveJob(job)
    let assessment
    if (process.env.GIGAS_DETERMINISTIC_PAGE_SEGMENTATION === '1' && (process.env.GIGAS_VISION_PROVIDER || '').toLowerCase() === 'mistral-ocr') {
      assessment = { containsVisibleText: null, orientationCorrect: true, columnsDetected: 2, estimatedTextBounds: null, pageType: 'unclassified_manuscript_canvas', rubrication: [], decorations: [], imageQuality: '', limitations: ['Dedicated OCR route does not perform semantic page triage; text presence is determined from verified crop OCR results.'], method: 'deterministic_two_column_production_v1', providerResult: null }
      json(path.join(dir, 'triage.json'), assessment)
    } else {
      const triage = await invokeRegionProvider({ imagePath: pageImage.path, expectedImageHash: pageImage.image.sha256, prompt: triagePrompt(), schema: triageSchema, requestId: `${job.jobId}-page-${page}-triage`, timeoutMs: Number(process.env.GIGAS_VISION_TIMEOUT_MS || 180000) })
      job.requestCount += 1; job.retryCount += Number(triage.retryCount || 0); persistProviderResult(path.join(dir, 'triage'), 'triage', triage); assessment = normalizeTriage(triage)
      json(path.join(dir, 'triage.json'), assessment)
      if (triage.failureClassification === 'authentication_failure') { item.state = 'blocked'; item.failures.push({ stage: 'triage', classification: triage.failureClassification }); saveJob(job); return }
    }
    item.triage = assessment
    item.state = 'segmenting'; saveJob(job); if (assessment.providerResult) await new Promise((resolve) => setTimeout(resolve, Number(process.env.GIGAS_REQUEST_DELAY_MS || 2000)))
    const display = pageImage.image.dimensions; const native = { width: inventory.width || display.width, height: inventory.height || display.height }; const boxes = segmentColumns({ width: display.width, height: display.height, columns: assessment.columnsDetected === 1 ? 1 : 2 })
    const regionResults = []
    for (const box of boxes) {
      const nativeBox = mapDisplayToNative(box, display, native); const regionId = `${sourceId}-page-${String(page).padStart(4, '0')}-${box.column}-${String(box.order).padStart(2, '0')}`; const region = { regionId, sourceId, page, canvasId: inventory.canvasId, column: box.column, order: box.order, displayDimensions: display, nativeDimensions: native, displayBox: box, nativeBox, cropUrl: `${inventory.imageServiceId}/${nativeBox.x},${nativeBox.y},${nativeBox.width},${nativeBox.height}/1600,/0/default.jpg`, state: 'queued', ...batchPolicy }
      const regionDir = path.join(dir, 'regions', regionId); fs.mkdirSync(regionDir, { recursive: true }); json(path.join(regionDir, 'region.json'), region); item.regions.push({ regionId, state: 'preparing' }); saveJob(job)
      try {
        const cropPath = path.join(regionDir, 'crop.jpg'); sourceStoragePreflight(20 * 1024 ** 2, 'page'); const crop = await streamDownload(region.cropUrl, cropPath, 0); const cropImage = validateBatchImage(cropPath); region.crop = { ...crop, ...cropImage }; region.state = 'transcribing'; json(path.join(regionDir, 'region.json'), region); item.state = 'transcribing'; saveJob(job)
        const result = await invokeRegionProvider({ imagePath: cropPath, expectedImageHash: cropImage.sha256, prompt: regionPrompt(), schema: regionSchema, requestId: `${job.jobId}-${regionId}`, timeoutMs: Number(process.env.GIGAS_VISION_TIMEOUT_MS || 180000) })
        job.requestCount += 1; job.retryCount += Number(result.retryCount || 0); persistProviderResult(regionDir, 'region', result); const salvaged = result.parsedOutput || (result.rawResponse ? parseSalvage(extractAssistant(result.rawResponse).content).parsed : null); const candidate = normalizeRegion({ ...result, parsedOutput: salvaged }, region); if (!candidate) throw Object.assign(new Error(result.error || result.failureClassification || 'region_failed'), { classification: result.failureClassification || 'provider_error', result })
        candidate.qualityWarnings = plausibilityWarnings(candidate.lines, assessment.estimatedVisibleLines || 0, { height: region.nativeBox.height }, qualityCalibration); json(path.join(regionDir, 'candidate.json'), candidate); regionResults.push({ ...region, state: 'completed', candidate }); const record = item.regions.find((r) => r.regionId === regionId); record.state = 'completed'; record.lines = candidate.lines.length; record.qualityWarnings = candidate.qualityWarnings; saveJob(job)
      } catch (error) {
        const record = item.regions.find((r) => r.regionId === regionId); record.state = 'retryable_failed'; record.failure = { classification: error.classification || error.message, message: error.message }; item.failures.push({ regionId, classification: record.failure.classification }); json(path.join(regionDir, 'failure.json'), record.failure); saveJob(job)
      }
      await new Promise((resolve) => setTimeout(resolve, Number(process.env.GIGAS_REQUEST_DELAY_MS || 2000)))
    }
    item.state = 'merging'; saveJob(job); const merged = mergeRegionCandidates(regionResults); const candidate = { sourceId, sourcePage: page, canvasId: inventory.canvasId, folioLabel: inventory.label || null, image: pageImage.image, columns: assessment.columnsDetected, assessment, regions: regionResults.map((r) => ({ regionId: r.regionId, cropUrl: r.cropUrl, cropSha256: r.crop.sha256, column: r.column, nativeBox: r.nativeBox, lines: r.candidate.lines, qualityWarnings: r.candidate.qualityWarnings || [] })), lines: merged.lines, disagreements: merged.disagreements, plausibilityWarnings: [...new Set(regionResults.flatMap((r) => r.candidate.qualityWarnings || []))], failedRegions: item.failures, coverage: regionResults.length / boxes.length, machineDraftWarning: 'UNVERIFIED MACHINE TRANSCRIPTION — Generated from official manuscript imagery. May contain omissions, incorrect readings, incorrect line divisions, and unresolved abbreviations. Not a scholarly edition.', ...batchPolicy }
    writePageCandidate(job, page, candidate); item.lines = merged.lines.length; item.coverage = candidate.coverage; item.state = item.failures.length || regionResults.length < boxes.length ? 'partial' : 'packaged'; json(path.join(dir, 'page-package.json'), candidate); item.state = item.state === 'packaged' ? 'completed' : item.state; saveJob(job)
  } catch (error) { item.state = 'partial'; item.failures.push({ stage: 'page', classification: error.message, message: error.message }); writeFailure(job, page, { sourceId, page, failure: error.message, at: now(), ...batchPolicy }); saveJob(job) }
}

async function resumeFailedPage(job, page) {
  const item = updatePage(job, page, { state: 'transcribing' }); const dir = pageDir(job, page); const regionRoot = path.join(dir, 'regions'); const regionResults = []
  const regionDirs = fs.existsSync(regionRoot) ? fs.readdirSync(regionRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => path.join(regionRoot, entry.name)).sort() : []
  for (const regionDir of regionDirs) {
    const regionFile = path.join(regionDir, 'region.json'); if (!fs.existsSync(regionFile)) continue
    const region = JSON.parse(fs.readFileSync(regionFile, 'utf8')); const candidateFile = fs.existsSync(path.join(regionDir, 'candidate.json')) ? path.join(regionDir, 'candidate.json') : path.join(regionDir, 'mistral-comparison-candidate.json')
    if (fs.existsSync(candidateFile)) { const candidate = JSON.parse(fs.readFileSync(candidateFile, 'utf8')); const existing = item.regions.find((entry) => entry.regionId === region.regionId); if (existing) { existing.state = 'completed'; existing.lines = candidate.lines.length; item.failures = (item.failures || []).filter((failure) => failure.regionId !== region.regionId) } regionResults.push({ ...region, state: 'completed', candidate }); saveJob(job); continue }
    item.state = 'transcribing'; item.regions = item.regions || []; const record = item.regions.find((entry) => entry.regionId === region.regionId) || { regionId: region.regionId, state: 'preparing' }; if (!item.regions.includes(record)) item.regions.push(record); saveJob(job)
    try {
      const cropPath = path.join(regionDir, 'crop.jpg'); const cropImage = validateBatchImage(cropPath); region.crop = { ...(region.crop || {}), ...cropImage }; json(regionFile, region); const attemptDir = path.join(regionDir, 'attempts', `resume-${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`); process.env.GIGAS_VISION_MAX_RETRIES = '0'; delete process.env.GIGAS_VISION_MODEL_2; delete process.env.GIGAS_VISION_FALLBACK_MODELS; delete process.env.GIGAS_GEMINI_THINKING_BUDGET; const result = await invokeRegionProvider({ imagePath: cropPath, expectedImageHash: cropImage.sha256, prompt: regionPrompt(), schema: regionSchema, requestId: `${job.jobId}-${region.regionId}-resume`, timeoutMs: Number(process.env.GIGAS_VISION_TIMEOUT_MS || 180000) }); job.requestCount += 1; job.retryCount += Number(result.retryCount || 0); persistProviderResult(attemptDir, 'region-resume', result); const salvaged = result.parsedOutput || (result.rawResponse ? parseSalvage(extractAssistant(result.rawResponse).content).parsed : null); const candidate = normalizeRegion({ ...result, parsedOutput: salvaged }, region); if (!candidate) throw Object.assign(new Error(result.error || result.failureClassification || 'region_failed'), { classification: result.failureClassification || 'provider_error' }); candidate.qualityWarnings = plausibilityWarnings(candidate.lines, 0, { height: region.nativeBox.height }, qualityCalibration); json(candidateFile, candidate); regionResults.push({ ...region, state: 'completed', candidate }); record.state = 'completed'; record.lines = candidate.lines.length; record.qualityWarnings = candidate.qualityWarnings; item.failures = (item.failures || []).filter((failure) => failure.regionId !== region.regionId); saveJob(job)
    } catch (error) { record.state = 'retryable_failed'; record.failure = { classification: error.classification || error.message, message: error.message }; item.failures = (item.failures || []).filter((failure) => failure.regionId !== region.regionId); item.failures.push({ regionId: region.regionId, classification: record.failure.classification }); json(path.join(regionDir, `resume-failure-${Date.now()}.json`), record.failure); saveJob(job) }
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  const triage = fs.existsSync(path.join(dir, 'triage.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'triage.json'), 'utf8')) : {}; const image = fs.existsSync(path.join(dir, 'page-image.manifest.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'page-image.manifest.json'), 'utf8')) : null; const merged = mergeRegionCandidates(regionResults); const candidate = { sourceId: job.sourceId, sourcePage: page, canvasId: regionResults[0]?.canvasId || null, folioLabel: regionResults[0]?.folioLabel || null, image, columns: triage.columnsDetected || 2, assessment: triage, regions: regionResults.map((entry) => ({ regionId: entry.regionId, cropUrl: entry.cropUrl, cropSha256: entry.crop?.sha256 || null, column: entry.column, nativeBox: entry.nativeBox, lines: entry.candidate.lines, qualityWarnings: entry.candidate.qualityWarnings || [] })), lines: merged.lines, disagreements: merged.disagreements, plausibilityWarnings: [...new Set(regionResults.flatMap((entry) => entry.candidate.qualityWarnings || []))], failedRegions: item.failures, coverage: regionDirs.length ? regionResults.length / regionDirs.length : 0, machineDraftWarning: 'UNVERIFIED MACHINE TRANSCRIPTION — Generated from official manuscript imagery. May contain omissions, incorrect readings, incorrect line divisions, and unresolved abbreviations. Not a scholarly edition.', ...batchPolicy }; writePageCandidate(job, page, candidate); item.lines = merged.lines.length; item.coverage = candidate.coverage; item.state = item.failures.length || regionResults.length < regionDirs.length ? 'partial' : 'completed'; json(path.join(dir, 'page-package.json'), candidate); saveJob(job)
}

async function main() {
  fs.mkdirSync(batchRoot, { recursive: true }); const pages = listPages(); let job
  if (args.job) job = loadJob(args.job); else { const selected = (pagesArg ? parsePageRange(pagesArg) : []).slice(0, Number(args['max-pages'] || 10)); if (!selected.length) throw new Error('pages_required'); job = buildBatchJob({ sourceId, pages: selected, provider, model }); fs.mkdirSync(jobDirectory(job.jobId), { recursive: true }); saveJob(job) }
  if (args.job && provider === 'mistral-ocr') { job.recoveryProvider = 'mistral-ocr'; job.recoveryModel = process.env.GIGAS_MISTRAL_OCR_MODEL || 'mistral-ocr-4-0'; job.providerHistory = [...new Set([...(job.providerHistory || []), job.provider, 'mistral-ocr'])]; saveJob(job) }
  const storage = storageSnapshot(); json(path.join(jobDirectory(job.jobId), 'storage-preflight.json'), storage); if (storage.freeBytes < storage.pauseBelowBytes && !args['dry-run']) { job.state = 'paused_storage'; saveJob(job); console.log(JSON.stringify({ ...batchSummary(job), blocker: 'storage_below_pause_threshold', storage }, null, 2)); return }
  if (args['dry-run']) { console.log(JSON.stringify({ ...batchSummary(job), storage }, null, 2)); return }
  job.state = 'preparing'; saveJob(job)
  for (const page of job.pagesRequested) { const current = job.pages.find((entry) => entry.page === page); if (args.job && current.state === 'partial' && current.regions.length) await resumeFailedPage(job, page); else { if (['completed', 'partial'].includes(current.state) && args.resume !== 'false') continue; await processPage(job, page, pages) } if (job.pages.find((entry) => entry.page === page)?.state === 'blocked') { job.state = 'paused_authentication'; saveJob(job); break } }
  if (!['paused_storage', 'paused_authentication'].includes(job.state)) job.state = job.pages.some((p) => ['partial', 'blocked', 'terminal_failed'].includes(p.state)) ? 'partial' : 'completed'; saveJob(job); console.log(JSON.stringify({ ...batchSummary(job), storage: storageSnapshot(), jobPath: jobFile(job.jobId) }, null, 2))
}
main().catch((error) => { console.error(JSON.stringify({ error: error.message }, null, 2)); process.exitCode = 1 })
