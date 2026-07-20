# Model provenance and independence

Every stage records provider, model, model version, request ID, prompt hash, request-payload hash, source-image hash, transmitted-image hash, raw-response hash, parsed-output hash, timestamps, usage, retries, and validation status.

The independent transcription and translation prompts are constructed without first-reader outputs, confidence, comments, retries, or comparisons. With one configured model the record says `same_model_separate_context`; a distinct configured model may be recorded as `different_model`.

Exact readings and translation outputs are retained separately. Comparisons add differences and blockers but never normalize or overwrite either candidate.
