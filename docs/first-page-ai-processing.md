# First-page AI processing

The selected first page is sent as actual image data, not as a filesystem path in a text prompt. The adapter verifies the source image hash, MIME type, dimensions, and nonzero size before constructing provider-native base64 image input.

Run the complete candidate workflow with:

```sh
npm run process:first-page -- --source-id=<source-id> --page=1
npm run verify:first-page-run -- --source-id=<source-id> --page=1
```

Stages resume from valid completed records. Network, timeout, rate-limit, and transient server failures may retry with bounded exponential backoff. Malformed scholarly content is not retried with a request to guess. All raw responses, parsed outputs, hashes, prompts, providers, models, retries, and blockers remain under candidate storage.

Without a usable provider the run records an explicit blocked result. No text is invented.
