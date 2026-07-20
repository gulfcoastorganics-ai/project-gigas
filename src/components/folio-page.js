const layerLabels = { latinDiplomatic: 'Diplomatic Latin', latinExpanded: 'Expanded Latin', englishLiteral: 'Literal English', englishReadable: 'Readable English', historicalNotes: 'Historical Notes' }

const verificationLabels = { verified: 'Verified', reviewed: 'Reviewed', draft: 'Draft', placeholder: 'Placeholder' }

export function renderFolio(folio, { layer = 'image', bookmarked = false, commentary = false, verificationStatus = 'placeholder' }) {
  const isImage = layer === 'image'
  const value = Array.isArray(folio[layer]) ? folio[layer].join(' ') : folio[layer]
  const text = layer === 'image' ? '' : `<div class="text-layer"><p class="layer-label">${layerLabels[layer] || 'Editorial layer'}</p><p>${value || 'No content recorded.'}</p></div>`
  const notes = commentary ? `<aside class="marginal-gloss" aria-label="Marginal commentary"><span>Marginal gloss</span><p>${folio.villanuevaCommentary[0] || 'No commentary recorded.'}</p></aside>` : ''
  const uncertainty = folio.uncertainReadings?.length ? `<aside class="uncertainty-list" aria-label="Uncertain readings"><strong>Uncertain readings</strong>${folio.uncertainReadings.map((item) => `<details><summary>${item.location || 'Unlocated reading'}</summary><p>${item.reason || 'Editorial uncertainty recorded.'}</p><small>Confidence: ${Math.round((item.confidence ?? 0) * 100)}%</small></details>`).join('')}</aside>` : ''
  return `<div class="folio-inner ${isImage ? 'image-mode' : 'text-mode'}">
    <header class="folio-header"><span>${folio.section}</span><span class="verification-badge status-${verificationStatus}"><i aria-hidden="true"></i>${verificationLabels[verificationStatus] || 'Unverified'}</span><span>${folio.folioNumber}</span></header>
    ${isImage ? `<div class="image-viewport"><span class="image-spinner" aria-label="Loading folio image">Loading…</span><img data-folio-image data-image-src="${folio.imageSource?.src || folio.image}" data-image-fallback="${folio.imageSource?.fallback || folio.imageSource?.src || folio.image}" data-image-type="${folio.imageSource?.type || 'local-static'}" data-image-manifest="${folio.imageSource?.manifest || ''}" alt="${folio.folioNumber}, placeholder folio artwork" loading="lazy" decoding="async" /><div class="image-error" hidden role="alert">Image unavailable. <button data-retry-image type="button">Retry</button></div><span class="placeholder-stamp">PLACEHOLDER ARTWORK</span></div>` : text}
    ${uncertainty}
    ${notes}
    <footer class="folio-footer"><span>${folio.chapter}</span><button class="bookmark ${bookmarked ? 'is-saved' : ''}" data-bookmark="${folio.id}" type="button" aria-label="${bookmarked ? 'Remove bookmark' : 'Bookmark'} folio ${folio.folioNumber}" aria-pressed="${bookmarked}">${bookmarked ? '★' : '☆'}</button><button class="folio-source-button" data-folio-source="${folio.id}" type="button">Sources</button></footer>
  </div>`
}
