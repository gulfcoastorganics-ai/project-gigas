const DB_NAME = 'project-gigas-codex'
const STORE = 'bookmarks'
const REGION_STORE = 'region-drafts'
const SESSION_STORE = 'editorial-sessions'
const SESSION_KEY = 'project-gigas-session-002r'
const RECENT_KEY = 'project-gigas-recent'
const PREF_KEY = 'project-gigas-preferences'

export function openCodexDB() {
  return new Promise((resolve) => {
    if (!('indexedDB' in window)) return resolve({ get: async () => [], toggle: async () => false, preferences: getPreferences, savePreferences: (preferences) => localStorage.setItem(PREF_KEY, JSON.stringify(preferences)), recent: getRecent, addRecent: (id) => { const recent = getRecent().filter((item) => item !== id); localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...recent].slice(0, 8))) }, getRegionDraft: async () => null, saveRegionDraft: async () => undefined, getSession: async () => getLocalSession(), saveSession: async (session) => localStorage.setItem(SESSION_KEY, JSON.stringify(session)) })
    const request = indexedDB.open(DB_NAME, 3)
    request.onupgradeneeded = () => { const db = request.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' }); if (!db.objectStoreNames.contains(REGION_STORE)) db.createObjectStore(REGION_STORE, { keyPath: 'folioId' }); if (!db.objectStoreNames.contains(SESSION_STORE)) db.createObjectStore(SESSION_STORE, { keyPath: 'id' }) }
    request.onsuccess = () => resolve({
      get: () => transaction(request.result, 'readonly', (store) => store.getAll()),
      toggle: (folio) => new Promise((done) => {
        const db = request.result; const tx = db.transaction(STORE, 'readwrite'); const store = tx.objectStore(STORE)
        const check = store.get(folio.id)
        check.onsuccess = () => { check.result ? store.delete(folio.id) : store.put({ id: folio.id, folioNumber: folio.folioNumber, savedAt: Date.now() }) }
        tx.oncomplete = () => done(!check.result)
      }),
      addRecent: (id) => { const recent = getRecent().filter((item) => item !== id); localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...recent].slice(0, 8))) },
      recent: getRecent,
      preferences: getPreferences,
      savePreferences: (preferences) => localStorage.setItem(PREF_KEY, JSON.stringify(preferences)),
      getRegionDraft: (folioId) => transaction(request.result, 'readonly', (store) => store.get(folioId), REGION_STORE),
      saveRegionDraft: (folioId, regions) => transaction(request.result, 'readwrite', (store) => store.put({ folioId, regions, savedAt: Date.now() }), REGION_STORE),
      getSession: (id = 'session-002r-001') => transaction(request.result, 'readonly', (store) => store.get(id), SESSION_STORE),
      saveSession: (session) => transaction(request.result, 'readwrite', (store) => store.put(session), SESSION_STORE),
    })
    request.onerror = () => resolve({ get: async () => [], toggle: async () => false })
  })
}

function transaction(db, mode, action, storeName = STORE) { return new Promise((resolve) => { const request = action(db.transaction(storeName, mode).objectStore(storeName)); request.onsuccess = () => resolve(request.result); request.onerror = () => resolve([]) }) }
function getRecent() { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') } catch { return [] } }
function getPreferences() { try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}') } catch { return {} } }
function getLocalSession() { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') } catch { return null } }
