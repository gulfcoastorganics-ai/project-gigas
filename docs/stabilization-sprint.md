# Manuscript-processing stabilization

The stabilized first-page runner resolves the requested external source receipt, page selection, image path, and SHA-256 before any provider call. It creates a preview checkpoint and records the exact transmitted image metadata. Each run is written under a new `runs/run-*` directory; previous runs are never overwritten.

If primary transcription fails, every downstream editorial stage is recorded as blocked with `failureClassification: upstream_stage_failed` and `blockedBy: transcription-primary`. No empty candidate prompt is generated.
