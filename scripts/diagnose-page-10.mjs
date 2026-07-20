import fs from 'node:fs'
import path from 'node:path'
import { candidateRoot, root, parseArgs, writeJson, sha256, mediaType, imageDimensions } from '../src/manuscript/source-ingestion.js'
import { resolveCandidatePage } from '../src/manuscript/external-source.js'
import { invokeVisionModelSafe } from '../src/manuscript/vision-provider-runtime.js'
import { validateImagePayload, verifyImageFile, verifyDataUrl, cropCoordinates, validateCrop } from '../src/manuscript/vision-diagnostics.js'

const args = parseArgs(process.argv.slice(2))
const sourceId = args['source-id']
const page = Number(args.page || 10)
if (!sourceId || page !== 10) { console.error('ERROR: diagnostic is restricted to --page=10'); process.exit(1) }
const resolved = resolveCandidatePage(sourceId, page)
const expected = '2aa2d4e2a3891c40d5ad74c1243ea735e93b73f14ac2d6773dd4e51cec305098'
const sourceCheck = verifyImageFile(resolved.imagePath, expected)
if (!sourceCheck.valid) { console.error(JSON.stringify({ status: 'blocked', sourceCheck }, null, 2)); process.exit(1) }
const runId = `diagnostic-${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}-${process.pid}`
const dir = path.join(candidateRoot, 'diagnostics', sourceId, `page-${String(page).padStart(4, '0')}`, runId)
fs.mkdirSync(dir, { recursive: true })
const dimensions = sourceCheck.dimensions
const fullPagePath = path.join(dir, 'full-page-2400-source.jpg')
fs.copyFileSync(resolved.imagePath, fullPagePath)
const fullCheck = verifyImageFile(fullPagePath, expected)
const crops = cropCoordinates(dimensions.width, dimensions.height).map((crop) => ({ ...crop, valid: validateCrop(crop, dimensions.width, dimensions.height), imagePath: null, status: 'descriptor_only_no_local_raster_tool' }))
const diagnosticManifest = { schemaVersion: '1.0', status: 'diagnostic', sourceId, sourcePage: page, sourceImage: { path: path.relative(root, resolved.imagePath), sha256: sourceCheck.sha256, mime: sourceCheck.mime, bytes: sourceCheck.byteCount, dimensions }, derivatives: [{ identity: 'full-page-2400', path: path.relative(root, fullPagePath), sha256: fullCheck.sha256, mime: fullCheck.mime, bytes: fullCheck.byteCount, dimensions, transformation: 'byte-identical authority copy' }, { identity: 'full-page-1200', status: 'not_generated', reason: 'No local raster resize utility is installed; original authority retained.' }], crops, contactSheet: { status: 'not_generated', reason: 'No local raster compositor is installed.' }, generatedAt: new Date().toISOString(), originalUnmodified: sourceCheck.sha256 === fullCheck.sha256 }
writeJson(path.join(dir, 'diagnostic-manifest.json'), diagnosticManifest)
const prompt = `You are performing page triage only on the attached official manuscript image. Return JSON only with fields: containsText (boolean), folioPage (boolean), orientationCorrect (boolean), columnsDetected (integer), writingRegions (array of objects with name and normalized boundingBox), imageQuality (string), limitations (array), visibleTextEvidence (array of concise visual observations), triageConfidence (number 0 to 1). Do not transcribe, translate, identify a known passage, or infer from memory. Inspect the full image pixels. A photographed medieval folio with visible writing must not be called a cover. Policy fields such as canonical, blocked, reviewRequired, approval, and scholarly verification are application-controlled and must not be returned.`
const response = await invokeVisionModelSafe({ imagePath: resolved.imagePath, expectedImageHash: expected, prompt, schema: { type: 'triage', required: ['containsText', 'folioPage', 'orientationCorrect', 'columnsDetected', 'writingRegions', 'imageQuality', 'limitations', 'visibleTextEvidence', 'triageConfidence'] }, requestId: `${runId}-page-triage` })
const manifest = { ...diagnosticManifest, request: response.requestManifest || null, provider: { provider: response.provider, configuredModel: response.model, actualRoutedModel: response.actualRoutedModel, responseId: response.responseId || null, requestPayloadHash: response.requestPayloadHash || null, promptSha256: sha256(Buffer.from(prompt)), status: response.status, failureClassification: response.failureClassification || null, retryCount: response.retryCount || 0 }, response: { rawResponsePath: response.rawProviderResponse ? 'raw-provider-response.txt' : null, rawResponseSha256: response.rawProviderResponseHash || '', providerEnvelopeHash: response.providerEnvelopeHash || '', assistantContentHash: response.assistantContentHash || '', parsedOutputHash: response.parsedOutputHash || '', validationErrors: response.validationErrors || [], parsedOutput: response.parsedOutput || null }, policy: { canonical: false, candidateOnly: true, reviewRequired: true, scholarlyVerified: false }, completedAt: new Date().toISOString() }
if (response.rawProviderResponse) fs.writeFileSync(path.join(dir, 'raw-provider-response.txt'), response.rawProviderResponse)
writeJson(path.join(dir, 'diagnostic-manifest.json'), manifest)
console.log(JSON.stringify({ runId, output: path.relative(root, dir), status: response.status, failureClassification: response.failureClassification || null, triage: response.parsedOutput || null, sourceSha256: sourceCheck.sha256, transmittedImageSha256: response.transmittedImageSha256 || null, requestPayloadHash: response.requestPayloadHash || null }, null, 2))
