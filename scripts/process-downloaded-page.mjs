import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { parseArgs, root, candidateRoot, sha256, imageDimensions, mediaType, writeJson } from '../src/manuscript/source-ingestion.js'
import { officialSource, calculateFileSha256 } from '../src/manuscript/official-source.js'

const args = parseArgs(process.argv.slice(2))
const page = Number(args.page)
const sourceId = args['source-id'] || officialSource.sourceId

const file = path.join(root, 'data/sources/pages', sourceId, `source-page-${String(page).padStart(4, '0')}.jpg`)
const manifestPath = `${file}.manifest.json`

if (!fs.existsSync(file) || !fs.existsSync(manifestPath)) {
  console.error('ERROR: downloaded page or its manifest is missing; run source:download-page first')
  process.exit(1)
}

// 1. Validate the download manifest
let manifest
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
} catch (error) {
  console.error(`ERROR: failed to read manifest JSON: ${error.message}`)
  process.exit(1)
}

if (manifest.sourceId !== sourceId || Number(manifest.sourcePage) !== page) {
  console.error('ERROR: manifest sourceId or page mismatch')
  process.exit(1)
}

const fileBytes = fs.statSync(file).size
if (fileBytes !== manifest.bytes) {
  console.error(`ERROR: file size (${fileBytes}) does not match manifest bytes (${manifest.bytes})`)
  process.exit(1)
}

const fileHash = await calculateFileSha256(file)
if (fileHash !== manifest.sha256) {
  console.error(`ERROR: file hash (${fileHash}) does not match manifest sha256 (${manifest.sha256})`)
  process.exit(1)
}

const imageDir = path.join(candidateRoot, 'folio-images', sourceId)
fs.mkdirSync(imageDir, { recursive: true })
const target = path.join(imageDir, `official-source-page-${String(page).padStart(4, '0')}.jpg`)
fs.copyFileSync(file, target)

const bytes = fs.readFileSync(target)
const dimensions = imageDimensions(bytes, mediaType(target))

const selectionPath = path.join(candidateRoot, 'external-sources', sourceId, 'candidate-page-selection.json')
const selection = {
  schemaVersion: '1.0',
  selectionId: `selection-${sourceId}-page-${String(page).padStart(4, '0')}`,
  sourceId,
  sourcePage: page,
  imagePath: path.relative(root, target),
  imageSha256: sha256(bytes),
  pixelWidth: dimensions?.width || null,
  pixelHeight: dimensions?.height || null,
  selectionReason: 'Official page-on-demand download',
  candidateFolioId: null,
  candidateSide: null,
  mappingStatus: 'unmapped',
  canonical: false,
  status: 'unverified_candidate',
  reviewRequired: true
}
writeJson(selectionPath, selection)

// 2. Generate regions file
const regionBase = path.join(candidateRoot, 'regions', `regions-${sourceId}-page-${String(page).padStart(4, '0')}.json`)
const regions = [0, 1].map((column) => {
  const regionId = `region-${sourceId}-page-${String(page).padStart(4, '0')}-column-${column + 1}`
  return {
    regionId,
    columnNumber: column + 1,
    normalizedCoordinates: { x: column * 0.5, y: 0, width: 0.5, height: 1 },
    pixelCoordinates: { x: Math.round(column * (dimensions?.width || 0) / 2), y: 0, width: Math.round((dimensions?.width || 0) / 2), height: dimensions?.height || 0 },
    linePlaceholders: [1, 2, 3].map((lineNumber) => ({ lineId: `${regionId}-line-${String(lineNumber).padStart(3, '0')}`, lineNumber, readingOrder: column * 1000 + lineNumber, diplomaticLatin: null }))
  }
})
writeJson(regionBase, {
  schemaVersion: '1.0',
  manifestId: path.basename(regionBase, '.json'),
  sourceId,
  sourcePage: page,
  imagePath: selection.imagePath,
  sourceImageSha256: selection.imageSha256,
  regions,
  refinementStatus: 'automatically_regenerated',
  canonical: false,
  status: 'unverified_candidate',
  reviewRequired: true,
  transcriptionTextPresent: false
})

const evidencePath = path.join(root, 'data/candidates/evidence/first-page-mapping.txt')
writeJson(path.join(candidateRoot, 'source-folio-map.json'), {
  schemaVersion: '1.0',
  sourceId,
  sourcePage: page,
  mappingStatus: 'unmapped',
  candidateFolioId: null,
  candidateSide: null,
  evidence: fs.existsSync(evidencePath) ? [{ path: path.relative(root, evidencePath), sha256: sha256(fs.readFileSync(evidencePath)) }] : [],
  canonical: false,
  reviewRequired: true
})

// 3. Launch a new isolated run
const child = spawn(process.execPath, [
  path.join(root, 'scripts/run-first-folio-passes.mjs'),
  `--source-id=${sourceId}`,
  `--page=${page}`,
  args['new-run'] ? '--new-run' : ''
], { stdio: 'inherit' })

child.on('close', (code) => {
  if (code === 0) {
    // 4. Export a review package on success
    console.log('Passes completed successfully. Exporting review package...')
    const exporter = spawn(process.execPath, [
      path.join(root, 'scripts/export-first-folio-review-package.mjs'),
      `--source-id=${sourceId}`,
      `--page=${page}`
    ], { stdio: 'inherit' })
    exporter.on('close', (expCode) => {
      process.exit(expCode || 0)
    })
  } else {
    process.exit(code || 0)
  }
})
