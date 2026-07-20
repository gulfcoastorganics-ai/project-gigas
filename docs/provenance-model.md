# Provenance model

Authorities, citations, and licenses live in registries under `src/data/`. Folios reference IDs through normalized `sources` packages; the UI resolves those references through `src/data/provenance.js`. Missing legacy packages receive explicitly placeholder defaults in `normalize-folio.js`.

Add an authority before assigning responsibility for an image, transcription, translation, note, or commentary. Internal project records are not historical authorities.
