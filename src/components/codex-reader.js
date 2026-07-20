import { loadCurrent, loadAdjacent, evictOldFolios } from '../data/folio-loader.js'
import { renderFolio } from './folio-page.js'
import { addSwipeNavigation } from './page-turner.js'
import { layers, nextLayer } from './translation-panel.js'
import { renderIndex, bindIndex } from './manuscript-index.js'
import { bindImageLoading } from './image-loader.js'
import { search } from '../search/search-index.js'
import { SourcePanel } from './source-panel.js'

const DEFAULTS = { layer: 'image', zoom: 1, fontSize: 1, theme: 'vellum', sidebar: false, commentary: false }

export class CodexReader {
  constructor({ index, db, root }) { this.indexData = index; this.entries = index.folios; this.sections = index.sections; this.metadata = index.metadata; this.db = db; this.root = root; this.position = 0; this.currentFolios = []; this.settings = { ...DEFAULTS, ...db.preferences() }; this.bookmarks = new Set(); this.searchResults = [] }

  async init() {
    const saved = await this.db.get(); this.bookmarks = new Set(saved.map((item) => item.id)); const requested = new URLSearchParams(location.search).get('folio'); const requestedPosition = this.entries.findIndex((entry) => entry.id === requested); if (requestedPosition >= 0) this.position = requestedPosition - (requestedPosition % 2); history.replaceState({ folio: this.entries[this.position].id }, '', `?folio=${this.entries[this.position].id}`); this.cacheElements(); this.sourcePanel = new SourcePanel({ root: this.root }); this.bindEvents(); this.renderMetadata(); await this.render(); if (this.settings.sidebar) this.openDrawer();
  }

  cacheElements() { this.cover = this.root.querySelector('#cover-screen'); this.shell = this.root.querySelector('#reader-shell'); this.left = this.root.querySelector('#left-folio'); this.right = this.root.querySelector('#right-folio'); this.counter = this.root.querySelector('#current-folio'); this.status = this.root.querySelector('#reader-status'); this.drawer = this.root.querySelector('#index-drawer'); this.indexList = this.root.querySelector('#manuscript-index'); this.searchInput = this.root.querySelector('#folio-search'); this.searchResultsElement = this.root.querySelector('#search-results') }

  bindEvents() {
    const open = () => { this.cover.hidden = true; this.shell.hidden = false; this.root.classList.add('is-open') }
    this.root.querySelector('#open-codex').addEventListener('click', open); this.root.querySelector('#open-codex-secondary').addEventListener('click', open)
    this.root.querySelector('#previous-folio').addEventListener('click', () => this.move(-2)); this.root.querySelector('#next-folio').addEventListener('click', () => this.move(2))
    this.root.querySelector('#toggle-translation').addEventListener('click', () => { this.settings.layer = nextLayer(this.settings.layer); this.savePreferences(); this.render() })
    this.root.querySelector('#toggle-commentary').addEventListener('click', (event) => { this.settings.commentary = !this.settings.commentary; event.currentTarget.setAttribute('aria-pressed', this.settings.commentary); this.savePreferences(); this.render() })
    this.root.querySelector('#toggle-fullscreen').addEventListener('click', () => document.fullscreenElement ? document.exitFullscreen() : this.root.requestFullscreen?.())
    this.root.querySelector('#open-index').addEventListener('click', () => this.openDrawer()); this.root.querySelector('#close-index').addEventListener('click', () => this.closeDrawer())
    this.root.querySelector('#open-source-panel').addEventListener('click', () => this.openSources(this.currentFolios[0]))
    this.searchInput.addEventListener('input', () => this.renderSearch(this.searchInput.value)); this.root.querySelector('#clear-search').addEventListener('click', () => { this.searchInput.value = ''; this.renderSearch(''); this.searchInput.focus() })
    this.root.addEventListener('click', async (event) => { const sourceButton = event.target.closest('[data-folio-source]'); if (sourceButton) return this.openSources(this.currentFolios.find((item) => item.id === sourceButton.dataset.folioSource)); const button = event.target.closest('[data-bookmark]'); if (!button) return; const folio = this.currentFolios.find((item) => item.id === button.dataset.bookmark); const added = await this.db.toggle(folio); added ? this.bookmarks.add(folio.id) : this.bookmarks.delete(folio.id); this.status.textContent = `${added ? 'Saved' : 'Removed'} bookmark for folio ${folio.folioNumber}`; this.render() })
    window.addEventListener('keydown', (event) => { if (!this.shell.hidden && event.key === 'ArrowLeft') this.move(-2); if (!this.shell.hidden && event.key === 'ArrowRight') this.move(2); if (event.key === 'Escape' && !this.drawer.hidden) this.closeDrawer(); if (!this.drawer.hidden && event.key === 'Tab') this.trapFocus(event) })
    window.addEventListener('popstate', () => { const id = new URLSearchParams(location.search).get('folio'); if (id) this.goTo(id, false) })
    addSwipeNavigation(this.root.querySelector('.codex-reader'), () => this.move(-2), () => this.move(2))
  }

