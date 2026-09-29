import { defineConfig } from "vitest/config";

// Tests cover the pure classification pipeline only — no DOM, no React, so no
// Vite plugins are needed here. Kept separate from vite.config.ts so the app
// build never pulls in test infrastructure.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
