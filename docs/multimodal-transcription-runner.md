# Multimodal transcription runner

Export an input package containing the actual page image as a data URI:

```sh
npm run export:transcription-input -- --source-page=1
```

The package includes source manifest data, source and image hashes, candidate region metadata, folio mapping status, and the unverified/noncanonical transcription instructions.

Candidate transcription requires a configured multimodal CLI:

```sh
GIGAS_LLM_CLI='your-llm-command' GIGAS_LLM_MULTIMODAL=true \
GIGAS_LLM_MODEL='model-name' GIGAS_LLM_MODEL_VERSION='version' \
npm run transcribe:candidate -- --source-page=1
```

The runner passes the real image with `--image`, verifies its hash, refuses missing or text-only capability, stores raw output and validated JSON under `data/candidates/transcriptions/`, and records the complete prompt and model provenance. It never writes canonical paths. Model output must be the Project GIGAS JSON schema with `status: unverified_ai_candidate`, `canonical: false`, and `reviewRequired: true`.
