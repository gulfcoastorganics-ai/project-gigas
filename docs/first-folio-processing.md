# First-folio processing

Select exactly one source page after receipt verification:

```sh
npm run select:candidate-page -- --source-id=<id> --page=1
npm run map:candidate-folio -- --source-id=<id> --page=1 --folio=folio-candidate-001r --side=recto --evidence=reviewer-statement.txt
npm run prepare:first-folio-regions -- --source-id=<id> --page=1
npm run run:first-folio-passes -- --source-id=<id> --page=1
```

The mapping is reversible, candidate-only, and requires an evidence file. Source-page numbering remains separate from manuscript foliation. Regions contain deterministic two-column and line placeholders but no transcript text.

The pass runner requires a configured multimodal CLI and sends the actual image with every pass. The independent transcription and translation prompts do not receive first-reader output. If multimodal capability is unavailable, the run records a blocked failure instead of inventing text.
