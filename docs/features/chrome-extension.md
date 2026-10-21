# Peguin Copilot for Chrome

The private copilot inside the owner's own Google Meet tab, in Chrome's side panel (which Chrome leaves out of tab shares). No desktop app, no Peguin account: the owner's own AI key.

- **Start** finds the Meet call (the tab in front, or the window's only Meet tab), posts the AI notice in the meeting chat and starts listening only once the notice shows up there. If it can't post it, the owner can paste it; Peguin starts when it sees it.
- **Two ears:** Meet's live captions (with speaker names; the owner's lines as "You", used as context only) and the tab's audio through whisper in the browser (WebGPU or WebAssembly, nothing uploaded). Either can be off or fail; the other carries on.
- **Merge:** cleans both, pairs the same speech from the two ears, keeps one line per utterance. Auto, Captions or Audio decides whose text wins; the panel shows each ear's live level and how often the two agree.
- **Cards:** each question someone asks gets a streamed suggestion labelled From your notes / Not in your notes / General knowledge, from the owner's notes only for their own work. "◎ Both ears" marks a question both sources heard the same way. Up to three wait; older overflow is marked skipped. The owner can also type a question.
- **Settings:** name, AI (Claude, OpenAI or Grok, with an API key, models from the key's own list), notes (one fact per line), Work or Interview, Check online (Claude), which ears to use and the whisper model.

## Build and load

```bash
cd extension && npm install && npm run build
```

Then chrome://extensions → Developer mode → Load unpacked → `extension/dist`. Open a Meet call, click the Peguin icon **on the Meet tab** (Chrome only lets an extension hear a tab after that click), and press Start. `npm run zip` makes `peguin-copilot.zip` for the Chrome Web Store.

## Decisions

- 2026-10-18: Peguin Copilot for Chrome
- 2026-10-10: Copilot: the call is told in chat, then popped-out notes leave screen shares
- 2026-10-10: Every user's own AI; Grok as an alternative standard voice
- 2026-10-10: The copilot answers general questions, interviews included

## Files

| Path | Role |
|---|---|
| `extension/static/manifest.json` | MV3 manifest: side panel, tab capture, offscreen, Meet content script, AI and Hugging Face hosts, CSP with `wasm-unsafe-eval` |
| `extension/build.mjs` | esbuild bundles per context, static files, onnxruntime's WebAssembly into `dist/ort/` |
| `extension/src/merge.ts` | Pure: `clean`, `isNoise`, `similarity`, `sameSpeech`, `pick`, `Merger` |
| `extension/src/captions.ts` | Pure: `CaptionTracker` cuts Meet's growing caption blocks into pieces at pauses; `splitBlock` |
| `extension/src/vad.ts` | Pure: voice detection that cuts the tab audio into utterances for whisper |
| `extension/src/cards.ts` | Pure: `CardQueue` (one answer at a time, waiting limit), `splitLabel` |
| `extension/src/ai.ts` | The owner's AI from the browser: `listModels`, `ask` (streamed), `checkOnline` (Claude web search), `chatModels`, `sseDeltas` |
| `extension/src/settings.ts` | Settings in `chrome.storage.local`; API keys sealed with a non-extractable AES-GCM key in IndexedDB; `factsOf` |
| `extension/src/content.ts` | On Meet: reads captions, turns them on, posts the AI notice, reports in-call/ended |
| `extension/src/offscreen.ts`, `extension/static/pcm-worklet.js` | Tab audio: plays it back (capturing mutes the tab), 16 kHz frames, VAD, whisper queue |
| `extension/src/background.ts` | Opens the side panel from the toolbar; creates the offscreen page |
| `extension/src/messages.ts` | Message types between the parts; `isMeetUrl` |
| `extension/src/panel/copilot.ts` | The copilot: start, notice, both ears, merge, questions, answers, Check online |
| `extension/src/panel/App.tsx`, `styles.css` | The panel UI |
| `src/core/brain/prompts.ts` | Shared with the desktop copilot: `AI_NOTICE`, `isQuestion`, `copilotSystem`, `copilotWebSystem`, `answerContext`, `plainSpoken` |

## Tests

`test/extension.test.ts`: cleaning, matching (including different speech close in time, and the same words far apart), the merger's waiting, late twins and the owner's lines, caption tracking, voice detection, the card queue and labels, model lists, SSE parsing. End to end in Chrome for Testing against a fake Meet page with a faked Anthropic API (notice, captions, questions, streamed answers, audio refusing without the toolbar click), and whisper on a spoken clip inside the extension's CSP. Not yet: a real Meet call (caption DOM, chat notice, tab audio after the toolbar click, whisper on real voices, WebGPU).
