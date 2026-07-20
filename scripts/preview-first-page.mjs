import { parseArgs } from '../src/manuscript/source-ingestion.js'
import { createPagePreview } from '../src/manuscript/first-page-runtime.js'
const args = parseArgs(process.argv.slice(2)); if (!args['source-id'] || !args.page) { console.error('ERROR: use --source-id=<id> --page=1'); process.exit(1) }
try { console.log(JSON.stringify(createPagePreview(args['source-id'], args.page).preview, null, 2)) } catch (error) { console.error(`ERROR: ${error.message}`); process.exit(1) }
