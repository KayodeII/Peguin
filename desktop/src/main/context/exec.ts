import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/** Run a CLI and return stdout; throws with stderr on failure. */
export async function sh(cmd: string, args: string[], opts: { cwd?: string; timeoutMs?: number } = {}): Promise<string> {
  const { stdout } = await run(cmd, args, { cwd: opts.cwd, timeout: opts.timeoutMs ?? 20000, maxBuffer: 8 * 1024 * 1024, env: process.env });
  return stdout;
}
