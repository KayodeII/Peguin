// Spike: join a Google Meet, Teams or Zoom call from an Electron window,
// speak one line, and report whether we can hear the other participants. Throwaway code: the
// real desktop app will be TypeScript built on the ports refactor.
import { app, BrowserWindow, ipcMain } from "electron";
import { execFile, execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";

const here = path.dirname(fileURLToPath(import.meta.url));
const { values: args } = parseArgs({
  args: process.argv.slice(1),
  options: {
    url: { type: "string" },
    name: { type: "string", default: "Penguin (AI)" },
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
  console.error('Usage: npm start -- [--url <meeting link>] [--name "Mujeeb (AI)"] [--say "..."] [--delay 5] [--hidden] [--audible] [--verbose]');
  process.exit(1);
}
// Non-negotiable: the bot's name always says it's an AI. Teams only allows
// letters, numbers, spaces and - ' . _ @ in guest names, so no parentheses.
const base = String(args.name).replace(/\s*(\(AI\)|- AI)\s*$/i, "");
const name = platform === "teams" ? `${base} - AI` : `${base} (AI)`;
const line = typeof args.say === "string" ? args.say
  : `Hi everyone, I'm ${base}, an AI assistant. This is a quick test of Penguin speaking into the call.`;

/** macOS `say` stands in for Piper in this spike. */
async function synthesize(text) {
  const file = path.join(await mkdtemp(path.join(tmpdir(), "penguin-")), "line.wav");
  await promisify(execFile)("say", ["-o", file, "--file-format=WAVE", "--data-format=LEI16@24000", text]);
  return readFile(file);
}

const t0 = Date.now();
const log = (msg) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${msg}`);
const inject = readFileSync(path.join(here, "inject.js"), "utf8");
const audio = synthesize(line); // pre-synthesize so speaking is instant
audio.catch((e) => log(`TTS failed: ${e}`));

// Meet rejects unknown browsers; present as plain Chrome.
app.userAgentFallback = app.userAgentFallback.replace(/ (Electron|penguin-meet-spike)\/\S+/g, "");

app.whenReady().then(() => {
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
  ipcMain.on("type", (e, text) => e.sender.insertText(text)); // into the focused field
  ipcMain.on("in-call", async () => {
    if (inCall) return;
    inCall = true;
    log(`in the call; speaking in ${args.delay}s`);
    setTimeout(async () => {
      const buf = await audio;
      log(`speaking: "${line}"`);
      // Every frame gets it; only the one that's in the meeting plays it.
      for (const f of win.webContents.mainFrame.framesInSubtree) f.send("speak", buf);
    }, Number(args.delay) * 1000);
  });
  ipcMain.on("playback-ended", () => log("finished speaking"));
  ipcMain.on("level", (_e, { rms, tracks, frame }) => {
    const talking = rms > 0.01;
    if (talking || (tracks > 0 && Date.now() - lastLevelLog > 10000)) {
      lastLevelLog = Date.now();
      log(`hearing: ${talking ? "SPEECH" : "quiet "} rms=${rms.toFixed(4)} audio taps=${tracks}${frame === "top" ? "" : ` (${frame})`}`);
    }
  });
  ipcMain.on("ended", () => { log("call ended or we were removed"); app.quit(); });

  // --verbose: snapshot the window every 10 s so a failed join can be seen.
  if (args.verbose) {
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
