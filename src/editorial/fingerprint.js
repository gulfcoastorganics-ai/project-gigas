import { getCanonicalEditorialData } from './canonical-data.js'
const normalize = (value) => Array.isArray(value) ? value.map(normalize) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalize(value[key])])) : value
export async function getCanonicalFingerprint() { const bytes = new TextEncoder().encode(JSON.stringify(normalize(getCanonicalEditorialData()))); const digest = await crypto.subtle.digest('SHA-256', bytes); return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('') }
