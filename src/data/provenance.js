import authorities from './authorities.json'
import citations from './citations.json'
import licenses from './licenses.json'
import { isVerificationState } from './verification.js'

const authorityMap = new Map(authorities.map((item) => [item.id, item]))
const citationMap = new Map(citations.map((item) => [item.id, item]))
const licenseMap = new Map(licenses.map((item) => [item.id, item]))

export function getAuthorityById(id) { return authorityMap.get(id) }
export function getCitationById(id) { return citationMap.get(id) }
export function getLicenseById(id) { return licenseMap.get(id) }
export function getCitationsForFolio(folio, layer = null) { const source = layer ? folio.sources?.[layer] : Object.values(folio.sources || {}).flat(); return [...new Set(source?.citationIds || [])].map(getCitationById).filter(Boolean) }
export function getAuthoritiesForFolio(folio, layer = null) { const source = layer ? folio.sources?.[layer] : Object.values(folio.sources || {}).flat(); return [...new Set(source?.authorityIds || [])].map(getAuthorityById).filter(Boolean) }
export function formatCitation(citation) { if (!citation) return ''; const creator = citation.creator ? `${citation.creator}. ` : ''; const year = citation.year ? ` (${citation.year}).` : ''; const location = [citation.institution, citation.repository, citation.shelfmark, citation.folio && `folio ${citation.folio}`].filter(Boolean).join(', '); return `${creator}${citation.title}${year}${location ? ` ${location}.` : ''}${citation.url ? ` ${citation.url}` : ''}` }
export function formatAttribution(license) { return license?.requiresAttribution ? license.attributionText : '' }
export function validateProvenance(folio) { const errors = []; const warnings = []; for (const [layer, source] of Object.entries(folio.sources || {})) { for (const id of source.authorityIds || []) if (!authorityMap.has(id)) errors.push(`${folio.id} ${layer}: unknown authority ${id}`); for (const id of source.citationIds || []) if (!citationMap.has(id)) errors.push(`${folio.id} ${layer}: unknown citation ${id}`); if (source.licenseId && !licenseMap.has(source.licenseId)) errors.push(`${folio.id} ${layer}: unknown license ${source.licenseId}`); if (!source.licenseId && layer === 'image') warnings.push(`${folio.id} image: missing license reference`); if (!isVerificationState(source.verificationState)) errors.push(`${folio.id} ${layer}: invalid verification state ${source.verificationState}`); const license = getLicenseById(source.licenseId); if (license && source.offlineCache && !license.allowsOfflineCaching) errors.push(`${folio.id} ${layer}: offline caching conflicts with ${license.id}`) } return { errors, warnings } }
export function registries() { return { authorities, citations, licenses } }
