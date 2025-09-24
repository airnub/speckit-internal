import path from "node:path";
import { execa } from "execa";
import fs from "fs-extra";

export type SpeckitVersionInfo = {
  version: string;
  commit: string;
};

export async function getSpeckitVersion(repoRoot?: string): Promise<SpeckitVersionInfo> {
  const root = repoRoot ?? process.cwd();
  const pkgPath = path.join(root, "packages", "speckit-cli", "package.json");

  let version = "0.0.0";
  let commit = "unknown";

  try {
    const pkg = await fs.readJson(pkgPath);
    version = normaliseString(pkg?.version) || version;
    commit =
      normaliseString(pkg?.speckitCommit) ||
      normaliseString(pkg?.gitHead) ||
      (await resolveGitCommit(root)) ||
      commit;
  } catch {
    commit = (await resolveGitCommit(root)) || commit;
  }

  return { version, commit };
}

function normaliseString(input: unknown): string {
  return typeof input === "string" && input.trim() ? input.trim() : "";
}

async function resolveGitCommit(root: string): Promise<string | null> {
  try {
    const { stdout } = await execa("git", ["rev-parse", "--short", "HEAD"], { cwd: root });
    const short = stdout.trim();
    return short || null;
  } catch {
    return null;
  }
}
