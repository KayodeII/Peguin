# Decisions

Newest first. Add an entry when you make a choice a future agent might otherwise undo.

## 2026-10-27: Glass website, and Join as me shown honestly

The owner liked cluely.com's glassmorphism and asked for it on the site, and for Cluely's features in the app. The site now has frosted surfaces (translucent white, blur, a light edge, a soft periwinkle shadow) over a fixed aurora of soft gradients; the glows are radial gradients rather than a blur filter, so scrolling stays smooth. Section colours moved to cooler periwinkle tints so the glass reads. A new "Join as me" section keeps that glass and blue-card feel for the private copilot but not Cluely's exact cards (live captions with "Question for you" instead of a recording timer, an answer labelled with its source instead of a chat bubble, the AI notice posted first instead of a visible/invisible slider), showing only what the app does today (listening to the others, labelled suggestions, the recap, Work/Interview and Check online). Unlike Cluely, which sells "undetectable" and "invisible to others", Peguin's card says the opposite: the AI notice goes in the chat first, and only then do the notes stay out of screen shares (non-negotiable 1). Cluely's wording and images aren't reused. The app features chosen from Cluely (an Ask bar over any meeting app, quick actions with Cmd+Enter, opt-in Ask about my screen, richer meeting notes) come in their own PRs, and the site shows each only once it ships.

## 2026-10-27: Mini Peguin: the Dynamic Island or a small window

The owner asked for the Dynamic Island to be optional, "like a minimized version of the app" on Macs with a notch, and otherwise "a portable small window like Tailscale mini". Mini Peguin is its own window loading the app's page (`#mini-island` / `#mini-window`) with the app's preload, so it uses the same IPC and sender check as the main window. Off by default; Settings > General picks Off, Dynamic Island (only listed on a Mac with a notch) or Small window, and the main window has a button to shrink into it. It's the app's status and quick actions, not only voice control's: it works with voice control off, and while it's on, voice control's status pill steps aside (`pointer.island` still decides that pill when Mini is off). The island sits over the menu bar at screen-saver level like the overlay, opens under the pointer, and is sized to its content so the see-through part never blocks clicks; the notch is detected from the menu bar height (32 pt or more), as the overlay does without its helper.

## 2026-10-27: Peguin's cursor gets its own channel

The owner asked to bring the cursor "out of settings to somewhere they can easily see to turn on". Voice control and Peguin's cursor now have a **#cursor** channel in the sidebar, marked ON or OFF, with the switch beside a preview of the cursor, the permissions, how it looks, things to say and Try it; each saves at once. The rarer options (how to talk to it, Smart or Quick, search address, asking the AI) stay in Settings > Voice control, which links to #cursor.

## 2026-10-27: A first run that explains each step

The owner asked for a first start like Tailscale's: the old welcome was one form (name, link, time, sources) that didn't say what Peguin does or why it needs anything. The first run is now eight short steps, each with a sentence on why: what Peguin does, your name (it listens for it), sources (titles and statuses, never code), your AI (Claude Code and Codex detected with `--version`), your standup, what macOS will ask for and when, signing in for the trial, and the menu bar. Permissions are explained, not requested: macOS still asks when a feature first needs it, so setup never opens a system prompt the owner didn't trigger. Nothing is saved until the last step, so quitting halfway shows the first run again.

## 2026-10-27: Sources sessions — Codex, Cursor, Gemini, Copilot, Continue, DeepSeek

The owner asked for an orderly Sessions box with more AI coding tools, not only Claude Code. Each is a toggle that reads the owner's own prompts from that tool's local files on this Mac (never code or model output): Claude Code (`~/.claude/projects`), Codex (`~/.codex/history.jsonl`), Cursor (`~/.cursor/projects/.../agent-transcripts`), Gemini CLI, Copilot CLI, Continue, DeepSeek (desktop app / `~/.deepseek` when present). Missing installs report cleanly. Same privacy rule as Claude Code.

## 2026-10-27: Sources as app boxes (Code, Tickets, Sessions, This Mac)

The owner wanted Sources grouped like apps you link, not a flat list of toggles and paste fields. Sources is now four boxes: **Code** (Git + GitHub), **Tickets** (Linear + Jira), **Sessions** (Claude Code and the other AI coding tools), **This Mac** (work log). GitHub Connect runs `gh auth login -w` so nothing is pasted. Linear/Jira Connect opens their site to create a key, then one paste; full one-click OAuth through the Worker (like calendars) is still the follow-up when keys put people off.

## 2026-10-26: Linear and Jira on the desktop with the owner's own API keys

The desktop update only read git, GitHub and Claude Code, though the product promises Linear and Jira. The owner pastes a Linear personal API key, or a Jira site, email and Atlassian API token, in Sources. Each is checked (Linear's `viewer`, Jira's `/myself`), sealed with the Keychain in `trackers.sealed` and sent only to Linear or that Jira site. The fetches reuse the server stack's `src/core/sources/linear.ts` and `jira.ts`: issues assigned to the owner, updated since the previous workday; titles, statuses and times only. OAuth apps through the Worker (like calendars) would be one click, but need app registrations, a callback and token refresh on our side, and send the tokens through our server; personal keys need none of that and match "the owner's own" pattern of the xAI and ElevenLabs keys. OAuth can be added later as a second way to connect. A key that stops working shows as a source warning with how to fix it; it never fails the draft.

## 2026-10-24: Recaps for copilot meetings

The owner chose this as the next feature. Copilot meetings now get a recap in `#recaps`, from the same `MeetingLog` with `kind: "copilot"`, so one list, one retention setting and one summary path serve both. Differences, because the owner was there themselves: suggestions are stored on the question, not as something Peguin said; only "Not in your notes." questions become follow-ups ("Follow up on: ..."); questions with no suggestion in time are "skipped", not follow-ups; the summary prompt says the owner's words are missing and must not be guessed. It's on by default like Peguin's own recaps, with its own switch in Settings > Recaps, since it keeps other people's words from meetings Peguin didn't join; the Privacy Policy says so.

## 2026-10-24: Tamper-resistant installed app and signed updates

The owner asked that Peguin "can't be reverse engineered". A local Electron app can always be read by someone determined; what can be stopped is changing it, running it as something else, and pushing code to other people's Macs. So:

- **Electron fuses** (`build.electronFuses` in `desktop/package.json`): no `ELECTRON_RUN_AS_NODE`, no `NODE_OPTIONS`, no `--inspect`, cookies encrypted, the app loads only from `app.asar`, and the asar's integrity is checked at launch. A modified bundle exits with "Integrity check failed" (tested by repacking a change into a packaged build). Until there's a Developer ID, someone can still re-sign their own edited copy on their own Mac; notarisation closes that for copies they hand to others.
- **Minified main and preload bundles** (esbuild `--minify`, no source maps, no licence comments); the renderer already was. No obfuscator: it slows the app and breaks easily for little gain over minification.
- **Development overrides are ignored when installed** (`devEnv()` in `paths.ts`): `PENGUIN_CLOUD_URL` used to switch the installed app to another server and the dev licence key, and `PENGUIN_RENDERER_URL` could load any page with the app's preload.
- **The app's IPC answers only its own pages** (`handle()` in `index.ts` checks the sender frame); its pages can't navigate away, open windows or attach webviews (links go to the browser); DevTools close in installed builds.
- **Updates must be signed by Peguin.** The release workflow signs `SHA256SUMS.txt` with an Ed25519 key (`RELEASE_SIGNING_KEY` secret, `desktop/scripts/sign-sums.mjs`) and the app checks `SHA256SUMS.txt.sig` against the public key in `updater.ts` before downloading. Someone who could change a GitHub release or `/api/release` still can't install code on users' Macs. The private key is kept outside the repo; losing it means shipping a new public key in a release users download by hand.
- What actually protects revenue stays server-side: licences are Ed25519-signed by the Worker, and AI runs on the owner's own account.

