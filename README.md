# Project GIGAS

Project GIGAS is a vanilla JavaScript manuscript-reader prototype with a conservative scholarly-data workflow. It combines JSON records, IndexedDB, a PWA shell, lazy folio imports, provenance registries, local search, and reusable image adapters.

## Development and validation

Start with:

```bash
npm install
npm run dev
npm run validate:data
npm run verify:assets
npm run audit:sources
npm run release:check
npm run test:smoke
npm run test:browser
npm run build
```

Additional review-package and folio-specific commands are documented in `package.json` and `docs/`.

## Editorial status

The current folios are explicitly labeled placeholders. Canonical text remains empty where human transcription is unavailable; candidate material is kept separate from canonical records. Release remains gated pending scholarly review.

## Architecture and trust boundaries

See [editorial workflow](docs/editorial-workflow.md), [editorial architecture](docs/editorial-architecture.md), [canonical evidence policy](docs/canonical-evidence-policy.md), [trust boundaries](docs/editorial-trust-boundaries.md), and [canonical empty state](docs/canonical-empty-state.md).

No verified live demo URL or screenshot gallery is currently linked; add a public demo and representative workflow screenshots when available.
