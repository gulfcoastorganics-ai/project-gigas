import { ManuscriptAssetAdapter } from './asset-adapter.js'
export class StaticImageAdapter extends ManuscriptAssetAdapter {
  loadPreview() { return Promise.resolve(this.config.src) }
  loadFullImage() { return Promise.resolve(this.config.src) }
}