## 2026-10-21: Silero VAD in front of whisper

Voice control's mic is always on, and a fixed loudness gate passed room noise to whisper, which invents text for it ("Thank you.", "Okay."): over half of 1,336 transcribed lines in a day's testing were noise, only 36 were addressed to Peguin, and scraps of real speech ran as commands. whisper.cpp's built-in Silero VAD (`--vad`, a 0.9 MB model shipped in `desktop/resources/`) keeps only voiced parts: noise clips came back empty, commands word for word, and the owner's room went silent in the log. Whisper's confidence scores were checked first and can't tell invented filler from speech. VAD can't tell the owner from a TV: that needs a speaker-verification model (the voice-cloning encoder's likeness overlaps, 0.60-0.86 for the owner and 0.33-0.72 for other voices), left for later.

## 2026-10-21: Smart drive with the owner's AI, and Peguin's own cursor

The owner wants Peguin to do things like a person ("open Music" should move to it and click, not just pop it open), "backed by the user's integrated AI; we'll build our own LLM later". So:

- **The owner's AI plans, Peguin acts visibly.** Each step the AI gets the goal, the steps so far and what's on screen as text (names, kinds and centres from the accessibility tree: the Dock, the front window, the menu bar), never screenshots, and answers with one JSON step. Text keeps it working with every AI the owner can choose (Claude Code sign-in, Codex, Grok), none of which takes images through our integration, and keeps what's sent small.
- **Safety over cleverness:** ids must come from the list, typing only into something chosen visibly (an unseen Spotlight once swallowed "Music" + Return into the editor in front), a step that changes nothing ends the run, 12 steps at most, Esc/"stop", and no sending, deleting, buying or posting unless asked.
- **Instant things stay local** (scroll, keys, typing, drawing, stop, "open <app>" via the Dock): an AI step costs about 9 s.
- **Peguin's own cursor:** a black penguin head (the brand), beak as the hotspot, an eye that looks where it's going and follows the owner's mouse; it wanders mid-screen away from the mouse and looks at the window the work log notes. Clicks warp the real mouse there and straight back, so only Peguin's cursor seems to move.
- **Peguin's own calls to Claude are no longer saved as Claude Code sessions** (`--no-session-persistence`), and sessions in temp folders are skipped: they were showing up as the owner's work.

## 2026-10-20: Work log and Learn my voice (opt-in, reviewed by the owner)

After voice control, the owner asked that Peguin "regularly get context from the laptop on work" and "from time to time get my voice, which the app will use to train itself to join meetings". They chose: app and window title only (not the text on screen, not screenshots), clips kept for them to approve (not automatic), both off by default.

- **Work log, Sources > On this Mac** (`desktop/src/main/watch/`): every few minutes (owner's setting, 5) `pointer-helper front` returns the front app, its window title (Accessibility; without it, the app name only) and seconds since the last input. Nothing is noted after 5 minutes idle, for Peguin itself, the lock screen, private browser windows, or the owner's skip list (a starting list of password and messaging apps they edit). Encrypted on the Mac, kept for the owner's days (7). The draft gets time per window ("Code: pointer.ts — penguin (about 1 h 20 min)"), and its prompt says these lines show where time went: never finished work, never facts unless other activity supports them. That keeps "never invent facts" while still letting the update mention what the owner spent the day on.
- **Learn my voice, Settings > Voice** (`desktop/src/main/speech/voice/clips.ts`, `clipRules.ts`): there is no training in the fine-tuning sense; the on-Mac voice and ElevenLabs both copy a voice from a sample, so a better sample is what "learning" means. While voice control listens, lines that aren't commands go to `learnFrom`, which keeps clean ones (4 to 15 s, 8+ words, 60%+ speech, not distorted, up to the owner's daily limit, 30 waiting at most), only after the owner has recorded their consent, and never while the copilot or a meeting is live (the speakers carry other voices). The overlay now records at 24 kHz so clips match the recorded sample's quality; whisper still gets 16 kHz.
- **The owner decides what's them.** Each clip shows a likeness to the consent recording from the voice model's speaker embedding, as a hint only. Measured with `spikes/voice/vendor` and `gen/me.wav` as the reference: the owner's dataset clips of 4 s or more scored 0.60 to 0.86, six macOS voices 0.33 to 0.72 ("Daniel" 0.72). Too close to trust, so nothing is pre-ticked. Ticked clips (12 s or more) replace the sample, up to 30 s; the consent recording stays, the ElevenLabs clone is remade on the next line, and the used clips leave the list.
- **Disclosure doesn't change.** Speaking in the owner's voice still starts with the AI introduction and keeps "(AI)" in the name; the consent sentence already says so.

## 2026-10-27: Screenshot when asked; local LLM later, not bundled yet

Smart drive refused “take a screenshot of WhatsApp” because the cloud AI treated it as a privacy risk and Peguin had no screenshot step. Screenshots are now a first-class action (`screenshot` in drive + parse): `screencapture` writes a PNG to the Desktop when the owner asks; Screen Recording may be required for Electron/Peguin. A bundled local LLM (so the planner isn't rate-limited or over-cautious) is still attractive for offline Smart drive, but shipping a capable instruct model inside the .dmg is a large download and a separate product decision — prefer optional download (MLX / llama.cpp on Apple Silicon) later, with the owner's Claude/Codex/Grok remaining the default planner. Local models still need the same action grammar (including screenshot); they don't replace tools.

## 2026-10-27: Session-limit falls across the owner's AIs

When Claude (or Codex / Grok) returns a session or rate limit, `brain.ts` marks that AI exhausted until the reset it reported (or one hour) and retries the same prompt on the next available agent on this Mac (Claude CLI, Codex CLI, or an xAI key). If none can answer, voice control shows a short "out of uses" line in a box under Peguin's cursor. Preference in Settings is unchanged; only that request (and later ones while the limit lasts) skip the exhausted AI.

## 2026-10-27: Voice control default is hold Control+Option (Clicky-style)

Clicky's UX is hold Control+Option, speak, release to act. Peguin matched the wake-word path first; ambient listening invented noise as commands until VAD, and the press shortcut never felt as reliable as a held modifier. Default `pointer.trigger` is now `hold`: the Swift helper watches flags with a listen-only CGEvent tap (`ptt-on`), PCM only feeds whisper while the keys are down, and release flushes the utterance. Wake word / press shortcut remain as `wake` or `both`. Same Accessibility permission as clicks.

## 2026-10-20: Voice control ("Hey Peguin"), without AI

The owner asked for "a virtual mouse for our AI representative": spoken commands that start with "Hey Peguin" (click on this, draw this, go to my browser). They chose: commands only from their own mic (people in a meeting can never drive the Mac), the whole Mac (desktop app), and, asked which AI should drive it, "we don't need AI to plug it, do we?". Right for the commands asked for, so there's none:

- **A fixed set of commands, like macOS Voice Control** (`desktop/src/main/pointer/commands.ts`, pure, tested): click, double-click and right-click by a button's name, by number or where the mouse is; open the browser, a site, an app; search; scroll; keys (new tab, back, copy, ...); type; find on the page; draw a circle, box, arrow, underline or highlight; freehand; clear; stop. Instant, free, nothing leaves the Mac, and it can't misread a web page as an instruction (the prompt-injection risk of a screenshot-reading agent). Open-ended jobs ("research this and summarise it") would need an AI; that's a later, opt-in extra (Claude's `computer_toolset_20260801` with the owner's API key; Claude Code sign-ins don't offer it).
- **"This" without seeing the screen:** buttons are found by name in the front app's accessibility tree (Chrome and Electron apps build theirs when asked with `AXManualAccessibility`); "show numbers" puts a badge on everything clickable for things without a usable name; several equally good matches get numbered and Peguin asks which. No Screen Recording permission: only Accessibility (clicks, typing, button names) and the mic.
- **Hearing "Hey Peguin":** the same whisper.cpp server, on the owner's mic, cut at 600 ms pauses. Measured with spoken clips (two voices, twelve commands, padded and unpadded): the meeting prompt dropped the leading "Hey Peguin" on 19 of 48; the prompt `Hey <name>, hello there.` kept 40 of 40 command clips, added it to none of 16 ordinary sentences, and produced no wake phrase on 19 noise clips (a prompt with a real command, "open my browser", was repeated verbatim on 11 of 19 noise clips, which would have acted). Its exact copy and whisper's silence words ("Thank you.", "Okay.") are dropped. About 0.4 s of transcription after the 0.6 s pause.
- **Not acting on talk:** a line must start with the wake phrase. "Hey/OK Peguin" plus anything is for Peguin (an unknown command gets a caption saying so); a bare "Peguin, ..." counts only when it's a known command, so "penguin facts" in conversation does nothing. "Hey Peguin" alone, or the shortcut (Settings, default Control+Alt+Space), makes the next line the command. While the copilot is in a meeting, a command waits 1.8 s and is dropped if the meeting audio said the same words (it came out of the speakers).
- **Visible, never silent:** a see-through, click-through window on every display shows Peguin's own cursor gliding to the target, a ring on it, a caption for every action, the listening orb, badges and drawings (which also appear in a screen share). The real pointer glides too, so the owner sees where it went. Freehand takes the mouse until "done" or Esc.
- **Off by default**, Settings > Voice control; wake words, shortcut and search address are the owner's settings. Ungated by plan for now: the owner's call.

