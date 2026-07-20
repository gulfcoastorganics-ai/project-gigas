import fs from 'node:fs'
import path from 'node:path'
import { sha256 } from './source-ingestion.js'

export function classifyFailure(failure = {}, provider = {}) {
  const text = `${failure.classification || ''} ${failure.message || ''} ${provider.failureClassification || ''} ${provider.providerErrorMessage || ''}`.toLowerCase()
  if (/429|rate limit|rate_limited/.test(text)) return 'rate_limited'
  if (/timeout|aborted|transport|connection|fetch failed/.test(text)) return 'transport_failure'
  if (/empty/.test(text)) return 'empty_response'
  if (/malformed|json/.test(text)) return 'malformed_json'
  if (/schema|missing_required|invalid_noncanonical/.test(text)) return 'schema_mismatch'
  if (/unsupported/.test(text)) return 'unsupported_structured_output'
  if (/english|explain|commentary/.test(text)) return 'english_explanatory_prose'
  return 'other_provider_rejection'
}

export function extractAssistant(raw) {
  let envelope = null
  try { envelope = JSON.parse(raw) } catch { return { envelope: null, content: String(raw || '') } }
  const content = envelope?.choices?.[0]?.message?.content
  if (typeof content === 'string') return { envelope, content }
  if (Array.isArray(content)) return { envelope, content: content.map((part) => typeof part === 'string' ? part : part?.text || '').join('') }
  const gemini = envelope?.candidates?.[0]?.content?.parts
  if (Array.isArray(gemini)) return { envelope, content: gemini.map((part) => part?.text || '').join('') }
  return { envelope, content: '' }
}

function balancedObject(text) {
  const start = text.indexOf('{'); if (start < 0) return null
  let depth = 0; let quote = false; let escaped = false
  for (let i = start; i < text.length; i++) { const c = text[i]; if (quote) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quote = false; continue } if (c === '"') { quote = true; continue } if (c === '{') depth++; if (c === '}') { depth--; if (depth === 0) return text.slice(start, i + 1) } }
  return null
}

