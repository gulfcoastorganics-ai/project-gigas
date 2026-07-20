# Heavy transcription pipeline

The batch worker processes official IIIF canvases as isolated, noncanonical machine candidates. The default resource policy is one page at a time and one provider request at a time; page derivatives and region crops are streamed to disk and never require the complete Codex Gigas PDF.

Start a bounded job with:

```sh
npm run transcribe:batch -- --pages=10-19
```

The job is stored under `data/candidates/batches/<job-id>/`. Each page has its own image manifest, triage response, native-coordinate region records, crop manifests, raw provider responses, normalized region candidates, page candidate, and failure records. Region failures mark a page `partial` and do not stop later pages.

Useful controls:

```sh
npm run transcribe:status -- --job=<job-id>
npm run transcribe:failures -- --job=<job-id>
npm run transcribe:resume -- --job=<job-id>
npm run transcribe:retry-failures -- --job=<job-id>
npm run transcribe:export -- --job=<job-id>
npm run transcribe:storage-report -- --job=<job-id>
npm run transcribe:prune-temp -- --job=<job-id>
```

The worker maps display-space segmentation boxes to the inventory’s native IIIF dimensions independently on each axis and requests crops from the official image service. All generated records carry `canonical: false`, `candidateOnly: true`, `reviewRequired: true`, and `translationStatus: not_attempted`. Raw responses are retained separately from normalized candidates. The dashboard is available at `/editor/batch-transcription?job=<job-id>` when the Vite app is running.

The output label is **UNVERIFIED MACHINE TRANSCRIPTION**. It is not a scholarly edition and cannot promote itself into canonical data. Authentication failures and storage thresholds pause the job; transport, malformed-response, and schema failures remain in the retry/failure queue.

