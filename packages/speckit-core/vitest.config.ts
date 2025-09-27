import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@speckit/core": path.resolve(__dirname, "src/index.ts"),
      "@speckit/core/sanitize": path.resolve(__dirname, "src/sanitize.ts"),
      "@speckit/core/metrics": path.resolve(__dirname, "src/metrics.ts"),
    },
  },
});
