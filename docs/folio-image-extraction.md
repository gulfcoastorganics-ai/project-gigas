# Folio image extraction

For an accepted PDF, intake extracts one native embedded image per page in PDF order as `folio-source-page-0001`, `folio-source-page-0002`, and so on. JPEG, JPEG 2000, and common Flate-compressed RGB streams are preserved or decoded without downscaling. The manifest records dimensions and the extracted-image hash.

PDF page order is only source order. It is not a folio-number assignment. Intake creates `data/candidates/source-folio-map.json` with every page unmapped; a reviewer must supply evidence before proposing a folio ID or side.

Prepare a candidate full-page region with:

```sh
npm run prepare:folio-regions -- --source-page=1
```

The region record contains normalized and pixel coordinates, a stable region ID, source-image hash, and empty line placeholders. It contains no transcription text.
