// `npm run dev`: build main + preloads, start Vite for the React window
// (hot reload), then launch Electron pointing at it.
import { execSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "vite";

execSync("npm run build:main && npm run build:preload", { stdio: "inherit" });
const server = await createServer({ configFile: "vite.config.ts", logLevel: "warn" });
await server.listen();
const url = server.resolvedUrls?.local[0] ?? "http://localhost:5173/";
const electron = createRequire(import.meta.url)("electron"); // path to the binary
const child = spawn(electron, ["."], { stdio: "inherit", env: { ...process.env, PENGUIN_RENDERER_URL: url } });
child.on("exit", async (code) => { await server.close(); process.exit(code ?? 0); });
