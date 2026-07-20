# Asset integrity

`npm run verify:assets` hashes pilot JPEGs, tile JPEGs, and manifests locally with SHA-256. `npm run verify:assets -- --write` regenerates the manifest after a controlled asset change. Verification never contacts a network. Any checksum, byte-length, MIME, source-capture, or license mismatch blocks the command.
