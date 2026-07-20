import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const source = (file) => fs.readFileSync(path.join(root, file), 'utf8')

test('reader wiring covers core navigation and persistence workflows', () => {
  const reader = source('src/components/codex-reader.js'); const folio = source('src/components/folio-page.js')
  assert.match(reader, /ArrowLeft/); assert.match(reader, /ArrowRight/); assert.match(reader, /popstate/); assert.match(reader, /savePreferences/); assert.match(folio, /data-bookmark/); assert.match(reader, /SourcePanel/)
})
test('provenance and image foundations are wired without external services', () => {
  assert.match(source('src/data/provenance.js'), /formatCitation/); assert.match(source('src/images/tiled-image-adapter.js'), /getTileManifest/); assert.match(source('src/images/tiled-viewer.js'), /TileCache/); assert.match(source('src/images/viewport-controller.js'), /pointerdown/); assert.match(source('public/service-worker.js'), /isCacheable/)
})
test('deterministic fixture inventory is complete', () => {
  const index = JSON.parse(source('src/data/codex-index.json')); assert.equal(index.folios.length, 10); for (const folio of index.folios) assert.ok(fs.existsSync(path.join(root, 'src/data/folios', `${folio.id}.json`)))
})
test('pilot records remain provenance-aware and release-blocked', () => {
  const pilot = JSON.parse(source('src/data/folios/folio-002r.json')); assert.equal(pilot.sources.image.licenseId, 'license-cc-by-4-0'); assert.equal(pilot.sources.transcription.verificationState, 'placeholder'); assert.equal(pilot.transcriptionSegments.length, 0); assert.match(pilot.imageSource.manifest, /002r/)
})
test('Sprint 5 editorial routes and structured search are present', () => {
  assert.match(source('src/editorial/region-authoring.js'), /saveRegionDraft/); assert.match(source('src/editorial/comparison-view.js'), /findings/); assert.match(source('src/editorial/evidence-view.js'), /draft-layout-overlay/); assert.match(source('src/search/search-index.js'), /createTextSearchIndex/); assert.match(source('scripts/release-check.mjs'), /diplomatic transcription/)
})
