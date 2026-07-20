import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { classifyImage, classifyPdf, ingest, sha256, multimodalCapability } from '../src/manuscript/source-ingestion.js'

function png(width = 120, height = 120) { const b = Buffer.alloc(124); Buffer.from([137,80,78,71,13,10,26,10]).copy(b); b.writeUInt32BE(width, 16); b.writeUInt32BE(height, 20); return b }
function pdfWithImage(image, width = 1200, height = 1200, text = '') { const body = `%PDF-1.4\n1 0 obj<</Type /Catalog /Pages 2 0 R>>endobj\n2 0 obj<</Type /Pages /Kids [3 0 R] /Count 1>>endobj\n3 0 obj<</Type /Page /Resources<</XObject<</Im0 4 0 R>>>> /Contents 5 0 R>>endobj\n4 0 obj<</Subtype /Image /Width ${width} /Height ${height} /Filter /DCTDecode /Length ${image.length}>>\nstream\n${image.toString('latin1')}\nendstream\nendobj\n5 0 obj<</Length ${text.length}>>stream\n${text}\nendstream\nendobj\ntrailer<</Root 1 0 R>>%%EOF`; return Buffer.from(body, 'latin1') }
test('single manuscript image is accepted and classified', () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gigas-source-')); const file = path.join(dir, 'folio.png'); fs.writeFileSync(file, png()); assert.equal(classifyImage(file).classification, 'manuscript_folio_image'); const manifest = ingest(file); assert.equal(manifest.classification, 'manuscript_folio_image'); assert.equal(sha256(fs.readFileSync(file)), manifest.originalSha256) })
test('brochure-like text PDF is not accepted as manuscript evidence', () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gigas-brochure-')); const image = crypto.randomBytes(200); const file = path.join(dir, 'brochure.pdf'); fs.writeFileSync(file, pdfWithImage(image, 120, 120, 'A descriptive exhibition brochure with catalog text repeated many times '.repeat(100))); assert.equal(classifyPdf(file).classification, 'descriptive_document'); assert.throws(() => ingest(file), /descriptive_document/) })
test('image-heavy PDF is classified as manuscript scan', () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gigas-pdf-')); const file = path.join(dir, 'scan.pdf'); fs.writeFileSync(file, pdfWithImage(Buffer.concat([Buffer.from([255,216]), crypto.randomBytes(1000), Buffer.from([255,217])]))); assert.equal(classifyPdf(file).classification, 'manuscript_scan') })
test('text-only transcription capability is blocked', () => { const old = { cli: process.env.GIGAS_LLM_CLI, multi: process.env.GIGAS_LLM_MULTIMODAL }; delete process.env.GIGAS_LLM_CLI; delete process.env.GIGAS_LLM_MULTIMODAL; assert.equal(multimodalCapability(), false); Object.assign(process.env, { GIGAS_LLM_CLI: old.cli, GIGAS_LLM_MULTIMODAL: old.multi }) })
