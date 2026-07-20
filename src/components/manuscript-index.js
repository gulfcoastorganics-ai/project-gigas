export function renderIndex(container, { sections, entries, currentId, bookmarks, recent, onSelect }) {
  const groups = sections.map((section) => {
    const folios = entries.filter((entry) => entry.section.toLowerCase().includes(section.title.toLowerCase().replace('old testament', '').trim()) || (section.id === 'old-testament' && entry.keywords.includes('old testament')))
    return `<section class="toc-section"><h3>${section.title}</h3>${folios.length ? `<ul>${folios.map((folio) => entryButton(folio, folio.id === currentId, bookmarks.has(folio.id), onSelect)).join('')}</ul>` : `<p class="toc-empty">${section.description}</p>`}</section>`
  }).join('')
  const recentMarkup = recent.length ? `<section class="toc-section"><h3>Recently viewed</h3><ul>${recent.map((id) => entries.find((entry) => entry.id === id)).filter(Boolean).map((folio) => entryButton(folio, folio.id === currentId, bookmarks.has(folio.id), onSelect)).join('')}</ul></section>` : ''
  container.innerHTML = recentMarkup + groups
}

function entryButton(folio, current, bookmarked, onSelect) { return `<li><button type="button" class="index-entry ${current ? 'current' : ''}" data-index-id="${folio.id}"><span>${folio.folioNumber}</span><small>${folio.title} · ${folio.chapter}${bookmarked ? ' · ★' : ''}</small><b class="verification-dot status-${folio.verificationStatus}" aria-label="${folio.verificationStatus}"></b></button></li>` }

export function bindIndex(container, onSelect) { container.querySelectorAll('[data-index-id]').forEach((button) => button.addEventListener('click', () => onSelect(button.dataset.indexId))) }
