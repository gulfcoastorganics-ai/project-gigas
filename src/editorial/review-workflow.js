export const REVIEW_STATES = [
  'awaiting_assignment', 'primary_assigned', 'primary_in_review', 'primary_submitted',
  'second_reader_assigned', 'second_reader_in_review', 'second_reader_submitted',
  'comparison_ready', 'disagreements_open', 'adjudication_required', 'adjudicated',
  'canonical_proposal_ready', 'rejected', 'blocked'
]

const transitions = {
  awaiting_assignment: ['primary_assigned', 'rejected', 'blocked'],
  primary_assigned: ['primary_in_review', 'rejected', 'blocked'],
  primary_in_review: ['primary_submitted', 'rejected', 'blocked'],
  primary_submitted: ['second_reader_assigned', 'blocked'],
  second_reader_assigned: ['second_reader_in_review', 'blocked'],
  second_reader_in_review: ['second_reader_submitted', 'blocked'],
  second_reader_submitted: ['comparison_ready', 'blocked'],
  comparison_ready: ['disagreements_open', 'adjudication_required', 'adjudicated', 'blocked'],
  disagreements_open: ['adjudication_required', 'rejected', 'blocked'],
  adjudication_required: ['adjudicated', 'blocked'],
  adjudicated: ['canonical_proposal_ready', 'blocked'],
  canonical_proposal_ready: ['blocked'],
  rejected: [],
  blocked: ['awaiting_assignment', 'primary_assigned', 'rejected']
}

export function allowedReviewTransition(previous, next) {
  return previous === next || Boolean(transitions[previous]?.includes(next))
}

export function validateReviewTransition(previous, next) {
  if (!REVIEW_STATES.includes(previous) || !REVIEW_STATES.includes(next)) return [`Unknown review state: ${previous} → ${next}`]
  return allowedReviewTransition(previous, next) ? [] : [`Invalid review transition: ${previous} → ${next}`]
}

export function getReviewStateTransitions() { return structuredClone(transitions) }

export function validateAssignment(assignment, context = {}) {
  const errors = []
  for (const field of ['id', 'submissionId', 'folioId', 'reviewerId', 'reviewerRole', 'qualificationRecordId', 'assignedAt', 'status', 'submissionSha256']) if (!assignment?.[field]) errors.push(`${assignment?.id || 'assignment'}: missing ${field}`)
  if (assignment?.folioId !== 'folio-002r') errors.push(`${assignment?.id || 'assignment'}: Sprint 8 assignments are restricted to folio-002r`)
  if (context.submissionId && assignment?.submissionId !== context.submissionId) errors.push(`${assignment.id}: submission mismatch`)
  if (context.contributorIds && !context.contributorIds.has(assignment?.reviewerId)) errors.push(`${assignment?.id || 'assignment'}: unknown reviewer ${assignment?.reviewerId}`)
  if (context.qualificationIds && !context.qualificationIds.has(assignment?.qualificationRecordId)) errors.push(`${assignment?.id || 'assignment'}: missing qualification record ${assignment?.qualificationRecordId}`)
  if (!['primary', 'second-reader', 'adjudicator'].includes(assignment?.reviewerRole)) errors.push(`${assignment?.id || 'assignment'}: unsupported reviewer role`)
  if (!['awaiting_assignment', 'assigned', 'in_review', 'submitted', 'blocked', 'rejected'].includes(assignment?.status)) errors.push(`${assignment?.id || 'assignment'}: invalid assignment status`)
  if (assignment?.conflictOfInterest?.declared !== true) errors.push(`${assignment?.id || 'assignment'}: conflict-of-interest declaration is required`)
  return errors
}

export function validateSecondReaderIndependence(primary, second, context = {}) {
  const errors = []
  if (!primary || !second) return ['Both primary and second-reader assignments are required.']
  if (primary.reviewerId === second.reviewerId) errors.push('Primary and second reader must be different contributors.')
  if (second.status === 'assigned' && primary.status !== 'submitted') errors.push('Second-reader assignment is blocked until primary review is submitted.')
  const declaration = second.independenceDeclaration || {}
  if (declaration.independent !== true) errors.push('Second reader must declare an independent reading.')
  if (declaration.priorAccessToPrimaryReading !== false) errors.push('Blind second-reader package must declare no prior access to the primary reading.')
  if (declaration.conflictDisclosed !== true) errors.push('Second reader must disclose conflicts or declare none.')
  if (context.primaryReviewerId && declaration.priorCollaborationWithPrimary === undefined) errors.push('Prior collaboration disclosure is required.')
  return errors
}

