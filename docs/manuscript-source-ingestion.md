# Manuscript source ingestion

Project GIGAS accepts a genuine manuscript PDF, a directory of PNG/JPEG/TIFF/WebP images, or one manuscript image:

```sh
npm run ingest:manuscript -- --input=/path/to/manuscript.pdf
```

The intake inspects PDF page count, embedded image count and dimensions, image coverage, printable text density, metadata, and repeated page-image structure. Text-heavy descriptive documents are classified as `descriptive_document` and rejected. The five-page exhibition brochure is not manuscript evidence and must not be ingested as such.

The original file is copied unchanged under `data/candidates/manuscript-sources/`; its SHA-256, media type, size, filename, timestamp, and page count are recorded in `data/candidates/manifests/`. Source IDs are content hashes, so repeating an intake is safe and deterministic.

All generated records are candidate-only. Nothing in `data/candidates/` is canonical manuscript data.
