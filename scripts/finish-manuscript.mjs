import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { root, sha256 } from '../src/manuscript/source-ingestion.js'
import { atomicJson, storageSnapshot } from '../src/manuscript/batch-pipeline.js'
import { buildMasterCompletionIndex, terminalizeOrphanedJobs } from '../src/manuscript/master-completion.js'
import { exportMasterEdition, verifyMasterEdition } from '../src/manuscript/master-edition.js'

const expectedFingerprint = '4b99fb184f7cf26efaf11fe6d2f41780b33a1e3183dd3c8d3a3c9149ae78fcd0'
const stateFile = path.join(root, 'data/candidates/master-edition/master-job.json')
const now = () => new Date().toISOString()
function fingerprint() { const command = spawnSync(process.execPath, [path.join(root, 'scripts/fingerprint-folio.mjs'), '--folio=002r'], { cwd: root, encoding: 'utf8' }); if (command.status) throw new Error('canonical_fingerprint_failed'); return JSON.parse(command.stdout).fingerprint }
let state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : { schemaVersion: '1.0', jobId: `master-${now().replace(/[:.]/g, '-')}-${process.pid}`, state: 'prepared', createdAt: now(), canonicalFingerprintBefore: fingerprint(), ranges: [], canonical: false, candidateOnly: true, reviewRequired: true }
function save() { state.updatedAt = now(); atomicJson(stateFile, state) }
function run(label, script, args, env, { continueOnFailure = false } = {}) { const entry = { label, script, args, state: 'running', startedAt: now() }; state.ranges.push(entry); save(); const result = spawnSync(process.execPath, [path.join(root, script), ...args], { cwd: root, env: { ...process.env, ...env }, stdio: 'inherit' }); entry.finishedAt = now(); entry.exitCode = result.status; entry.state = result.status === 0 ? 'completed' : 'blocked'; save(); if (result.status !== 0 && !continueOnFailure) throw new Error(`${label}_failed`) }
function pages(from, to) { return Array.from({ length: to - from + 1 }, (_, index) => from + index) }
function latestTranslationJob(from, to) { const base = path.join(root, 'data/candidates/translation-production'); if (!fs.existsSync(base)) return null; return fs.readdirSync(base, { withFileTypes: true }).filter((entry) => entry.isDirectory()).flatMap((entry) => { const file = path.join(base, entry.name, 'production-job.json'); if (!fs.existsSync(file)) return []; try { return [JSON.parse(fs.readFileSync(file, 'utf8'))] } catch { return [] } }).filter((job) => job.pages?.[0] === from && job.pages?.[1] === to).sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))[0] || null }
try {
  if (state.canonicalFingerprintBefore !== expectedFingerprint || fingerprint() !== expectedFingerprint) throw new Error('canonical_fingerprint_mismatch_before_processing')
  if (!process.env.MISTRAL_API_KEY) throw new Error('MISTRAL_API_KEY_missing')
  state.state = 'running'; save()
  for (const [from, to] of [[1, 9], [400, 499], [500, 599], [600, 629]]) {
    let index = buildMasterCompletionIndex(); if (pages(from, to).every((page) => index.pages[page - 1]?.transcription?.candidatePath)) continue
    const disk = storageSnapshot(); if (disk.freeBytes < disk.pauseBelowBytes) throw new Error('storage_below_2gb')
    run(`ocr-${from}-${to}`, 'scripts/transcribe-production.mjs', [`--pages=${from}-${to}`], { GIGAS_VISION_PROVIDER: 'mistral-ocr', GIGAS_MISTRAL_OCR_MODEL: 'mistral-ocr-4-0', GIGAS_VISION_TIMEOUT_MS: '180000' })
  }
  run('exception-refresh-before-recovery', 'scripts/exceptions.mjs', ['--command=report'], {})
  const queue = JSON.parse(fs.readFileSync(path.join(root, 'data/candidates/exceptions/queue.json'), 'utf8')); const retryJobs = [...new Set(queue.exceptions.filter((item) => item.retryStatus === 'retryable' && item.page !== 59).map((item) => item.jobId))]
  for (const jobId of retryJobs) run(`exception-recovery-${jobId}`, 'scripts/retry-regions.mjs', [`--job=${jobId}`], { GIGAS_VISION_PROVIDER: 'mistral-ocr', GIGAS_MISTRAL_OCR_MODEL: 'mistral-ocr-4-0', GIGAS_MISTRAL_MAX_ATTEMPTS: '2', GIGAS_MISTRAL_RETRY_DELAYS_MS: '5000', GIGAS_VISION_TIMEOUT_MS: '180000' }, { continueOnFailure: true })
  run('exception-refresh-after-recovery', 'scripts/exceptions.mjs', ['--command=report'], {})
  for (const [from, to] of [[1, 9], [10, 19], [100, 199], [200, 299], [300, 399], [400, 499], [500, 599], [600, 629]]) {
    let index = buildMasterCompletionIndex(); const needed = pages(from, to).filter((page) => { const item = index.pages[page - 1]; return item?.classification === 'text_bearing' && !item.translation?.candidatePath }); if (!needed.length) continue
    const disk = storageSnapshot(); if (disk.freeBytes < disk.pauseBelowBytes) throw new Error('storage_below_2gb')
    const existing = latestTranslationJob(from, to); const args = [`--pages=${from}-${to}`, '--chunk-size=50']; if (existing && !String(existing.state).startsWith('completed')) args.push(`--production-job=${existing.productionId}`)
    run(`translation-${from}-${to}`, 'scripts/translate-production.mjs', args, { GIGAS_TRANSLATION_PROVIDER: 'mistral', GIGAS_TRANSLATION_MODEL: 'mistral-small-2603', GIGAS_TRANSLATION_TIMEOUT_MS: '180000', GIGAS_TRANSLATION_MAX_OUTPUT_TOKENS: '16384' })
  }
  run('exception-report', 'scripts/exceptions.mjs', ['--command=report'], {})
  state.orphanedJobsTerminalized = terminalizeOrphanedJobs()
  const exported = exportMasterEdition(); const verified = verifyMasterEdition(); if (!verified.valid) throw new Error(`master_edition_verification_failed:${verified.errors.join(',')}`)
  state.export = exported.exportPath; state.viewer = exported.viewerUrl; state.verification = verified; state.canonicalFingerprintAfter = fingerprint(); if (state.canonicalFingerprintAfter !== expectedFingerprint) throw new Error('canonical_fingerprint_mismatch_after_processing'); state.state = 'completed'; state.finishedAt = now(); save()
  console.log(JSON.stringify({ jobId: state.jobId, state: state.state, export: state.export, viewer: state.viewer, verification: verified, canonicalFingerprintBefore: state.canonicalFingerprintBefore, canonicalFingerprintAfter: state.canonicalFingerprintAfter, stateHash: sha256(fs.readFileSync(stateFile)) }, null, 2))
} catch (error) { state.state = 'blocked'; state.blocker = error.message; state.finishedAt = now(); state.canonicalFingerprintAfter = fingerprint(); save(); console.error(JSON.stringify({ jobId: state.jobId, state: state.state, blocker: state.blocker, resume: 'npm run manuscript:finish', canonicalFingerprintBefore: state.canonicalFingerprintBefore, canonicalFingerprintAfter: state.canonicalFingerprintAfter }, null, 2)); process.exitCode = 1 }
