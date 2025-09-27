import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_DIR = path.dirname(fileURLToPath(new URL(".", import.meta.url)));

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      reporter: ["text", "lcov"],
    },
  },
  resolve: {
    alias: [
      {
        find: /^@speckit\/analyzer$/,
        replacement: path.resolve(PACKAGE_DIR, "../speckit-analyzer/src/index.ts"),
      },
      {
        find: /^@speckit\/analyzer\/(.*)$/,
        replacement: path.resolve(PACKAGE_DIR, "../speckit-analyzer/src/$1"),
      },
    ],
  },
});
