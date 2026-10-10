# Speech recognition

whisper.cpp (Metal) runs as a local `whisper-server` bundled with the app; nothing is sent anywhere. The model, large-v3-turbo q5_0 (~550 MB), downloads on first run. Whisper is primed with the owner's names and distinctive terms from the prepared facts. Peguin's own words are also checked by ear with it (see [voice.md](voice.md)).

## Decisions

- 2026-10-06: Desktop-first (local speech)
- 2026-10-10: Speech recognition: whisper large-v3-turbo, neutral prompt, vocabulary from the facts (benchmark)

## Files

| Path | Role |
|---|---|
| `desktop/src/main/speech/whisper.ts` | Starts `whisper-server`; `createListener` (voice activity, end-of-utterance silence), `transcribe` |
| `desktop/src/main/speech/hints.ts` | `vocabulary(facts)`, `whisperPrompt(names, vocab)` |
| `desktop/src/main/speech/model.ts` | Model download (size check, removes the old base.en) |
| `desktop/src/main/paths.ts` | `WHISPER_MODEL`, binary and model locations |
| `desktop/scripts/setup-whisper.sh`, `build-whisper-release.sh` | Build whisper.cpp for development and for releases (`desktop/vendor/` isn't in git) |
| `desktop/src/renderer/App.tsx` | First-run model download screen |

## Tests

`test/hints.test.ts`.
