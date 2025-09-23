import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node"
  },
  resolve: {
    alias: {
      "@speckit/core": path.resolve(__dirname, "../speckit-core/src/index.ts"),
      "@speckit/agent": path.resolve(__dirname, "../speckit-agent/src/index.ts")
    }
  }
});
