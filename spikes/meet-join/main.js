// Spike: join a Google Meet, Teams or Zoom call from an Electron window,
// listen with local whisper.cpp, and give the owner's update when someone
// hands them the floor. Throwaway code: the real desktop app will be
// TypeScript built on the ports refactor.
import { app, BrowserWindow, ipcMain } from "electron";
import { execFile, execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";
import { TurnDetector } from "./gen/turn.js"; // bundled from src/realtime/turn.ts by `prestart`
import { createListener, startWhisper } from "./listen.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const { values: args } = parseArgs({
  args: process.argv.slice(1),
  options: {
    url: { type: "string" },
    name: { type: "string", default: "Penguin (AI)" },
    aliases: { type: "string", default: "" },   // comma-separated, e.g. "Mujib,MJ"
    update: { type: "string" },                 // what to say when handed the floor
    greet: { type: "boolean", default: false }, // old spike behaviour: say a line on joining
    say: { type: "string" },
    delay: { type: "string", default: "5" },
    hidden: { type: "boolean", default: false },
    audible: { type: "boolean", default: false }, // debug: play call audio out loud
    verbose: { type: "boolean", default: false }, // log the buttons seen while joining
  },
  allowPositionals: true,
  strict: false,
});

/** Mirrors detectPlatform() in src/core/providers/types.ts. */
function detectPlatform(url) {
  let host = "";
  try { host = new URL(url).hostname.toLowerCase(); } catch { return "unknown"; }
  if (host === "zoom.us" || host.endsWith(".zoom.us") || host.endsWith(".zoomgov.com")) return "zoom";
  if (host === "meet.google.com") return "google_meet";
  if (host.endsWith("teams.microsoft.com") || host.endsWith("teams.live.com")) return "teams";
  return "unknown";
}

/** Open each platform's browser client directly instead of its app launcher. */
function webClientUrl(url, platform) {
  if (platform !== "zoom") return url;
  const u = new URL(url);
  const id = u.pathname.match(/\/(?:j|wc\/join|wc)\/(\d+)/)?.[1];
  return id ? `${u.origin}/wc/join/${id}${u.search}` : url; // keeps ?pwd=
}

/** No --url: take a meeting you already have open in Chrome (macOS). Penguin
 *  still joins from its own window, as a separate guest participant. */
function meetingFromChrome() {
  try {
    const out = execFileSync("osascript", ["-e",
      'tell application "Google Chrome" to get URL of every tab of every window'], { encoding: "utf8" });
    return out.split(/,\s*/).map((u) => u.trim()).find((u) => detectPlatform(u) !== "unknown");
  } catch { return undefined; }
}
if (typeof args.url !== "string") {
  args.url = meetingFromChrome();
  if (args.url) console.log(`Found your meeting in Chrome: ${args.url}`);
}

const platform = typeof args.url === "string" ? detectPlatform(args.url) : "unknown";
if (platform === "unknown") {
  console.error("No Google Meet, Teams or Zoom link found. Open one in Chrome, or pass it explicitly.");
  console.error('Usage: npm start -- [--url <meeting link>] [--name "Mujeeb"] [--aliases "Mujib,MJ"] [--update "..."] [--greet] [--hidden] [--audible] [--verbose]');
  process.exit(1);
}
// Non-negotiable: the bot's name always says it's an AI. Teams only allows
// letters, numbers, spaces and - ' . _ @ in guest names, so no parentheses.
const base = String(args.name).replace(/\s*(\(AI\)|- AI)\s*$/i, "");
const name = platform === "teams" ? `${base} - AI` : `${base} (AI)`;
const first = base.split(/\s+/)[0];
const names = [...new Set([base, first, ...String(args.aliases).split(",").map((a) => a.trim())].filter(Boolean))];
const line = typeof args.say === "string" ? args.say
  : `Hi everyone, I'm ${base}, an AI assistant. This is a quick test of Penguin speaking into the call.`;
// Non-negotiables: disclose first; never invent facts. Without --update it's
// plainly labelled a test. Follow-ups always defer to the owner in free mode.
const updateLine = `Hi everyone, I'm Penguin, ${first}'s AI assistant. ${first} is in another meeting, so I'm covering the update. `
  + (typeof args.update === "string" ? args.update : "This is a test update, so there's nothing real to report yet.")
  + ` ${first} can follow up on anything after the call.`;
const deferLine = `Good question. I'll get ${first} to follow up on that after the call.`;
const ackLine = "Yes, I'm here. Go ahead.";

/** macOS `say` stands in for Piper in this spike. */
async function synthesize(text) {
  const file = path.join(await mkdtemp(path.join(tmpdir(), "penguin-")), "line.wav");
  await promisify(execFile)("say", ["-o", file, "--file-format=WAVE", "--data-format=LEI16@24000", text]);
  return readFile(file);
}

