# Submission intake

`npm run intake:submission -- --manifest=<path>` performs a guarded intake for folio 2r. It validates the manifest, verifies the contributor reference, preserves the original manifest and files, calculates SHA-256 checksums, creates source-capture records, classifies the material, and creates no canonical manuscript records.

Intake outcomes are deliberately separate from scholarly acceptance:

- accepted for editorial review: provenance and contributor requirements are present;
- accepted as unverified research material: the file is preserved but cannot support verification;
- blocked pending clarification: required metadata is incomplete; or
- rejected: the material is explicitly unsuitable for canonical use.

An intake result is not a transcription review and does not resolve the folio's blocking finding. A genuine specialist submission must still pass region review, independent comparison, adjudication where needed, provenance-chain validation, and release checks.
