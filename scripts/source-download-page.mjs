import { parseArgs } from '../src/manuscript/source-ingestion.js'
import { downloadPage } from '../src/manuscript/official-source.js'

const args = parseArgs(process.argv.slice(2))
try {
  const result = await downloadPage(args['source-id'], Number(args.page), args.size || 'review', globalThis.fetch, args.force)
  console.log(JSON.stringify(result, null, 2))
} catch (error) {
  console.error(JSON.stringify({ error: error.message, details: error.details || null }, null, 2))
  process.exit(1)
}