## 2026-10-18: Peguin Copilot for Chrome

The owner asked whether WebAssembly in the browser could replace the desktop app. It can't for Join as Peguin: a web page can't script Meet's page, replace its `getUserMedia` or run with no tab open, which is why the app is Electron. It can do the private copilot inside the owner's own Meet tab, as a Chrome extension (`extension/`), and the owner chose that, Google Meet first.

- **Two ears, merged.** The owner asked to "combine both, with a way to clean, match and prioritise". Ear one is Meet's own live captions, read from the page (fast, punctuated, with speaker names; the owner's lines come as "You" and are context only). Ear two is the tab's audio (what the owner hears: everyone else, never their mic) through whisper in the browser (transformers.js, WebGPU or WebAssembly; `whisper-base.en` by default, `large-v3-turbo` on a GPU). `extension/src/merge.ts` cleans both (fillers, stutters, whisper's silence phrases), pairs pieces that overlap in time and share most words, and keeps one line per utterance. Priority: Auto (captions, unless whisper clearly heard more of the same sentence), Captions or Audio, switchable live. A piece waits 1.6 s for its twin; a twin that comes later only adds its speaker. Either ear can be off or fail and the other carries on.
- **The AI notice comes first, every time.** Chrome's side panel isn't part of a tab share, so the notes are always hidden from one; under "the call is told in chat" (2026-10-10) that's only allowed once the call has been told. So Start posts the same `AI_NOTICE` (moved to `src/core/brain/prompts.ts`, shared with the desktop app) in the Meet chat and listens only once it shows up in the chat log. If it can't be posted, the owner can paste it themselves; Peguin starts when it sees it.
- **The user's own AI, with an API key**, from the browser straight to Anthropic (the SDK with `dangerouslyAllowBrowser`), OpenAI or xAI. No CLIs in a browser, and Peguin's server stays out of the path (2026-10-10, "Every user's own AI"). Models come from the key's own list; Claude defaults to `claude-opus-5-5` at `effort: low` (copilot answers must be quick) with server-side refusal fallbacks. Check online is Claude-only for now (its `web_search` tool). Keys are sealed with a non-extractable AES-GCM key kept in the profile's IndexedDB (non-negotiable 6).
- **No code from the network** (Chrome Web Store rule): onnxruntime's WebAssembly ships in the extension; only model weights come from Hugging Face, once, then cached. Measured in Chrome for Testing: the extension's CSP allows it, and `whisper-base.en` transcribed a 3.8 s clip correctly in 2.1 s on one WebAssembly thread (18.5 s first load, including the download).
- **Look:** dark heads-up display, light when the system is light: hairline panels with tomato corner brackets, one colour per ear (captions mint, audio blue), monospace instrument labels, a listening orb and a radar while waiting. The owner asked for "futuristic". A conic sweep in the radar and the orb's glow are the only gradients; the website's "no gradients" rule is for the site.
- **Not done yet:** plan gating (the desktop copilot is Pro and Team; the extension has no Peguin sign-in, so it's free for now: the owner's call), Zoom and Teams web, Check online for OpenAI and xAI, whisper prompting with names from the notes, Chrome Web Store listing.

## 2026-10-12: Speech recognition: transcribe early in the pause; prime with Peguin, not sentence starts

The owner found Peguin slow to catch what was said, and inaccurate ("Pergun", "Calendly, I can't wait" from nothing).

- **Slow:** the listener waited out the whole pause (0.7 s, 1.2 s in the copilot) before starting whisper (~0.4 s). Now it starts transcribing after 0.4 s of silence; if whisper's text ends in "?", the utterance is handed over then, and otherwise the same transcript is used when the pause ends (dropped if they speak again). End of speech to transcript, measured with real whisper: copilot questions ~1.6 s → ~0.8 s, the participant ~1.1 s → ~0.8 s. Statements without a "?" still wait the full pause, so "could you walk me… through it" still arrives whole.
- **Inaccurate:** `vocabulary()` took every capitalised word, and in PR titles that's mostly sentence starts ("Desktop", "Leave", "Every", "Calendly"); whisper then hears those words where they weren't said. Words that only start a sentence, clause, quoted title or bracket are now skipped (mixed case, acronyms and digits still count), and "Peguin" is always in the prompt. On 48 synthetic call clips, the old prompt from the owner's real facts scored 8.0% word errors, the new one 7.7% with Peguin heard right every time. What remains is mostly the owner's name ("Muji") and tech words outside the facts (Redis, Postgres): those drop to ~2% when they're in the prompt.
- Tried and not worth it: a proper low-pass resampler instead of averaging every 3 samples (same score) and beam search (slightly worse, slower).

## 2026-10-13: Live answers stream, from a Claude CLI started ahead of time

Peguin waited for the whole answer before voicing any of it, and every answer started a fresh `claude -p`, which takes ~1.7 s before Claude even sees the prompt (the model makes no difference: Opus, Sonnet and Haiku all took 3.9–4.4 s end to end). Now:

