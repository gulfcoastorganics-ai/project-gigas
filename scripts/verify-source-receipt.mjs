import { verifyReceipt } from '../src/manuscript/external-source.js'
import { parseArgs } from '../src/manuscript/source-ingestion.js'
const args = parseArgs(process.argv.slice(2)); if (!args.path) { console.error('ERROR: use --path=<receipt>'); process.exit(1) }
try { const result = verifyReceipt(args.path); console.log(JSON.stringify(result, null, 2)); if (!result.valid) process.exit(1) } catch (error) { console.error(`ERROR: ${error.message}`); process.exit(1) }
