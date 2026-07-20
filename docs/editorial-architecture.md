# Editorial architecture

Project GIGAS separates scholarly evidence from presentation and local work in progress.

```text
Raw submission
      ↓
Integrity layer
      ↓
Assessment layer
      ↓
Review layer
      ↓
Proposal layer
      ↓
Canonical layer
      ↓
Reader UI
```

## Layer responsibilities

- **Raw submission:** preserves supplied manifests and files without interpretation.
- **Integrity layer:** records checksums, byte lengths, source captures, licenses, and transformations.
- **Assessment layer:** classifies provenance, source quality, contributor identity, and qualification.
- **Review layer:** records regions, readings, comparisons, findings, adjudications, and review authority.
- **Proposal layer:** contains candidate JSON, semantic diffs, base fingerprints, and release previews.
- **Canonical layer:** contains only deliberately accepted repository records with complete provenance chains.
- **Reader UI:** renders canonical data and labels draft, uncertain, commentary, and verification states; it cannot write repository files.

IndexedDB stores recoverable local drafts and sessions. It is not a canonical source.
