import { app, BrowserWindow, ipcMain, Menu, nativeImage, Tray } from "electron";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { meetingPaths, MeetingRunner, type MeetingEvent } from "./meeting/runner.js";
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

if (!app.requestSingleInstanceLock()) app.quit();

let prefs: BrowserWindow | null = null;
let tray: Tray | null = null;
let whisper: Promise<Whisper> | null = null;
let meeting: MeetingRunner | null = null;

function openPreferences() {
  if (prefs && !prefs.isDestroyed()) { prefs.show(); prefs.focus(); return; }
  prefs = new BrowserWindow({
    width: 900, height: 760, minWidth: 720, minHeight: 560, title: "Penguin",
    backgroundColor: "#0f1720",
    webPreferences: { preload: path.join(outDir, "preload/app.cjs"), sandbox: true, contextIsolation: true },
  });
  if (rendererUrl) void prefs.loadURL(rendererUrl);
  else void prefs.loadFile(path.join(outDir, "renderer/index.html"));
  prefs.on("closed", () => { prefs = null; });
  // Dev aid: PENGUIN_SNAPSHOT=out.png saves a picture of this window, then quits.
  const snap = process.env.PENGUIN_SNAPSHOT;
  if (snap) prefs.webContents.once("did-finish-load", () => setTimeout(async () => {
    writeFileSync(snap, (await prefs!.webContents.capturePage()).toPNG());
    app.exit(0);
  }, 1200));
}

function send(e: MeetingEvent) {
  if (prefs && !prefs.isDestroyed()) prefs.webContents.send("meeting:event", e);
  if (e.kind === "status") tray?.setTitle(e.status === "in_call" ? "🐧●" : "🐧");
}

ipcMain.handle("settings:get", () => loadSettings());
ipcMain.handle("settings:save", (_e, s: unknown) => saveSettings(s));

ipcMain.handle("meeting:join", async (_e, url: string) => {
  const settings = loadSettings();
  if (!settings.displayName.trim()) throw new Error("Set your name in Profile first, so Penguin knows when it's called.");
  meeting?.stop();
  whisper ??= startWhisper(appRoot);
  whisper.catch(() => { whisper = null; });
  const runner = new MeetingRunner(url, settings, await whisper, meetingPaths(appRoot, outDir));
  meeting = runner;
  runner.on("event", send);
  runner.on("event", (e) => { if (e.kind === "status" && (e.status === "ended" || e.status === "failed") && meeting === runner) meeting = null; });
  await runner.start();
  return { platform: runner.platform };
});
ipcMain.handle("meeting:leave", () => { meeting?.stop(); meeting = null; });

app.whenReady().then(() => {
  tray = new Tray(nativeImage.createEmpty());
  tray.setTitle("🐧"); // macOS menu bar; a proper icon comes with packaging
  tray.setToolTip("Penguin");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open Penguin", click: openPreferences },
    { label: "Leave meeting", click: () => { meeting?.stop(); meeting = null; } },
    { type: "separator" },
    { label: "Quit Penguin", role: "quit" },
  ]));
  openPreferences();
  app.on("activate", openPreferences);
});

app.on("second-instance", openPreferences);
// Keep running in the menu bar when the window closes.
app.on("window-all-closed", () => {});
app.on("will-quit", () => {
  meeting?.stop();
  void whisper?.then((w) => w.stop()).catch(() => {});
});
