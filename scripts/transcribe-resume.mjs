import { spawn } from 'node:child_process'
import path from 'node:path'
import { root, parseArgs } from '../src/manuscript/source-ingestion.js'
const args = parseArgs(process.argv.slice(2)); const child = spawn(process.execPath, [path.join(root, 'scripts/transcribe-batch.mjs'), `--job=${args.job}`, '--resume'], { stdio: 'inherit' }); child.on('close', (code) => { process.exitCode = code || 0 })

