import { StaticImageAdapter } from './static-image-adapter.js'
import { TiledImageAdapter } from './tiled-image-adapter.js'
import { ManuscriptAssetAdapter } from './asset-adapter.js'

export function createAssetAdapter(source = {}) { if (source.type === 'tiled-manifest') return new TiledImageAdapter(source); if (source.type === 'placeholder') return new ManuscriptAssetAdapter(source); return new StaticImageAdapter(source) }
export function adapterForFolio(folio) { return createAssetAdapter(folio.imageSource || { type: folio.image?.includes('placeholder') ? 'placeholder' : 'local-static', src: folio.image, licenseId: folio.sources?.image?.licenseId }) }
