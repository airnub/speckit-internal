import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const resolvePackage = (relativePath: string) => path.resolve(__dirname, relativePath);

export default defineConfig({
  test: {
    dir: "src",
    environment: "node",
    globals: true,
    snapshotFormat: {
      escapeString: false,
      printBasicPrototype: false,
    },
  },
  resolve: {
    alias: {
      "@speckit/feature-flags": resolvePackage("../speckit-feature-flags/src/index.ts"),
      "@speckit/framework-registry": resolvePackage("../speckit-framework-registry/src/index.ts"),
      "@speckit/presets": resolvePackage("../speckit-presets/src/index.ts"),
    },
  },
});
