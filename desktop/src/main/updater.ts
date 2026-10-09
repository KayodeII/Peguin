// Updating the installed app in place, without the owner downloading a .dmg.
// The release publishes the app as a zip plus SHA256SUMS.txt. The new version is
// downloaded in the background, checked against the published checksum,
// unpacked, and checked again (its version must match). Then, on "Restart to
// update" or when the app quits, a small script swaps the bundle once Peguin
// has exited, and reopens it if asked. A download made by the app itself
// carries no quarantine flag, so macOS doesn't ask "Open Anyway" again.
//
// Until the app is signed with an Apple Developer ID this replaces Squirrel /
// electron-updater, which require a signed app on macOS.
import { app } from "electron";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { accessSync, constants, createWriteStream, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

export const ZIP_ASSET = "Peguin-mac-arm64.zip";

/** The checksum listed for `name` in a shasum file ("<hex>  <name>" lines), or null (pure). */
export function checksumFor(sums: string, name: string): string | null {
  for (const line of sums.split("\n")) {
    const m = line.trim().match(/^([a-f0-9]{64})\s+\*?(.+)$/i);
    if (m && m[2] === name) return m[1]!.toLowerCase();
  }
  return null;
}

/** /Applications/Peguin.app from the running executable (…/Peguin.app/Contents/MacOS/Peguin), or null (pure). */
export function bundleOf(execPath: string): string | null {
  const bundle = path.resolve(execPath, "../../..");
  return bundle.endsWith(".app") ? bundle : null;
}

const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/**
 * The swap, run by /bin/sh after Peguin exits: keep the old bundle until the new
 * one is in place, put it back if anything fails, then reopen if asked (pure).
 */
export function swapScript(o: { pid: number; current: string; next: string; reopen: boolean; cleanup?: string }): string {
  const cur = q(o.current), old = q(`${o.current}.old`), next = q(o.next);
  return [
    "#!/bin/sh",
    `while kill -0 ${o.pid} 2>/dev/null; do sleep 0.2; done`,
    `rm -rf ${old}`,
    `if mv ${cur} ${old} && (mv ${next} ${cur} || ditto ${next} ${cur}); then rm -rf ${old}; else rm -rf ${cur}; mv ${old} ${cur}; fi`,
    `xattr -dr com.apple.quarantine ${cur} 2>/dev/null`,
    o.reopen ? `open ${cur}` : ":",
    o.cleanup ? `rm -rf ${q(o.cleanup)}` : ":",
  ].join("\n");
}

export type UpdateState = { version: string; status: "downloading" | "ready" | "failed"; progress: number; error?: string };

let ready: { version: string; app: string; dir: string } | null = null;
let running: Promise<void> | null = null;

/** Whether this install can replace itself: a packaged Mac app in a folder the owner can write to. */
export function canSelfUpdate(): boolean {
  if (!app.isPackaged || process.platform !== "darwin") return false;
  const bundle = bundleOf(process.execPath);
  if (!bundle) return false;
  try { accessSync(path.dirname(bundle), constants.W_OK); accessSync(bundle, constants.W_OK); return true; } catch { return false; }
}

async function download(url: string, file: string, onProgress: (f: number) => void): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15 * 60_000) });
  if (!res.ok || !res.body) throw new Error(`The download failed (${res.status}).`);
  const total = Number(res.headers.get("content-length")) || 0;
  const hash = createHash("sha256");
  const out = createWriteStream(file);
  let got = 0;
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    hash.update(chunk);
    if (!out.write(chunk)) await new Promise((r) => out.once("drain", r));
    got += chunk.length;
    if (total) onProgress(got / total);
  }
  await new Promise<void>((r, j) => out.end((e?: Error | null) => (e ? j(e) : r())));
  return hash.digest("hex");
}

/** Downloads, verifies and unpacks `version` in the background. Safe to call again; one at a time. */
export function prepareUpdate(u: { version: string; zip: string; sums: string }, onState: (s: UpdateState) => void): Promise<void> {
  if (ready?.version === u.version) { onState({ version: u.version, status: "ready", progress: 1 }); return Promise.resolve(); }
  running ??= (async () => {
    let dir = "";
    try {
      dir = mkdtempSync(path.join(tmpdir(), "peguin-update-"));
      onState({ version: u.version, status: "downloading", progress: 0 });
      const sumsRes = await fetch(u.sums, { signal: AbortSignal.timeout(60_000) });
      const want = sumsRes.ok ? checksumFor(await sumsRes.text(), ZIP_ASSET) : null;
      if (!want) throw new Error("The release has no checksum for the update.");
      const zip = path.join(dir, ZIP_ASSET);
      const got = await download(u.zip, zip, (progress) => onState({ version: u.version, status: "downloading", progress }));
      if (got !== want) throw new Error("The update didn't match its published checksum, so it wasn't installed.");
      await promisify(execFile)("ditto", ["-x", "-k", zip, dir]);
      rmSync(zip, { force: true });
      const next = path.join(dir, "Peguin.app");
      if (!existsSync(next)) throw new Error("The update didn't contain Peguin.app.");
      const { stdout } = await promisify(execFile)("plutil", ["-extract", "CFBundleShortVersionString", "raw", path.join(next, "Contents/Info.plist")]);
      if (stdout.trim() !== u.version) throw new Error(`The update says it's version ${stdout.trim()}, not ${u.version}.`);
      ready = { version: u.version, app: next, dir };
      onState({ version: u.version, status: "ready", progress: 1 });
    } catch (e) {
      if (dir) rmSync(dir, { recursive: true, force: true });
      onState({ version: u.version, status: "failed", progress: 0, error: e instanceof Error ? e.message : String(e) });
      throw e;
    } finally { running = null; }
  })();
  return running;
}

export const updateReady = () => ready?.version ?? null;

/**
 * Hands the swap to a detached script that waits for Peguin to exit. Call just
 * before quitting. Returns false when there's nothing ready to install.
 */
export function installOnExit(reopen: boolean): boolean {
  const bundle = bundleOf(process.execPath);
  if (!ready || !bundle || !canSelfUpdate()) return false;
  const script = path.join(ready.dir, "swap.sh");
  writeFileSync(script, swapScript({ pid: process.pid, current: bundle, next: ready.app, reopen, cleanup: ready.dir }), { mode: 0o755 });
  spawn("/bin/sh", [script], { detached: true, stdio: "ignore" }).unref();
  ready = null;
  return true;
}
