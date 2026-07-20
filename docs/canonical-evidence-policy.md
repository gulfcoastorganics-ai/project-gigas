# Canonical evidence policy

This is the governing policy for material admitted to the Project GIGAS canonical repository. More specialized documents may explain implementation details, but they may not weaken these requirements.

## Design principles

- Evidence before interpretation.
- Preserve originals without modification.
- Never fabricate manuscript text.
- Separate historical evidence from modern commentary.
- Make every canonical change reproducible.
- Attribute every editorial decision.
- Preserve cryptographic integrity throughout the workflow.

## Canonical evidence

Canonical evidence is a repository record whose identity, source, integrity, contributor, editorial history, and review status are documented sufficiently for the relevant release gate. A valid string by itself is not canonical evidence.

Acceptable bases include:

- an image or metadata record from the holding institution or an authoritative digital repository;
- a published scholarly or diplomatic transcription with a resolvable citation;
- a qualified human transcription made directly from the identified manuscript image;
- a published human translation with its edition or publication citation; and
- documented editorial observations that remain explicitly classified as uncertain, draft, or commentary.

OCR, AI-generated text, normalized Bible text, anonymous submissions, unsourced copies, and non-scholarly fixtures cannot become canonical manuscript evidence. They may be retained as isolated research material when their status is explicit.

## Minimum review requirements

Each canonical textual record requires an identified contributor, a source capture or direct-manuscript method, a citation or documented evidence basis, a linked manuscript region where applicable, and a review history. Diplomatic transcription requires a reviewer authorized for that scope. Where project policy requires independent review, the second reading must be genuinely independent and disagreements must remain visible until adjudicated.

Qualification is never inferred from a name, title, or software account. Reviewer authority is determined by the qualification registry and review-authority matrix.

## Rejection criteria

Reject or isolate material when its provenance is unknown, its contributor is anonymous, its source cannot be identified, its original has been altered without a transformation record, its checksum does not match, it contains fabricated or machine-generated manuscript wording, or its review claims exceed the recorded authority. A rejected item must not silently enter canonical JSON.

## Preservation and provenance

Original submissions are preserved byte-for-byte when permitted. Source captures and asset records carry SHA-256 checksums, file metadata, capture method, contributor, and rights information. Canonical proposals record the base fingerprint; application requires a matching fingerprint, validation, proposal-integrity checks, and explicit human confirmation. Browser drafts never overwrite repository files.

Every accepted record must be traceable through the chain: source or submission → capture and checksum → contributor → region → review assignment and findings → adjudication when needed → verification event → canonical change history → release gate.

## Release requirements

Release gates are layer-specific. A folio cannot be release-ready while required image rights, citations, provenance, review authority, uncertainty handling, accessibility, browser behavior, or audit-trail requirements fail. Empty layers are incomplete evidence, not passing evidence. Verification states are controlled transitions and are never upgraded automatically by validation or UI display.

The current folio 2r state is therefore correctly blocked: authoritative image evidence exists, but no qualifying transcription submission and review history exists.
