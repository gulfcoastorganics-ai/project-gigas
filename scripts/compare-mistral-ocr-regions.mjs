import fs from 'node:fs'
import path from 'node:path'
import { parseArgs, root, sha256 } from '../src/manuscript/source-ingestion.js'
import { jobDirectory, loadJob, atomicJson } from '../src/manuscript/batch-pipeline.js'
import { invokeMistralOcr } from '../src/manuscript/mistral-ocr-provider.js'
import { normalizeSalvage } from '../src/manuscript/batch-recovery.js'

const args = parseArgs(process.argv.slice(2))
const jobId = args.job || 'batch-2026-07-14T01-26-26-060Z-21001'
const job = loadJob(jobId)
const selectedPages = [20, 22, 24]
const runId = `run-${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`
const outputRoot = path.join(root, 'data/candidates/provider-comparisons/mistral-ocr', job.sourceId, `pages-${selectedPages.join('-')}`, runId)
fs.mkdirSync(outputRoot, { recursive: true })

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)) }
function pageDir(page) { return path.join(jobDirectory(jobId), `pages/page-${String(page).padStart(4, '0')}`) }
function firstFailed(page) {
  const item = job.pages.find((entry) => entry.page === page)
  const region = item?.regions.find((entry) => entry.state !== 'completed')
  if (!region) throw new Error(`no_failed_region:${page}`)
  const dir = path.join(pageDir(page), 'regions', region.regionId)
  return { item, region, dir, cropPath: path.join(dir, 'crop.jpg'), regionPath: path.join(dir, 'region.json') }
}
function saveRaw(dir, result) {
  fs.mkdirSync(dir, { recursive: true })
  const raw = result.rawProviderResponse || result.rawResponse || ''
  if (raw) fs.writeFileSync(path.join(dir, 'raw-response.txt'), raw)
  atomicJson(path.join(dir, 'provider-result.json'), { ...result, rawProviderResponse: raw ? '[see raw-response.txt]' : '', rawResponse: raw ? '[see raw-response.txt]' : '' })
  atomicJson(path.join(dir, 'raw-response-manifest.json'), { sha256: raw ? sha256(Buffer.from(raw)) : '', bytes: Buffer.byteLength(raw), provider: result.provider, model: result.actualRoutedModel || result.model, responseId: result.providerResponseId || null, httpStatus: result.httpStatus ?? null })
}
const results = []
for (const page of selectedPages) {
  const selection = firstFailed(page)
  const comparisonDir = path.join(outputRoot, `page-${String(page).padStart(4, '0')}`, selection.region.regionId)
  const region = JSON.parse(fs.readFileSync(selection.regionPath, 'utf8'))
  const image = fs.readFileSync(selection.cropPath)
  const started = Date.now()
  const result = await invokeMistralOcr({ imagePath: selection.cropPath, expectedImageHash: region.crop?.sha256, requestId: `${jobId}-mistral-comparison-${selection.region.regionId}`, timeoutMs: Number(process.env.GIGAS_VISION_TIMEOUT_MS || 180000), model: process.env.GIGAS_MISTRAL_OCR_MODEL || 'mistral-ocr-4-0' })
  const durationMs = Date.now() - started
  saveRaw(comparisonDir, result)
  const normalized = result.parsedOutput ? normalizeSalvage(result.parsedOutput, region) : { candidate: null, findings: [{ type: result.failureClassification || 'provider_failure' }], repairs: [] }
  const record = { page, regionId: region.regionId, cropUrl: region.cropUrl, cropSha256: region.crop?.sha256 || sha256(image), provider: result.provider, model: result.actualRoutedModel, durationMs, httpStatus: result.httpStatus ?? null, requestId: result.providerResponseId || result.requestId, rawResponseHash: result.rawProviderResponseHash || '', blocks: result.blocks?.length || 0, linesExtracted: result.parsedOutput?.lines?.length || 0, validation: normalized.findings, salvage: normalized.repairs, usable: Boolean(normalized.candidate), rateLimitHeaders: result.rateLimitHeaders || {}, canonical: false, candidateOnly: true, reviewRequired: true }
  if (normalized.candidate) { normalized.candidate.provider = 'mistral-ocr'; normalized.candidate.model = result.actualRoutedModel; normalized.candidate.regionIdentity = region; normalized.candidate.applicationPolicy = { canonical: false, candidateOnly: true, reviewRequired: true, scholarlyVerified: false, transcriptionStatus: 'machine_candidate' }; atomicJson(path.join(selection.dir, 'mistral-comparison-candidate.json'), normalized.candidate) }
  atomicJson(path.join(comparisonDir, 'comparison.json'), { ...record, candidate: normalized.candidate || null })
  results.push(record)
  if (page !== selectedPages.at(-1)) await wait(2000)
}
const summary = { schemaVersion: '1.0', jobId, provider: 'mistral-ocr', model: process.env.GIGAS_MISTRAL_OCR_MODEL || 'mistral-ocr-4-0', runId, comparisons: results, usableComparisons: results.filter((r) => r.usable).length, thresholdPassed: results.filter((r) => r.usable).length >= 2, canonical: false, candidateOnly: true, reviewRequired: true }
atomicJson(path.join(outputRoot, 'summary.json'), summary)
console.log(JSON.stringify({ ...summary, outputRoot }, null, 2))
