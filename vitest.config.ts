import { defineConfig } from "vitest/config";

// Only our tests: spikes/ vendors third-party code that ships its own.
export default defineConfig({ test: { include: ["test/**/*.test.ts"] } });