- **Streamed:** `claude -p --output-format stream-json --include-partial-messages` (and Grok's `stream: true`) feed `bySentence`, and the participant voices each sentence as soon as the next one starts, while Claude is still writing. Codex has no streaming, so it still comes in one piece.
- **Warm:** while a meeting runs (Peguin's participant with follow-ups on, or the copilot) with Claude chosen, one CLI is kept started with `--input-format stream-json`, waiting. A question uses it once and a new spare starts behind it, so every answer still gets its own process and nothing carries over between answers. A plain `claude -p` can't be started early: it gives up after 3 s without stdin.
- Measured on the owner's Mac, question to first sentence ready: ~4.2 s (whole answer, cold) → ~1.6–1.9 s (warm, streamed). Copilot suggestions use the warm process too, but still appear whole.
- If the stream breaks after some sentences were spoken, Peguin stops there and the question counts as answered with what was said (the "Good question, I'll get <owner> to follow up" line would sound odd mid-answer). Nothing spoken yet: it defers as before.

## 2026-10-10: Copilot: the call is told in chat, then popped-out notes leave screen shares

Earlier the same day, hiding the copilot from screen capture was declined: with Interview mode, it would hide AI help from an interviewer. The owner's answer: the other side should know AI is helping, just not see the notes. So the hiding is conditional on telling them.

- **AI notice in the meeting chat** (`AI_NOTICE` in `desktop/src/main/copilot/session.ts`), posted from the owner's own account: when they pop out the notes, and as soon as they're in the call in Interview mode. Fixed text, not a setting, since it's the condition for hiding. `copilot-inject.js` opens the chat (Meet, Teams, Zoom web), types and sends it, and only reports success once the text shows up in the chat log. Once per meeting.
- **`setContentProtection(true)` on the popped-out notes only after that confirmation.** If the notice can't be posted, the notes still pop out but stay visible in shares, and the panel says so; docking and popping out again retries. Checked on macOS 26: a protected window is left out of `screencapture`.
- Not done: the docked panel can't be excluded (it's part of the meeting window), and nothing hides Peguin from proctoring software.

## 2026-10-10: Copilot: Work/Interview switch, Check online, Hide, Pop out

From the owner's live test: general questions need current facts from the web; the copilot should know whether it's a work meeting or an interview; and the panel should be hidden from the other side when the owner shares their screen.

- **Work / Interview** (panel switch, `settings.copilot.mode`): Interview answers technical, design and general questions the way a strong candidate would (up to about seventy words); both modes keep work and experience questions to the notes and never invent experience.
- **Check online** (panel switch, off by default): the quick answer still comes in about 4 s; for General knowledge cards a second pass searches the web with the user's own AI (Claude Code `WebSearch`, `codex --search`, xAI Responses `web_search`) and replaces it about 15 s later, labelled "Checked online · <site>". Measured 17 to 19 s per web answer, too slow to wait on.
- **Hide** collapses the panel to a 52 px strip; the meeting takes the space. While hidden the owner doesn't see it either.
- **Pop out** moves the panel into its own small always-on-top window. The meeting window then has no panel in it, so sharing that window (or any other single window or app) leaves the notes out. **Dock** (or closing the notes window) puts it back.
  - Hiding it from screen capture was declined here, then built later the same day on condition the call is told in chat (see "the call is told in chat" above).
  - **Screen sharing from the copilot window works.** Electron rejects `getDisplayMedia` without a handler. The meeting session uses macOS's own picker (`setDisplayMediaRequestHandler` with `useSystemPicker`, macOS 15+). On older macOS the panel says to share from the meeting's own app.
- Fixed with it: a burst of questions left all but the newest stuck on "Thinking…" (only the newest waited). Now up to three wait in order and an older overflow is marked skipped.

## 2026-10-10: Every user's own AI; Grok as an alternative standard voice

The owner: "it is the users connected claude grok whatever service token we should use, not mine for everyone". So:

- The app's drafts, answers, copilot suggestions and recap summaries always use the user's own AI, chosen in Settings > AI: Claude (their Claude Code sign-in, the default), Codex (their ChatGPT sign-in via the Codex CLI) or Grok (their xAI API key, sealed with the Keychain in `xai.sealed`). `brain.ts` has one `generate()`; there's no server route any more.
- The Worker's `/api/draft`, `/api/answer`, `/api/suggest` and `/api/recap` answer 503. Apps before 0.7 treat 503 as "use your own Claude Code", so old installs keep working without Peguin's key. The per-plan daily AI caps and the `usage` table are gone (migration 0006). Peguin's own Anthropic key is only for the website help chat.
- Plans still gate features (follow-up answers, recaps, own voice, copilot); they no longer include AI usage.
- Standard voice (when not speaking in the owner's own voice): the Mac voice (default, private) or an xAI voice with the user's key (`voice.standard`, `voice.grokVoice`, default "eve"). If xAI fails mid-meeting Peguin falls back to the Mac voice and logs why, so it never goes silent. The owner's own voice (on the Mac or ElevenLabs) is unchanged.
- Grok chat models come from the key's `/v1/models` list (image, video, speech and embedding models filtered out); the user picks one, nothing is hardcoded.

## 2026-10-10: The copilot answers general questions, interviews included

The owner wants the copilot to help with any question, including in interviews, and to offer Codex as well as Claude. This reverses the earlier "interviews out of scope" line (the agent recommended keeping it; the owner decided otherwise).

- Suggestions start with a label: "From your notes:" (about the owner's work, facts only), "Not in your notes." (about the owner's work, not covered; a holding answer, or for "tell me about a time…" a way to structure their own real example), or "General knowledge:" (concepts, trade-offs, technical questions; at most three short sentences). It never invents the owner's status, numbers, projects or personal experiences. The panel shows the label.
- Settings > AI picks the AI for everything (see "Every user's own AI"); Codex runs `codex exec` read-only, about 10 s a suggestion versus about 4 s for Claude.
- The Terms say the user follows each interview's or exam's rules on AI help. Privacy Policy lists OpenAI for the Codex option. The popped-out notes leave screen shares only after the call is told in chat that AI is helping (see "the call is told in chat"); nothing hides Peguin from proctoring tools.
- Peguin's own spoken answers (non-negotiable 2) are unchanged: facts only, defer otherwise.

## 2026-10-10: Speech recognition: whisper large-v3-turbo, neutral prompt, vocabulary from the facts

The owner found the copilot mishearing questions. Benchmark: 12 interview and standup questions in three macOS voices (US, UK, Indian English), cut to 8 kHz phone quality with noise added, through the bundled whisper-server on an M-series Mac. Word error rate / sentences perfect / time per sentence:

- base.en (before), prompt "Daily standup.": 12.9% / 12 of 36 / 55 ms
- small.en q5_1: 7.1% / 17 / 127 ms
- large-v3-turbo q5_0: 6.4% / 22 / 403 ms; with the neutral "A meeting with <name>." 5.0%; adding jargon 4.2% / 24

So the app downloads large-v3-turbo q5_0 (~550 MB, was ~150 MB), primes whisper with the owner's names plus distinctive terms from the prepared facts (`speech/hints.ts`), and no longer says "standup". The copilot waits 1.2 s of silence (not 0.7 s) before cutting an utterance, so a question with a pause in it arrives whole, and its question check counts spoken requests ("tell me about…", "walk us through…", "explain…"). Peguin's own turn-taking (`src/realtime/turn.ts`, which has its own `isQuestion`) is unchanged. Synthetic voices are cleaner than real calls; re-measure with recorded call audio if accuracy is questioned again.

## 2026-10-09: Update in place without a signed app (for now)

Squirrel.Mac and electron-updater only update signed apps, and Peguin is ad-hoc signed until there's an Apple Developer ID. So `desktop/src/main/updater.ts` does it directly: releases also publish `Peguin-mac-arm64.zip` (listed in `SHA256SUMS.txt`); `/api/release` returns both URLs; when a newer version appears (and the owner's `autoUpdate` setting is on, and the install is writable) the app downloads the zip in the background, checks its SHA-256 against the published sum, unpacks it with `ditto`, checks the bundle's version, and offers "Restart to update". A detached `/bin/sh` script waits for Peguin to exit, moves the old bundle aside, moves the new one in (putting the old one back if that fails), clears quarantine and reopens it; quitting with an update ready installs it without reopening. Downloads made by the app carry no quarantine flag, so "Open Anyway" isn't asked again. Each ad-hoc build has a different signature, so macOS may ask once to allow Keychain access after an update. Once there's a Developer ID, switch to electron-updater with signing and notarisation. Versions before this one have to be downloaded once more by hand.

## 2026-10-09: The private copilot

"Join as me" opens the owner's own meeting in a Peguin window: the meeting on the left (a `WebContentsView` with the persistent `persist:copilot` profile, the owner's real mic and camera, and sign-in allowed because they're there as themselves), and a panel on the right (the app's renderer at `#copilot`) that only they see. `resources/copilot-inject.js` taps only other people's audio (remote WebRTC tracks, or the page's Web Audio output for Zoom) and never replaces the mic or camera; whisper transcribes on the Mac. `isQuestion` (pure, tested with false positives) picks questions; each gets a card with a suggested answer from `copilotSystem`: first person as the owner, from the prepared facts only, starting "Not in your notes." with an honest holding answer when they don't cover it. One suggestion is written at a time and only the newest waiting question is kept. Suggestions go through the Worker (`/api/suggest`, counted as answers, Pro and Team) and fall back to the owner's Claude Code sign-in like everything else. Copilot meetings aren't in Recaps yet (that model assumes Peguin was the participant). Interview answering is deliberately not a mode (see the hand-over entry).

