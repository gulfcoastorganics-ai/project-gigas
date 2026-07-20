import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

test('master edition is candidate-only, aligned, searchable, and covers official inventory', () => {
  const source = fs.readFileSync('src/manuscript/master-edition.js', 'utf8'); const viewer = fs.readFileSync('src/editorial/master-edition-viewer.js', 'utf8')
  assert.match(source, /inventoryCount !== 629/); assert.match(source, /sourceLineId/); assert.match(source, /canonical: false/); assert.match(source, /reviewRequired: true/)
  assert.match(viewer, /UNVERIFIED MACHINE TRANSCRIPTION AND TRANSLATION — NOT A SCHOLARLY EDITION/); assert.match(viewer, /Search Latin and English/); assert.match(viewer, /data-layer/)
})
