import { createAssetAdapter } from '../images/image-source-registry.js'
import { TiledViewer } from '../images/tiled-viewer.js'

export function bindImageLoading(container) {
  container.querySelectorAll('img[data-folio-image]').forEach(async (image) => {
    const viewport = image.closest('.image-viewport'); const spinner = viewport.querySelector('.image-spinner'); const adapter = createAssetAdapter({ type: image.dataset.imageType, src: image.dataset.imageSrc, fallback: image.dataset.imageFallback, manifest: image.dataset.imageManifest || undefined })
    image.addEventListener('load', () => { spinner.hidden = true; viewport.classList.add('is-loaded') }, { once: true })
    image.addEventListener('error', () => { spinner.hidden = true; viewport.classList.add('has-error'); viewport.querySelector('.image-error').hidden = false }, { once: true })
    try { if (image.dataset.imageType === 'tiled-manifest') { image.hidden = true; const viewer = new TiledViewer({ element: viewport, adapter, fallback: image.dataset.imageSrc }); await viewer.mount() } else image.src = await adapter.loadPreview() } catch (error) { spinner.hidden = true; viewport.classList.add('has-error'); viewport.querySelector('.image-error').hidden = false; console.warn('[Project GIGAS] image adapter failed:', error.message) }
    viewport.querySelector('[data-retry-image]')?.addEventListener('click', () => { viewport.classList.remove('has-error'); viewport.querySelector('.image-error').hidden = true; spinner.hidden = false; image.src = `${image.dataset.imageFallback}?retry=${Date.now()}` })
  })
}
