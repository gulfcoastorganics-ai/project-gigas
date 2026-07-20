# Scholarly submission manifest

Every transcription submission must include a manifest before intake. The manifest identifies the folio, contributor, source method, files, source citations, transcription policy, qualification statement, machine-assistance disclosure, and known limitations.

The machine-readable template is `src/data/specialist-submission-schema.json`. Use `npm run intake:submission -- --manifest=<path>` to validate and preserve a submission without changing canonical folio data.

Anonymous, OCR, machine-generated, fixture, or unknown-provenance material may be retained as explicitly noncanonical research evidence, but cannot satisfy the diplomatic release gate.
