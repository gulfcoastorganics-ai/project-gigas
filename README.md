# Project GIGAS

Project GIGAS is a vanilla JavaScript manuscript reader prototype with a conservative scholarly-data pipeline. It uses JSON records, IndexedDB, a PWA shell, lazy folio imports, provenance registries, local search, and reusable image adapters.

## Development

```bash
npm install
npm run dev
npm run validate:data
npm run verify:assets
npm run audit:sources
npm run audit:pilot
npm run release:check
npm run test:smoke
npm run browser:probe
npm run export:review-package -- --folio=002r
npm run export:provenance-graph -- --folio=002r
npm run verify:audit-trail -- --folio=002r
npm run fingerprint:folio -- --folio=002r
npm run export:transcription-template -- --folio=002r
npm run test:browser
npm run test:review-workflow
npm run export:folio -- --folio=002r
npm run diff:folio -- --folio=002r --candidate=<path>
npm run verify:review-workflow
npm run export:primary-review-package
npm run export:second-reader-package
npm run export:comparison-package
npm run export:adjudication-dossier
npm run export:unresolved-disagreements
npm run verify:review-workflow-package -- --path=<path>
npm run tiles:generate -- --folio=002r --force
npm run build
```

The ten current folios are labeled placeholders. Do not treat their text or artwork as authoritative manuscript material.

Sprint 4 pilots real CC BY 4.0 image derivatives for adjacent folios 2r/2v from National Library of Sweden A 148. The image/catalog layer is provenance-linked; transcription, translation, alignment, and release remain blocked pending scholarly review. `npm run test:browser` reports an actionable environment blocker when no Chromium-compatible browser runner is available. Open `/editorial-status` for the local workflow dashboard.

Sprint 5 adds the folio 2r editorial workflow: draft layout guides, IndexedDB-backed region authoring at `/editor/folio-002r/regions`, evidence view at `/editor/folio-002r/evidence`, read-only comparison at `/editor/folio-002r/compare`, structured text-layer schemas, review findings, change history, export packages, and layer-specific release gates. Canonical JSON is not changed by browser editing.

Sprint 6 adds the unified workbench at `/editor/folio-002r`, recoverable editorial sessions, canonical fingerprints, candidate-only transcription imports, semantic diffs, reviewer mode, blank specialist templates, and evidence-export guards. Folio 2r remains blocked and no transcription has been fabricated.

Sprint 7 establishes Outcome B of the scholarly workflow: no genuine human transcription was found, so the project preserves canonical text emptiness and produces a specialist review package, submission-intake path, qualification policy, provenance graph, audit-trail verification, and blocked release state. The non-scholarly demo fixture remains candidate-only.

The governing evidence rules are in `docs/canonical-evidence-policy.md`. The pipeline is illustrated in `docs/editorial-workflow.md`, its layers are described in `docs/editorial-architecture.md`, and trust boundaries are documented in `docs/editorial-trust-boundaries.md`. See `docs/editorial-threat-model.md` for integrity threats, `docs/editorial-lifecycle.md` for workflow states, and `docs/canonical-empty-state.md` for why empty folio 2r text is intentional.

See `docs/` for provenance, citations, licensing, verification, tiled images, testing, validation, specialist intake, and review policies.

Sprint 8 adds candidate-only specialist assignments, blind second-reader package boundaries, line-review and disagreement schemas, guarded adjudication states, workflow-package integrity checks, and review-state tests. These records are empty because no genuine transcription submission exists. The canonical fingerprint and blocked release state remain unchanged.