  async move(amount) { const next = Math.max(0, Math.min(this.entries.length - 2, this.position + amount)); if (next !== this.position) { this.position = next; await this.render(true) } }
  async goTo(id, push = true) { const found = this.entries.findIndex((entry) => entry.id === id); if (found < 0) return; this.position = Math.min(found - (found % 2), this.entries.length - 2); if (push) history.pushState({ folio: id }, '', `?folio=${id}`); this.closeDrawer(); await this.render(true) }

  async render(updateHistory = false) {
    const ids = [this.entries[this.position]?.id, this.entries[this.position + 1]?.id]; const adjacentIds = [this.entries[this.position - 2]?.id, this.entries[this.position + 2]?.id]; this.currentFolios = await loadCurrent(ids); await loadAdjacent(adjacentIds); evictOldFolios([...ids, ...adjacentIds].filter(Boolean)); const [left, right] = this.currentFolios
    if (updateHistory && left) { history.pushState({ folio: left.id }, '', `?folio=${left.id}`); this.db.addRecent(left.id) }
    this.left.innerHTML = left ? renderFolio(left, { layer: this.settings.layer, bookmarked: this.bookmarks.has(left.id), commentary: this.settings.commentary, verificationStatus: this.entries[this.position].verificationStatus }) : ''; this.right.innerHTML = right ? renderFolio(right, { layer: this.settings.layer, bookmarked: this.bookmarks.has(right.id), commentary: this.settings.commentary, verificationStatus: this.entries[this.position + 1].verificationStatus }) : ''
    bindImageLoading(this.root); this.root.querySelectorAll('.image-viewport img').forEach((image) => image.addEventListener('click', () => { this.settings.zoom = this.settings.zoom > 1 ? 1 : 1.5; image.style.transform = `scale(${this.settings.zoom})`; this.savePreferences() })); this.counter.value = right ? `${left.folioNumber}–${right.folioNumber}` : left.folioNumber; this.root.querySelector('#previous-folio').disabled = this.position === 0; this.root.querySelector('#next-folio').disabled = this.position >= this.entries.length - 2; this.updateLayerLabel(); this.updateSettingsUI(); if (!this.drawer.hidden) this.renderDrawer()
  }

  renderDrawer() { renderIndex(this.indexList, { sections: this.sections, entries: this.entries, currentId: this.entries[this.position]?.id, bookmarks: this.bookmarks, recent: this.db.recent(), onSelect: (id) => this.goTo(id) }); bindIndex(this.indexList, (id) => this.goTo(id)); this.renderSearch(this.searchInput.value) }
  renderSearch(query) { const results = search(query, this.entries); this.searchResults = results; this.searchResultsElement.innerHTML = query ? results.map(({ entry, score }) => `<button class="search-result" type="button" data-search-id="${entry.id}"><span>${entry.folioNumber}</span><small>${entry.title} · ${entry.section} <b>${score}</b></small></button>`).join('') || '<p class="toc-empty">No indexed metadata matched.</p>' : ''; this.searchResultsElement.querySelectorAll('[data-search-id]').forEach((button) => button.addEventListener('click', () => this.goTo(button.dataset.searchId))) }
  openDrawer() { this.drawer.hidden = false; this.settings.sidebar = true; this.savePreferences(); this.drawer.setAttribute('aria-modal', 'true'); this.renderDrawer(); this.searchInput.focus() }
  closeDrawer() { this.drawer.hidden = true; this.settings.sidebar = false; this.savePreferences(); this.drawer.removeAttribute('aria-modal') }
  trapFocus(event) { const focusable = [...this.drawer.querySelectorAll('button, input')]; const first = focusable[0]; const last = focusable.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() } }
  updateLayerLabel() { const button = this.root.querySelector('#toggle-translation'); button.textContent = this.settings.layer === 'image' ? 'Layers' : `Layer: ${this.settings.layer.replace('english', 'English ')}` }
  updateSettingsUI() { this.root.querySelector('#toggle-commentary').setAttribute('aria-pressed', this.settings.commentary); this.root.dataset.theme = this.settings.theme; this.root.style.setProperty('--reader-font-scale', this.settings.fontSize); }
  savePreferences() { this.db.savePreferences(this.settings) }
  renderMetadata() { this.root.querySelector('#manuscript-metadata').innerHTML = `<strong>${this.metadata.title}</strong><br>${this.metadata.estimatedDate} · ${this.metadata.language}<br><small>${this.metadata.source}</small>` }
  openSources(folio) { if (folio) this.sourcePanel.open(folio) }
}
