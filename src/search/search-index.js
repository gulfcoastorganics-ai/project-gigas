const WEIGHTS = { folioNumber: 8, section: 6, chapter: 5, title: 4, keywords: 3 }

export function normalize(value = '') { return String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() }
export function tokenize(value) { return normalize(value).split(/\s+/).filter(Boolean) }
export function createSearchIndex(entries) { return entries.map((entry) => ({ entry, fields: Object.fromEntries(Object.keys(WEIGHTS).map((key) => [key, normalize(Array.isArray(entry[key]) ? entry[key].join(' ') : entry[key])])) })) }
export function search(query, entries, limit = 12) {
  const terms = tokenize(query); if (!terms.length) return []
  return createSearchIndex(entries).map(({ entry, fields }) => {
    const score = terms.reduce((total, term) => total + Object.entries(WEIGHTS).reduce((fieldScore, [field, weight]) => fieldScore + (fields[field].includes(term) ? weight : 0), 0), 0)
    return { entry, score }
  }).filter((result) => result.score > 0).sort((a, b) => b.score - a.score || a.entry.folioNumber.localeCompare(b.entry.folioNumber)).slice(0, limit)
}

export function createTextSearchIndex({ diplomatic = [], expanded = [], literal = [], readable = [] } = {}) {
  return [
    ...diplomatic.map((record) => ({ ...record, layer: 'diplomatic Latin', text: record.displayText || record.text || '' })),
    ...expanded.map((record) => ({ ...record, layer: 'expanded Latin', text: record.text || '' })),
    ...literal.map((record) => ({ ...record, layer: 'literal English', text: record.text || '' })),
    ...readable.map((record) => ({ ...record, layer: 'readable English', text: record.text || '' })),
  ].filter((record) => record.text && record.verificationState !== 'placeholder')
}

export function searchText(query, records, limit = 20) {
  const terms = tokenize(query); if (!terms.length) return []
  return records.map((record) => ({ record, score: terms.reduce((score, term) => score + (normalize(record.text).includes(term) ? 1 : 0), 0) })).filter((result) => result.score > 0).sort((a, b) => b.score - a.score).slice(0, limit)
}
