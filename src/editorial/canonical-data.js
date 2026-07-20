import layout from '../data/layouts/folio-002r.json'
import regions from '../data/regions/folio-002r.json'
import diplomatic from '../data/transcriptions/folio-002r-diplomatic.json'
import expanded from '../data/transcriptions/folio-002r-expanded.json'
import literal from '../data/translations/folio-002r-literal-en.json'
import readable from '../data/translations/folio-002r-readable-en.json'
import alignments from '../data/alignments/folio-002r.json'
import uncertainties from '../data/uncertain-readings/folio-002r.json'
import assignments from '../data/reviews/assignments-002r.json'
import findings from '../data/reviews/findings-002r.json'
import changes from '../data/change-history/folio-002r.json'
import strategy from '../data/source-strategies/folio-002r.json'

export function getCanonicalEditorialData() { return { layout, regions, diplomatic, expanded, literal, readable, alignments, uncertainties, assignments, findings, changes, strategy } }
export function createDraftSession(baseRevision, contributorId = 'contributor-project-gigas') { return { id: `session-002r-${Date.now()}`, folioId: 'folio-002r', contributorId, startedAt: new Date().toISOString(), lastModifiedAt: new Date().toISOString(), baseRevision, scope: ['regions','diplomatic-transcription'], status: 'draft', dirty: false, validationState: 'not-run', notes: '' } }
