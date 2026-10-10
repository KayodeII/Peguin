# Voice

How Peguin sounds in the meeting.

- **Standard voice:** the Mac's built-in voice (default, private) or a Grok voice with the user's xAI key, falling back to the Mac voice if xAI fails mid-meeting.
- **The owner's own voice** (opt-in): a sample recorded live in the app after a consent sentence, then either Chatterbox Turbo on the Mac (ONNX, ~3.3 GB model) or an ElevenLabs instant clone with their own key. Prepared lines are checked by ear with whisper and redone when the words come back wrong; the update is made ahead of time and cached encrypted.
- The disclosure and "(AI)" name never change, whichever voice is used.

## Decisions

- 2026-10-07: Product shape (voice cloning only of the account holder, live recording, consent)
- 2026-10-08: Speaking in the owner's own voice, on their Mac
- 2026-10-08: The voice sample is natural talk, not a read script
- 2026-10-08: Speak in sentences, stop when talked over
- 2026-10-09: ElevenLabs as an optional engine for the owner's own voice
- 2026-10-10: Every user's own AI; Grok as an alternative standard voice

## Files

| Path | Role |
|---|---|
| `desktop/src/main/speech/tts.ts` | `macVoice`, `standardVoice` (Mac or Grok), choosing own voice vs standard, fallbacks |
| `desktop/src/main/xai.ts` | `grokSpeak` (MP3 to 24 kHz WAV with `afconvert`) |
| `desktop/src/main/speech/voice/index.ts` | Own voice: sample, pronunciations, cache, ahead-of-time update |
| `desktop/src/main/speech/voice/engine.ts` | Chatterbox Turbo through onnxruntime-node |
| `desktop/src/main/speech/voice/model.ts` | Model download, pinned revision and sizes |
| `desktop/src/main/speech/voice/eleven.ts` | ElevenLabs engine, clone lifecycle, emotion cues |
| `desktop/src/main/speech/voice/store.ts` | The sample, encrypted, deletable |
| `desktop/src/main/speech/voice/text.ts`, `sampling.ts`, `audio.ts` | Text clean-up and respelling, token sampling, audio joins and levelling (pure) |
| `desktop/src/renderer/voice.tsx` | Settings > Voice: record, download, pronunciations, tuning, try it |
| `desktop/src/renderer/ai.tsx` | `StandardVoice`: Mac/Grok, voice id, Hear it |
| `desktop/src/main/settings.ts` | `voice.*` (`standard`, `grokVoice`, `engine`, `eleven.*`, pace, expressiveness, attempts) |
| `spikes/voice/README.md` | Measurements behind the choices |

## Tests

`test/voice.test.ts`, `test/xai.test.ts`.
