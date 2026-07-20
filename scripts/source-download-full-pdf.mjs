import { parseArgs } from '../src/manuscript/source-ingestion.js'
import { officialSource, downloadFullPdf } from '../src/manuscript/official-source.js'

const args = parseArgs(process.argv.slice(2))
if (!args['confirm-large-download']) {
  console.error('ERROR: full PDF requires --confirm-large-download')
  process.exit(1)
}
if (!officialSource.pdfUrl) {
  console.error('ERROR: official PDF URL is not published as a direct configured URL; use the catalog access link after confirming the official download endpoint.')
  process.exit(1)
}

try {
  const result = await downloadFullPdf(args['source-id'] || officialSource.sourceId)
  console.log(JSON.stringify(result, null, 2))
} catch (error) {
  console.error(JSON.stringify({ error: error.message, details: error.details || null }, null, 2))
  process.exit(1)
}
