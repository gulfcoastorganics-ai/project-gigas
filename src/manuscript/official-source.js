import fs from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import crypto from 'node:crypto'
import { root, sha256, mediaType, imageDimensions, writeJson } from './source-ingestion.js'

export const sourceRoot = path.join(root, 'data/sources')
export const officialSource = { sourceId: 'external-459e4da71e7fd69d189a8196c9d9a9beb03026e4bbbdce06b37dec39a74981a0', institution: 'National Library of Sweden', shelfmark: 'A 148', title: 'Codex Gigas', variantTitle: 'Djävulsbibeln', language: 'Latin', approximateDate: '1210–1220', extentLeaves: 309, license: 'CC BY 4.0', licenseUri: 'https://creativecommons.org/licenses/by/4.0/', attribution: 'National Library of Sweden; photographer Per B. Adolphson.', catalogUrl: 'https://libris.kb.se/bib/20821675', viewerUrl: 'https://www.manuscripta.se/ms/100500', pdfUrl: 'https://libris.kb.se/assets/codex-gigas-4gb.pdf', pdfAccessUrl: 'https://libris.kb.se/showrecord?d=libris&f=&g=&m=10&n=1&q=onr%3A20821675&r=&s=r&t=v&tab1=getit&tab2=ill&tab3=full&vw=', iiifManifestUrl: 'https://www.manuscripta.se/iiif/100500/manifest.json', catalogIdentifier: '19091448', evidenceRole: 'institutional_catalog_and_digital_surrogate' }
const dirs = { catalog: path.join(sourceRoot, 'catalog'), manifests: path.join(sourceRoot, 'manifests'), downloads: path.join(sourceRoot, 'downloads'), pages: path.join(sourceRoot, 'pages') }
const ensureDirs = () => Object.values(dirs).forEach((dir) => fs.mkdirSync(dir, { recursive: true }))
const officialHosts = new Set(['libris.kb.se', 'www.manuscripta.se', 'manuscripta.se', 'iiif.manuscripta.se', 'www.kb.se', 'kb.se'])
function assertOfficial(url) { const parsed = new URL(url); if (!officialHosts.has(parsed.hostname)) throw new Error('untrusted_source_host'); return parsed }
function storagePreflight(expectedBytes, temporaryBytes, safetyMargin) { const stat = fs.statfsSync(root); const freeBytes = stat.bsize * stat.bavail; const requiredBytes = expectedBytes + temporaryBytes + safetyMargin; if (freeBytes < requiredBytes) { const error = new Error('insufficient_storage'); error.details = { filesystem: root, freeBytes, expectedBytes, temporaryBytes, requiredBytes, shortfall: requiredBytes - freeBytes }; throw error } return { filesystem: root, freeBytes, expectedBytes, temporaryBytes, requiredBytes, shortfall: 0 } }
export function sourceStoragePreflight(expectedBytes, mode = 'page') { return storagePreflight(Number(expectedBytes || 0), mode === 'full' ? 2 * 1024 ** 3 : Number(process.env.GIGAS_MAX_IMAGE_BYTES || 50 * 1024 ** 2), mode === 'full' ? 0 : 500 * 1024 ** 2) }
function jsonResponseBody(response) { return response.text().then((text) => { try { return JSON.parse(text) } catch { return { text } } }) }
async function fetchOfficial(url, fetchImpl) { let current = url; for (let hop = 0; hop < 4; hop++) { assertOfficial(current); const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), Number(process.env.GIGAS_SOURCE_TIMEOUT_MS || 30000)); try { const response = await fetchImpl(current, { redirect: 'manual', signal: controller.signal }); if (response.status >= 300 && response.status < 400) { const location = response.headers.get('location'); if (!location) throw new Error('redirect_without_location'); const next = new URL(location, current).toString(); assertOfficial(next); current = next; continue } if (!response.ok) throw new Error(`source_http_${response.status}`); return { response, retrievedAt: new Date().toISOString(), finalUrl: current } } catch (error) { if (error.name === 'AbortError') throw new Error('source_timeout'); throw error } finally { clearTimeout(timer) } } throw new Error('too_many_redirects') }
export async function syncMetadata(fetchImpl = globalThis.fetch) { ensureDirs(); const catalogFetch = await fetchOfficial(officialSource.catalogUrl, fetchImpl); const catalog = await jsonResponseBody(catalogFetch.response); const manifestFetch = await fetchOfficial(officialSource.iiifManifestUrl, fetchImpl); const manifest = await jsonResponseBody(manifestFetch.response); const record = { schemaVersion: '1.0', ...officialSource, accessDate: new Date().toISOString(), retrieval: { catalog: { url: officialSource.catalogUrl, status: catalogFetch.response.status, retrievedAt: catalogFetch.retrievedAt }, iiifManifest: { url: officialSource.iiifManifestUrl, status: manifestFetch.response.status, retrievedAt: manifestFetch.retrievedAt } }, catalog, iiifManifest: manifest, sourceRecordHash: sha256(Buffer.from(JSON.stringify({ ...officialSource, catalog, manifest }))), canonical: false }; writeJson(path.join(dirs.catalog, `${officialSource.sourceId}.json`), { source: officialSource, catalog, accessDate: record.accessDate }); writeJson(path.join(dirs.manifests, `${officialSource.sourceId}.json`), record); writeJson(path.join(dirs.manifests, `${officialSource.sourceId}-iiif.json`), manifest); return record }
function canvasImage(canvas) { const page = canvas.items?.[0]?.items?.[0]?.body || canvas.images?.[0]?.resource; const service = page?.service?.[0] || page?.service || canvas.images?.[0]?.resource?.service; return { imageUrl: page?.id || page?.['@id'] || null, serviceId: service?.id || service?.['@id'] || null, width: page?.width || canvas.width || null, height: page?.height || canvas.height || null } }
export function parseIiifManifest(manifest) { const canvases = manifest.items || manifest.sequences?.[0]?.canvases || []; return canvases.map((canvas, index) => { const image = canvasImage(canvas); const service = image.serviceId; return { sourcePage: index + 1, canvasId: canvas.id || canvas['@id'] || null, label: typeof canvas.label === 'string' ? canvas.label : canvas.label?.en?.[0] || canvas.label?.none?.[0] || null, folioLabel: null, imageUrl: image.imageUrl, imageServiceId: service, width: image.width, height: image.height, downloadStatus: 'not_downloaded', verificationStatus: 'unverified' } }) }
export function listPages() { const file = path.join(dirs.manifests, `${officialSource.sourceId}.json`); if (!fs.existsSync(file)) throw new Error('metadata_not_synced'); const manifest = JSON.parse(fs.readFileSync(file, 'utf8')); const pages = parseIiifManifest(manifest.iiifManifest); writeJson(path.join(dirs.manifests, `${officialSource.sourceId}-page-inventory.json`), { schemaVersion: '1.0', sourceId: officialSource.sourceId, pages, canonical: false }); return pages }
export function validateOfficialInventory(from = 1, to = 629) {
  const file = path.join(dirs.manifests, `${officialSource.sourceId}-page-inventory.json`)
  if (!fs.existsSync(file)) throw new Error('official_inventory_missing')
  const inventory = JSON.parse(fs.readFileSync(file, 'utf8'))
  const pages = inventory.pages
  const ids = pages?.map((page) => page.canvasId)
  const valid = inventory.sourceId === officialSource.sourceId && pages?.length === 629 &&
    manifestUrlMatches() && ids.every(Boolean) && new Set(ids).size === ids.length &&
    pages.every((page, index) => page.sourcePage === index + 1) &&
    pages.some((page) => page.sourcePage === Number(from)) && pages.some((page) => page.sourcePage === Number(to))
  if (!valid) {
    const error = new Error('official_inventory_invalid')
    error.details = { sourceId: inventory.sourceId, count: pages?.length || 0, expectedCount: 629, manifestUrl: readManifestUrl(), requestedRange: [Number(from), Number(to)] }
    throw error
  }
  return { sourceId: officialSource.sourceId, manifestUrl: readManifestUrl(), count: pages.length, retrievedAt: readRetrievalTime(), pages }
}
function readSourceRecord() { const file = path.join(dirs.manifests, `${officialSource.sourceId}.json`); return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null }
function readManifestUrl() { return readSourceRecord()?.iiifManifestUrl || null }
function readRetrievalTime() { return readSourceRecord()?.retrieval?.iiifManifest?.retrievedAt || null }
function manifestUrlMatches() { return readManifestUrl() === officialSource.iiifManifestUrl }
function iiifUrl(page, size) { if (!page.imageServiceId) return page.imageUrl; const width = size === 'preview' ? 1200 : size === 'full' ? 'full' : 2400; return `${page.imageServiceId}/full/${width},/0/default.jpg` }
export async function calculateFileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', (err) => reject(err))
  })
}
export async function streamDownload(url, destination, expectedBytes = 0, fetchImpl = globalThis.fetch) {
  assertOfficial(url)
  const partial = `${destination}.partial`
  const sidecar = `${destination}.download.json`
  let offset = fs.existsSync(partial) ? fs.statSync(partial).size : 0
  let side = fs.existsSync(sidecar) ? JSON.parse(fs.readFileSync(sidecar, 'utf8')) : null
  if (side && side.url !== url) {
    fs.rmSync(partial, { force: true })
    offset = 0
    side = null
  }
  const headers = {}
  if (offset) headers.range = `bytes=${offset}-`
  let response = await fetchImpl(url, { headers, redirect: 'manual' })
  if (![200, 206].includes(response.status)) throw new Error(`download_http_${response.status}`)
  
  // Changed ETag check to trigger restart
  const responseEtag = response.headers.get('etag')
  if (offset > 0 && side && side.etag && responseEtag && side.etag !== responseEtag) {
    fs.rmSync(partial, { force: true })
    offset = 0
    response = await fetchImpl(url, { redirect: 'manual' })
    if (!response.ok) throw new Error(`download_http_${response.status}`)
  }

  const contentType = response.headers.get('content-type') || ''
  if (!/^image\/(jpeg|png|tiff|webp|jp2)|application\/pdf/i.test(contentType)) throw new Error('unexpected_content_type')
  const append = offset > 0 && response.status === 206
  if (offset && !append) {
    fs.rmSync(partial, { force: true })
    offset = 0
  }
  const stream = Readable.fromWeb(response.body)
  await pipeline(stream, fs.createWriteStream(partial, { flags: append ? 'a' : 'w' }))
  const bytes = fs.statSync(partial).size
  const expected = expectedBytes || Number((response.headers.get('content-length') || 0)) + (append ? offset : 0)
  if (expected && bytes < expected) throw new Error('truncated_response')
  fs.renameSync(partial, destination)
  const sha256Val = await calculateFileSha256(destination)
  const meta = { url, expectedSize: expected || null, downloadedBytes: bytes, etag: response.headers.get('etag'), lastModified: response.headers.get('last-modified'), acceptRanges: response.headers.get('accept-ranges'), startTime: side?.startTime || new Date().toISOString(), lastUpdate: new Date().toISOString(), retryCount: side?.retryCount || 0, sha256: sha256Val, sha256Status: 'verified' }
  writeJson(sidecar, meta)
  return { path: destination, bytes, contentType: mediaType(destination) || contentType.split(';')[0], sha256: meta.sha256, etag: meta.etag, lastModified: meta.lastModified, httpStatus: response.status, declaredContentType: contentType }
}
export async function downloadPage(sourceId, pageNumber, size = 'review', fetchImpl = globalThis.fetch, force = false) {
  if (sourceId !== officialSource.sourceId) throw new Error('unknown_source_id')
  const inventory = listPages()
  const page = inventory[Number(pageNumber) - 1]
  if (!page) throw new Error('page_out_of_range')
  const url = iiifUrl(page, size)
  const dir = path.join(dirs.pages, sourceId)
  fs.mkdirSync(dir, { recursive: true })
  const ext = '.jpg'
  const destination = path.join(dir, `source-page-${String(page.sourcePage).padStart(4, '0')}${ext}`)
  const manifestPath = `${destination}.manifest.json`

  if (!force && fs.existsSync(destination) && fs.existsSync(manifestPath)) {
    try {
      const existingManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
      const actualSize = fs.statSync(destination).size
      if (existingManifest.bytes === actualSize) {
        const actualHash = await calculateFileSha256(destination)
        if (existingManifest.sha256 === actualHash) {
          return { ...existingManifest, path: destination }
        }
      }
    } catch {
      // ignore and download
    }
  }

  sourceStoragePreflight(Number(process.env.GIGAS_MAX_IMAGE_BYTES || 50 * 1024 ** 2), 'page')
  const downloaded = await streamDownload(url, destination, 0, fetchImpl)
  const record = { schemaVersion: '1.0', sourceId, downloadType: 'page_image', sourcePage: page.sourcePage, folioLabel: page.folioLabel, canvasId: page.canvasId, imageServiceId: page.imageServiceId, sourceUrl: url, finalUrl: url, retrievedAt: new Date().toISOString(), institution: officialSource.institution, shelfmark: officialSource.shelfmark, license: officialSource.license, attribution: officialSource.attribution, contentType: downloaded.contentType, bytes: downloaded.bytes, sha256: downloaded.sha256, etag: downloaded.etag, lastModified: downloaded.lastModified, canonical: false, evidenceRole: 'digital_surrogate', size }
  writeJson(manifestPath, record)
  return { ...record, path: destination }
}
export async function downloadFullPdf(sourceId, fetchImpl = globalThis.fetch) {
  if (sourceId !== officialSource.sourceId) throw new Error('unknown_source_id')
  if (!officialSource.pdfUrl) throw new Error('pdf_url_not_configured')
  const dir = dirs.downloads
  fs.mkdirSync(dir, { recursive: true })
  const destination = path.join(dir, `official-full-pdf.pdf`)
  const estimatedBytes = 4258291712
  sourceStoragePreflight(estimatedBytes, 'full')
  const downloaded = await streamDownload(officialSource.pdfUrl, destination, estimatedBytes, fetchImpl)
  const record = { schemaVersion: '1.0', sourceId, downloadType: 'full_pdf', sourceUrl: officialSource.pdfUrl, finalUrl: downloaded.url || officialSource.pdfUrl, retrievedAt: new Date().toISOString(), institution: officialSource.institution, shelfmark: officialSource.shelfmark, license: officialSource.license, attribution: officialSource.attribution, contentType: downloaded.contentType, bytes: downloaded.bytes, sha256: downloaded.sha256, etag: downloaded.etag, lastModified: downloaded.lastModified, canonical: false, evidenceRole: 'digital_surrogate' }
  writeJson(`${destination}.manifest.json`, record)
  return { ...record, path: destination }
}
export function storageReport() {
  ensureDirs()
  const files = []
  function walk(dir) {
    if (!fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(file)
      else files.push({ path: path.relative(root, file), bytes: fs.statSync(file).size })
    }
  }
  walk(path.join(root, 'data'))
  walk(path.join(root, 'exports'))
  walk(path.join(root, 'src/data'))
  const total = files.reduce((n, f) => n + f.bytes, 0)

  const categories = { archival: 0, reproducible: 0, temporary: 0, reviewEvidence: 0, canonical: 0 }
  for (const f of files) {
    const p = f.path
    if (p.endsWith('.partial') || p.endsWith('.tmp') || p.includes('/tmp/') || p.includes('/temp/')) {
      categories.temporary += f.bytes
    } else if (p.startsWith('src/data/')) {
      categories.canonical += f.bytes
    } else if (p.startsWith('data/sources/')) {
      categories.archival += f.bytes
    } else if (p.startsWith('data/derived/') || p.startsWith('data/candidates/folio-images/')) {
      categories.reproducible += f.bytes
    } else if (p.startsWith('exports/') || p.startsWith('data/candidates/evidence/') || p.includes('/runs/')) {
      categories.reviewEvidence += f.bytes
    } else {
      categories.temporary += f.bytes
    }
  }

  return {
    totalProjectBytes: total,
    sourceFilesBytes: files.filter((f) => f.path.startsWith('data/sources/')).reduce((n, f) => n + f.bytes, 0),
    derivedFilesBytes: files.filter((f) => f.path.startsWith('data/derived/')).reduce((n, f) => n + f.bytes, 0),
    candidateRunsBytes: files.filter((f) => f.path.includes('/runs/')).reduce((n, f) => n + f.bytes, 0),
    reviewPackagesBytes: files.filter((f) => f.path.startsWith('exports/')).reduce((n, f) => n + f.bytes, 0),
    largest20: files.sort((a, b) => b.bytes - a.bytes).slice(0, 20),
    activePartials: files.filter((f) => f.path.endsWith('.partial')),
    classifications: categories
  }
}
export function pruneCache() {
  const removed = []
  const derivedDir = path.join(root, 'data/derived')
  if (fs.existsSync(derivedDir)) {
    for (const entry of fs.readdirSync(derivedDir, { withFileTypes: true })) {
      const file = path.join(derivedDir, entry.name)
      fs.rmSync(file, { recursive: true, force: true })
      removed.push(path.relative(root, file))
    }
  }
  function walkAndRemovePartials(dir) {
    if (!fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walkAndRemovePartials(file)
      } else if (entry.name.endsWith('.partial')) {
        fs.rmSync(file, { force: true })
        removed.push(path.relative(root, file))
      }
    }
  }
  walkAndRemovePartials(path.join(root, 'data'))
  return removed
}

