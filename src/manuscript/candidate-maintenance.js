import fs from 'node:fs'
import path from 'node:path'
import { root, sha256 } from './source-ingestion.js'
import { atomicJson } from './batch-pipeline.js'

function walk(directory, visit) { if (!fs.existsSync(directory)) return; for (const entry of fs.readdirSync(directory, { withFileTypes: true })) { const file = path.join(directory, entry.name); if (entry.isDirectory()) walk(file, visit); else visit(file) } }

export function pruneVerifiedReconstructableCrops({ roots = [path.join(root, 'data/candidates/batches'), path.join(root, 'exports/batch-transcriptions')] } = {}) {
  const removed = []; const rejected = []
  for (const base of roots) walk(base, (file) => {
    if (path.basename(file) !== 'crop.jpg') return
    const directory = path.dirname(file); const regionFile = path.join(directory, 'region.json'); const candidateFile = path.join(directory, 'candidate.json'); const resultFile = path.join(directory, 'provider-result.json'); const rawFile = path.join(directory, 'raw-response.txt'); const pageDirectory = path.dirname(path.dirname(directory)); const pageCandidate = path.join(pageDirectory, 'page-candidate.json')
    if (![regionFile, candidateFile, resultFile, rawFile, pageCandidate].every(fs.existsSync)) { rejected.push({ path: path.relative(root, file), reason: 'verification_evidence_incomplete' }); return }
    let region; try { region = JSON.parse(fs.readFileSync(regionFile, 'utf8')) } catch { rejected.push({ path: path.relative(root, file), reason: 'region_manifest_invalid' }); return }
    const bytes = fs.readFileSync(file); const hash = sha256(bytes); if (!region.cropUrl || !region.crop?.sha256 || region.crop.sha256 !== hash) { rejected.push({ path: path.relative(root, file), reason: 'crop_identity_or_hash_invalid' }); return }
    removed.push({ path: path.relative(root, file), sha256: hash, bytes: bytes.length, cropUrl: region.cropUrl, regionId: region.regionId, reconstructable: true }); fs.rmSync(file)
  })
  const report = { schemaVersion: '1.0', generatedAt: new Date().toISOString(), removed, rejected, bytesReclaimed: removed.reduce((sum, item) => sum + item.bytes, 0), policy: 'Only verified IIIF crop derivatives with preserved URL, hash, normalized candidate, raw response, provider result, and page candidate were removed.', canonical: false, candidateOnly: true }
  const directory = path.join(root, 'data/candidates/maintenance'); fs.mkdirSync(directory, { recursive: true }); const file = path.join(directory, `crop-prune-${new Date().toISOString().replace(/[:.]/g, '-')}.json`); atomicJson(file, report); return { ...report, reportPath: path.relative(root, file) }
}
