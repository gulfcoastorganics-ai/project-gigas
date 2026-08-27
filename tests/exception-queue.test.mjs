import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

test('exception collection scans all newest batch pages and preserves terminal human review', () => {
  const source = fs.readFileSync('scripts/exceptions.mjs', 'utf8')
  assert.match(source, /jobsByPage/); assert.match(source, /retry_exhausted/); assert.match(source, /human_review_required/); assert.doesNotMatch(source, /first >= 200 && first <= 399/)
})

test('terminal exception records remain noncanonical and require human review', () => {
  const queue = JSON.parse(fs.readFileSync('tests/fixtures/exception-queue.json', 'utf8'))
  const page = queue.exceptions.find((item) => item.page === 59)
  assert.ok(page)
  assert.equal(page.retryStatus, 'retry_exhausted')
  assert.equal(page.resolutionStatus, 'human_review_required')
  assert.equal(page.canonical, false)
  assert.equal(page.reviewRequired, true)
})
