// Where things live: inside the installed app (process.resourcesPath) or in
// the source tree when running from source.
import { app } from "electron";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."); // out/
const sourceRoot = path.resolve(outDir, "..");                                         // desktop/

/** A file shipped next to the app: extraResources when installed, desktop/resources from source. */
export const resource = (name: string) => app.isPackaged ? path.join(process.resourcesPath, name) : path.join(sourceRoot, "resources", name);

/** EventKit helper that reads the Mac's calendars (built by scripts/build-calendar-helper.sh). */
export const calendarHelperPath = () => app.isPackaged ? path.join(process.resourcesPath, "calendar", "calendar-helper") : path.join(sourceRoot, "build/calendar/calendar-helper");

export const WHISPER_MODEL = "base.en";
export const MODEL_URL = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${WHISPER_MODEL}.bin`;

export function whisperPaths() {
  const bin = app.isPackaged ? path.join(process.resourcesPath, "whisper", "whisper-server") : path.join(sourceRoot, "vendor/whisper.cpp/build/bin/whisper-server");
  const downloaded = path.join(app.getPath("userData"), "models", `ggml-${WHISPER_MODEL}.bin`);
  const dev = path.join(sourceRoot, "vendor/whisper.cpp/models", `ggml-${WHISPER_MODEL}.bin`);
  return { bin, model: !app.isPackaged && existsSync(dev) && !existsSync(downloaded) ? dev : downloaded };
}

/**
 * Apps opened from Finder get a bare PATH, so git, gh and claude aren't found.
 * Take the PATH from the user's login shell, plus the usual install folders.
 */
export function fixPath() {
  if (process.platform === "win32") return;
  let shellPath = "";
  try {
    // Login shell, not interactive: picks up .zprofile (Homebrew) without running prompt plugins.
    shellPath = execFileSync(process.env.SHELL || "/bin/zsh", ["-lc", "printf %s \"$PATH\""], { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch { /* fall back to the defaults below */ }
  const extra = ["/opt/homebrew/bin", "/usr/local/bin", path.join(homedir(), ".local/bin"), path.join(homedir(), ".npm-global/bin")];
  const parts = [...shellPath.split(":"), ...(process.env.PATH ?? "").split(":"), ...extra].filter(Boolean);
  process.env.PATH = [...new Set(parts)].join(":");
}
