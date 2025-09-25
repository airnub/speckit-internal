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
      "@speckit/engine": path.resolve(__dirname, "../speckit-engine/src/index.ts"),
      "@speckit/agent": path.resolve(__dirname, "../speckit-agent/src/index.ts"),
      "@speckit/cli": path.resolve(__dirname, "../speckit-cli/src/index.ts"),
      "@speckit/feature-flags": path.resolve(__dirname, "../speckit-feature-flags/src/index.ts"),
      "@speckit/framework-registry": path.resolve(
        __dirname,
        "../speckit-framework-registry/src/index.ts"
      ),
      "@speckit/presets": path.resolve(__dirname, "../speckit-presets/src/index.ts"),
    }
  }
});
