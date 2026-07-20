# Multimodal provider configuration

The provider adapter is configured only through environment variables or an ignored local JSON file. It never prints or stores API keys.

OpenAI-compatible:

```sh
GIGAS_VISION_PROVIDER=openai \
GIGAS_VISION_MODEL=gpt-4.1-mini \
GIGAS_VISION_API_KEY="$OPENAI_API_KEY" \
npm run probe:vision-provider
```

OpenRouter uses `GIGAS_VISION_PROVIDER=openrouter`, `GIGAS_VISION_MODEL=<provider/model>`, and `GIGAS_VISION_API_KEY`. Gemini and Anthropic use `gemini` and `anthropic` respectively. Ollama requires an actually installed, image-capable model and `GIGAS_VISION_PROVIDER=ollama`; no model is downloaded automatically.

Optional settings are `GIGAS_VISION_BASE_URL`, `GIGAS_VISION_TIMEOUT_MS`, `GIGAS_VISION_MAX_RETRIES`, `GIGAS_VISION_MODEL_VERSION`, and `GIGAS_VISION_CONFIG=/path/to/vision-provider.local.json`. Keep local configuration files out of version control.

Probe first:

```sh
npm run probe:vision-provider
```

The probe reports configuration, image support, structured-output support, endpoint type, and blockers without exposing credentials.
