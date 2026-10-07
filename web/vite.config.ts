import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In dev, API and auth routes go to the Worker (cd ../cloud && npm run dev).
const worker = "http://localhost:8787";
export default defineConfig({
  plugins: [react()],
  // Older Safari and Chrome too (Vite's default starts at Safari 16): Macs and
  // iPhones a few OS versions behind still get the full site.
  build: { target: ["es2020", "safari14", "chrome87", "firefox78", "edge88"] },
  server: { port: 5174, proxy: { "/api": worker, "/auth": worker, "/app": worker } },
});
