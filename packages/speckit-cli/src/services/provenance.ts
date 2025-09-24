import fs from "fs-extra";
import path from "node:path";
import { createHash } from "node:crypto";

import { execa } from "execa";

import { resolveRepoRoot } from "./workspace.js";

export type SpeckitVersion = {
  version: string;
  commit: string;
};

const DEFAULT_COMMIT = "workspace";

export async function getSpeckitVersion(repoRoot = process.cwd()): Promise<SpeckitVersion> {
  const root = await resolveRepoRoot(repoRoot);
  const pkgPath = path.join(root, "packages", "speckit-cli", "package.json");
  let version = "0.0.0";

  try {
    const pkgJson = await fs.readJson(pkgPath);
    if (typeof pkgJson?.version === "string") {
      version = pkgJson.version;
    }
  } catch (error: any) {
    throw new Error(`Failed to read Speckit CLI package.json at ${pkgPath}: ${error?.message || error}`);
  }

  let commit = (process.env.SPECKIT_COMMIT || "").trim();

  if (!commit) {
    try {
      const { stdout } = await execa("git", ["rev-parse", "--short", "HEAD"], { cwd: root });
      commit = stdout.trim();
    } catch {
      commit = "";
    }
  }

  if (!commit) {
    commit = DEFAULT_COMMIT;
  }

  return { version, commit };
}

export async function hashSpecYaml(repoRoot = process.cwd()): Promise<string> {
  const root = await resolveRepoRoot(repoRoot);
  const specPath = path.join(root, ".speckit", "spec.yaml");
  try {
    const file = await fs.readFile(specPath);
    const hash = createHash("sha256").update(file).digest("hex");
    return `sha256:${hash}`;
  } catch (error: any) {
    throw new Error(`Failed to hash spec at ${specPath}: ${error?.message || error}`);
  }
}
