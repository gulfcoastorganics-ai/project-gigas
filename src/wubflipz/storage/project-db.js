const DB_NAME = 'wubflipz-projects'
const DB_VERSION = 1

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('projects')) {
        db.createObjectStore('projects', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('lineage')) {
        db.createObjectStore('lineage', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('critique')) {
        db.createObjectStore('critique', { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function tx(db, storeName, mode) {
  return db.transaction(storeName, mode).objectStore(storeName)
}

export class ProjectDB {
  static async save(project) {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const request = tx(db, 'projects', 'readwrite').put({
        id: project.id,
        data: project,
        savedAt: Date.now(),
        schemaVersion: 1,
      })
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  static async load(id) {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const request = tx(db, 'projects', 'readonly').get(id)
      request.onsuccess = () => resolve(request.result?.data || null)
      request.onerror = () => reject(request.error)
    })
  }

  static async list() {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const request = tx(db, 'projects', 'readonly').getAll()
      request.onsuccess = () => resolve(request.result.map(r => ({
        id: r.data.id,
        title: r.data.title || r.data.blueprint?.title || 'Untitled',
        savedAt: r.savedAt,
        bpm: r.data.bpm || r.data.blueprint?.bpm,
        genre: (r.data.genre || r.data.blueprint?.genre || []).join(', '),
      })))
      request.onerror = () => reject(request.error)
    })
  }

  static async delete(id) {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const request = tx(db, 'projects', 'readwrite').delete(id)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  static async saveLineage(entry) {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const request = tx(db, 'lineage', 'readwrite').put(entry)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  static async saveCritique(projectId, critique) {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const request = tx(db, 'critique', 'readwrite').put({
        id: projectId,
        critique,
        savedAt: Date.now(),
      })
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  static async loadCritique(projectId) {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const request = tx(db, 'critique', 'readonly').get(projectId)
      request.onsuccess = () => resolve(request.result?.critique || null)
      request.onerror = () => reject(request.error)
    })
  }

  static async exportJSON(project) {
    return JSON.stringify(project, null, 2)
  }

  static async importJSON(json) {
    return JSON.parse(json)
  }
}

export function downloadProject(project) {
  const json = JSON.stringify(project, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${project.title || 'wubflipz-project'}.json`
  a.click()
  URL.revokeObjectURL(url)
}
