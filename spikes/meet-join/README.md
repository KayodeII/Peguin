# Spike: Electron joins Google Meet, Teams and Zoom

Proves the riskiest part of the desktop direction: a local Electron window can join a Meet as a guest, speak into the call, and hear the other participants. Throwaway code, not part of the build.

```bash
cd spikes/meet-join
npm install
npm start -- --name "Mujeeb (AI)"          # finds the Meet open in your Chrome (macOS)
npm start -- --url https://meet.google.com/abc-defg-hij --name "Mujeeb (AI)"
# works with Meet, Teams (teams.microsoft.com / teams.live.com) and Zoom links; Zoom opens its browser client
# options: --say "custom line"  --delay 5  --hidden  --audible (play call audio)  --verbose (log buttons, screenshot every 10 s)
```

Penguin always joins from its own window, as a separate guest. Running inside your Chrome tab would make it you (your account and mic, no "(AI)" name). Test with two participants: be in the Meet in Chrome as yourself, run the spike, admit "Mujeeb (AI)" from the lobby, then talk.

Pass criteria, all visible in the terminal log:
1. `clicked "Ask to join"`, then `in the call` after you admit it
2. `speaking: ...` and you hear the line in your browser, then `finished speaking`
3. `tapped remote audio track #N`, and `hearing: SPEECH` lines while you talk

TTS uses macOS `say` as a stand-in for Piper. Name ends in "(AI)" and the default line discloses it's an AI (non-negotiable).

Per-platform notes:
- Teams: guest names can't contain parentheses, so the name is "<name> - AI". The name is typed through Electron (`insertText`) because Teams ignores values set from script.
- Zoom: `/j/<id>?pwd=` links are rewritten to `/wc/join/<id>?pwd=`. If WebRTC tracks don't show up, a Web Audio tap catches what the page plays.
- App launch prompts (`msteams:`, `zoommtg:`) are blocked so Penguin stays in the browser client.
