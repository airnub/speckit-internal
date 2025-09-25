#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distEntrypoint = path.resolve(__dirname, "../dist/cli.js");

const run = async () => {
  if (fs.existsSync(distEntrypoint)) {
    await import(pathToFileURL(distEntrypoint).href);
    return;
  }

  console.error(
    "speckit CLI has not been built yet. Run `pnpm --filter @speckit/cli build` or `pnpm -r build` to generate dist files.",
  );
  process.exitCode = 1;
  return;
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
