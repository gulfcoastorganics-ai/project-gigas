import path from 'node:path'
import { ingest, parseArgs } from '../src/manuscript/source-ingestion.js'
const args = parseArgs(process.argv.slice(2)); if (!args.input) { console.error('ERROR: use --input=<path>'); process.exit(1) }
try { const manifest = ingest(args.input); console.log(JSON.stringify({ sourceId: manifest.sourceId, classification: manifest.classification, pageCount: manifest.pageCount, canonical: false, manifest: `data/candidates/manifests/${manifest.sourceId}.json` }, null, 2)) } catch (error) { console.error(`ERROR: ${error.message}`); process.exit(1) }
