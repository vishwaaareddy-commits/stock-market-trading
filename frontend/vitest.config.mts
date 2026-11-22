import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": import.meta.dirname } },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    globals: true,
    // jsdom workers are memory-hungry; run files serially so low-RAM machines do not crash.
    fileParallelism: false,
  },
});