## 2026-10-09: Hand over by leaving, not by taking over Peguin's seat

The owner wants to step in mid-meeting. Peguin's participant is named "<Name> (AI)" and the platforms don't let a guest rename mid-call, so letting the owner speak through Peguin's window would put a human voice behind an "(AI)" name. Instead, **Hand over to me** (Live view, and the menu bar) opens the meeting link in the owner's browser so they join as themselves, while Peguin stops whatever it was saying, tells the room "<first name> is joining now, so I'll hand over" and leaves. The line is pre-synthesized with the others, so it plays at once; leaving waits for its playback to end (12 s at most).

A private, text-only meeting copilot (the owner's own meeting in Peguin's window, with notes and suggested answers only they can see) is planned next. ~~Answering questions covertly in job interviews is out of scope.~~ Reversed by the owner on 2026-10-10; see "The copilot answers general questions, interviews included".

## 2026-10-09: Work without server-side AI

The owner can't fund Anthropic credit yet, so nothing may depend on it. When the Worker's Claude call fails for an account reason (no credit, bad or unscoped key, rate limit) or Anthropic is down, `ask()` returns 503 "server-side AI is unavailable". The help chat then answers from the closest FAQ entry (keyword match, question words weighted double) and always offers "Message the team"; it never improvises. The desktop app treats that 503 as "use the owner's own Claude Code sign-in" for drafts, answers and recaps, so a signed-in subscriber keeps working on their own Claude.

## 2026-10-09: ElevenLabs as an optional engine for the owner's own voice

The owner wants Peguin to sound fully human, with emotion, in their own voice. The on-Mac engine (Chatterbox Turbo) is private but audibly less natural; Eleven v4 (28 Sept 2026) leads the public speech rankings and its instant clones need only seconds of audio. So where the voice is made is the owner's setting, `voice.engine`: `mac` (default, nothing leaves the Mac) or `elevenlabs` (their own API key in the Keychain; the recorded sample becomes an instant clone in their ElevenLabs account; every line is generated there). Prepared lines use `voice.eleven.model` (default `eleven_v4`) and are checked by ear and regenerated like the on-Mac engine; live answers use `voice.eleven.liveModel` (default `eleven_v4_turbo`, ~150 ms to first audio). Expressiveness maps to ElevenLabs stability and style; pronunciations are applied as respellings. Re-recording remakes the clone; deleting the sample or disconnecting deletes it from their account. The consent recording, the spoken AI disclosure and the "(AI)" name are unchanged: sounding human never replaces saying it's an AI. Bring-your-own-key keeps it off our bill while it's tested; billing it through the subscription can come later. Emotion: with `voice.eleven.cues` on, the draft and answer prompts may add up to three delivery cues from a fixed list ([warmly], [thoughtfully], ...) that v4 performs; they're stripped for display, records, word checks and every other voice, and never appear in facts.

## 2026-10-08: Plans, a switchable waitlist, one-click calendars

The owner asked for Free, Basic, Pro and Team plans, a waitlist, and calendars that connect with a click instead of pasted links.

- **Plans live in one file**, `src/core/plans.ts`, shared by the Worker (daily AI limits, the plan signed into the licence), the website (cards and comparison table) and the desktop app (feature gates). Prices aren't in code: each paid plan is a Paystack plan (`PAYSTACK_PLANS` JSON, set by `cloud/scripts/paystack-setup.mjs`), and a plan without one shows "Coming soon" and offers the waitlist. The feature split (Free: 3 standups a week, no follow-ups, recaps or own voice; Basic: every standup + follow-ups; Pro: + recaps + own voice; Team: Pro with seats) is a first proposal for the owner to adjust in that file.
- **Trial is Pro for TRIAL_DAYS, then Free**, not a lock-out. Every account gets a licence; old licences without `plan`, and subscriptions from before plans, count as Pro.
- **Team can't be bought yet**: seats aren't built, so it's waitlist-only even if a Paystack plan exists.
- **Desktop gates from the signed licence, offline**: own voice falls back to the standard voice (the owner's setting is kept), follow-ups defer, no AI summary, and Free counts standups joined per week (Monday start, owner's timezone) in `joins.json`. It's a local app, so this is honest-user enforcement; the Worker enforces the AI limits for real. `PENGUIN_PLAN` overrides the plan in development.
- **Waitlist is a switch**, `SIGNUPS` in `wrangler.jsonc` ("waitlist" or "open"). With "waitlist", new emails need an invite; existing accounts always sign in. Invites go through `POST /api/admin/invite` (bearer `ADMIN_TOKEN`), which also emails the invite.
- **Calendars connect through the Worker, which keeps no calendar tokens.** It holds the OAuth client secrets, runs consent, and hands tokens to the app once via `peguin://calendar` with PKCE (the hand-off row is encrypted with a key derived from the one-time code, and deleted when collected). The app stores tokens in the Keychain and refreshes through `/api/calendar/refresh`, a pass-through. Google uses the sign-in OAuth client with `calendar.events.readonly` (Google review needed past 100 users); Outlook uses Microsoft Graph `Calendars.Read`; Calendly uses its OAuth app. A provider without its client configured is hidden in the app. Mac Calendar and iCal links stay as alternatives; old Calendly personal tokens keep working.

## 2026-10-08: The voice sample is natural talk, not a read script

A 40-clip-per-variant comparison (word error with whisper small.en) and a blind listening test by the owner (`spikes/voice/README.md`, "Fair comparison") showed that the reference clip matters more than anything else tried: natural standup-style talk gave 3.9% word error and 72% word-perfect clips against 7.5% and 38% for the read-through script the app used. On sound, the owner rated it level with a voice fine-tuned on 60 recorded sentences (both beat the old sample). Fine-tuning works and can ship without PyTorch (`patch_onnx.py` bakes a 12.6 MB LoRA into the ONNX files), but it made very short lines worse and needs a training runtime or a cloud GPU, so it stays a possible later upgrade. Averaging the speaker fingerprint across clips and output-layer-only training didn't help.

So the app records the consent sentence, then 15-20 seconds of the owner talking naturally about their work, and only the natural part becomes the voice reference.

## 2026-10-08: Standups from the owner's calendars

