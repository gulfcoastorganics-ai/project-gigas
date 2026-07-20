# Low-memory processing

Downloads stream to disk, page processing is sequential, and the full PDF is not buffered by the page workflow. Use `GIGAS_MAX_CONCURRENCY=1`, `GIGAS_MAX_IMAGE_BYTES`, `GIGAS_MAX_RESPONSE_BYTES`, and `GIGAS_DOWNLOAD_CHUNK_BYTES` to bound work.
