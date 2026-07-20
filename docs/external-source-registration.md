# External source registration

Register a public-domain or explicitly licensed manuscript source with a metadata JSON file:

```sh
npm run register:external-source -- --input=/path/to/source.pdf --metadata=/path/to/source-metadata.json
```

The metadata must identify the title, holding institution, collection, shelfmark/manuscript identifier, acquisition, rights statement and basis, attribution requirements, registrant, and source SHA-256 when supplied. A descriptive brochure, malformed file, unknown classification, missing identifier, missing rights, or mismatched hash is rejected.

Registration preserves the original byte-for-byte and creates a durable receipt containing the source hash, metadata hash, classification, page count, acquisition timestamp, rights record, and canonical fingerprint at intake. Registration is candidate-only.
