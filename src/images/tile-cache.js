export class TileCache {
  constructor(limit = 32) { this.limit = limit; this.items = new Map() }
  get(key) { const item = this.items.get(key); if (item) { this.items.delete(key); this.items.set(key, item) } return item }
  set(key, value) { if (this.items.has(key)) this.items.delete(key); this.items.set(key, value); while (this.items.size > this.limit) this.items.delete(this.items.keys().next().value); return value }
  clear() { this.items.clear() }
}
