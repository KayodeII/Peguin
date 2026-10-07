import { app, BrowserWindow, ipcMain, Menu, nativeImage, nativeTheme, Tray } from "electron";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { completeSignIn, refreshAccount, signOut, startSignIn, type Account } from "./account.js";
import { answerQuestion, isFresh, loadDraft, prepareDraft, type Draft } from "./brain.js";
import { meetingPaths, MeetingRunner, type MeetingEvent } from "./meeting/runner.js";
import { nextStandup, startScheduler } from "./scheduler.js";
import { loadSettings, saveSettings } from "./settings.js";
import { startWhisper, type Whisper } from "./speech/whisper.js";

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."); // out/
const appRoot = path.resolve(outDir, "..");                                        // desktop/
const rendererUrl = process.env.PENGUIN_RENDERER_URL; // set by `npm run dev`

// Meeting windows are hidden; don't let Chromium pause them.
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
// Meeting sites reject unknown browsers; present as plain Chrome.
app.userAgentFallback = app.userAgentFallback.replace(/ (Electron|penguin-desktop)\/\S+/g, "");

app.setName("Penguin"); // before ready: menu name and app-data folder
if (process.env.PENGUIN_USER_DATA) app.setPath("userData", process.env.PENGUIN_USER_DATA); // dev: separate profile
if (!app.requestSingleInstanceLock()) app.quit();

// penguin:// links (sign-in hand-off). In development the Electron binary is
// registered with this project folder as its argument.
if (process.defaultApp) app.setAsDefaultProtocolClient("penguin", process.execPath, [path.resolve(process.argv[1] ?? ".")]);
else app.setAsDefaultProtocolClient("penguin");

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let whisper: Promise<Whisper> | null = null;
let meeting: MeetingRunner | null = null;
let preparing: Promise<Draft> | null = null;

export type AppEvent =
  | { kind: "meeting"; event: MeetingEvent }
  | { kind: "draft"; draft: Draft | null; preparing: boolean; error?: string }
  | { kind: "log"; text: string }
  | { kind: "account"; account: Account | null; error?: string };

function send(e: AppEvent) {
  if (win && !win.isDestroyed()) win.webContents.send("app:event", e);
  if (e.kind === "meeting" && e.event.kind === "status") tray?.setTitle(e.event.status === "in_call" ? "🐧●" : "🐧");
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
    width: 1180, height: 760, minWidth: 900, minHeight: 600, title: "Penguin", show: false,
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
  if (snap) win.webContents.once("did-finish-load", () => setTimeout(async () => {
    writeFileSync(snap, (await win!.webContents.capturePage()).toPNG());
    app.exit(0);
  }, Number(process.env.PENGUIN_SNAPSHOT_DELAY ?? 1500)));
}

/** One preparation at a time; everyone waiting shares it. */
function prepare(): Promise<Draft> {
  if (preparing) return preparing;
  send({ kind: "draft", draft: loadDraft(), preparing: true });
  preparing = prepareDraft(loadSettings())
    .then((d) => { send({ kind: "draft", draft: d, preparing: false }); return d; })
    .catch((e) => { send({ kind: "draft", draft: loadDraft(), preparing: false, error: message(e) }); throw e; })
    .finally(() => { preparing = null; });
  return preparing;
}

async function join(url: string) {
  const settings = loadSettings();
  if (!settings.displayName.trim()) throw new Error("Add your name in Settings first, so Penguin knows when it's called.");
  meeting?.stop();
  let draft = loadDraft();
  if (!isFresh(draft, settings.timezone)) {
    send({ kind: "log", text: "Preparing today's update before joining…" });
    draft = await prepare().catch(() => draft); // join anyway: Penguin says the update will follow
  }
  whisper ??= startWhisper(appRoot);
  whisper.catch(() => { whisper = null; });
  const runner = new MeetingRunner(url, settings, await whisper, meetingPaths(appRoot, outDir), {
    draft,
    answer: (q, recent) => answerQuestion(settings, draft, q, recent),
  });
  meeting = runner;
  runner.on("event", (event) => {
    send({ kind: "meeting", event });
    if (event.kind === "status" && (event.status === "ended" || event.status === "failed") && meeting === runner) meeting = null;
  });
  await runner.start();
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

let account: Account | null = null;
async function updateAccount(fn: () => Promise<Account | null>) {
  try { account = await fn(); send({ kind: "account", account }); }
  catch (e) { send({ kind: "account", account, error: message(e) }); }
}
function handleUrl(url: string) {
  if (!url.startsWith("penguin://")) return;
  openWindow();
  void updateAccount(async () => (await completeSignIn(url)) ?? account);
}
app.on("open-url", (e, url) => { e.preventDefault(); app.isReady() ? handleUrl(url) : app.once("ready", () => handleUrl(url)); });

ipcMain.handle("settings:get", () => loadSettings());
ipcMain.handle("settings:save", (_e, s: unknown) => saveSettings(s));
ipcMain.handle("draft:get", () => ({ draft: loadDraft(), preparing: !!preparing }));
ipcMain.handle("draft:prepare", () => prepare());
ipcMain.handle("standup:next", () => nextStandup(loadSettings()));
ipcMain.handle("meeting:join", (_e, url: string) => join(url));
ipcMain.handle("meeting:leave", () => { meeting?.stop(); meeting = null; });
ipcMain.handle("account:get", () => account);
ipcMain.handle("account:signin", () => startSignIn());
ipcMain.handle("account:signout", () => updateAccount(async () => { await signOut(); return null; }));

app.whenReady().then(() => {
  tray = new Tray(nativeImage.createEmpty());
  tray.setTitle("🐧"); // macOS menu bar; a proper icon comes with packaging
  tray.setToolTip("Penguin");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open Penguin", click: openWindow },
    { label: "Prepare today's update", click: () => void prepare().catch(() => {}) },
    { label: "Leave meeting", click: () => { meeting?.stop(); meeting = null; } },
    { type: "separator" },
    { label: "Quit Penguin", role: "quit" },
  ]));
  openWindow();
  void updateAccount(refreshAccount);
  setInterval(() => void updateAccount(refreshAccount), 6 * 3600 * 1000);
  startScheduler({
    settings: loadSettings,
    prepare,
    join,
    log: (text) => send({ kind: "log", text }),
  });
  app.on("activate", openWindow);
});

// Windows and Linux deliver penguin:// links as an argument to a second instance.
app.on("second-instance", (_e, argv) => {
  const url = argv.find((a) => a.startsWith("penguin://"));
  if (url) handleUrl(url); else openWindow();
});
// Keep running in the menu bar when the window closes.
app.on("window-all-closed", () => {});
app.on("will-quit", () => {
  meeting?.stop();
  void whisper?.then((w) => w.stop()).catch(() => {});
});
