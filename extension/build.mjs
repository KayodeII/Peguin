// Builds the unpacked extension into dist/: one bundle per extension context,
// the static files, and onnxruntime's WebAssembly (shipped inside the
// extension, since Chrome extensions may not load code from the network).
import { build, context } from "esbuild";
import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";

const out = "dist";
const watch = process.argv.includes("--watch");
rmSync(out, { recursive: true, force: true });
mkdirSync(path.join(out, "ort"), { recursive: true });
cpSync("static", out, { recursive: true });
const ort = path.dirname(new URL(import.meta.resolve("onnxruntime-web")).pathname);
for (const f of readdirSync(ort)) if (/^ort-wasm-simd-threaded(\.asyncify)?\.(wasm|mjs)$/.test(f)) cpSync(path.join(ort, f), path.join(out, "ort", f));

const common = { bundle: true, target: "chrome120", logLevel: "warning", minify: !watch, sourcemap: watch ? "inline" : false, define: { "process.env.NODE_ENV": watch ? '"development"' : '"production"' } };
const jobs = [
  { ...common, entryPoints: { background: "src/background.ts" }, format: "iife", outdir: out },
  { ...common, entryPoints: { content: "src/content.ts" }, format: "iife", outdir: out },
  { ...common, entryPoints: { offscreen: "src/offscreen.ts" }, format: "esm", outdir: out, external: ["sharp", "onnxruntime-node", "fs", "path", "url"] },
  { ...common, entryPoints: { sidepanel: "src/panel/main.tsx" }, format: "esm", outdir: out, jsx: "automatic" },
];
if (watch) { for (const j of jobs) await (await context(j)).watch(); console.log("watching…"); }
else await Promise.all(jobs.map((j) => build(j)));
