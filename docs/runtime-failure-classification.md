# Runtime failure classification

Provider failures are classified as `transport_failure`, `authentication_failure`, `rate_limited`, `provider_error`, `invalid_model`, `text_only_model`, `image_not_sent`, `image_rejected`, `empty_response`, `malformed_json`, `schema_validation_failure`, `upstream_stage_failed`, or `unexpected_exception`.

Raw provider response bodies, response headers, HTTP status, request/response IDs, retry metadata, and attempt records are preserved before parsing or validation. Parsed-but-invalid JSON is retained with validation errors.
