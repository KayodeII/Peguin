// The private copilot: the owner's own meeting in a Peguin window, with a
// panel beside it that only they see. Peguin listens to everyone else (never
// the owner's mic), transcribes on this Mac, and when someone asks something
// it suggests what the owner could say, from their prepared facts only.
//
// Unlike Peguin's own AI participant, the owner is here as themselves, so
// signing in to their meeting account in this window is allowed. The profile
// persists, so they stay signed in next time.
import { app, BrowserWindow, ipcMain, WebContentsView, type IpcMainEvent } from "electron";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isQuestion } from "../../../../src/core/brain/prompts.js";
import type { Draft } from "../brain.js";
import { detectPlatform, webClientUrl } from "../meeting/platform.js";
import { outDir, resource } from "../paths.js";
import type { Settings } from "../settings.js";
import { createListener, type Whisper } from "../speech/whisper.js";
import { vocabulary } from "../speech/hints.js";

/** Width of the notes panel on the right, in px. */
export const PANEL_WIDTH = 380;
/** Lines of conversation Claude sees with each question. */
const CONTEXT_LINES = 16;

export type CopilotCard = { id: number; question: string; at: number; answer?: string; error?: string };
export type CopilotEvent =
  | { type: "status"; status: "joining" | "listening" | "ended"; detail?: string }
  | { type: "heard"; text: string; at: number }
  | { type: "card"; card: CopilotCard };

export class CopilotSession {
  private win?: BrowserWindow;
  private view?: WebContentsView;
  private readonly detach: Array<() => void> = [];
  private readonly recent: string[] = [];
  private cards = 0;
  private busy = false;
  private pending: CopilotCard | null = null;
  private ended = false;
  /** Everything shown so far, for the panel to catch up when it opens (it may subscribe after the first events). */
  private snapshot: { status?: Extract<CopilotEvent, { type: "status" }>; heard: { text: string; at: number }[]; cards: Map<number, CopilotCard> } = { heard: [], cards: new Map() };

  constructor(
    readonly url: string,
    private readonly settings: Settings,
    private readonly whisper: Whisper,
    private readonly brain: { draft: Draft | null; suggest: (question: string, recent: string[]) => Promise<string> },
    /** The panel page (the app's renderer at #copilot), loaded into the window itself. */
    private readonly panel: { url?: string; file?: string },
    private readonly onEnd: () => void,
  ) {}

  private send(e: CopilotEvent) {
    if (e.type === "status") this.snapshot.status = e;
    if (e.type === "heard") this.snapshot.heard = [...this.snapshot.heard.slice(-199), { text: e.text, at: e.at }];
    if (e.type === "card") this.snapshot.cards.set(e.card.id, e.card);
    const wc = this.win?.webContents;
    if (wc && !wc.isDestroyed()) wc.send("app:event", { kind: "copilot", event: e });
  }

  /** What the panel should show right now. */
  state() {
    return { status: this.snapshot.status ?? null, heard: this.snapshot.heard, cards: [...this.snapshot.cards.values()] };
  }

