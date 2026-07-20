# Editorial workflow

The canonical evidence pipeline is deliberately conservative:

```text
Submission
    │
    ▼
SHA-256 preservation
    │
    ▼
Scholarly assessment
    │
    ├── Reject ───────────────► Noncanonical archive
    │
    ▼
Qualified reviewer
    │
    ▼
Second independent review
    │
    ▼
Canonical proposal
    │
    ▼
Dry-run validation
    │
    ▼
Provenance verification
    │
    ▼
Canonical repository
    │
    ▼
Reader UI
```

The proposal and apply commands are separate intentionally. A candidate can be inspected, diffed, reviewed, and rejected without changing canonical data.
