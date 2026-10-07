# Spike: Electron joins Google Meet, Teams and Zoom, and responds

Proves the desktop direction: a local Electron window joins a call as a guest, listens with local whisper.cpp, and gives the owner's update when someone hands them the floor. Throwaway code, not part of the build.

```bash
cd spikes/meet-join
npm install
./setup-whisper.sh                 # once: builds whisper.cpp + model into ./vendor (nothing system-wide)
npm start -- --url "<meeting link>" --name "Mujeeb" --aliases "Mujib"
# no --url: uses the Meet/Teams/Zoom link open in your Chrome (macOS)
# options: --update "what to say"  --greet (speak on joining)  --hidden  --audible (play call audio)  --verbose (buttons, levels, screenshots)
```

How it responds:
- Someone hands the owner the floor ("Mujeeb, you're up", "Mujeeb?") → Penguin discloses it's an AI and gives the update (`--update`, or a clearly labelled test update).
- A question for the owner afterwards → "I'll get Mujeeb to follow up on that" (free mode never answers live).
- Everything else → silent. Turn logic is `src/realtime/turn.ts`, bundled at start (`prestart`), so there's one copy of it.

Penguin always joins from its own window, as a separate guest. Running inside your Chrome tab would make it you (your account and mic, no "(AI)" name). Test with two participants: be in the Meet in Chrome as yourself, run the spike, admit "Mujeeb (AI)" from the lobby, then talk.

Pass criteria, in the terminal log:
1. `in the call; waiting for someone to hand Mujeeb the floor`
2. Say "Mujeeb, you're up": `heard: "..." -> give_update`, then you hear the update and `reply started N ms after they stopped talking`
3. Ask "Mujeeb, any blockers?": `-> answer`, and Penguin defers to you
4. Talk to someone else: `-> none`, Penguin stays quiet

TTS uses macOS `say` as a stand-in for Piper. Speech-to-text: `listen.js` (energy gate, 700 ms pause ends an utterance, whisper-server with names as a prompt). Name ends in "(AI)" and the default line discloses it's an AI (non-negotiable).

Per-platform notes:
- Teams: guest names can't contain parentheses, so the name is "<name> - AI". The name is typed through Electron (`insertText`) because Teams ignores values set from script.
- Zoom: `/j/<id>?pwd=` links are rewritten to `/wc/join/<id>?pwd=`. If WebRTC tracks don't show up, a Web Audio tap catches what the page plays.
- App launch prompts (`msteams:`, `zoommtg:`) are blocked so Penguin stays in the browser client.
