# Voice control ("Hey Peguin")

A virtual mouse on the owner's Mac. They say "Hey Peguin" and a command; Peguin's cursor glides to the target and it clicks, types, scrolls, opens things or draws on top of the screen. Only the owner's own mic, heard on the Mac by whisper. No AI and no screenshots: buttons are found by name through macOS Accessibility. Off by default (Settings > Voice control).

- **Say:** "click sign in", "show numbers" then "click 7", "click this" (where the mouse is), double-click, right-click; "open my browser", "go to github.com", "open Slack", "search for ..."; "scroll down a bit", "go back", "new tab", "close tab", "reload", "copy", "paste", "undo"; "type hello there", "press enter", "find pricing"; "draw a circle / an arrow here", "box sign in", "highlight this", "draw" (freehand, "done" or Esc), "clear"; "stop".
- **Wake:** "Hey/OK Peguin, ..." always counts; a bare "Peguin, ..." only with a known command. "Hey Peguin" alone or the shortcut (default Control+Alt+Space) makes the next line the command. Wake words, shortcut and search address are settings.
- **Permissions:** Microphone, and Accessibility (Settings shows both, with Allow). Without Accessibility, opening sites, apps and searches still work.
- **Learn my voice** (Settings > Voice, off by default): lines that aren't commands go to `learnFrom`, which keeps clean ones (4 to 15 s, 8+ words, mostly speech, not distorted, the owner's daily limit) for review. Never while the copilot or a meeting is live.
- **The work log** (Sources > On this Mac) uses the same helper (`front`) and the same Accessibility permission for window titles.
- **While the copilot is in a meeting**, a command waits 1.8 s and is ignored if the meeting audio said the same words (it came through the speakers).

## Try it from source

```bash
cd desktop && npm run setup:pointer && npm run build
PENGUIN_POINTER_TRY="show numbers;draw an arrow here" npx electron .
```

`PENGUIN_POINTER_TRY` (development only) runs those commands 2.5 s apart once voice control is on. Settings > Voice control also has a "Try it" box.

## Decisions

- 2026-10-20: Voice control ("Hey Peguin"), without AI

## Files

| Path | Role |
|---|---|
| `desktop/src/main/pointer/commands.ts` | Pure: `wake`, `parse` (the commands), `matchTarget`/`labelScore` (a spoken name to a button), `commandPrompt`, `isFiller`, `Echo`, `describe`, `searchUrl` |
| `desktop/src/main/pointer/index.ts` | `VoiceControl`: the mic listener, the Swift helper, overlay windows, running each action, numbers, freehand, the echo wait |
| `desktop/native/pointer.swift`, `desktop/scripts/build-pointer-helper.sh` | `pointer-helper`: glide, click, scroll, type, keys, the front app's clickable elements, the default browser; JSON lines over stdin/stdout |
| `desktop/src/renderer/pointer.tsx`, `desktop/src/preload/pointer.ts` | The see-through overlay (#pointer): Peguin's cursor, captions, listening orb, badges, drawings; mic capture on the primary display |
| `desktop/src/renderer/voicecontrol.tsx` | Settings > Voice control |
| `desktop/src/main/speech/whisper.ts` | `createListener` takes a `prompt` (voice control's own) and a `rate` (the overlay records at 24 kHz); utterances carry their audio |
| `desktop/src/main/copilot/session.ts` | Tells `echo` what the meeting said |

## Tests

`test/pointer.test.ts`: the wake phrase (including talk about penguins and the owner's own wake words), every command family, numbers and URLs, button matching (exact beats partial, ties become choices, nested duplicates count once, no guesses), fillers and the prompt's own words. Measured: spoken clips through the real listener and whisper-server (24 of 24 commands, no actions from 8 ordinary sentences or noise, ~0.4 s transcription), and on screen in the app (numbers, captions, a drawn arrow, the "which one?" choice). Not yet: the owner's own voice on a real mic, clicks in Chrome and Safari pages, a second display, freehand drawing, the echo wait in a real copilot call.
