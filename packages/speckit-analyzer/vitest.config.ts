import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    coverage: {
      reporter: ["text", "lcov"],
    },
  },
  resolve: {
    alias: {
      "@speckit/analyzer": path.resolve(__dirname, "src/index.ts"),
      "@speckit/core": path.resolve(__dirname, "../speckit-core/src/index.ts"),
      "@speckit/core/metrics": path.resolve(__dirname, "../speckit-core/src/metrics.ts"),
      "@speckit/core/sanitize": path.resolve(__dirname, "../speckit-core/src/sanitize.ts"),
    },
  },
});
