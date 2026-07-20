import { probeVisionProvider, invokeLiveVisionProbe } from '../src/manuscript/vision-provider.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { deflateSync } from 'node:zlib'
import { sha256 } from '../src/manuscript/source-ingestion.js'

function crc32(buffer) { let crc = 0xffffffff; for (const byte of buffer) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)) } return (crc ^ 0xffffffff) >>> 0 }
const chunk = (type, data) => { const typeBytes = Buffer.from(type); const length = Buffer.alloc(4); length.writeUInt32BE(data.length); const body = Buffer.concat([typeBytes, data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body)); return Buffer.concat([length, body, crc]) }
function syntheticPng() { const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]); const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(100, 0); ihdr.writeUInt32BE(100, 4); ihdr[8] = 8; ihdr[9] = 2; const rows = Buffer.concat(Array.from({ length: 100 }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(300, 245)]))); return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]) }
const config = await probeVisionProvider();
if (process.argv.includes('--live')) { const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gigas-probe-')), 'probe.png'); const bytes = syntheticPng(); fs.writeFileSync(file, bytes); const result = await invokeLiveVisionProbe({ imagePath: file, expectedImageHash: sha256(bytes), prompt: 'Return only {"ok":true}' }); const output = { ...config, liveProbe: result }; if (process.argv.includes('--verbose')) { output.liveProbe.verbose = { model: result.model, requestFieldNames: result.requestFieldNames || [], imageMime: result.imageMime, imageBytes: result.imageBytes, httpStatus: result.httpStatus ?? null, providerErrorCode: result.providerErrorCode || null, providerErrorMessage: result.providerErrorMessage || null, responseId: result.providerResponseId || result.responseId || null, responseHeaders: result.responseHeaders || {} } } console.log(JSON.stringify(output, null, 2)) } else console.log(JSON.stringify(config, null, 2))
