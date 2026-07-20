import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pruneVerifiedReconstructableCrops } from '../src/manuscript/candidate-maintenance.js'
import { sha256 } from '../src/manuscript/source-ingestion.js'

test('only verified reconstructable crop derivatives are pruned', () => { const base = fs.mkdtempSync(path.join(os.tmpdir(), 'gigas-prune-')); const page = path.join(base, 'job/pages/page-0001'); const region = path.join(page, 'regions/r1'); fs.mkdirSync(region, { recursive: true }); const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]); fs.writeFileSync(path.join(region, 'crop.jpg'), bytes); fs.writeFileSync(path.join(region, 'region.json'), JSON.stringify({ regionId: 'r1', cropUrl: 'https://iiif.manuscripta.se/crop', crop: { sha256: sha256(bytes) } })); for (const file of ['candidate.json', 'provider-result.json']) fs.writeFileSync(path.join(region, file), '{}'); fs.writeFileSync(path.join(region, 'raw-response.txt'), 'raw'); fs.writeFileSync(path.join(page, 'page-candidate.json'), '{}'); const result = pruneVerifiedReconstructableCrops({ roots: [base] }); assert.equal(result.removed.length, 1); assert.equal(result.bytesReclaimed, bytes.length); assert.equal(fs.existsSync(path.join(region, 'crop.jpg')), false); fs.rmSync(base, { recursive: true, force: true }) })
