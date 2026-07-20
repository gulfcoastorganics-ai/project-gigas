# First-folio review package

Export and verify the complete candidate package:

```sh
npm run export:first-folio-review-package
npm run verify:first-folio-review-package -- --path=exports/first-folio-review/<source-id>/page-0001
```

The package contains the source receipt and rights metadata, selected image and hash, mapping evidence, regions and line placeholders, all pass outputs, raw responses, comparisons, grammar review, evidence fusion, blockers, and file hashes. It is explicitly `unverified_ai_candidate`, `canonical: false`, and not release-eligible. Unresolved disagreements remain visible and block readiness.

The candidate preview is available at `/editor/candidate-preview` and loads a package manifest locally. It is not linked into the public canonical reader.
