import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In dev, API and auth routes go to the Worker (cd ../cloud && npm run dev).
const worker = "http://localhost:8787";
export default defineConfig({
  plugins: [react()],
  server: { port: 5174, proxy: { "/api": worker, "/auth": worker, "/app": worker } },
});