The owner wanted calendars from wherever they live (Meet's Google Calendar, the Mac, Calendly and so on), so calendars are adapters behind one interface (`desktop/src/main/calendar/`), like activity sources:

- **Mac Calendar** through a small Swift EventKit helper (`desktop/native/calendar.swift`, bundled like whisper-server): every account added to macOS (Google, Exchange/Outlook, iCloud) at once, no OAuth app, no Google review, nothing leaves the Mac. macOS asks for permission once.
- **Calendar links**: the private iCal address Google, Outlook and iCloud each offer, parsed with ical.js (recurrences, moved and removed occurrences, the calendar's own time zones).
- **Calendly**: scheduled events via a personal access token.
- Links and the Calendly token are read access to someone's calendar, so they're encrypted (`calendar.bin`), not in settings.json; the UI shows them masked.
- A meeting is a standup when its title has one of the owner's words (editable; default standup, stand-up, stand up, daily, scrum) and it has a Meet, Zoom or Teams link (URL field, location or notes). The same meeting from two calendars is deduplicated by start and link. Meetings with a link that didn't match are listed with "Count as standup".
- The scheduler attends the next calendar standup (prepare 15 minutes before, join a minute before, each occurrence once) and falls back to the fixed time. Calendars are cached for five minutes.
- Not yet: direct "Connect Google" and "Connect Microsoft" (OAuth apps, Google's review for calendar scopes), which would also cover people who use neither the Mac's Calendar nor links.

## 2026-10-08: A recap after every meeting

- The runner keeps a structured log as the meeting happens (`desktop/src/main/meeting/record.ts`): what was heard, what Peguin said (update, answers, deferrals, acknowledgements), interruptions, and every question with how it was handled.
- **Follow-ups never depend on a model.** Every question Peguin deferred (or that was still pending when the call ended) becomes a follow-up straight away. If the owner allows it (Settings > Recaps, on by default), Claude reads the transcript for a short summary and extra follow-ups; when it describes a deferred question, its more actionable wording replaces it, but nothing deferred is ever dropped. The prompt allows the transcript only and never names speakers, who aren't identified.
- Recaps are kept encrypted on the Mac (shared `sealed.ts` helper) for the owner's chosen period (default 30 days), shown in `#recaps` with a follow-up checklist and an unread count, and announced with a notification. `/api/recap` on the Worker serves subscribers, capped at `RECAPS_PER_DAY`.
- Slack posting is left for later: it needs a webhook URL per user and a decision about sharing transcripts with a workspace.

## 2026-10-08: Speak in sentences, stop when talked over

- **Answers are spoken a sentence at a time.** The answer text is split into sentences and each is synthesised and sent as soon as it's ready; the meeting page queues the chunks and plays them back to back, keeping the mic on from the first chunk until the last ends (an end marker closes the turn). With the owner's voice this cuts the wait before Peguin starts talking roughly in half. Claude's text itself isn't streamed yet.
- **Talking over Peguin stops it.** About 0.8 s of someone else's continuous speech while Peguin talks (short enough to feel polite, long enough to skip coughs and "mm-hm") stops playback at once, mutes, and drops anything still being prepared. What they say is heard straight away: `TurnDetector.interrupted(now)` ends the echo tail but keeps the follow-up window, so "wait, is that merged?" is answered and people talking among themselves aren't. It's a setting (on by default) because a participant's echo of Peguin could trigger it in some rooms.

## 2026-10-08: Speaking in the owner's own voice, on their Mac

Opt-in, in Settings > Voice. Chatterbox Turbo (Resemble AI, MIT) runs through onnxruntime-node in the Electron main process with the pure-JS `@huggingface/tokenizers`, so there is no Python and no cloud call; findings and timings are in `spikes/voice/README.md`.

- **Model:** fp32 (3.3 GB), downloaded only when the owner turns the feature on, pinned to one revision with exact file sizes. q4 (721 MB) was as fast but garbled technical phrases.
- **Sample:** recorded live in the app (no file upload, so nobody can clone a colleague from a recording), starting with a consent sentence; stored encrypted with `safeStorage`; deletable with every line made from it.
- **Sounding human:** sampling instead of greedy decoding, one sentence at a time joined with pauses, Resemble's punctuation clean-up, loudness levelled.
- **Nothing about how someone sounds is built in.** Every value is the owner's setting: a pronunciation list (any word, spelled how it sounds, each with "Hear it"), the pause between sentences (default 0.32 s), expressiveness (sampling temperature, default 0.6) and how many times prepared lines are redone (default 3). Previews read the owner's own latest update; the recording prompt is their latest update, or free talk about their work. Only the consent sentence is fixed, because it is the consent record. Model properties from Resemble's reference (top-k, top-p, repetition penalty) aren't preferences and stay in code.
- **Checked by ear:** prepared lines (update, defer, acknowledgement) are transcribed with the app's whisper and regenerated, up to the owner's attempts setting, when the words come back wrong. Accented but correct speech scores 0.1-0.2 against off-the-shelf recognition, so the bar is 0.2, and the owner's aliases count as their name; a gained or lost negation ("can" heard as "can't") always fails. Live answers skip the check to stay quick.
- **Ahead of time:** the update is made in the owner's voice right after it's prepared (about 25 s) and cached encrypted, so the meeting plays it instantly.
- **Disclosure:** unchanged and still first, plus "speaking in <name>'s voice" when the own voice is on. If the own voice fails, Peguin falls back to the standard voice and drops that phrase.
- **Prompts write for the ear** (short sentences, no stacked technical nouns, numbers as words), which helps both voices.
- Not yet: Perth watermarking (the reference implementation needs PyTorch), streaming answers sentence by sentence, CoreML.

## 2026-10-07: Reduced motion means calmer, not off

Visitors with "reduce motion" switched on (common on Windows, where turning off animation effects sets it) saw an almost static site. Now reduced motion keeps fades, typing, speaking bars, the hero scene, the scripted app demo and the perched penguin, and drops only travel: smooth scrolling, parallax, the showcase tilt, cursor-driven layer drift, looping background motion and the help penguin's walk-in. Reveals fade in place instead of sliding. The build also targets Safari 14 and Chrome 87 so older Macs and iPhones get the full site.

## 2026-10-07: App showcase with a grain gradient

The closing tomato band is replaced by a ClickUp-style showcase (`web/src/components/AppDemo.tsx`): a rounded card with a slowly drifting, grainy gradient in the brand colours, the app icon, one line and the trial button, over a faithful copy of the desktop app. A scripted cursor prepares the update, joins the standup, and Peguin speaks and answers, then it loops. It only runs while on screen and shows the finished meeting for reduced motion. This is the one deliberate exception to "no gradients": the owner asked for it, and it frames the product rather than decorating text.

## 2026-10-07: Desktop install status and update checks

The desktop app sends `x-peguin-version` on every cloud request; the Worker stores it on the app token (`app_tokens.app_version`). The account page shows "Installed" with the version and last use, "Update available" when `APP_LATEST_VERSION` is newer, or a download button. The app checks `/api/release` every six hours and shows an update card in the sidebar. Releases are GitHub Releases on the public repo, built by `.github/workflows/release.yml` when a `v*` tag is pushed; the Worker reads the latest one through the GitHub API (cached ten minutes) and `/download/mac` redirects to its .dmg, so a release needs no redeploy (see `docs/RELEASING.md`). `APP_LATEST_VERSION`/`APP_DOWNLOAD_URL` remain as a fallback. Auto-install (Squirrel/electron-updater) needs a signed app, so it waits for Apple signing.

## 2026-10-07: Help penguin, help chat and designed emails

Support starts from the mascot: Peguin walks along the bottom of the page, rolls over, raises a "Need help?" flag and chirps (`web/src/components/HelpPenguin.tsx`). Visitors can send it away; a small corner button remains. The chat answers suggested FAQ questions locally and free-form ones through `/api/support/chat`, where Claude answers only from the site FAQ (`web/src/faq.ts`, shared with the page) and the live price, and marks anything else for handoff. Handoffs go to `/api/support/message`: stored in D1 and emailed only to `SUPPORT_INBOX`, never to the visitor's address, so the public form can't be used as a spam relay. Both endpoints are rate limited per hashed IP. Emails (sign-in, welcome on first sign-in, support inbox) share one table-based, inline-styled layout in `cloud/src/email.ts` with PNG art under `web/public/email/`, because Gmail drops SVG.

## 2026-10-07: Light-only website with a flowing section colour

The dark look users saw came from the OS dark-mode styles, which the owner didn't want, so the site is now light-only. Following Ghost, Ramp and ClickUp, each home section declares a pastel `data-bg` and `useBackgroundFlow` (in `web/src/ui.tsx`) fades the page background between them as you scroll. Big image moments are scroll-driven: a photo that opens from an inset card to full bleed (`ExpandingPhoto`) and a pinned rail of persona cards that slides sideways (`PeopleRail`), both in `web/src/components/Scenes.tsx`. The no-slop rules from the entry below still apply.

## 2026-10-07: Notion neutrals, no AI-slop patterns, motion-led website

Replaces the warm "coffee" palette below. The owner wanted it closer to Notion and the site to feel alive like wisprflow.ai, without the generic look of AI-made sites.
- **Palette:** Notion's neutrals (white, `#F7F6F3`, ink `#37352F`, `#191919` for dark bands) plus one accent, tomato `#C8432F` (white text 4.9:1), and Notion's soft block colours for tiles. No browns or creams.
- **Removed as AI-slop tells** (per published checklists): serif-italic accent words, badges and all-caps labels above headings, gradients and colored card borders, decorative blobs, numbered 1-2-3 steps, stat banner rows, identical icon cards, em dashes and words like seamless/leverage/unlock. Headlines are plain, specific sentences in one typeface.
- **Motion:** Lenis smooth scroll; word-by-word headline rises; a hero intro (commits arrive in a Notion-style page, the update writes itself, the meeting calls on Ada, a waveform plays) with cursor parallax; a scroll-linked section where noise is struck out, related work is grouped and the update writes itself; a pinned "one morning" window that changes from 09:15 to 09:33; photo parallax; a giant footer wordmark.
- **Background animations tied to the product:** a dot grid with ripples like sound in a room (reacts to the cursor), drifting waveforms on the dark demo band, expanding voice rings on the final call to action. All pause off-screen and switch off for reduced motion.
- No photo credits in the footer (the Unsplash licence doesn't require them; `web/src/photos.ts` keeps the sources).

## 2026-10-07: Brand palette and a bolder, photo-led website

- **Palette:** warm and nostalgic rather than black. Terracotta `#B4552C` is the brand colour (white text 4.9:1), with sage `#3F7A71`, butter `#F2D589`, cream paper `#FAF5EC` and espresso `#2A211C` for dark sections. Bold bands keep these exact colours in dark mode; accent text lightens instead.
- **Type:** Notion-style system sans; Fraunces (Google Fonts) for italic accents and big numbers.
- **Site:** after Wispr Flow and Ghost. A split hero with a photo and floating animated meeting cards; an integrations marquee; a dark live-demo band; a terracotta band of product facts (40 s, 15 min, 0 lines of code; no vanity metrics); before/after; three photo feature rows with animated UI cards; a bento grid; auto-advancing persona tabs; a how-it-works timeline; a sage privacy band; pricing; FAQ; a terracotta final call to action; and an espresso footer. Scroll reveals and count-ups respect reduced motion.
- **Photos:** ten free Unsplash images (no Unsplash+), self-hosted as WebP in `web/public/images` (about 1.7 MB) and credited in the footer (`web/src/photos.ts`).

## 2026-10-07: Website redesign modelled on Wispr Flow, Notion theme

`web/` follows wisprflow.ai's structure: a short headline with an italic serif accent, an animated product demo (a standup where Peguin is called and speaks), a "works with" strip, a before/after (raw commits to a 40-second update), features, how it works, privacy, pricing, FAQ, a final call to action, and a multi-column footer. Colours and type stay Notion's, with dark mode from the OS. **No invented social proof:** no customer logos, testimonials, stats or certifications until they're real. The demos use the example name "Ada". Sign-in emails come from `no-reply@peguin.co`.

## 2026-10-07: Paystack instead of Stripe; our own 14-day trial

- **Billing is Paystack** (the owner is in Lagos; a Paystack key already exists). Checkout initialises a transaction with the plan (`PAYSTACK_PLAN_CODE`), which creates the subscription on payment. Manage billing uses Paystack's manage-subscription link.
- **Webhook** `/webhooks/paystack`: `x-paystack-signature` is the HMAC-SHA512 of the raw body keyed with the secret key. Events carry no id, so each is deduplicated by a hash of its body. Subscription and invoice events always re-read the subscription from Paystack, matched to the user by email. The webhook URL is set in the Paystack dashboard (no API for it).
- **Trial:** Paystack plans have no trials, so Peguin gives 14 days from sign-up with no card (`users.trial_ends_at`). Entitlement = trial, or active, or non-renewing until the period ends, or a failed renewal within 3 days.
- **Price:** the Paystack business doesn't accept USD, so the plan is in naira. Test mode uses a ₦7,500/month placeholder until the owner sets the real price (`scripts/paystack-setup.mjs --currency NGN --amount …`). The website reads the live plan from `GET /api/plan`, so the shown price always matches what Paystack charges.
- Stripe code and columns are retired (the columns stay in the schema; SQLite can't drop them cleanly).

## 2026-10-07: Notion-style themes; domain www.peguin.co

- **Desktop look:** Discord's layout with Notion's colour and type by default. Themes in Settings → Appearance: System (follows the OS between Notion light and dark), Light, Dark, Midnight (Discord dark), plus five accents. Appearance saves instantly. Settings opens from one gear, in the user panel.
- **Domain:** `https://www.peguin.co` is canonical and `peguin.co` redirects to it. Installed builds talk to www.peguin.co; running from source talks to the local Worker unless `PENGUIN_CLOUD_URL` is set.

## 2026-10-07: One Cloudflare Worker for the website and the API

`cloud/` is a single Worker with D1. It serves the website (`web/dist`, Workers static assets, Cloudflare's successor to Pages) and the API on one origin, so session cookies stay first-party and there's one deploy.
- **Sign-in:** email links (Resend; printed to the console in dev) and Google. Sessions are random tokens stored hashed, in an HttpOnly SameSite=Lax cookie; cookie-authenticated writes must be JSON (CSRF).
- **Desktop sign-in:** `/app/connect` with a PKCE S256 challenge, returning to `peguin://auth` with a one-time code that only the app's verifier can redeem, for a revocable app token.
- **Billing:** originally Stripe; replaced by Paystack (see the entry above).
- **Licences:** Ed25519-signed, at most 30 days, plus 3 offline days past the period end. The private JWK is a Worker secret; the public key ships in the app. JWKs are imported without `alg`, because Node and Workers disagree on its value.
- **Claude:** `claude-opus-5` through the official SDK, with server-side refusal fallbacks (`fallbacks: "default"`). Drafts use high effort; live answers use low effort for speed. Daily per-user caps. Same prompts as the desktop (`src/core/brain/prompts.ts`).
- The old server default `claude-sonnet-5-5` wasn't a valid model ID; it's now `claude-opus-5`.

## 2026-10-07: Product shape: desktop app first, then website and payments

- **Build order:** the real desktop app (Electron + React) with a preferences window first, then the website, sign-up and Stripe on Cloudflare, then opt-in voice cloning.
- **Sign-in:** Google plus a passwordless email link, handled by the Cloudflare Worker. The desktop app signs in by opening the browser and returning through a `peguin://` link.
- **Web stack:** React + Vite on Cloudflare Pages; the Worker serves the API. The desktop app's UI uses the same React.
- **Desktop build:** Vite for the React window, esbuild for the main process and preloads (electron-vite doesn't support Vite 8 yet).
- **Display name** is a user preference, but the AI suffix is always added (" (AI)", or " - AI" on Teams).
- **Connections:** users connect their calendar (to find standups and double-bookings) and GitHub/Linear/Jira (facts for the update). They don't connect Zoom, Meet or Teams logins: Peguin joins as a guest.
- **Turn-taking stays rule-based** (`src/realtime/turn.ts`): instant, free and testable. An LLM classifier for ambiguous cases may come later in the paid tier. The LLM's job is drafting the update and answering from facts.
- **Voice cloning (later, opt-in):** only the account holder's own voice, recorded live in the app with a consent sentence (no uploads); disclosure stays in every meeting; deletable. Check model licences before choosing (several open models are non-commercial).

## 2026-10-07: Official SDKs for Teams and Zoom; strict join pacing

During Teams spike testing (about six automated guest joins to a fake meeting within minutes, from the owner's IP), the owner's personal Microsoft account was locked for "activity that goes against the Microsoft Services Agreement". The spike never signed in, so the cause is unconfirmed, but platforms clearly detect and act against bot-like joins, and users' accounts and IPs must not be put at risk.

Decision:
- **Teams:** join through **Azure Communication Services** (ACS), Microsoft's supported way for an external app to join a Teams meeting as a guest with a custom name, sending and receiving audio. The ACS web Calling SDK runs inside the Electron app, so the desktop architecture is unchanged. It's billed per minute (a few cents per standup; check current pricing), so it goes through the server and is covered by the subscription.
- **Zoom:** the browser-client approach for the spike; the **Zoom Meeting SDK** for production. That needs Zoom Marketplace approval for joining meetings outside our own account.
- **Google Meet:** browser guest join (no official route that can speak; see the first entry). Keep it, and watch for enforcement.
- **Join rules for every driver:** one join click per 15 s, at most 3 per meeting, no retry loops. Never sign in to any account inside Peguin's window (sign-in pages are blocked). Test against real meetings only, one join per test.

## 2026-10-07: Bot name suffix is " - AI" on Teams

Teams guest names allow only letters, numbers, spaces and `- ' . _ @`; "Mujeeb (AI)" leaves "Join now" disabled. On Teams the name is "Mujeeb - AI"; everywhere else it stays "Mujeeb (AI)". The spoken disclosure is unchanged.

## 2026-10-06: Desktop-first; each user's machine runs the bot

Context: the main use case is covering a standup when the owner is double-booked, so their computer is already on and in a call. Recall, Deepgram and a hosted cluster all charge per use; running on the user's machine makes running costs close to zero.

Decision:
- **Peguin becomes an Electron app.** A hidden Chromium window joins the meeting's web client as a guest named "<owner> (AI)". It replaces `getUserMedia` with Peguin's voice and an avatar, and taps the other participants' WebRTC audio tracks. This is the same technique Recall and Attendee use, run locally. Electron rather than Tauri, because we need our own Chromium to inject audio.
- **Local speech:** whisper.cpp (STT) and Piper (TTS). Local storage: SQLite. A local scheduler replaces BullMQ.
- **A small server on the owner's Cloudflare domain:** a Worker for accounts, Stripe subscription webhooks and signed license tokens (Ed25519, about 30 days, with offline grace), plus D1, and R2 for installers. Drafting with Claude stays server-side, so the API key never ships in the client and the paid feature can't be cracked away.
- **Live follow-ups:** answered by Claude through the server when subscribed and online. Otherwise Peguin defers to the owner (`FOLLOWUPS=defer`); a small local model never answers live questions (non-negotiable 2).
- **Kept as optional adapters, not the default:** the current server stack (Recall/Attendee, Deepgram, BullMQ, Postgres).

Costs: Apple Developer Program for notarization and a Windows code-signing certificate before distribution; Stripe fees on revenue; a few cents of Claude per user. Local development needs neither signing nor paid keys.

Order: (1) spike that Electron can join Meet, speak and hear (`spikes/meet-join/`); (2) ports refactor (domain and use cases independent of vendors); (3) Electron app skeleton; (4) license Worker; (5) Teams and Zoom web clients.

## 2026-10-06: Use a meeting-bot provider instead of native platform APIs

Research (October 2026):
- **Google Meet Media API** is a developer preview, closed to new registrations, and **receive-only**: it can't send audio into a call. Each connection also needs approval from someone in the meeting's org. That rules it out for a speaking bot.
- **Zoom Realtime Media Streams (RTMS)** is **receive-only** (audio, video, transcripts and chat over WebSocket). Speaking needs a bot joining through the Zoom Meeting SDK.
- **Microsoft Teams** Graph media bots can send and receive 20 ms PCM, but need Windows Server, .NET with `Microsoft.Skype.Bots.Media` (no Linux version), a public IP and TLS certificate, and admin consent for `Calls.AccessMedia.All`.

Decision: put the platforms behind a `MeetingBotProvider` interface, backed by:
- **Recall.ai** (default): its Output Media API loads our webpage as the bot's camera and mic on Zoom, Meet, Teams and Webex. We use the `web_4_core` variant for smooth audio, which their docs list at about $0.60/hour pay-as-you-go.
- **Attendee** (`attendee-labs/attendee`, open source, Django in one Docker image): `voice_agent_settings.url` does the same thing. Use it to self-host or cut per-hour cost.

Both providers feed meeting audio to the page as its microphone, so a single agent page (`public/agent.html`) works for every platform and provider.

## 2026-10-06: Do speech-to-text ourselves from page audio

Recall exposes an in-page transcript socket, but Attendee doesn't. Streaming the page mic to our realtime node and running Deepgram there gives one code path for both providers, plus diarization and name keyterm boosting.

## 2026-10-06: Deepgram for both STT and TTS

One vendor and one key; low-latency streaming STT (`nova-3`) and fast TTS (Aura, MP3). Both models are set through env vars if we switch.

## 2026-10-06: Three services, Postgres + Redis + BullMQ

The owner asked for the best architecture that scales. The heavy per-meeting work (a browser in the call) is the provider's, so ours is one WebSocket plus streaming STT/TTS per meeting. Keeping each meeting on one realtime node avoids distributed session state. BullMQ gives retries, delays, deduplication and tz-aware cron schedulers on infrastructure we already need.

## 2026-10-06: Prepare and pre-synthesize the update

Latency when called on is what users notice. The update is drafted in `meeting.prep` and turned into audio when the session starts, so playback starts immediately. Only follow-ups do a live round trip.

## 2026-10-06: Always disclose

The bot announces itself as the owner's AI assistant and its name ends in "(AI)". This covers recording and AI-participant policies and protects the owner if something is misstated. It's non-negotiable (see AGENTS.md).

## 2026-10-06: Name

Originally named "Penguin". Renamed to **Peguin** on 2026-10-07 to match the domain (peguin.co); every user-facing string, the bot's spoken introduction and the `peguin://` URL scheme use it. Internal identifiers (package names, `PENGUIN_*` env vars, the D1 database, the repo folder) keep "penguin" to avoid churn.
