import index from './codex-index.json'
import metadata from './manuscript-metadata.json'
import { normalizeFolio } from './normalize-folio.js'

const imports = import.meta.glob('./folios/*.json')
const cache = new Map()
const MAX_CACHE = 4
const VALID_STATES = ['placeholder', 'draft', 'machine-assisted', 'internally-reviewed', 'externally-reviewed', 'verified', 'disputed', 'deprecated', 'reviewed', 'unreviewed']
const REQUIRED = ['id', 'folioNumber', 'side', 'section', 'chapter', 'image', 'latinDiplomatic', 'latinExpanded', 'englishLiteral', 'englishReadable', 'languageNotes', 'historicalNotes', 'villanuevaCommentary', 'uncertainReadings', 'verificationState']

export function loadIndex() { return { ...index, metadata } }

export async function loadFolio(id) {
  if (cache.has(id)) return cache.get(id)
  const entry = index.folios.find((item) => item.id === id)
  if (!entry || !imports[entry.source]) throw new Error(`Folio ${id} is not present in the manuscript index.`)
  const module = await imports[entry.source]()
  const folio = module.default || module
  validateFolio(folio, index.folios)
  const normalized = normalizeFolio(folio, entry)
  cache.set(id, normalized)
  return normalized
}

export async function loadCurrent(ids) { return Promise.all(ids.filter(Boolean).map(loadFolio)) }
export async function loadAdjacent(ids) { return loadCurrent(ids) }
export function evictOldFolios(keepIds = []) { for (const id of cache.keys()) if (!keepIds.includes(id)) cache.delete(id); return cache.size }
export function getCachedFolios() { return [...cache.values()] }

export function validateFolio(folio, entries = index.folios) {
  const missing = REQUIRED.filter((key) => !(key in (folio || {})))
  if (missing.length) throw new Error(`${folio?.id || 'Folio'} is malformed; missing ${missing.join(', ')}`)
  if (!/^folio-\d{3}[rv]$/.test(folio.id)) throw new Error(`${folio.id} has an invalid id.`)
  if (!VALID_STATES.includes(folio.verificationState?.transcription || folio.verificationState)) throw new Error(`${folio.id} has an invalid verification state.`)
  if (!Array.isArray(folio.languageNotes) || !Array.isArray(folio.historicalNotes) || !Array.isArray(folio.villanuevaCommentary)) throw new Error(`${folio.id} note fields must be arrays`)
  if (entries.filter((entry) => entry.id === folio.id).length > 1) throw new Error(`Duplicate folio id: ${folio.id}`)
  if (typeof folio.image !== 'string' || !folio.image) throw new Error(`${folio.id} has a broken image reference.`)
  return folio
}

export function validateIndex(source = index) {
  const ids = new Set(); const errors = []
  source.folios.forEach((folio) => { if (ids.has(folio.id)) errors.push(`Duplicate index id: ${folio.id}`); ids.add(folio.id); if (!VALID_STATES.includes(folio.verificationStatus)) errors.push(`Invalid verification status: ${folio.id}`) })
  if (errors.length) console.error('[Project GIGAS] Index validation errors:', errors)
  return errors
}

validateIndex()
