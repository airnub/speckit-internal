#!/usr/bin/env node
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, "..");
const distEntry = join(packageRoot, "dist", "cli.js");

if (!existsSync(distEntry)) {
  const npmExecPath = process.env.npm_execpath;
  const usingPnpm = typeof npmExecPath === "string" && npmExecPath.includes("pnpm");
  const command = usingPnpm ? process.execPath : "pnpm";
  const args = usingPnpm ? [npmExecPath, "run", "build"] : ["run", "build"];
  const result = spawnSync(command, args, {
    cwd: packageRoot,
    stdio: "inherit",
    shell: !usingPnpm && process.platform === "win32",
  });

  if (result.status !== 0) {
    console.error("Failed to build the Speckit CLI bundle.\n" +
      "Please run `pnpm install` or `pnpm --filter @speckit/cli build` and try again.");
    process.exit(result.status ?? 1);
  }
}

await import(pathToFileURL(distEntry).href);
