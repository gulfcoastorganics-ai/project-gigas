import './styles/base.css'
import './styles/codex.css'
import './styles/manuscript.css'
import './styles/responsive.css'
import { loadIndex } from './data/folio-loader.js'
import { CodexReader } from './components/codex-reader.js'
import { openCodexDB } from './storage/codex-db.js'
import { renderEditorialStatus } from './editorial/status-dashboard.js'
import { renderRegionAuthoring } from './editorial/region-authoring.js'
import { renderComparison } from './editorial/comparison-view.js'
import { renderEvidenceView } from './editorial/evidence-view.js'
import { renderEditorialWorkspace } from './editorial/workspace.js'
import { renderReviewerMode } from './editorial/reviewer-mode.js'
import { renderCandidatePreview } from './editorial/candidate-preview.js'
import { renderBatchDashboard } from './editorial/batch-dashboard.js'
import { renderTranslationPilotViewer, renderTranslationProductionViewer } from './editorial/translation-pilot-viewer.js'
import { renderMasterEditionViewer } from './editorial/master-edition-viewer.js'

const app = document.querySelector('#app')

app.innerHTML = `
  <main id="codex-app" class="codex-app" aria-labelledby="reader-title">
    <section class="cover-screen" id="cover-screen" aria-label="Codex opening screen">
      <div class="cover-ornament" aria-hidden="true">✦</div>
      <p class="eyebrow">A working interactive edition</p>
      <h1 id="reader-title">Project <span>GIGAS</span></h1>
      <p class="cover-subtitle">The Devil's Bible · Codex Reader</p>
      <p class="cover-notice">A scalable working edition for historically responsible manuscript study.</p>
      <button class="clasp clasp-left" id="open-codex" type="button" aria-label="Open the Codex Gigas">Open the codex</button>
      <button class="clasp clasp-right" id="open-codex-secondary" type="button" aria-label="Open the Codex Gigas"></button>
    </section>
    <section class="reader-shell" id="reader-shell" hidden>
      <header class="codex-toolbar">
        <div class="toolbar-title"><span class="sigil" aria-hidden="true">✦</span><span>Project GIGAS</span></div>
        <div class="toolbar-actions">
          <button id="open-index" type="button">Index</button>
          <button id="toggle-translation" type="button" aria-pressed="false">Layers</button>
          <button id="toggle-commentary" type="button" aria-pressed="false">Commentary</button>
          <button id="open-source-panel" type="button">Sources</button>
          <a class="toolbar-link" href="/editorial-status">Editorial status</a>
          <button id="toggle-fullscreen" type="button">Fullscreen</button>
        </div>
      </header>
      <div class="reader-status" role="status" aria-live="polite" id="reader-status"></div>
      <section class="codex-reader" aria-label="Codex manuscript reader">
        <article class="folio folio-left" id="left-folio"></article>
        <article class="folio folio-right" id="right-folio"></article>
      </section>
      <nav class="folio-navigation" aria-label="Folio navigation">
        <button id="previous-folio" type="button">← <span>Previous</span></button>
        <output id="current-folio" aria-label="Current folio spread">1r–1v</output>
        <button id="next-folio" type="button"><span>Next</span> →</button>
      </nav>
      <p class="reader-footnote">Placeholder content is clearly identified. No manuscript transcription is fabricated.</p>
    </section>
    <aside class="source-panel" id="source-panel" aria-labelledby="source-panel-title" hidden></aside>
    <aside class="index-drawer" id="index-drawer" aria-label="Manuscript index" hidden>
      <div class="drawer-header"><h2>Manuscript index</h2><button id="close-index" type="button" aria-label="Close index">×</button></div>
      <label class="search-label" for="folio-search">Search folio metadata</label>
      <div class="search-row"><input id="folio-search" type="search" placeholder="Genesis, 3r, creation…" autocomplete="off"><button id="clear-search" type="button">Clear</button></div>
      <div id="search-results" class="search-results" aria-live="polite"></div>
      <p id="index-summary">Browse indexed manuscript sections.</p><div id="manuscript-index"></div>
      <div class="drawer-metadata" id="manuscript-metadata"></div>
    </aside>
  </main>`

if (location.pathname === '/editor/candidate-preview') {
  app.innerHTML = '<div class="editorial-route" id="editorial-route"></div>'
  renderCandidatePreview(app.querySelector('#editorial-route'))
} else if (location.pathname === '/editor/batch-transcription') {
  app.innerHTML = '<div class="editorial-route" id="editorial-route"></div>'
  await renderBatchDashboard(app.querySelector('#editorial-route'), new URLSearchParams(location.search).get('job'))
} else if (location.pathname === '/editor/translation-pilot') {
  app.innerHTML = '<div class="editorial-route" id="editorial-route"></div>'
  await renderTranslationPilotViewer(app.querySelector('#editorial-route'), new URLSearchParams(location.search).get('run'))
} else if (location.pathname === '/editor/translation-production') {
  app.innerHTML = '<div class="editorial-route" id="editorial-route"></div>'
  const query = new URLSearchParams(location.search); await renderTranslationProductionViewer(app.querySelector('#editorial-route'), query.get('job'), Number(query.get('page') || 30))
} else if (location.pathname === '/editor/master-edition') {
  app.innerHTML = '<div class="editorial-route" id="editorial-route"></div>'
  await renderMasterEditionViewer(app.querySelector('#editorial-route'), Number(new URLSearchParams(location.search).get('page') || 1))
} else if (location.pathname.endsWith('/review')) {
  app.innerHTML = '<div class="editorial-route" id="editorial-route"></div>'
  await renderReviewerMode(app.querySelector('#editorial-route'))
} else if (location.pathname === '/editor/folio-002r' || ['/transcription','/expansion','/literal','/readable','/alignment'].some((suffix) => location.pathname.endsWith(suffix))) {
  app.innerHTML = '<div class="editorial-route" id="editorial-route"></div>'
  const mode = location.pathname.split('/').at(-1); await renderEditorialWorkspace(app.querySelector('#editorial-route'), mode === 'folio-002r' ? '' : mode)
} else if (location.pathname.startsWith('/editor/folio-002r/')) {
  app.innerHTML = '<div class="editorial-route" id="editorial-route"></div>'
  const routeRoot = app.querySelector('#editorial-route')
  if (location.pathname.endsWith('/regions')) await renderRegionAuthoring(routeRoot)
  else if (location.pathname.endsWith('/compare')) await renderComparison(routeRoot)
  else if (location.pathname.endsWith('/evidence')) await renderEvidenceView(routeRoot)
  else routeRoot.innerHTML = '<p>Unknown editorial route. <a href="/">Return to reader</a></p>'
} else if (location.pathname === '/editorial-status') {
  await renderEditorialStatus(app, loadIndex())
} else try {
  const [index, db] = await Promise.all([loadIndex(), openCodexDB()])
  new CodexReader({ index, db, root: document.querySelector('#codex-app') }).init()
} catch (error) {
  document.querySelector('#reader-status').textContent = `The codex could not be opened: ${error.message}`
  console.error(error)
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/service-worker.js').catch(console.error)
