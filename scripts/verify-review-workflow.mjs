import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateAssignment, validateLineReview, validateDisagreement, validateAdjudication, canonicalProposalBlocked, validateReviewTransition } from '../src/editorial/review-workflow.js'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))
const assignments = read('src/data/reviews/sprint-8/assignments.json'); const lineReviews = read('src/data/reviews/sprint-8/line-reviews.json'); const disagreements = read('src/data/reviews/sprint-8/disagreements.json'); const adjudications = read('src/data/reviews/sprint-8/adjudications.json'); const state = read('src/data/reviews/sprint-8/state.json')
const errors = []; const contributorIds = new Set(read('src/data/contributors.json').map((item) => item.id)); const qualificationIds = new Set(read('src/data/reviewer-qualifications.json').map((item) => item.id));
for (const item of assignments) errors.push(...validateAssignment(item, { contributorIds, qualificationIds }))
for (const item of lineReviews) errors.push(...validateLineReview(item)); for (const item of disagreements) errors.push(...validateDisagreement(item)); for (const item of adjudications) errors.push(...validateAdjudication(item, { adjudicatorIds: new Set() }))
errors.push(...validateReviewTransition(state.state, state.state)); if (state.canonicalMutation !== false) errors.push('Sprint 8 review records must not mutate canonical data.')
const blockers = canonicalProposalBlocked({ primarySubmitted: assignments.some((item) => item.reviewerRole === 'primary' && item.status === 'submitted'), secondSubmitted: assignments.some((item) => item.reviewerRole === 'second-reader' && item.status === 'submitted'), openDisagreements: disagreements.filter((item) => item.status !== 'resolved').length, qualifiedReviewers: assignments.length })
console.log(JSON.stringify({ assignments: assignments.length, lineReviews: lineReviews.length, disagreements: disagreements.length, adjudications: adjudications.length, state: state.state, canonicalMutation: false, proposalBlockers: blockers, errors }, null, 2)); if (errors.length) process.exit(1)
