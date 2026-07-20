import fs from 'node:fs'
import path from 'node:path'
import { root, candidateRoot, sha256, imageDimensions, mediaType, writeJson } from './source-ingestion.js'
import { qualityWarnings } from './quality-calibration.js'

export const batchRoot = path.join(candidateRoot, 'batches')
export const batchPolicy = { canonical: false, candidateOnly: true, reviewRequired: true, scholarlyVerified: false, transcriptionStatus: 'machine_candidate', translationStatus: 'not_attempted', promotionEligible: false }

export function parsePageRange(value) {
  const match = String(value || '').match(/^(\d+)(?:-(\d+))?$/)
  if (!match) throw new Error('invalid_page_range')
  const from = Number(match[1]); const to = Number(match[2] || match[1])
  if (from < 1 || to < from) throw new Error('invalid_page_range')
  return Array.from({ length: to - from + 1 }, (_, i) => from + i)
}

export function mapDisplayToNative(box, display, native) {
  const sx = native.width / display.width; const sy = native.height / display.height
  const x = Math.max(0, Math.min(native.width - 1, Math.round(box.x * sx)))
  const y = Math.max(0, Math.min(native.height - 1, Math.round(box.y * sy)))
  const width = Math.max(1, Math.min(native.width - x, Math.round(box.width * sx)))
  const height = Math.max(1, Math.min(native.height - y, Math.round(box.height * sy)))
  return { x, y, width, height, scaleX: sx, scaleY: sy }
}

export function buildBatchJob({ sourceId, pages, provider, model, jobId = `batch-${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}` }) {
  return { schemaVersion: '1.0', jobId, sourceId, pagesRequested: pages, state: 'queued', provider, model, concurrency: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), requestCount: 0, retryCount: 0, pages: pages.map((page) => ({ page, state: 'queued', regions: [], failures: [], lines: 0, coverage: 0 })), ...batchPolicy }
}

export function jobDirectory(jobId) { return path.join(batchRoot, jobId) }
export function jobFile(jobId) { return path.join(jobDirectory(jobId), 'job.json') }
export function atomicJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); const temp = `${file}.${process.pid}.tmp`; const fd = fs.openSync(temp, 'w'); try { fs.writeFileSync(fd, JSON.stringify(value, null, 2) + '\n'); fs.fsyncSync(fd) } finally { fs.closeSync(fd) }; fs.renameSync(temp, file) }
export function saveJob(job) { job.updatedAt = new Date().toISOString(); atomicJson(jobFile(job.jobId), job); return job }
export function loadJob(jobId) { return JSON.parse(fs.readFileSync(jobFile(jobId), 'utf8')) }
export function updatePage(job, page, patch) { const item = job.pages.find((entry) => entry.page === Number(page)); if (!item) throw new Error('page_not_in_job'); Object.assign(item, patch); saveJob(job); return item }

export function segmentColumns({ width, height, columns = 2 }) {
  const result = []; const marginX = Math.round(width * 0.10); const gutter = Math.round(width * 0.06); const top = Math.round(height * 0.12); const bottom = Math.round(height * 0.88)
  const usable = Math.floor((width - marginX * 2 - gutter) / columns); const regionHeight = Math.round((bottom - top) / 2); const overlap = Math.round(regionHeight * 0.10)
  for (let column = 0; column < columns; column++) { const x = marginX + column * (usable + gutter); for (let row = 0; row < 2; row++) { const y = Math.max(top, top + row * regionHeight - (row ? overlap : 0)); const end = Math.min(bottom, top + (row + 1) * regionHeight); result.push({ column: column === 0 ? 'left' : 'right', order: column * 2 + row, x, y, width: usable, height: end - y }) } }
  return result
}

