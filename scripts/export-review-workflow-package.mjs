import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { blindPackageProjection } from '../src/editorial/review-workflow.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = Object.fromEntries(process.argv.slice(2).map((arg) => { const [key, value] = arg.replace(/^--/, '').split('='); return [key, value || true] }))
const kind = args.kind || 'primary'; const folio = args.folio || '002r'; if (folio !== '002r') throw new Error('Sprint 8 review packages are restricted to folio 002r.')
const timestamp = process.env.GIGAS_EXPORT_TIMESTAMP || new Date().toISOString(); const safeTimestamp = timestamp.replace(/[:.]/g, '-')
const output = path.join(root, 'exports', 'review-workflow', `folio-${folio}`, kind, safeTimestamp); fs.mkdirSync(output, { recursive: true })
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))
const fingerprint = crypto.createHash('sha256'); for (const file of ['src/data/layouts/folio-002r.json','src/data/regions/folio-002r.json','src/data/transcriptions/folio-002r-diplomatic.json','src/data/transcriptions/folio-002r-expanded.json','src/data/translations/folio-002r-literal-en.json','src/data/translations/folio-002r-readable-en.json','src/data/alignments/folio-002r.json','src/data/uncertain-readings/folio-002r.json','src/data/reviews/assignments-002r.json','src/data/reviews/findings-002r.json','src/data/change-history/folio-002r.json']) fingerprint.update(fs.readFileSync(path.join(root, file)))
const files = {}; const write = (name, value) => { const target = path.join(output, name); fs.mkdirSync(path.dirname(target), { recursive: true }); const content = typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`; fs.writeFileSync(target, content); files[name] = { sha256: crypto.createHash('sha256').update(content).digest('hex'), byteLength: Buffer.byteLength(content) } }
const state = read('src/data/reviews/sprint-8/state.json'); const assignments = read('src/data/reviews/sprint-8/assignments.json'); const lines = read('src/data/reviews/sprint-8/line-reviews.json'); const disagreements = read('src/data/reviews/sprint-8/disagreements.json'); const adjudications = read('src/data/reviews/sprint-8/adjudications.json')
write('records/state.json', state); write('records/assignments.json', assignments); write('records/line-reviews.json', kind === 'second-reader' ? lines.map((item) => blindPackageProjection(item)) : lines)
if (kind === 'second-reader') write('records/blind-review-boundary.json', { excludedFields: ['primaryReading','proposedDiplomaticReading','confidence','commentary','comparison','adjudication'], primaryReviewerConclusions: 'excluded', firstReaderText: 'excluded' })
if (kind === 'comparison') write('records/disagreements.json', disagreements)
if (kind === 'adjudication') write('records/adjudications.json', adjudications)
if (kind === 'unresolved') write('reports/unresolved-disagreements.json', disagreements.filter((item) => item.status !== 'resolved'))
write('instructions/README.md', `# ${kind} review package\n\nFolio: folio-${folio}\n\nThis package is candidate-only. It cannot modify canonical repository data. Reviewers must preserve supplied readings and report disagreements rather than silently reconciling them.\n`)
write('manifest.json', { schemaVersion: 'sprint-8-review-workflow-1', packageKind: kind, folioId: `folio-${folio}`, createdAt: timestamp, canonicalFingerprint: fingerprint.digest('hex'), canonicalMutation: false, includedRecords: Object.keys(files), files })
console.log(JSON.stringify({ output, packageKind: kind, canonicalMutation: false, canonicalFingerprint: read('src/data/reviews/sprint-8/state.json').canonicalFingerprint || 'see manifest' }, null, 2))
