import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const folioArg = process.argv.find((arg) => arg.startsWith('--folio='))
const folioId = folioArg?.split('=')[1]
if (!folioId) { console.error('ERROR: provide --folio=002r'); process.exit(1) }
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))
const index = read('src/data/codex-index.json')
const entry = index.folios.find((item) => item.id === `folio-${folioId}` || item.id === folioId)
if (!entry) { console.error(`ERROR: unknown folio ${folioId}`); process.exit(1) }
const id = entry.id
const optional = (file, fallback) => fs.existsSync(path.join(root, file)) ? read(file) : fallback
const folio = read(`src/data/folios/${id}.json`)
const captureFiles = fs.readdirSync(path.join(root, 'src/data/source-captures')).filter((file) => file.endsWith('.json')).map((file) => read(`src/data/source-captures/${file}`)).filter((capture) => capture.storedFilename?.includes(id.replace('folio-', '')) || capture.id.includes(id.replace('folio-', '')))
const packageData = {
  folio, indexEntry: entry,
  sourceStrategy: optional(`src/data/source-strategies/${id}.json`, null),
  translationMethods: optional('src/data/translation-methods.json', []),
  layout: optional(`src/data/layouts/${id}.json`, null), regions: optional(`src/data/regions/${id}.json`, []),
  diplomatic: optional(`src/data/transcriptions/${id}-diplomatic.json`, null), expanded: optional(`src/data/transcriptions/${id}-expanded.json`, null),
  literal: optional(`src/data/translations/${id}-literal-en.json`, null), readable: optional(`src/data/translations/${id}-readable-en.json`, null),
  alignments: optional(`src/data/alignments/${id}.json`, []), uncertainReadings: optional(`src/data/uncertain-readings/${id}.json`, []),
  captures: captureFiles, integrity: optional('src/data/asset-integrity.json', { assets:[] }).assets.filter((asset) => asset.assetPath.includes(id.replace('folio-', ''))),
  transformations: optional('src/data/asset-transformations.json', []).filter((item) => item.outputAsset?.includes(id.replace('folio-', ''))),
  reviews: optional(`src/data/reviews/assignments-${id.replace('folio-', '')}.json`, []), findings: optional(`src/data/reviews/findings-${id.replace('folio-', '')}.json`, []), changes: optional(`src/data/change-history/${id}.json`, []),
  release: { status:'blocked', reason:'Canonical text and review layers are incomplete.' },
}
const output = path.join(root, 'exports'); fs.mkdirSync(output, { recursive:true }); fs.writeFileSync(path.join(output, `${id}.json`), JSON.stringify(packageData, null, 2) + '\n')
const markdown = `# Research package: ${id}\n\n- Release status: **${packageData.release.status}**\n- Image captures: ${captureFiles.length}\n- Integrity records: ${packageData.integrity.length}\n- Diplomatic segments: ${packageData.diplomatic?.segments?.length || 0}\n- Regions: ${packageData.regions.length}\n- Alignments: ${packageData.alignments.length}\n- Findings: ${packageData.findings.length}\n\nThis package is a reproducible editorial snapshot. It does not assert historical verification.\n`
fs.writeFileSync(path.join(output, `${id}.md`), markdown)
console.log(`Exported ${id} research package to exports/.`)