export function parseSalvage(content) {
  let text = String(content || '').replace(/^\uFEFF/, '').trim(); const repairs = []
  if (/^```/.test(text)) { text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim(); repairs.push('removed_markdown_fences') }
  let parsed = null
  try { parsed = JSON.parse(text); return { parsed, repairs, error: null, truncated: false, partialResponse: false } } catch {}
  const object = balancedObject(text)
  if (object) { try { parsed = JSON.parse(object); repairs.push('extracted_complete_json_object'); return { parsed, repairs, error: null, truncated: false, partialResponse: false } } catch {} }
  const compact = extractCompleteCompactLines(text)
  if (compact.lines.length) return { parsed: { lines: compact.lines }, repairs: [...repairs, 'extracted_complete_line_objects'], error: null, truncated: true, partialResponse: true, incompleteRemainder: compact.incompleteRemainder }
  return { parsed: null, repairs, error: 'empty_or_malformed_json', truncated: true, partialResponse: true }
}

function completeObjectsInArray(text, start) {
  const lines = []; let cursor = text.indexOf('[', start); if (cursor < 0) return { lines, incompleteRemainder: '' }; cursor++
  while (cursor < text.length) {
    while (/\s|,/.test(text[cursor] || '')) cursor++
    if (text[cursor] === ']') return { lines, incompleteRemainder: '' }
    const begin = text.indexOf('{', cursor); if (begin < 0) break
    let depth = 0; let quote = false; let escaped = false; let end = -1
    for (let i = begin; i < text.length; i++) { const c = text[i]; if (quote) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quote = false; continue } if (c === '"') { quote = true; continue } if (c === '{') depth++; if (c === '}') { depth--; if (depth === 0) { end = i; break } } }
    if (end < 0) return { lines, incompleteRemainder: text.slice(begin) }
    try { const line = JSON.parse(text.slice(begin, end + 1)); if (line && typeof line === 'object' && !Array.isArray(line)) lines.push(line) } catch { return { lines, incompleteRemainder: text.slice(begin) }
    }
    cursor = end + 1
  }
  return { lines, incompleteRemainder: text.slice(cursor) }
}

export function extractCompleteCompactLines(content) {
  const text = String(content || ''); const linesKey = text.search(/"lines"\s*:/i)
  if (linesKey >= 0) return completeObjectsInArray(text, linesKey)
  if (/^\s*\{/.test(text) || /^\s*\[/.test(text)) return completeObjectsInArray(text, 0)
  const lines = []; let cursor = 0
  while (cursor < text.length) { const begin = text.indexOf('{', cursor); if (begin < 0) break; const one = completeObjectsInArray(`[${text.slice(begin)}]`, 0); if (!one.lines.length) break; lines.push(one.lines[0]); cursor = begin + JSON.stringify(one.lines[0]).length }
  return { lines, incompleteRemainder: text.slice(cursor) }
}

export const compactRegionSchema = { type: 'object', required: ['lines'], properties: { lines: { type: 'array', items: { type: 'object', required: ['n', 't', 'c', 'u', 'i', 'p'] } } } }
export const compactRegionPrompt = 'Transcribe the visible medieval Latin one physical line at a time. Return JSON only in this compact schema: {"lines":[{"n":1,"t":"","c":0,"u":false,"i":false,"p":false}]}. Copy only visible characters. Preserve line breaks and medieval spelling. Do not translate or explain. Do not identify the passage. Do not reconstruct text from memory. Do not expand abbreviations silently. Use u:true for uncertain readings, i:true when a line cannot be read, and p:true for a cropped boundary line. Keep every t concise. Return no introduction, commentary, Markdown, or workflow metadata.'

function englishLike(value) { return /\b(the|this|image|shows|manuscript|page|text|column|appears|visible|description)\b/i.test(String(value || '')) }
export function normalizeSalvage(parsed, identity) {
  const sourceLines = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.lines) ? parsed.lines : []
  const findings = []; const repairs = []
  const lines = sourceLines.map((line, index) => { const compact = line.n !== undefined || line.t !== undefined || line.c !== undefined; const text = compact ? (line.t ?? '') : (line.diplomaticLatin ?? line.text ?? line.reading ?? line.transcription ?? ''); if (line.text !== undefined && line.diplomaticLatin === undefined && !compact) repairs.push({ type: 'structural_alias', from: 'text', to: 'diplomaticLatin' }); if (compact) repairs.push({ type: 'compact_field_mapping', fields: ['n', 't', 'c', 'u', 'i', 'p'] }); if (englishLike(text)) { findings.push({ type: 'english_in_latin_field', index }); return null } const rawConfidence = compact ? line.c : (line.confidence ?? line.confidenceScore ?? 0); const confidence = rawConfidence === null || rawConfidence === undefined ? null : Number(rawConfidence); if (confidence !== null && (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)) { findings.push({ type: 'invalid_confidence', index }); return null } return { lineId: `${identity.regionId}-line-${String(index + 1).padStart(4, '0')}`, sequence: Number(compact ? (line.n ?? index + 1) : (line.sequence ?? line.lineNumber ?? index + 1)), diplomaticLatin: String(text), confidence, partialAtStart: Boolean(compact ? line.p : (line.partialAtStart ?? line.partial)), partialAtEnd: Boolean(compact ? line.p : (line.partialAtEnd ?? line.partial)), illegible: Boolean(compact ? line.i : line.illegible), uncertainTokens: Array.isArray(line.uncertainTokens) ? line.uncertainTokens : [], abbreviationMarks: Array.isArray(line.abbreviationMarks) ? line.abbreviationMarks : [], rubrication: Array.isArray(line.rubrication) ? line.rubrication : [], notes: Array.isArray(line.notes) ? line.notes : [] } }).filter(Boolean).sort((a, b) => a.sequence - b.sequence)
  if (!lines.length) return { candidate: null, findings: [...findings, { type: 'no_usable_lines' }], repairs }
  return { candidate: { regionAssessment: parsed.regionAssessment || {}, lines, decorations: Array.isArray(parsed.decorations) ? parsed.decorations : [], warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [], applicationPolicy: { canonical: false, candidateOnly: true, reviewRequired: true, scholarlyVerified: false, transcriptionStatus: 'machine_candidate' }, identity, salvageStatus: 'structurally_salvaged', partialResponse: Boolean(parsed.partialResponse), truncated: Boolean(parsed.truncated) }, findings, repairs }
}

export function rawFiles(root) { const files = []; function walk(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const file = path.join(dir, entry.name); if (entry.isDirectory()) walk(file); else if (entry.name === 'raw-response.txt') files.push(file) } } if (fs.existsSync(root)) walk(root); return files }
export function hashRaw(file) { const raw = fs.readFileSync(file); return { bytes: raw.length, sha256: sha256(raw) } }
