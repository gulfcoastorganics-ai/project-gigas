# Provider response lifecycle

Before each request, Project GIGAS validates source/page identity, image existence, MIME, dimensions, byte count, and SHA-256. The transmitted image is recorded. After the provider responds, the raw body and response metadata are persisted first; only then is JSON extraction and schema validation attempted.

Malformed JSON, empty bodies, provider errors, authentication failures, and schema failures all retain their raw evidence. A valid response is still an unverified AI candidate and cannot enter canonical data.
