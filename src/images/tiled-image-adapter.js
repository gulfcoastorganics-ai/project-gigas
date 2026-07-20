import { ManuscriptAssetAdapter } from './asset-adapter.js'
import { parseTileManifest } from './tile-manifest.js'
export class TiledImageAdapter extends ManuscriptAssetAdapter {
  supportsTiles() { return true }
  async getTileManifest() { if (!this.config.manifest) return null; const response = await fetch(this.config.manifest); if (!response.ok) throw new Error(`Tile manifest unavailable: ${this.config.manifest}`); return parseTileManifest(await response.json()) }
  loadPreview() { return Promise.resolve(this.config.fallback || this.config.src) }
  loadFullImage() { return this.loadPreview() }
}