export function mergeRegionCandidates(regions) {
  const lines = []; const disagreements = []
  for (const region of regions.filter((entry) => entry.candidate?.lines && Array.isArray(entry.candidate.lines))) for (const line of region.candidate.lines) {
    const text = line.diplomaticLatin ?? line.text ?? ''
    const normalized = String(text).trim().toLowerCase().replace(/\s+/g, ' ')
    const duplicate = lines.find((existing) => existing.normalized === normalized && normalized)
    if (duplicate) { duplicate.sources.push(region.regionId); continue }
    const collision = lines.find((existing) => existing.column === region.column && Math.abs(existing.sequence - Number(line.sequence || line.lineNumber || 0)) < 1 && existing.normalized && normalized && existing.normalized !== normalized)
    if (collision) { collision.alternatives = [...new Set([...(collision.alternatives || []), text])]; collision.reviewRequired = true; disagreements.push({ issue: 'overlapping_line_disagreement', lineId: collision.lineId, readings: [collision.diplomaticLatin, text], resolution: 'unresolved', reviewRequired: true }); continue }
    lines.push({ lineId: `${region.regionId}-line-${String(lines.length + 1).padStart(4, '0')}`, column: region.column, sequence: Number(line.sequence || line.lineNumber || lines.length + 1), diplomaticLatin: text, normalized, confidence: Number(line.confidence ?? 0), uncertainTokens: line.uncertainTokens || [], illegible: Boolean(line.illegible), sources: [region.regionId], alternatives: [], reviewRequired: Boolean(line.uncertainTokens?.length || line.illegible) })
  }
  return { lines, disagreements }
}

export function plausibilityWarnings(lines = [], estimatedLines = 0, context = {}, calibration = null) { return qualityWarnings(lines, { ...context, estimatedLines }, calibration) }

export function validateBatchImage(file, expectedHash = null) { const bytes = fs.readFileSync(file); const type = mediaType(file); const dimensions = imageDimensions(bytes, type); const hash = sha256(bytes); if (!bytes.length || !dimensions?.width || !dimensions?.height) throw new Error('invalid_page_image'); if (expectedHash && hash !== expectedHash) throw new Error('page_image_hash_mismatch'); return { bytes: bytes.length, sha256: hash, mime: type, dimensions } }

export function pageManifest({ sourceId, page, inventory, image, url, nativeDimensions }) { return { schemaVersion: '1.0', sourceId, sourcePage: page, canvasId: inventory.canvasId, folioLabel: inventory.folioLabel || inventory.label || null, imageServiceId: inventory.imageServiceId, sourceUrl: url, bytes: image.bytes, sha256: image.sha256, contentType: image.mime, dimensions: image.dimensions, nativeDimensions, canonical: false, evidenceRole: 'digital_surrogate', retrievedAt: new Date().toISOString() } }

export function batchSummary(job) { return { jobId: job.jobId, state: job.state, pagesRequested: job.pagesRequested, completed: job.pages.filter((p) => p.state === 'completed').length, partial: job.pages.filter((p) => p.state === 'partial').length, blocked: job.pages.filter((p) => ['blocked', 'terminal_failed'].includes(p.state)).length, regionsAttempted: job.pages.reduce((n, p) => n + p.regions.length, 0), regionsSucceeded: job.pages.reduce((n, p) => n + p.regions.filter((r) => r.state === 'completed').length, 0), lines: job.pages.reduce((n, p) => n + p.lines, 0), requestCount: job.requestCount, retryCount: job.retryCount, ...batchPolicy } }

export function writePageCandidate(job, page, value) { const file = path.join(jobDirectory(job.jobId), `pages/page-${String(page).padStart(4, '0')}/page-candidate.json`); atomicJson(file, { schemaVersion: '1.0', ...batchPolicy, ...value }); return file }

export function writeFailure(job, page, failure) { const file = path.join(jobDirectory(job.jobId), `failures/page-${String(page).padStart(4, '0')}.json`); atomicJson(file, failure); return file }

export function storageSnapshot() { const stat = fs.statfsSync(root); return { filesystem: root, freeBytes: stat.bsize * stat.bavail, maxImageBytes: Number(process.env.GIGAS_MAX_IMAGE_BYTES || 50 * 1024 ** 2), warnBelowBytes: 3 * 1024 ** 3, pauseBelowBytes: 2 * 1024 ** 3 } }