  async start() {
    const platform = detectPlatform(this.url);
    if (platform === "unknown") throw new Error("That isn't a Google Meet, Zoom or Teams link.");
    const s = this.settings;
    const first = s.displayName.trim().split(/\s+/)[0] ?? "";
    const names = [...new Set([s.displayName.trim(), first, ...s.aliases].filter(Boolean))];

    const win = new BrowserWindow({
      width: 1440, height: 900, minWidth: 1000, minHeight: 640, title: "Peguin copilot",
      webPreferences: { preload: path.join(outDir, "preload/app.cjs"), sandbox: true, contextIsolation: true },
    });
    this.win = win;
    if (this.panel.url) void win.loadURL(`${this.panel.url}#copilot`);
    else void win.loadFile(this.panel.file!, { hash: "copilot" });

    const view = new WebContentsView({
      webPreferences: {
        preload: path.join(outDir, "preload/copilot.cjs"),
        partition: "persist:copilot", // the owner's own sign-in, kept between meetings
        nodeIntegrationInSubFrames: true,
        sandbox: true, contextIsolation: true, nodeIntegration: false,
        backgroundThrottling: false,
      },
    });
    this.view = view;
    win.contentView.addChildView(view);
    const layout = () => {
      const [w, h] = win.getContentSize() as [number, number];
      view.setBounds({ x: 0, y: 0, width: Math.max(0, w - PANEL_WIDTH), height: h });
    };
    layout();
    win.on("resize", layout);

    const wc = view.webContents;
    // The owner's real mic and camera, for their own meeting.
    wc.session.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === "media" || perm === "notifications" || perm === "fullscreen"));
    wc.session.setPermissionCheckHandler((_wc, perm) => perm === "media");
    wc.setWindowOpenHandler(({ url }) => (/^https:\/\//.test(url) ? { action: "allow" } : { action: "deny" }));
    wc.on("will-frame-navigate", (e) => { if (!/^(https?|about|blob|data):/i.test(e.url)) e.preventDefault(); });

    const listen = createListener({
      whisperUrl: this.whisper.url, names,
      vocab: () => vocabulary(this.brain.draft?.facts ?? []),
      // People pause mid-question ("could you walk me... through it?"); wait longer before cutting.
      endSilenceMs: 1200,
      onError: (e) => this.send({ type: "status", status: "listening", detail: `Speech recognition error: ${e instanceof Error ? e.message : e}` }),
      onUtterance: ({ text }) => this.heard(text),
    });

    const inject = readFileSync(resource("copilot-inject.js"), "utf8");
    const on = (channel: string, fn: (e: IpcMainEvent, ...a: any[]) => void) => {
      const h = (e: IpcMainEvent, ...a: any[]) => { if (e.sender === wc) fn(e, ...a); };
      ipcMain.on(channel, h);
      this.detach.push(() => ipcMain.removeListener(channel, h));
    };
    on("cop:inject", (e) => { e.returnValue = inject; });
    on("cop:log", (_e, msg: string) => { if (/listening to/.test(msg)) this.send({ type: "status", status: "listening", detail: "Listening. Questions show up here." }); });
    on("cop:pcm", (_e, buf: ArrayBuffer) => { if (!this.ended) listen(buf); });

    win.on("closed", () => this.end());
    this.send({ type: "status", status: "joining", detail: "Join the meeting on the left. Peguin starts listening once you're in." });
    if (!app.isPackaged) this.devDemo(win, wc);
    await wc.loadURL(webClientUrl(this.url, platform));
  }

  /**
   * Development only. PENGUIN_COPILOT_DEMO=<JSON array of lines> feeds them in as if
   * heard (real question detection and suggestions); PENGUIN_COPILOT_SNAPSHOT=<dir>
   * then saves the meeting and the panel as PNGs after PENGUIN_COPILOT_SNAPSHOT_MS.
   */
  private devDemo(win: BrowserWindow, meeting: Electron.WebContents) {
    const lines = JSON.parse(process.env.PENGUIN_COPILOT_DEMO ?? "[]") as string[];
    lines.forEach((t, i) => setTimeout(() => { if (!this.ended) this.heard(t); }, 2500 + i * 3000));
    const dir = process.env.PENGUIN_COPILOT_SNAPSHOT;
    if (!dir) return;
    setTimeout(async () => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, "panel.png"), (await win.webContents.capturePage()).toPNG());
      writeFileSync(path.join(dir, "meeting.png"), (await meeting.capturePage()).toPNG());
      app.exit(0);
    }, Number(process.env.PENGUIN_COPILOT_SNAPSHOT_MS ?? 30000));
  }

  private heard(text: string) {
    const at = Date.now();
    this.recent.push(`Someone: ${text}`);
    if (this.recent.length > CONTEXT_LINES) this.recent.shift();
    this.send({ type: "heard", text, at });
    if (isQuestion(text)) this.ask({ id: ++this.cards, question: text, at });
  }

  /** One suggestion at a time; while one is being written, only the newest question waits. */
  private ask(card: CopilotCard) {
    this.send({ type: "card", card });
    if (this.busy) { this.pending = card; return; }
    this.busy = true;
    void this.brain.suggest(card.question, [...this.recent])
      .then((answer) => this.send({ type: "card", card: { ...card, answer } }))
      .catch((e: unknown) => this.send({ type: "card", card: { ...card, error: e instanceof Error ? e.message : String(e) } }))
      .finally(() => {
        this.busy = false;
        const next = this.pending;
        this.pending = null;
        if (next && !this.ended) this.ask(next);
      });
  }

  stop() {
    if (this.win && !this.win.isDestroyed()) this.win.destroy();
    this.end();
  }

  private end() {
    if (this.ended) return;
    this.ended = true;
    while (this.detach.length) this.detach.pop()!();
    this.onEnd();
  }
}
