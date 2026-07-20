import fs from 'node:fs'
import path from 'node:path'
import { root, sha256 } from './source-ingestion.js'
import { atomicJson } from './batch-pipeline.js'
import { buildMasterCompletionIndex } from './master-completion.js'

const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
const warning = 'UNVERIFIED MACHINE TRANSCRIPTION AND TRANSLATION — NOT A SCHOLARLY EDITION'

function alignedPage(page) {
  const transcription = page.transcription?.candidatePath ? read(path.join(root, page.transcription.candidatePath)) : null
  const translation = page.translation?.candidatePath ? read(path.join(root, page.translation.candidatePath)) : null
  const translationById = new Map((translation?.lines || []).map((line) => [line.sourceLineId, line]))
  const sourceLines = translation?.lines || transcription?.lines || []
  const lines = sourceLines.map((source, index) => {
    const sourceLineId = source.sourceLineId || source.lineId || `page-${String(page.sourcePage).padStart(4, '0')}-line-${String(index + 1).padStart(4, '0')}`
    const translated = translationById.get(sourceLineId) || (translation?.lines || []).find((line) => line.sourceLineId === sourceLineId)
    return {
      sourceLineId,
      diplomaticLatin: source.diplomaticLatin ?? source.text ?? translated?.diplomaticLatin ?? '',
      expandedLatin: translated?.expandedLatin || '',
      literalEnglish: translated?.literalEnglish || '',
      readableEnglish: translated?.readableEnglish || '',
      coveredBySpanId: translated?.coveredBySpanId || null,
      terminalDisposition: translated?.terminalDisposition || (translation ? 'human_review_required' : null),
      sourceRegions: source.sourceRegionIds || source.regionIds || [],
      confidence: source.confidence ?? null,
      uncertain: Boolean(source.uncertain || source.sourceUncertain || translated?.uncertain),
      warnings: [...new Set([...(source.warnings || []), ...(translated?.warnings || [])])],
      provider: translated?.translationProvider || null,
      model: translated?.translationModel || null
    }
  })
  return {
    schemaVersion: '1.0', sourcePage: page.sourcePage, folioLabel: page.folioLabel, canvasId: page.canvasId,
    imageUrl: `${page.imageServiceId}/full/1600,/0/default.jpg`, dimensions: { width: page.width, height: page.height },
    classification: page.classification, state: page.state, coverage: { transcription: page.transcription?.coverage ?? 0, translation: translation?.coverage || null },
    lines, spans: translation?.spans || [], exceptions: page.exceptions || page.transcription?.failures || [], alternatives: page.alternatives,
    provenance: { transcriptionJobId: page.transcription?.jobId || null, translationProductionId: page.translation?.productionId || null, transcriptionCandidate: page.transcription?.candidatePath || null, translationCandidate: page.translation?.candidatePath || null },
    machineWarning: warning, canonical: false, candidateOnly: true, reviewRequired: true, scholarlyVerified: false
  }
}

