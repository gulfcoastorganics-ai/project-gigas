import { registerExternal } from '../src/manuscript/external-source.js'
import { parseArgs } from '../src/manuscript/source-ingestion.js'
const args = parseArgs(process.argv.slice(2)); if (!args.input || !args.metadata) { console.error('ERROR: use --input=<path> --metadata=<path>'); process.exit(1) }
try { const receipt = registerExternal(args.input, args.metadata); console.log(JSON.stringify({ sourceId: receipt.sourceId, classification: receipt.sourceClassification, rightsState: receipt.rights.rightsState, pageCount: receipt.pageCount, receipt: `data/candidates/external-sources/${receipt.sourceId}/source-receipt.json`, canonical: false }, null, 2)) } catch (error) { console.error(`ERROR: ${error.message}`); process.exit(1) }
