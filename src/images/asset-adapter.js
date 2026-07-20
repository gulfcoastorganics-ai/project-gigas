export class ManuscriptAssetAdapter {
  constructor(config = {}) { this.config = config }
  loadPreview() { return Promise.reject(new Error('Preview loading is not implemented for this asset adapter.')) }
  loadFullImage() { return Promise.reject(new Error('Full image loading is not implemented for this asset adapter.')) }
  getDimensions() { return { width: this.config.width || 0, height: this.config.height || 0 } }
  getTileManifest() { return null }
  supportsTiles() { return false }
  getAttribution() { return this.config.attribution || '' }
  getLicense() { return this.config.licenseId || '' }
}
