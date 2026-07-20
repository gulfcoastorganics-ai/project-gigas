# Editorial lifecycle states

The workflow uses explicit editorial states. These states describe process status, not historical accuracy.

```text
Missing evidence
      ↓
Submission received
      ↓
Integrity verified
      ↓
Assessment complete
      ↓
Awaiting specialist review
      ↓
Primary review complete
      ↓
Secondary review complete
      ↓
Canonical candidate
      ↓
Approved
      ↓
Released
```

Rejection branches from submission assessment to **Noncanonical archive**. Findings may return a candidate to review or assessment. A missing transcription is not a software failure: folio 2r is currently in the missing-evidence / awaiting-specialist-review condition, with its release state blocked.

The implementation also retains fine-grained verification states such as `draft`, `internally-reviewed`, `externally-reviewed`, `verified`, `disputed`, and `deprecated`. Those record the state of a specific record or layer; the lifecycle above records the folio workflow.
