import path from "node:path";
import { execSync } from "node:child_process";
import fs from "fs-extra";

export type SpeckitVersionInfo = {
  version: string;
  commit: string;
};

export async function getSpeckitVersion(repoRoot?: string): Promise<SpeckitVersionInfo> {
  const root = repoRoot ?? process.cwd();
  const pkgPath = path.join(root, "packages", "speckit-cli", "package.json");

  let version = "0.0.0";
  let commit = resolveCommitFromEnv() ?? "";

  try {
    const pkg = await fs.readJson(pkgPath);
    version = normaliseString(pkg?.version) || version;
  } catch {
    // ignore missing package metadata
  }

  if (!commit) {
    commit = resolveGitCommit(root) ?? "";
  }

  return { version, commit: commit || "unknown" };
}

function normaliseString(input: unknown): string {
  return typeof input === "string" && input.trim() ? input.trim() : "";
}

function resolveCommitFromEnv(): string | null {
  const envSha = normaliseString(process.env.GITHUB_SHA);
  if (!envSha) return null;
  return shortenSha(envSha);
}

function resolveGitCommit(root: string): string | null {
  try {
    const stdout = execSync("git rev-parse --short HEAD", { cwd: root, stdio: ["ignore", "pipe", "ignore"] });
    const short = stdout.toString("utf8").trim();
    return short ? short : null;
  } catch {
    return null;
  }
}

function shortenSha(sha: string): string {
  const clean = sha.trim();
  if (clean.length <= 7) return clean;
  return clean.slice(0, 7);
}
