# Editorial threat model

The threat model treats scholarly integrity as both a data and security concern.

| Threat | Control | Detection or response |
|---|---|---|
| Fabricated transcription | Source strategy, contributor identity, review authority, canonical evidence policy | Intake classification, review findings, release blocker |
| OCR hallucination | OCR is never accepted as canonical evidence | Submission classification and provenance audit |
| AI-generated Latin or translation | Machine-assistance disclosure and controlled verification transitions | Intake block, transition validation, release gate |
| Reviewer collusion or false independence | Qualification records, scope acceptance, independence declaration | Review audit and unresolved comparison reporting |
| Provenance loss | Source captures, citations, authorities, and complete provenance chain | Data validation and audit-trail verification |
| Checksum mismatch | SHA-256 manifests for submissions and assets | Integrity commands fail nonzero |
| Accidental canonical overwrite | Candidate-only browser workflow and guarded apply command | Base fingerprint check, explicit confirmation, backup snapshot |
| Stale review package | Package manifest, checksums, timestamps, and fingerprint comparison | Package verification and stale-revision warning |
| Unsigned or unreviewed proposal | Proposal status and explicit reviewer/application requirements | Proposal and release checks block |
| Restricted asset redistribution | License registry and service-worker policy | Asset validation and cache policy |

No single software check proves historical truth. Controls make unsupported claims difficult to admit, preserve the evidence needed for correction, and keep uncertainty visible.
