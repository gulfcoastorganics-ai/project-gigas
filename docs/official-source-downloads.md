# Official source downloads

Project GIGAS registers Codex Gigas, National Library of Sweden shelfmark A 148, through the LIBRIS and Manuscripta records. Metadata synchronization is the default. Page downloads use the official IIIF manifest and preserve a page manifest, hash, license, attribution, canvas ID, and image-service ID.

Use `npm run source:sync-metadata`, then `npm run source:list-pages`. Routine processing uses `source:download-page`; it does not download the 4 GB PDF. The full-PDF command is guarded and currently requires a configured direct official PDF URL plus `--confirm-large-download`.
