# Editorial trust boundaries

The project treats each movement of data as a trust boundary.

| Data | May modify canonical data? | Preservation rule | Human approval |
|---|---:|---|---|
| Original submission | No | Immutable captured copy and checksum | Assessment required |
| Noncanonical fixture or rejected material | No | Isolated archive, clearly classified | None can promote it by itself |
| IndexedDB draft | No | Recoverable local session | Export and review required |
| Candidate package | No | Fingerprinted, diffable, reproducible | Explicit proposal review |
| Review findings and adjudications | No, but they govern eligibility | Append history; do not erase disagreement | Authorized reviewer |
| Canonical proposal | No | Must match base fingerprint | Explicit apply confirmation |
| Canonical repository | Yes, only through guarded apply | Git plus change history and checksums | Required review and release gates |
| Reader UI | No | Read-only rendering of repository data | None |

Immutable material includes original supplied files and their recorded checksums. Reproducible material includes candidate exports, fingerprints, validation reports, semantic diffs, and research packages. Human approval is required before a candidate becomes canonical and before a verification state is upgraded.

The apply command requires a matching base fingerprint, passing validation, valid reviewer authority, no unresolved blocking findings for the accepted scope, and `--confirm-reviewed-import`. Without that flag it is a dry run.
