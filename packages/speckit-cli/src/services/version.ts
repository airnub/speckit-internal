import path from "node:path";
import { execSync } from "node:child_process";
import fs from "fs-extra";

const SHORT_SHA_PATTERN = /^[0-9a-f]{7,40}$/i;

export type SpeckitVersionInfo = {
  version: string;
  commit: string;
};

export function isLikelyCommitSha(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const clean = value.trim();
  if (!SHORT_SHA_PATTERN.test(clean)) {
    return false;
  }
  return !/^0+$/i.test(clean);
}

export async function getSpeckitVersion(repoRoot?: string): Promise<SpeckitVersionInfo> {
  const root = repoRoot ?? process.cwd();
  const pkgPath = path.join(root, "packages", "speckit-cli", "package.json");

  let version = "0.0.0";
  let commit: string | null = resolveCommitFromEnv();

  try {
    const pkg = await fs.readJson(pkgPath);
    version = normaliseString(pkg?.version) || version;
  } catch {
    // ignore missing package metadata
  }

  if (!commit) {
    commit = resolveGitCommit(root);
  }

  return { version, commit: commit ?? "unknown" };
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
    const short = stdout.toString("utf8").trim().toLowerCase();
    return isLikelyCommitSha(short) ? short : null;
  } catch {
    return null;
  }
}

function shortenSha(sha: string): string | null {
  const clean = sha.trim();
  if (!SHORT_SHA_PATTERN.test(clean)) {
    return null;
  }
  const shortened = clean.length > 7 ? clean.slice(0, 7) : clean;
  const normalised = shortened.toLowerCase();
  return isLikelyCommitSha(normalised) ? normalised : null;
}
