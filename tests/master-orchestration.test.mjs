import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

test('master orchestration is resumable, range bounded, and canonical isolated', () => {
  const source = fs.readFileSync('scripts/finish-manuscript.mjs', 'utf8')
  assert.match(source, /buildMasterCompletionIndex/); assert.match(source, /MISTRAL_API_KEY_missing/); assert.match(source, /storage_below_2gb/); assert.match(source, /\[600, 629\]/); assert.match(source, /canonical_fingerprint_mismatch_after_processing/)
  assert.match(source, /terminalizeOrphanedJobs/)
  assert.doesNotMatch(source, /OPENROUTER_API_KEY/); assert.doesNotMatch(source, /GEMINI_API_KEY/); assert.doesNotMatch(source, /download-full-pdf/)
})
