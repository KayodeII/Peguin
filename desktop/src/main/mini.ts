// Mini Peguin: a small version of the app that stays on screen while the main
// window is closed. On a Mac with a camera notch it can hug the notch like the
// iPhone's Dynamic Island (a pill that opens when the pointer is over it);
// anywhere else it's a small floating window, like Tailscale's mini player.
// It loads the app's own page (#mini-island or #mini-window) with the app's preload.
import { BrowserWindow, screen } from "electron";
import { writeFileSync } from "node:fs";
import { devEnv } from "./paths.js";
import type { Settings } from "./settings.js";

export type MiniForm = "island" | "window";

/** Width of each side of the island beside the camera (matches the page's CSS). */
const EAR = 46;
const WINDOW = { width: 340, height: 190 };
const OPEN = { width: 380, height: 160 };

/** The primary display's menu bar height and camera notch width (0 without a notch). */
export function notchOf(d = screen.getPrimaryDisplay()) {
  const bar = d.workArea.y - d.bounds.y;
  return { bar, notchW: bar >= 32 ? 185 : 0 };
}

export const hasNotch = () => notchOf().notchW > 0;

/** Where the mini goes (pure): the island over the notch, or the window at its last place or top right. */
export function miniBounds(form: MiniForm, open: boolean, d: { bounds: Electron.Rectangle; workArea: Electron.Rectangle }, notch: { bar: number; notchW: number }, last?: { x?: number; y?: number }, height?: number): Electron.Rectangle {
  const mid = d.bounds.x + d.bounds.width / 2;
  if (form === "island") {
    const w = open ? Math.max(OPEN.width, notch.notchW + 2 * EAR) : notch.notchW + 2 * EAR;
    const h = open ? (height ?? notch.bar + OPEN.height) : notch.bar;
    return { x: Math.round(mid - w / 2), y: d.bounds.y, width: w, height: h };
  }
  const wa = d.workArea;
  const fits = last?.x !== undefined && last?.y !== undefined
    && last.x >= wa.x - WINDOW.width / 2 && last.x <= wa.x + wa.width - WINDOW.width / 2 && last.y >= wa.y && last.y <= wa.y + wa.height - 40;
  const size = { width: WINDOW.width, height: height ?? WINDOW.height };
  return fits ? { x: last!.x!, y: last!.y!, ...size } : { x: wa.x + wa.width - WINDOW.width - 16, y: wa.y + 12, ...size };
}

export class Mini {
  private win: BrowserWindow | null = null;
  private form: MiniForm | null = null;
  private open = false;
  /** The page's own height, so no see-through part of the window catches clicks. */
  private height: number | undefined;

  constructor(
    private settings: () => Settings,
    private page: { url?: string; file?: string },
    private preload: string,
    /** Keep the window's position when the owner moves it. */
    private moved: (x: number, y: number) => void,
  ) {}

  /** Show, switch or close the mini to match Settings. The island needs a notch; without one it's the window. */
  apply() {
    const mode = this.settings().mini.mode;
    const form: MiniForm | null = mode === "off" ? null : mode === "island" && hasNotch() ? "island" : "window";
    if (form === this.form && this.win && !this.win.isDestroyed()) return;
    this.close();
    if (form) this.show(form);
  }

  /** What the page needs to know about where it is. */
  info() { return { form: this.form, notch: notchOf(), hasNotch: hasNotch() }; }

  /** The island opens while the pointer is over it, and closes again after; either form fits its content's height. */
  fit(open: boolean, height?: number) {
    if (!this.win || this.win.isDestroyed()) return;
    const h = height && height > 20 && height < 600 ? Math.ceil(height) : undefined;
    if (open === this.open && h === this.height) return;
    this.open = open; this.height = h;
    if (this.form === "island") {
      const d = screen.getPrimaryDisplay();
      this.win.setBounds(miniBounds("island", open, d, notchOf(d), undefined, h));
    } else if (h) {
      const [w] = this.win.getSize();
      this.win.setSize(w!, h);
    }
  }

  send(channel: string, payload: unknown) {
    if (this.win && !this.win.isDestroyed()) this.win.webContents.send(channel, payload);
  }

  close() {
    if (this.win && !this.win.isDestroyed()) this.win.destroy();
    this.win = null; this.form = null; this.open = false; this.height = undefined;
  }

  /** Development only: PENGUIN_MINI_SNAP=<base> saves the mini as drawn (closed, then opened from the page). */
  private snap(win: BrowserWindow) {
    const base = devEnv("PENGUIN_MINI_SNAP");
    if (!base) return;
    const shot = async (name: string) => writeFileSync(`${base}-${name}.png`, (await win.webContents.capturePage()).toPNG());
    setTimeout(async () => {
      await shot("closed");
      await win.webContents.executeJavaScript(`document.querySelector(".mini")?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))`);
      await new Promise((r) => setTimeout(r, 900));
      await shot("open");
    }, 1800);
  }

  private show(form: MiniForm) {
    const d = screen.getPrimaryDisplay();
    const b = miniBounds(form, false, d, notchOf(d), this.settings().mini);
    const island = form === "island";
    const win = new BrowserWindow({
      ...b, show: false, frame: false, transparent: true, hasShadow: !island, resizable: false, minimizable: false, maximizable: false,
      fullscreenable: false, skipTaskbar: true, movable: !island, enableLargerThanScreen: island, roundedCorners: !island,
      backgroundColor: "#00000000", title: "Peguin",
      webPreferences: { preload: this.preload, sandbox: true, contextIsolation: true },
    });
    // The island sits over the menu bar, like the overlay; the window floats above other apps.
    win.setAlwaysOnTop(true, island ? "screen-saver" : "floating");
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    const hash = island ? "mini-island" : "mini-window";
    if (this.page.url) void win.loadURL(`${this.page.url}#${hash}`);
    else void win.loadFile(this.page.file!, { hash });
    win.once("ready-to-show", () => { win.showInactive(); this.snap(win); });
    if (!island) win.on("moved", () => { const [x, y] = win.getPosition(); this.moved(x!, y!); });
    win.on("closed", () => { if (this.win === win) { this.win = null; this.form = null; } });
    this.win = win; this.form = form; this.open = false; this.height = undefined;
  }
}
