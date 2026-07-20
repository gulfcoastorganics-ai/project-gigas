import fs from 'node:fs'
import path from 'node:path'
import { root, sha256, imageDimensions, mediaType } from '../src/manuscript/source-ingestion.js'
import { validateRegionBounds } from '../src/manuscript/region-pilot.js'

const target = process.argv.find((x) => x.startsWith('--path='))?.slice(7)
if (!target) { console.error('ERROR: use --path=<region-run>'); process.exit(1) }
const dir = path.resolve(target); const errors = []; const read = (name) => { const file = path.join(dir, name); if (!fs.existsSync(file)) { errors.push(`${name}_missing`); return null } try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { errors.push(`${name}_malformed`); return null } }
const pkg = read('review-package.json'); const region = read('region.json'); const source = read('region-source-manifest.json'); const result = read('result.json')
if (pkg?.canonical !== false || pkg?.reviewRequired !== true) errors.push('package_policy_invalid')
if (region) errors.push(...validateRegionBounds(region.boundingBoxPixels).map((error) => `region:${error}`))
if (source) { const image = fs.existsSync(path.join(dir, 'region-source.jpg')) ? path.join(dir, 'region-source.jpg') : result?.requestManifest?.sourceImagePath; if (!image || !fs.existsSync(image)) errors.push('region_image_missing'); else { const bytes = fs.readFileSync(image); const expectedHash = source.sha256 || source.regionSha256; if (expectedHash && sha256(bytes) !== expectedHash) errors.push('region_hash_mismatch'); if (mediaType(image) !== 'image/jpeg' || !imageDimensions(bytes, 'image/jpeg')) errors.push('region_image_invalid') } if (source.canonical !== false) errors.push('source_manifest_canonical') }
if (result) { if (result.canonical !== false || result.candidateOnly !== true || result.reviewRequired !== true || (!['blocked', 'failed'].includes(result.status) && result.promotionEligible !== false)) errors.push('result_policy_invalid'); if (result.normalizedCandidate?.lines) { const ids = new Set(); for (const line of result.normalizedCandidate.lines) { if (ids.has(line.lineId)) errors.push('duplicate_line_id'); ids.add(line.lineId) } } }
console.log(JSON.stringify({ valid: errors.length === 0, errors, path: path.relative(root, dir), canonical: false, reviewRequired: true }, null, 2)); if (errors.length) process.exit(1)