const t0 = Date.now();
const log = (msg) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${msg}`);
const inject = readFileSync(path.join(here, "inject.js"), "utf8");
// Pre-synthesize so Penguin answers instantly when called on.
const audio = synthesize(line);
const updateAudio = synthesize(updateLine);
const deferAudio = synthesize(deferLine);
const ackAudio = synthesize(ackLine);
for (const a of [audio, updateAudio, deferAudio, ackAudio]) a.catch((e) => log(`TTS failed: ${e}`));

// The window is usually hidden: don't let Chromium pause it.
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");

// Meet rejects unknown browsers; present as plain Chrome.
app.userAgentFallback = app.userAgentFallback.replace(/ (Electron|penguin-meet-spike)\/\S+/g, "");

app.whenReady().then(async () => {
  let whisper;
  try { whisper = await startWhisper(here); log(`whisper.cpp ready; listening for: ${names.join(", ")}`); }
  catch (e) { log(`${e.message}`); app.quit(); return; }
  app.on("will-quit", () => whisper.stop());

  const win = new BrowserWindow({
    width: 1280, height: 800, show: !args.hidden, title: name,
    webPreferences: {
      preload: path.join(here, "preload.cjs"),
      partition: "meet-spike",              // throwaway cookies, guest join
      nodeIntegrationInSubFrames: true,     // run the preload in iframes too (Zoom's client uses one)
      sandbox: true, contextIsolation: true, nodeIntegration: false,
      backgroundThrottling: false,          // keep audio and timers running when hidden
      autoplayPolicy: "no-user-gesture-required",
    },
  });
  // Penguin taps call audio internally; never play it out of the speakers
  // (it would echo into the owner's mic, or leak into their other meeting).
  win.webContents.setAudioMuted(!args.audible);
  const ses = win.webContents.session;
  // Teams and Zoom try to open their desktop apps (msteams:, zoommtg:). Stay in the browser client.
  win.webContents.on("will-frame-navigate", (e) => {
    if (!/^(https?|about|blob|data):/i.test(e.url)) { e.preventDefault(); log(`blocked app launch: ${e.url.split(":")[0]}:`); }
  });
  // Penguin joins as an anonymous guest and never signs in to anyone's account.
  win.webContents.on("will-navigate", (e) => {
    const host = new URL(e.url).hostname;
    if (/^(login\.microsoftonline\.com|login\.live\.com|accounts\.google\.com)$/.test(host) || /zoom\.us\/signin/.test(e.url)) {
      e.preventDefault(); log(`blocked sign-in page (${host}); Penguin only joins as a guest`);
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => { log(`blocked popup: ${url}`); return { action: "deny" }; });
  ses.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === "media"));
  ses.setPermissionCheckHandler((_wc, perm) => perm === "media");

  let inCall = false;
  let lastLevelLog = 0;
  ipcMain.on("config", (e) => { e.returnValue = { name, platform, debug: !!args.verbose }; });
  ipcMain.on("inject-code", (e) => { e.returnValue = inject; });
  ipcMain.on("log", (_e, msg) => log(msg));
  // Type into the focused field through the DevTools protocol, like a headless
  // browser does. webContents.insertText freezes the page when the window is hidden.
  win.webContents.debugger.attach("1.3");
  ipcMain.on("type", (_e, text) => {
    win.webContents.debugger.sendCommand("Input.insertText", { text }).catch((err) => log(`typing failed: ${err.message}`));
  });
  const turn = new TurnDetector({ names });
  const speak = async (what, label) => {
    turn.setSpeaking(true, Date.now());
    log(`speaking (${label})`);
    const buf = await what;
    // Every frame gets it; only the one that's in the meeting plays it.
    for (const f of win.webContents.mainFrame.framesInSubtree) f.send("speak", buf);
  };
  const onPcm = createListener({
    whisperUrl: whisper.url, names,
    onError: (e) => log(`speech-to-text error: ${e}`),
    onUtterance(text, { sttMs, endedAt }) {
      const d = turn.onUtterance(text, Date.now());
      log(`heard: "${text}"  (stt ${sttMs} ms) -> ${d.action}`);
      if (d.action === "give_update") {
        turn.markUpdateGiven();
        speak(updateAudio, "update").then(() => log(`reply started ${Date.now() - endedAt} ms after they stopped talking`));
      } else if (d.action === "answer") {
        speak(deferAudio, "follow-up: deferring to the owner");
      } else if (d.action === "acknowledge") {
        speak(ackAudio, "acknowledging: listening for the question");
      }
    },
  });
  ipcMain.on("pcm", (_e, buf) => onPcm(buf));

  ipcMain.on("in-call", async () => {
    if (inCall) return;
    inCall = true;
    log(`in the call; waiting for someone to hand ${first} the floor`);
    if (args.greet) setTimeout(() => speak(audio, "greeting"), Number(args.delay) * 1000);
  });
  ipcMain.on("playback-ended", () => { turn.setSpeaking(false, Date.now()); log("finished speaking"); });
  ipcMain.on("level", (_e, { rms, tracks, frame }) => {
    if (!args.verbose) return;
    const talking = rms > 0.01;
    if (talking || (tracks > 0 && Date.now() - lastLevelLog > 10000)) {
      lastLevelLog = Date.now();
      log(`hearing: ${talking ? "SPEECH" : "quiet "} rms=${rms.toFixed(4)} audio taps=${tracks}${frame === "top" ? "" : ` (${frame})`}`);
    }
  });
  ipcMain.on("ended", () => { log("call ended or we were removed"); app.quit(); });

  // --verbose: snapshot the window every 10 s so a failed join can be seen.
  if (args.verbose) {
    win.webContents.on("did-navigate", (_e, u) => log(`navigated: ${u}`));
    win.webContents.on("console-message", (e) => { if (e.level === "error") log(`page error: ${String(e.message).slice(0, 200)}`); });
    const dir = path.join(tmpdir(), "penguin-shots");
    mkdirSync(dir, { recursive: true });
    log(`screenshots: ${dir}`);
    setInterval(async () => {
      const img = await win.webContents.capturePage();
      writeFileSync(path.join(dir, `${Math.round((Date.now() - t0) / 1000)}s.png`), img.toPNG());
    }, 10000);
  }

  const url = webClientUrl(args.url, platform);
  log(`${platform}: opening ${url} as "${name}"${args.hidden ? " (hidden window)" : ""}`);
  win.loadURL(url);
  win.on("closed", () => app.quit());
});
