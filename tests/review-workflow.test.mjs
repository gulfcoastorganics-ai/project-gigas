import test from 'node:test'
import assert from 'node:assert/strict'
import { validateAssignment, validateSecondReaderIndependence, validateLineReview, validateDisagreement, validateAdjudication, validateReviewTransition, assertBlindPackageSafe, canonicalProposalBlocked } from '../src/editorial/review-workflow.js'

const baseAssignment = { id: 'assignment-1', submissionId: 'submission-1', folioId: 'folio-002r', reviewerId: 'reviewer-1', reviewerRole: 'primary', qualificationRecordId: 'qualification-1', assignedAt: '2026-07-11', status: 'assigned', conflictOfInterest: { declared: true }, submissionSha256: 'a'.repeat(64) }

test('unauthorized reviewer and missing qualification are rejected', () => {
  const errors = validateAssignment(baseAssignment, { contributorIds: new Set(), qualificationIds: new Set() })
  assert.match(errors.join('\n'), /unknown reviewer/); assert.match(errors.join('\n'), /missing qualification/)
})
test('primary and second reviewer identity collision is rejected', () => {
  const second = { ...baseAssignment, id: 'assignment-2', reviewerRole: 'second-reader', status: 'assigned', independenceDeclaration: { independent: true, priorAccessToPrimaryReading: false, conflictDisclosed: true, priorCollaborationWithPrimary: false } }
  assert.match(validateSecondReaderIndependence(baseAssignment, second).join('\n'), /different contributors/)
})
test('conflict disclosure and premature second review are blockers', () => {
  const second = { ...baseAssignment, id: 'assignment-2', reviewerId: 'reviewer-2', reviewerRole: 'second-reader', status: 'assigned', independenceDeclaration: { independent: true, priorAccessToPrimaryReading: false, conflictDisclosed: false } }
  const errors = validateSecondReaderIndependence({ ...baseAssignment, status: 'in_review' }, second)
  assert.match(errors.join('\n'), /submitted/); assert.match(errors.join('\n'), /conflict/)
})
test('malformed region coordinates and missing submission hash are rejected', () => {
  const errors = validateLineReview({ id: 'line-1', folioId: 'folio-002r', regionId: 'region-1', lineId: 'line-1', imageCoordinates: { x: 2, y: 0, width: 0, height: .1 }, proposedDiplomaticReading: '', illegible: false, reviewerConfidence: null, reviewerId: 'r', timestamp: '2026-07-11' })
  assert.match(errors.join('\n'), /submissionSha256/); assert.match(errors.join('\n'), /between 0 and 1/)
})
test('invalid review-state transitions are rejected', () => { assert.match(validateReviewTransition('primary_in_review', 'canonical_proposal_ready').join('\n'), /Invalid review transition/) })
test('disagreements preserve both readings exactly', () => {
  const record = { id: 'd-1', folioId: 'folio-002r', primaryReviewId: 'p', secondReviewId: 's', classification: 'character-level', primaryReading: 'abc', secondaryReading: 'ab?c', status: 'open' }
  assert.deepEqual([record.primaryReading, record.secondaryReading], ['abc', 'ab?c']); assert.deepEqual(validateDisagreement(record), [])
})
test('unresolved disagreement blocks adjudication completion and unauthorized adjudicator is rejected', () => {
  const errors = validateAdjudication({ id: 'a-1', folioId: 'folio-002r', primaryReviewId: 'p', secondReviewId: 's', adjudicatorId: 'x', decision: 'adjudicated', reason: 'test', verificationState: 'draft' }, { adjudicatorIds: new Set(), openDisagreementCount: 1 })
  assert.match(errors.join('\n'), /not authorized/); assert.match(errors.join('\n'), /unresolved disagreements/)
})
test('blind package excludes primary conclusions', () => {
  assert.deepEqual(assertBlindPackageSafe({ firstReaderText: 'excluded', primaryReading: 'secret', confidence: .5 }), ['confidence', 'primaryReading'])
})
test('canonical proposal requires two valid submitted reviews', () => {
  assert.equal(canonicalProposalBlocked({ primarySubmitted: false, secondSubmitted: false, openDisagreements: 1, qualifiedReviewers: 0 }).length, 4)
})