export function validateLineReview(record) {
  const errors = []
  for (const field of ['id', 'folioId', 'regionId', 'lineId', 'submissionSha256', 'reviewerId', 'timestamp']) if (!record?.[field]) errors.push(`${record?.id || 'line-review'}: missing ${field}`)
  if (record?.folioId !== 'folio-002r') errors.push(`${record?.id || 'line-review'}: unsupported folio`)
  const coords = record?.imageCoordinates || {}
  for (const field of ['x', 'y', 'width', 'height']) if (!Number.isFinite(coords[field]) || coords[field] < 0 || coords[field] > 1) errors.push(`${record?.id || 'line-review'}: imageCoordinates.${field} must be between 0 and 1`)
  if (coords.width <= 0 || coords.height <= 0) errors.push(`${record?.id || 'line-review'}: image coordinates must have positive dimensions`)
  if (!record?.proposedDiplomaticReading && !record?.illegible) errors.push(`${record?.id || 'line-review'}: proposed reading or illegible marker is required`)
  if (record?.reviewerConfidence !== null && (record?.reviewerConfidence === undefined || record.reviewerConfidence < 0 || record.reviewerConfidence > 1)) errors.push(`${record?.id || 'line-review'}: reviewerConfidence must be between 0 and 1 or null`)
  return errors
}

export const DISAGREEMENT_TYPES = ['character-level', 'word-boundary', 'abbreviation-expansion', 'line-order', 'illegible-text', 'region-boundary', 'punctuation-editorial-mark', 'confidence', 'omitted-added-text']
export function validateDisagreement(record) {
  const errors = []
  for (const field of ['id', 'folioId', 'primaryReviewId', 'secondReviewId', 'classification', 'primaryReading', 'secondaryReading']) if (record?.[field] === undefined || record?.[field] === '') errors.push(`${record?.id || 'disagreement'}: missing ${field}`)
  if (!DISAGREEMENT_TYPES.includes(record?.classification)) errors.push(`${record?.id || 'disagreement'}: invalid classification`)
  if (record?.primaryReviewId === record?.secondReviewId) errors.push(`${record?.id || 'disagreement'}: readings must come from distinct reviews`)
  return errors
}

export function validateAdjudication(record, context = {}) {
  const errors = []
  for (const field of ['id', 'folioId', 'primaryReviewId', 'secondReviewId', 'adjudicatorId', 'decision', 'reason', 'verificationState']) if (!record?.[field]) errors.push(`${record?.id || 'adjudication'}: missing ${field}`)
  if (record?.primaryReviewId === record?.secondReviewId) errors.push(`${record?.id || 'adjudication'}: primary and second review must differ`)
  if (context.adjudicatorIds && !context.adjudicatorIds.has(record?.adjudicatorId)) errors.push(`${record?.id || 'adjudication'}: adjudicator is not authorized`)
  if (record?.decision === 'adjudicated' && (context.openDisagreementCount || 0) > 0) errors.push(`${record.id}: unresolved disagreements block adjudication completion`)
  return errors
}

export function blindPackageProjection(reviewPackage) {
  const { proposedDiplomaticReading, confidence, commentary, comparison, adjudication, primaryReading, ...safe } = reviewPackage || {}
  return safe
}

export function assertBlindPackageSafe(reviewPackage) {
  const forbidden = ['proposedDiplomaticReading', 'confidence', 'commentary', 'comparison', 'adjudication', 'primaryReading']
  return forbidden.filter((key) => Object.prototype.hasOwnProperty.call(reviewPackage || {}, key))
}

export function canonicalProposalBlocked({ primarySubmitted = false, secondSubmitted = false, openDisagreements = 0, qualifiedReviewers = 0 } = {}) {
  const blockers = []
  if (!primarySubmitted) blockers.push('primary review has not been submitted')
  if (!secondSubmitted) blockers.push('independent second review has not been submitted')
  if (openDisagreements > 0) blockers.push(`${openDisagreements} unresolved disagreement(s) remain`)
  if (qualifiedReviewers < 2) blockers.push('two qualified review records are required')
  return blockers
}
