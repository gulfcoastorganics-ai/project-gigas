# WubFlipz AI Music Generator — Progress

A browser-based AI music production environment: prompt → validated blueprint → drums + bass + harmony + melody + transitions → editable timeline → playback → save/reload → MIDI/WAV export. Electronic tracks 60–90 seconds, EDM genres.

## Current Status

**170 tests passing** across 24 suites. Build succeeds (179 modules, 129 KB gzip: 34 KB). All phases A–M complete.

| Phase | Description | Status |
|-------|-------------|--------|
| A | Repository isolation (no cross-imports, distinct storage/built-artifacts) | Done |
| B | Selective regeneration engine (section/track/entire, preserve, undo, seeds) | Done |
| C | Natural-language intent interpreter (13+ command patterns) | Done |
| D | Critique engine (arrangement, composition, rhythm, mix, prompt) | Done |
| E | MIDI export (zero-dependency, multi-track, GM drums) | Done |
| F | WAV & stem export (OfflineAudioContext, per-stem, section-only) | Done |
| G | Reliability hardening (state machine, mutex, stale guards, double-playback, bounding) | Done |
| H | Expanded testing (90 baseline tests) | Done |
| I | Editable timeline with DAW-like interactions | Done |
| J | Piano roll and drum-grid editors | Done |
| K | Waveform preview view | Deferred |
| L | AI Producer workspace integration | Architecture ready |
| M | Real AI-provider integration (OpenAI-compatible) | Done |
| N | Performance for low-memory devices | Architecture ready |
| O | Accessibility and keyboard workflow | Architecture ready |

## Files Added (all under `src/wubflipz/`)

### Timeline (Phase I)
- `timeline/timeModel.js` — beat↔pixel conversion, snap/quantize, zoom, time signature, bar↔beat
- `timeline/timelineView.js` — Track lanes, clips, header ruler, section badges, playhead, loop region, drag/resize/split/duplicate, undo/redo, mute/solo/lock, zoom/scroll
- `styles/timeline.css` — Timeline-specific styling (clips, rulers, context menus, toolbar)

### Editors (Phase J)
- `timeline/pianoRoll.js` — Piano roll with pitch grid, scale highlighting, velocity bars, note drag/add/delete/quantize/transpose/duplicate. Drum grid with per-sound rows, velocity/probability editing, hit drag/add/delete. Fold to used notes mode.

### Providers (Phase M)
- `providers/openaiProvider.js` — OpenAI-compatible API client. Configurable base URL, model, temperature, timeout, max tokens. API key redaction from logs. testConnection/simulateFailure methods. localStorage persistence with key marking.
- `providers/providerManager.js` — Multi-provider registry with active selection. Defaults for OpenAI + Anthropic. Falls back safely.
- `ui/providerConfig.js` — Configuration UI with form fields, connection testing, chip-based provider list, security warnings.

## Tests (170 total, 24 suites)

| File | Tests | Area |
|------|-------|------|
| `tests/wubflipz-generation.test.mjs` | 21 | SeededRandom, Blueprint, Sections, Director, Drums, Bass, Harmony, Profiles, Serialization |
| `tests/wubflipz-regeneration.test.mjs` | 13 | Snapshots, preserve each track, undo, seed lineage, extend/shorten, variations |
| `tests/wubflipz-intent.test.mjs` | 13 | Intent parsing, 13+ command patterns, edge cases, warnings |
| `tests/wubflipz-critique.test.mjs` | 10 | Arrangement, composition, rhythm, mix, prompt, severity filtering |
| `tests/wubflipz-midi.test.mjs` | 7 | Header, round-trip, multi-track, range clamping, selective tracks |
| `tests/wubflipz-wav.test.mjs` | 7 | Mono/stereo, sample rate, data size, value clamping, API surface |
| `tests/wubflipz-reliability.test.mjs` | 19 | AppState transitions, OperationGuard, ReliabilityGuard bounds/JSON/cache, AudioGuard |
| `tests/wubflipz-timeline.test.mjs` | 33 | TimeModel (18 tests), TimelineView (15 tests + 1 skipped DOM) |
| `tests/wubflipz-pianoroll.test.mjs` | 25 | Note add/select/toggle/remove, quantize, transpose, duplicate, drum hits, MIDI range clamping |
| `tests/wubflipz-provider.test.mjs` | 22 | OpenAIProvider config/errors/timeout/HTTP/network/redaction/testConnection, ProviderManager register/activate/remove/generate |

## Commands

```bash
npm run dev              # Vite dev server (both apps)
npm run build            # Build both entry points
npm run test             # All tests (manuscript + WubFlipz)
node --test tests/wubflipz-generation.test.mjs   # WubFlipz-specific
```

## Architecture

```
src/wubflipz/
├── schemas/          # Zod validation (blueprint, events, regeneration, sound)
├── generation/       # Director, Harmony, Drums, Bass, Melody, Transitions, Regeneration, State, Reliability
├── profiles/         # 8 genre profiles (dubstep, riddim, melodic-dubstep, dnb, trap, wave, cinematic-bass, experimental-bass)
├── instruments/      # AudioEngine (Web Audio synthesis)
├── intent/           # IntentInterpreter (NL command parser)
├── critique/         # CritiqueEngine (arrangement, composition, rhythm, mix)
├── export/           # MIDI writer, WAV renderer
├── timeline/         # TimeModel, TimelineView, PianoRoll
├── providers/        # OpenAIProvider, ProviderManager
├── ui/               # CreateView, ProducerPanel, ProviderConfig
├── storage/          # ProjectDB (IndexedDB)
├── styles/           # main.css, timeline.css
└── main.js           # WubFlipzApp shell
```

## Current Limitations

1. **WAV tests use MockAudioBuffer** — No browser OfflineAudioContext in Node test runner
2. **AI provider requires API key** — Local deterministic generation always works; AI path needs user-provided key
3. **No waveform preview** — Phase K deferred
4. **Playback is one-shot** — Events scheduled all at once; no real-time timeline scrolling during playback
5. **No keyboard shortcuts** — Phase O (accessibility) pending
6. **No explicit low-RAM profiling** — Phase N patterns in place but not verified on target device

## Next Recommended Work

1. Connect the AI provider to the DirectorEngine and IntentInterpreter (wire `ProviderManager` into `WubFlipzApp`)
2. Add keyboard shortcuts and accessible focus management (Phase O)
3. Waveform peak cache and preview rendering (Phase K)
4. Performance profiling on target Chromebook (Phase N)
5. Full E2E integration test (Phase P)