export function exportMasterEdition() {
  const completion = buildMasterCompletionIndex(); const publicRoot = path.join(root, 'public/master-edition'); const exportRoot = path.join(root, 'exports/master-edition')
  fs.mkdirSync(path.join(publicRoot, 'pages'), { recursive: true }); fs.mkdirSync(path.join(exportRoot, 'pages'), { recursive: true })
  const pages = []; const search = []; const qualityWarnings = []; const longOutputs = new Map()
  for (const page of completion.pages) {
    const value = alignedPage(page); const name = `page-${String(page.sourcePage).padStart(4, '0')}.json`; const publicFile = path.join(publicRoot, 'pages', name); const exportFile = path.join(exportRoot, 'pages', name)
    atomicJson(publicFile, value); if (fs.existsSync(exportFile)) fs.unlinkSync(exportFile); fs.linkSync(publicFile, exportFile)
    const latin = value.lines.map((line) => `${line.diplomaticLatin} ${line.expandedLatin}`).join(' '); const english = value.lines.map((line) => `${line.literalEnglish} ${line.readableEnglish}`).join(' ')
    const diplomaticLines = value.lines.map((line) => String(line.diplomaticLatin || '').trim()).filter(Boolean); const duplicates = diplomaticLines.length - new Set(diplomaticLines.map((line) => line.toLowerCase().replace(/\s+/g, ' '))).size
    if (diplomaticLines.length && duplicates / diplomaticLines.length > 0.1) qualityWarnings.push({ page: page.sourcePage, issue: 'duplicate_line_rate_above_10_percent', duplicateLines: duplicates, lineCount: diplomaticLines.length })
    if (diplomaticLines.some((line) => /^#{1,6}\s|```|\*\*[^*]+\*\*/.test(line))) qualityWarnings.push({ page: page.sourcePage, issue: 'markdown_artifact_candidate' })
    const normalizedLong = diplomaticLines.join(' ').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); if (normalizedLong.length > 100) { const key = sha256(Buffer.from(normalizedLong)); if (!longOutputs.has(key)) longOutputs.set(key, []); longOutputs.get(key).push(page.sourcePage) }
    pages.push({ page: page.sourcePage, folioLabel: page.folioLabel, state: page.state, classification: page.classification, path: `/master-edition/pages/${name}`, lineCount: value.lines.length, hasEnglish: value.lines.some((line) => line.literalEnglish && line.readableEnglish), reviewRequired: true })
    search.push({ page: page.sourcePage, folioLabel: page.folioLabel, latin, english })
  }
  const crossPageDuplicates = [...longOutputs.entries()].filter(([, sourcePages]) => new Set(sourcePages).size > 1).map(([contentHash, sourcePages]) => ({ issue: 'identical_long_output_across_pages', contentHash, pages: [...new Set(sourcePages)] })); qualityWarnings.push(...crossPageDuplicates)
  const index = { schemaVersion: '1.0', generatedAt: new Date().toISOString(), sourceId: completion.sourceId, manifestUrl: completion.manifestUrl, inventoryCount: completion.inventoryCount, counts: completion.counts, pages, warning, canonical: false, candidateOnly: true, reviewRequired: true }
  const quality = { schemaVersion: '1.0', generatedAt: index.generatedAt, warnings: qualityWarnings, systemicCrossPageDuplication: crossPageDuplicates.length > 0, canonical: false }
  atomicJson(path.join(publicRoot, 'index.json'), index); atomicJson(path.join(publicRoot, 'search.json'), search); atomicJson(path.join(exportRoot, 'index.json'), index); atomicJson(path.join(exportRoot, 'completion-index.json'), completion); atomicJson(path.join(exportRoot, 'quality-report.json'), quality)
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Project GIGAS machine working edition</title><style>body{font:16px system-ui;max-width:1200px;margin:auto;padding:1rem;background:#f4efe3;color:#241d18}header{position:sticky;top:0;background:#f4efe3;padding:.5rem 0}main{display:grid;grid-template-columns:minmax(260px,40%) 1fr;gap:1rem}img{max-width:100%}.line{border-block-end:1px solid #b8aa92;padding:.5rem}b{display:inline-block;min-width:8rem}.warning{background:#5b1b16;color:white;padding:1rem}@media(max-width:700px){main{display:block}}</style><header><h1>Project GIGAS</h1><p class="warning"><strong>${warning}</strong></p><button id="prev">Previous</button> <input id="page" type="number" min="1" max="629" value="1"> <button id="next">Next</button></header><main><figure><img id="image" alt="Official manuscript canvas"><figcaption id="caption"></figcaption></figure><section id="text"></section></main><script type="module">let page=1;const input=document.querySelector('#page');const e=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));async function show(n){page=Math.max(1,Math.min(629,n));input.value=page;const p=await fetch('pages/page-'+String(page).padStart(4,'0')+'.json').then(r=>r.json());document.querySelector('#image').src=p.imageUrl;document.querySelector('#caption').textContent='Canvas '+p.sourcePage+(p.folioLabel?' · '+p.folioLabel:'')+' · '+p.state;document.querySelector('#text').innerHTML=p.lines.map(l=>'<article class="line"><code>'+e(l.sourceLineId)+'</code><p><b>Diplomatic Latin</b> '+e(l.diplomaticLatin)+'</p><p><b>Expanded Latin</b> '+e(l.expandedLatin||'[untranslated]')+'</p><p><b>Literal English</b> '+e(l.literalEnglish||'[untranslated]')+'</p><p><b>Readable English</b> '+e(l.readableEnglish||'[untranslated]')+'</p></article>').join('')||'<p>No machine-readable text candidate.</p>'}document.querySelector('#prev').onclick=()=>show(page-1);document.querySelector('#next').onclick=()=>show(page+1);input.onchange=()=>show(Number(input.value));show(1)</script></html>`
  fs.writeFileSync(path.join(exportRoot, 'edition.html'), html)
  const files = fs.readdirSync(path.join(exportRoot, 'pages')).filter((name) => name.endsWith('.json')).sort().map((name) => { const file = path.join(exportRoot, 'pages', name); return { path: `pages/${name}`, sha256: sha256(fs.readFileSync(file)), bytes: fs.statSync(file).size } })
  const manifest = { schemaVersion: '1.0', generatedAt: index.generatedAt, inventoryCount: completion.inventoryCount, files, indexHash: sha256(fs.readFileSync(path.join(exportRoot, 'index.json'))), completionIndexHash: sha256(fs.readFileSync(path.join(exportRoot, 'completion-index.json'))), qualityReport: { path: 'quality-report.json', sha256: sha256(fs.readFileSync(path.join(exportRoot, 'quality-report.json'))), systemicCrossPageDuplication: quality.systemicCrossPageDuplication }, browsableEdition: { path: 'edition.html', sha256: sha256(fs.readFileSync(path.join(exportRoot, 'edition.html'))) }, warning, canonical: false, candidateOnly: true, reviewRequired: true }
  atomicJson(path.join(exportRoot, 'manifest.json'), manifest); return { index, manifest, exportPath: path.relative(root, exportRoot), viewerUrl: '/editor/master-edition' }
}

export function verifyMasterEdition() {
  const base = path.join(root, 'exports/master-edition'); const manifest = read(path.join(base, 'manifest.json')); const index = read(path.join(base, 'index.json')); const errors = []
  if (manifest.inventoryCount !== 629 || index.inventoryCount !== 629 || index.pages.length !== 629 || manifest.files.length !== 629) errors.push('official_inventory_or_page_export_count_invalid')
  const htmlFile = path.join(base, manifest.browsableEdition?.path || ''); if (!fs.existsSync(htmlFile) || sha256(fs.readFileSync(htmlFile)) !== manifest.browsableEdition?.sha256) errors.push('browsable_edition_invalid')
  const qualityFile = path.join(base, manifest.qualityReport?.path || ''); if (!fs.existsSync(qualityFile) || sha256(fs.readFileSync(qualityFile)) !== manifest.qualityReport?.sha256) errors.push('quality_report_invalid'); else if (read(qualityFile).systemicCrossPageDuplication) errors.push('systemic_cross_page_duplication_detected')
  for (const item of manifest.files) { const file = path.join(base, item.path); if (!fs.existsSync(file) || sha256(fs.readFileSync(file)) !== item.sha256) errors.push(`file_hash_invalid:${item.path}`); else { const page = read(file); const ids = new Set(page.lines.map((line) => line.sourceLineId)); for (const line of page.lines) if ((line.literalEnglish || line.readableEnglish) && !ids.has(line.sourceLineId)) errors.push(`source_alignment_invalid:${item.path}:${line.sourceLineId}`); if (page.canonical !== false || page.reviewRequired !== true) errors.push(`candidate_policy_invalid:${item.path}`) } }
  return { valid: errors.length === 0, verifiedAt: new Date().toISOString(), inventoryCount: index.inventoryCount, pages: index.pages.length, errors, canonical: false }
}
