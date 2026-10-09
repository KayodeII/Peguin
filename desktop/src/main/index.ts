import { app, BrowserWindow, ipcMain, Menu, nativeImage, nativeTheme, Notification, shell, systemPreferences, Tray } from "electron";
import { existsSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { checkForUpdate, completeSignIn, refreshAccount, signOut, startSignIn, type Account, type Update } from "./account.js";
import { answerQuestion, isFresh, loadDraft, prepareDraft, summarizeMeeting, type Draft } from "./brain.js";
import { deferredFollowUps, headline, mergeFollowUps, transcriptLines, worthKeeping, type MeetingRecord } from "./meeting/record.js";
import { deleteAllMeetings, deleteMeeting, listMeetings, saveMeeting, setFollowUpDone } from "./meetings.js";
import { lines, meetingPaths, MeetingRunner, type MeetingEvent } from "./meeting/runner.js";
import { nextStandup, startScheduler, whenLabel } from "./scheduler.js";
import { nextCalendarStandup, refreshCalendars, upcoming } from "./calendar/index.js";
import { macCalendarAccess, requestMacCalendarAccess } from "./calendar/mac.js";
import { loadCalendarSecrets, maskLink, saveCalendarSecrets } from "./calendar/secrets.js";
import { loadSettings, saveSettings } from "./settings.js";
import { fixPath, outDir, resource } from "./paths.js";
import { ensureModel } from "./speech/model.js";
import { synthesize } from "./speech/tts.js";
import {
  CONSENT_SENTENCE, deleteSample, deleteVoiceModel, ensureVoiceModel, forgetVoice, ownVoiceStatus, saveSample,
  speakInOwnVoice, usingOwnVoice, VOICE_MODEL_BYTES, voiceModelReady,
} from "./speech/voice/index.js";
import { sentences } from "./speech/voice/text.js";
import { startWhisper, transcribeSamples, type Whisper } from "./speech/whisper.js";

const rendererUrl = process.env.PENGUIN_RENDERER_URL; // set by `npm run dev`

fixPath();

// Meeting windows are hidden; don't let Chromium pause them.
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
// Meeting sites reject unknown browsers; present as plain Chrome.
app.userAgentFallback = app.userAgentFallback.replace(/ (Electron|penguin-desktop)\/\S+/g, "");

// Before ready: sets the menu name and the app-data folder. Settings from
// before the rename (folder "Penguin") move over once.
// (Electron fixes userData the first time it's read, so set it explicitly.)
app.setName("Peguin");
const dataDir = path.join(app.getPath("appData"), "Peguin");
const legacyData = path.join(app.getPath("appData"), "Penguin");
if (!process.env.PENGUIN_USER_DATA && existsSync(legacyData) && !existsSync(dataDir)) renameSync(legacyData, dataDir);
app.setPath("userData", dataDir);
if (process.env.PENGUIN_USER_DATA) app.setPath("userData", process.env.PENGUIN_USER_DATA); // dev: separate profile
if (!app.requestSingleInstanceLock()) app.quit();

// peguin:// links (sign-in hand-off). In development the Electron binary is
// registered with this project folder as its argument.
if (process.defaultApp) app.setAsDefaultProtocolClient("peguin", process.execPath, [path.resolve(process.argv[1] ?? ".")]);
else app.setAsDefaultProtocolClient("peguin");

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let whisper: Promise<Whisper> | null = null;
let meeting: MeetingRunner | null = null;
let preparing: Promise<Draft> | null = null;
let update: Update | null = null;

async function refreshUpdate() {
  update = await checkForUpdate();
  send({ kind: "update", update });
}

export type AppEvent =
  | { kind: "meeting"; event: MeetingEvent }
  | { kind: "draft"; draft: Draft | null; preparing: boolean; error?: string }
  | { kind: "log"; text: string }
  | { kind: "account"; account: Account | null; error?: string }
  | { kind: "model"; progress: number; error?: string }
  | { kind: "update"; update: Update | null }
  | { kind: "voice"; progress: number; error?: string }
  | { kind: "recaps" }
  | { kind: "show"; view: string };

function send(e: AppEvent) {
  // Development: meeting progress in the terminal too, so a failed join can be diagnosed from the logs.
  if (!app.isPackaged && (e.kind === "log" || e.kind === "meeting")) console.log("[peguin]", JSON.stringify(e).slice(0, 600));
  if (win && !win.isDestroyed()) win.webContents.send("app:event", e);
  if (e.kind === "meeting" && e.event.kind === "status") tray?.setTitle(e.event.status === "in_call" ? " ●" : "");
}

/** Matches the theme so the window doesn't flash a different colour while loading. */
function windowBackground(): string {
  const t = loadSettings().appearance.theme;
  const dark = t === "dark" || (t === "system" && nativeTheme.shouldUseDarkColors);
  return t === "midnight" ? "#313338" : dark ? "#191919" : "#ffffff";
}

function openWindow() {
  if (win && !win.isDestroyed()) { win.show(); win.focus(); return; }
  win = new BrowserWindow({
    width: 1180, height: 760, minWidth: 900, minHeight: 600, title: "Peguin", show: false,
    backgroundColor: windowBackground(), titleBarStyle: "hiddenInset", trafficLightPosition: { x: 14, y: 14 },
    webPreferences: { preload: path.join(outDir, "preload/app.cjs"), sandbox: true, contextIsolation: true },
  });
  if (rendererUrl) void win.loadURL(rendererUrl);
  else void win.loadFile(path.join(outDir, "renderer/index.html"), { hash: process.env.PENGUIN_VIEW ?? "" });
  // Come to the front on launch, even when started from a terminal.
  win.once("ready-to-show", () => { win?.show(); app.focus({ steal: true }); });
  win.on("closed", () => { win = null; });
  // Dev aid: PENGUIN_SNAPSHOT=out.png saves a picture of this window, then quits.
  const snap = process.env.PENGUIN_SNAPSHOT;
  // PENGUIN_SNAPSHOT_SCROLL=<css selector> scrolls that element into view first.
  if (snap) win.webContents.once("did-finish-load", () => setTimeout(async () => {
    const target = process.env.PENGUIN_SNAPSHOT_SCROLL;
    if (target) await win!.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(target)})?.scrollIntoView({ block: "start" })`);
    // PENGUIN_SNAPSHOT_PROBE=<js expression> prints its value (layout checks in development).
    const probe = process.env.PENGUIN_SNAPSHOT_PROBE;
    if (probe) console.log("probe:", JSON.stringify(await win!.webContents.executeJavaScript(probe)));
    await new Promise((r) => setTimeout(r, 300));
    writeFileSync(snap, (await win!.webContents.capturePage()).toPNG());
    app.exit(0);
  }, Number(process.env.PENGUIN_SNAPSHOT_DELAY ?? 1500)));
}

/** One preparation at a time; everyone waiting shares it. */
function prepare(): Promise<Draft> {
  if (preparing) return preparing;
  send({ kind: "draft", draft: loadDraft(), preparing: true });
  preparing = prepareDraft(loadSettings())
    .then((d) => { send({ kind: "draft", draft: d, preparing: false }); void warmOwnVoice(d); return d; })
    .catch((e) => { send({ kind: "draft", draft: loadDraft(), preparing: false, error: message(e) }); throw e; })
    .finally(() => { preparing = null; });
  return preparing;
}

async function join(url: string) {
  const settings = loadSettings();
  if (!settings.displayName.trim()) throw new Error("Add your name in Settings first, so Peguin knows when it's called.");
  meeting?.stop();
  let draft = loadDraft();
  if (!isFresh(draft, settings.timezone)) {
    send({ kind: "log", text: "Preparing today's update before joining…" });
    draft = await prepare().catch(() => draft); // join anyway: Peguin says the update will follow
  }
  await speechModel();
  whisper ??= startWhisper();
  whisper.catch(() => { whisper = null; });
  const runner = new MeetingRunner(url, settings, await whisper, meetingPaths(), {
    draft,
    answer: (q, recent) => answerQuestion(settings, draft, q, recent),
  });
  meeting = runner;
  runner.on("record", (r) => void recapMeeting(r));
  runner.on("event", (event) => {
    send({ kind: "meeting", event });
    if (event.kind === "status" && (event.status === "ended" || event.status === "failed") && meeting === runner) meeting = null;
  });
  await runner.start();
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

const nameVariants = (s: ReturnType<typeof loadSettings>) => {
  const first = s.displayName.trim().split(/\s+/)[0] ?? "";
  return [...new Set([s.displayName.trim(), first, ...s.aliases].filter(Boolean))];
};

/**
 * In the owner's voice, generating and checking the update takes about half a
 * minute, so do it right after preparing; the meeting then plays it from cache.
 */
async function warmOwnVoice(draft: Draft) {
  const s = loadSettings();
  if (!usingOwnVoice(s)) return;
  try {
    await speechModel();
    whisper ??= startWhisper();
    const w = await whisper;
    const check = (wav: Float32Array) => transcribeSamples(w.url, wav, nameVariants(s));
    const say = lines(s, draft, true), standard = lines(s, draft, false);
    send({ kind: "log", text: "Getting your update ready in your voice…" });
    await synthesize(say.update, { settings: s, check, standardText: standard.update });
    await synthesize(say.defer, { settings: s, check });
    await synthesize(say.ack, { settings: s, check });
    send({ kind: "log", text: "Your update is ready in your voice." });
  } catch (e) {
    send({ kind: "log", text: `Couldn't prepare your voice ahead of time (${message(e)}). It'll be made when the meeting starts.` });
  }
}

/**
 * After a meeting: keep the record (encrypted), list every deferred question as a
 * follow-up straight away, then, if the owner allows it, add Claude's summary
 * and any extra follow-ups from the transcript. A notification says how it went.
 */
async function recapMeeting(r: MeetingRecord) {
  if (!worthKeeping(r)) return;
  const s = loadSettings();
  const deferred = deferredFollowUps(r);
  r.recap = { followUps: deferred.map((text) => ({ text, done: false })), createdAt: Date.now() };
  saveMeeting(r);
  send({ kind: "recaps" });
  const lines = transcriptLines(r);
  if (s.recap.summarize && lines.length) {
    try {
      const { summary, followUps } = await summarizeMeeting(s, lines);
      r.recap = { summary: summary || undefined, followUps: mergeFollowUps(deferred, followUps).map((text) => ({ text, done: false })), createdAt: Date.now() };
      saveMeeting(r);
      send({ kind: "recaps" });
    } catch (e) {
      send({ kind: "log", text: `The recap has your follow-ups, but no summary (${message(e)}).` });
    }
  }
  if (Notification.isSupported()) {
    const n = new Notification({ title: "Standup covered", body: headline(r) });
    n.on("click", () => { openWindow(); send({ kind: "show", view: "recaps" }); });
    n.show();
  }
}

let voiceDownload: { progress: number; error?: string } | null = null;

function downloadVoiceModel(): Promise<void> {
  voiceDownload = { progress: 0 };
  return ensureVoiceModel((progress) => { voiceDownload = { progress }; send({ kind: "voice", progress }); })
    .then(() => { voiceDownload = null; send({ kind: "voice", progress: 1 }); })
    .catch((e) => { voiceDownload = { progress: 0, error: message(e) }; send({ kind: "voice", progress: 0, error: message(e) }); throw e; });
}

/** The owner's own words to read when recording: the start of their latest update, if there is one. */
const recordingScript = () => {
  const script = loadDraft()?.script;
  return script ? sentences(script).slice(0, 3).join(" ") : null;
};

const voiceStatus = () => ({
  ...ownVoiceStatus(loadSettings()), modelBytes: VOICE_MODEL_BYTES, download: voiceDownload,
  consent: CONSENT_SENTENCE, script: recordingScript(),
});

function useStandardVoice() {
  const s = loadSettings();
  if (s.voice.mode !== "standard") saveSettings({ ...s, voice: { ...s.voice, mode: "standard" } });
}

/** Download the speech model if needed, reporting progress to the window. */
function speechModel(): Promise<void> {
  return ensureModel((progress) => send({ kind: "model", progress }))
    .catch((e) => { send({ kind: "model", progress: 0, error: message(e) }); throw e; });
}

let account: Account | null = null;
async function updateAccount(fn: () => Promise<Account | null>) {
  try { account = await fn(); send({ kind: "account", account }); }
  catch (e) { send({ kind: "account", account, error: message(e) }); }
}
function handleUrl(url: string) {
  if (!url.startsWith("peguin://")) return;
  openWindow();
  void updateAccount(async () => (await completeSignIn(url)) ?? account);
}
app.on("open-url", (e, url) => { e.preventDefault(); app.isReady() ? handleUrl(url) : app.once("ready", () => handleUrl(url)); });

ipcMain.handle("settings:get", () => loadSettings());
ipcMain.handle("settings:save", (_e, input: unknown) => {
  const s = saveSettings(input);
  if (s.voice.mode === "mine" && !usingOwnVoice(s)) {
    useStandardVoice();
    throw new Error("Record your voice and download the voice model first; Peguin keeps the standard voice until then.");
  }
  return s;
});
ipcMain.handle("draft:get", () => ({ draft: loadDraft(), preparing: !!preparing }));
ipcMain.handle("draft:prepare", () => prepare());
// The sidebar's "Next standup": from the calendars when they're on, else the fixed time.
ipcMain.handle("standup:next", async () => {
  const s = loadSettings();
  const planned = await nextCalendarStandup(s).catch(() => null);
  if (planned) return { label: whenLabel(planned.start, new Date(), s.timezone), title: planned.title, url: planned.url };
  return nextStandup(s);
});
ipcMain.handle("calendar:status", async () => {
  const s = loadSettings(), secrets = loadCalendarSecrets();
  return { mac: { on: s.calendar.mac, access: await macCalendarAccess() }, links: secrets.links.map(maskLink), calendly: !!secrets.calendlyToken };
});
ipcMain.handle("calendar:mac-connect", async () => {
  const access = await requestMacCalendarAccess();
  const s = loadSettings();
  if (access === "authorized") saveSettings({ ...s, calendar: { ...s.calendar, mac: true, enabled: true } });
  refreshCalendars();
  return access;
});
ipcMain.handle("calendar:mac-disconnect", () => {
  const s = loadSettings();
  saveSettings({ ...s, calendar: { ...s.calendar, mac: false } });
  refreshCalendars();
});
ipcMain.handle("calendar:add-link", (_e, link: string) => {
  const secrets = loadCalendarSecrets();
  if (!/^(https?|webcal):\/\//i.test(String(link).trim())) throw new Error("That doesn't look like a calendar link. It should start with https:// or webcal://.");
  saveCalendarSecrets({ ...secrets, links: [...secrets.links, String(link)] });
  const s = loadSettings();
  if (!s.calendar.enabled) saveSettings({ ...s, calendar: { ...s.calendar, enabled: true } });
  refreshCalendars();
});
ipcMain.handle("calendar:remove-link", (_e, index: number) => {
  const secrets = loadCalendarSecrets();
  saveCalendarSecrets({ ...secrets, links: secrets.links.filter((_, i) => i !== Number(index)) });
  refreshCalendars();
});
ipcMain.handle("calendar:set-calendly", (_e, token: string | null) => {
  saveCalendarSecrets({ ...loadCalendarSecrets(), calendlyToken: token ? String(token) : null });
  const s = loadSettings();
  if (token && !s.calendar.enabled) saveSettings({ ...s, calendar: { ...s.calendar, enabled: true } });
  refreshCalendars();
});
ipcMain.handle("calendar:upcoming", (_e, fresh?: boolean) => { if (fresh) refreshCalendars(); return upcoming(loadSettings()); });
ipcMain.handle("meeting:join", (_e, url: string) => join(url));
ipcMain.handle("meeting:leave", () => { meeting?.stop(); meeting = null; });
ipcMain.handle("account:get", () => account);
ipcMain.handle("meetings:list", () => listMeetings(loadSettings().recap.keepDays));
ipcMain.handle("meetings:follow-up", (_e, id: string, index: number, done: boolean) => setFollowUpDone(String(id), Number(index), !!done));
ipcMain.handle("meetings:delete", (_e, id: string) => { deleteMeeting(String(id)); });
ipcMain.handle("meetings:delete-all", () => { deleteAllMeetings(); });
ipcMain.handle("voice:status", () => voiceStatus());
ipcMain.handle("voice:download", () => downloadVoiceModel().then(voiceStatus));
ipcMain.handle("voice:mic", () => (process.platform === "darwin" ? systemPreferences.askForMediaAccess("microphone") : true));
ipcMain.handle("voice:save", (_e, consent: ArrayBuffer, talk: ArrayBuffer) => {
  saveSample(new Float32Array(consent), new Float32Array(talk));
  forgetVoice();
  return voiceStatus();
});
ipcMain.handle("voice:delete", () => { useStandardVoice(); deleteSample(); forgetVoice(); return voiceStatus(); });
ipcMain.handle("voice:delete-model", () => { useStandardVoice(); deleteVoiceModel(); return voiceStatus(); });
// Previews use the owner's own lines: the disclosure and the start of their latest update.
ipcMain.handle("voice:preview", async () => {
  const s = loadSettings();
  if (!voiceModelReady()) throw new Error("Download the voice model first.");
  return speakInOwnVoice(sentences(lines(s, loadDraft(), true).update).slice(0, 3).join(" "), s);
});
ipcMain.handle("voice:say-word", async (_e, word: string) => {
  if (!voiceModelReady()) throw new Error("Download the voice model first.");
  return speakInOwnVoice(`This is how I say ${String(word).slice(0, 40)}.`, loadSettings());
});
ipcMain.handle("update:get", () => update);
ipcMain.handle("update:open", () => { if (update) void shell.openExternal(update.url); });
ipcMain.handle("account:signin", () => startSignIn());
ipcMain.handle("account:signout", () => updateAccount(async () => { await signOut(); return null; }));

app.whenReady().then(() => {
  const icon = nativeImage.createFromPath(resource("trayTemplate.png"));
  icon.setTemplateImage(true); // macOS tints it for light and dark menu bars
  tray = new Tray(icon);
  tray.setToolTip("Peguin");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open Peguin", click: openWindow },
    { label: "Prepare today's update", click: () => void prepare().catch(() => {}) },
    { label: "Leave meeting", click: () => { meeting?.stop(); meeting = null; } },
    { type: "separator" },
    { label: "Quit Peguin", role: "quit" },
  ]));
  openWindow();
  void speechModel().catch(() => {});
  void updateAccount(refreshAccount);
  setInterval(() => void updateAccount(refreshAccount), 6 * 3600 * 1000);
  void refreshUpdate();
  setInterval(() => void refreshUpdate(), 6 * 3600 * 1000);
  startScheduler({
    settings: loadSettings,
    calendarStandup: (s) => nextCalendarStandup(s),
    prepare,
    join,
    log: (text) => send({ kind: "log", text }),
  });
  app.on("activate", openWindow);
});

// Windows and Linux deliver peguin:// links as an argument to a second instance.
app.on("second-instance", (_e, argv) => {
  const url = argv.find((a) => a.startsWith("peguin://"));
  if (url) handleUrl(url); else openWindow();
});
// Keep running in the menu bar when the window closes.
app.on("window-all-closed", () => {});
app.on("will-quit", () => {
  meeting?.stop();
  void whisper?.then((w) => w.stop()).catch(() => {});
});
