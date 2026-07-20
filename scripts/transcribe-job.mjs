import fs from 'node:fs'
import path from 'node:path'
import { parseArgs, root } from '../src/manuscript/source-ingestion.js'
import { batchRoot, jobDirectory, jobFile, loadJob, batchSummary, storageSnapshot, atomicJson } from '../src/manuscript/batch-pipeline.js'

const args = parseArgs(process.argv.slice(2)); const job = loadJob(args.job)
const command = args.command || process.argv[1].split('/').pop()
if (command === 'transcribe-status.mjs') console.log(JSON.stringify({ ...batchSummary(job), jobPath: jobFile(job.jobId), storage: storageSnapshot() }, null, 2))
else if (command === 'transcribe-failures.mjs') console.log(JSON.stringify(job.pages.flatMap((page) => page.failures.map((failure) => ({ page: page.page, ...failure }))), null, 2))
else if (command === 'transcribe-export.mjs') { const out = path.join(root, 'exports', 'batch-transcriptions', job.jobId); fs.mkdirSync(out, { recursive: true }); fs.cpSync(jobDirectory(job.jobId), out, { recursive: true }); atomicJson(path.join(out, 'export-manifest.json'), { schemaVersion: '1.0', jobId: job.jobId, exportedAt: new Date().toISOString(), canonical: false, candidateOnly: true }); console.log(JSON.stringify({ path: out, ...batchSummary(job) }, null, 2)) }
else if (command === 'transcribe-storage-report.mjs') console.log(JSON.stringify(storageSnapshot(), null, 2))
else if (command === 'transcribe-prune-temp.mjs') { const removed = []; const dir = jobDirectory(job.jobId); if (fs.existsSync(dir)) for (const file of fs.readdirSync(dir, { recursive: true })) if (file.endsWith('.partial') || file.endsWith('.download.json')) { const full = path.join(dir, file); fs.rmSync(full, { force: true }); removed.push(full) } console.log(JSON.stringify({ removed, policy: 'only partial/download sidecars' }, null, 2)) }
else if (command === 'transcribe-retry-failures.mjs') { for (const page of job.pages) if (page.state === 'retryable_failed' || page.state === 'partial') page.state = 'queued'; job.state = 'queued'; atomicJson(jobFile(job.jobId), job); console.log(JSON.stringify({ jobId: job.jobId, state: job.state, retried: job.pages.filter((p) => p.state === 'queued').map((p) => p.page) }, null, 2)) }
else throw new Error('unknown_job_command')
