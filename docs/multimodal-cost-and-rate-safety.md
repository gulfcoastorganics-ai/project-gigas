# Multimodal cost and rate safety

The adapter applies a per-request timeout, a maximum response size, a maximum retry count, exponential backoff, and a bounded first-page stage count. Use `--dry-run` on the processing command to validate image delivery and request construction without a paid request.

Retries are limited to network failures, timeouts, rate limits, and transient provider errors. Malformed JSON and uncertain manuscript content are recorded as failures and are not sent back to the model with “guess better” instructions. Provider usage metadata is retained when supplied; API keys are never persisted.
