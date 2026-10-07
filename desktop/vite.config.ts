import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The preferences window. Main process and preloads are built with esbuild.
export default defineConfig({
  root: "src/renderer",
  base: "./",
  plugins: [react()],
  build: { outDir: "../../out/renderer", emptyOutDir: true },
  server: { port: 5173, strictPort: true },
});
