import { parseArgs } from '../src/manuscript/source-ingestion.js'
import { downloadPage } from '../src/manuscript/official-source.js'

const args = parseArgs(process.argv.slice(2))
try {
  const results = []
  for (let page = Number(args.from); page <= Number(args.to); page++) {
    results.push(await downloadPage(args['source-id'], page, args.size || 'review', globalThis.fetch, args.force))
  }
  console.log(JSON.stringify(results, null, 2))
} catch (error) {
  console.error(`ERROR: ${error.message}`)
  process.exit(1)
}
