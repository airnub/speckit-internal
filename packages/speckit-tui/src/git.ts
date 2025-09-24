import { execa } from "execa";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";

export type GitCommandResult = { ok: boolean; output: string };
export type GitAuthOptions = { token?: string };

type GitExecOptions = { cwd?: string; token?: string };

export async function gitRoot(): Promise<string|null> {
  try {
    const { stdout } = await execa("git", ["rev-parse", "--show-toplevel"]);
    return stdout.trim();
  } catch { return null; }
}
export async function gitBranch(cwd?: string): Promise<string> {
  try { const { stdout } = await execa("git", ["rev-parse","--abbrev-ref","HEAD"], { cwd }); return stdout.trim(); }
  catch { return "main"; }
}
export async function gitStatus(cwd?: string): Promise<string> {
  try { const { stdout } = await execa("git", ["status","--short","--branch"], { cwd }); return stdout; }
  catch { return "(git repo not initialized)"; }
}
export async function gitDiff(cwd?: string, path?: string): Promise<string> {
  try {
    const args = ["--no-pager","diff"];
    if (path) args.push("--", path);
    const { stdout } = await execa("git", args, { cwd });
    return stdout || "(no diff)";
  } catch (e:any) { return e?.stdout || "(diff unavailable)"; }
}
export async function openInEditor(filePath: string) {
  const editor = process.env.EDITOR || "nano";
  await execa(editor, [filePath], { stdio: "inherit" });
}
export async function gitCommitAll(msg: string, cwd?: string) {
  await execa("git", ["add","-A"], { cwd });
  await execa("git", ["commit","-m", msg], { cwd });
}
export async function gitFetch(cwd?: string, options?: GitAuthOptions): Promise<GitCommandResult> {
  return runGitCommand(["fetch", "--prune"], cwd, options?.token);
}
export async function gitPull(cwd?: string, options?: GitAuthOptions): Promise<GitCommandResult> {
  return runGitCommand(["pull", "--ff-only"], cwd, options?.token);
}
export async function gitPush(cwd?: string, options?: GitAuthOptions): Promise<GitCommandResult> {
  return runGitCommand(["push"], cwd, options?.token);
}
export async function runCmd(cwd: string, bin: string, args: string[]) {
  try {
    const { stdout } = await execa(bin, args, { cwd });
    return stdout;
  } catch (e:any) {
    return (e?.stdout || e?.stderr || String(e)) as string;
  }
}

async function runGitCommand(args: string[], cwd?: string, token?: string): Promise<GitCommandResult> {
  try {
    const { stdout, stderr } = await runGit(args, { cwd, token });
    const output = [stdout, stderr].filter(Boolean).join("\n").trim();
    return { ok: true, output };
  } catch (error: any) {
    const message = formatGitError(error);
    return { ok: false, output: message };
  }
}

export type GitEnsureGithubRepoOptions = {
  repo: string;
  branch?: string;
  dir: string;
  token?: string;
};

export async function gitEnsureGithubRepo(options: GitEnsureGithubRepoOptions): Promise<void> {
  const repoName = options.repo.replace(/\.git$/i, "").trim();
  if (!repoName) {
    throw new Error("GitHub repository name is required.");
  }

  const branch = (options.branch || "main").trim() || "main";
  const remoteUrl = repoName.includes("://") ? repoName : `https://github.com/${repoName}.git`;
  const repoDir = options.dir;
  const gitDir = path.join(repoDir, ".git");
  const parentDir = path.dirname(repoDir);
  const token = options.token?.trim() || undefined;

  await fs.ensureDir(parentDir);

  const hasRepo = await fs.pathExists(gitDir);

  if (!hasRepo) {
    if (await fs.pathExists(repoDir)) {
      await fs.remove(repoDir);
    }
    const cloneResult = await runGitCommand(
      ["clone", "--branch", branch, "--single-branch", remoteUrl, repoDir],
      undefined,
      token
    );
    if (!cloneResult.ok) {
      throw new Error(`git clone failed: ${cloneResult.output}`);
    }
  } else {
    const setRemoteResult = await runGitCommand(["remote", "set-url", "origin", remoteUrl], repoDir);
    if (!setRemoteResult.ok) {
      const addRemoteResult = await runGitCommand(["remote", "add", "origin", remoteUrl], repoDir);
      if (!addRemoteResult.ok) {
        throw new Error(`Failed to configure remote: ${addRemoteResult.output}`);
      }
    }
    const fetchResult = await gitFetch(repoDir, { token });
    if (!fetchResult.ok) {
      throw new Error(`git fetch failed: ${fetchResult.output}`);
    }
  }

  const branchExists = await runGit(["rev-parse", "--verify", branch], { cwd: repoDir })
    .then(() => true)
    .catch(() => false);

  if (!branchExists) {
    const checkoutResult = await runGitCommand(
      ["checkout", "-b", branch, `origin/${branch}`],
      repoDir,
      token
    );
    if (!checkoutResult.ok) {
      throw new Error(`Failed to create branch '${branch}': ${checkoutResult.output}`);
    }
  } else {
    const checkoutResult = await runGitCommand(["checkout", branch], repoDir);
    if (!checkoutResult.ok) {
      throw new Error(`Failed to checkout branch '${branch}': ${checkoutResult.output}`);
    }
  }
}

async function runGit(args: string[], options: GitExecOptions = {}) {
  const env: NodeJS.ProcessEnv = { ...process.env };
  env.GIT_TERMINAL_PROMPT = "0";

  let askPassDir: string | null = null;
  if (options.token) {
    askPassDir = await fs.mkdtemp(path.join(os.tmpdir(), "speckit-git-askpass-"));
    const scriptPath = path.join(askPassDir, "askpass.sh");
    const script = buildAskPassScript(options.token);
    await fs.writeFile(scriptPath, script, { mode: 0o700 });
    env.GIT_ASKPASS = scriptPath;
  }

  try {
    return await execa("git", args, { cwd: options.cwd, env });
  } finally {
    if (askPassDir) {
      await fs.remove(askPassDir).catch(() => undefined);
    }
  }
}

function buildAskPassScript(token: string): string {
  const username = shellQuote("oauth2");
  const password = shellQuote(token);
  return [
    "#!/bin/sh",
    "case \"$1\" in",
    `  *Username*) printf %s ${username} ;;`,
    `  *) printf %s ${password} ;;`,
    "esac"
  ].join("\n");
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function formatGitError(error: any): string {
  return (error?.stderr || error?.stdout || error?.shortMessage || error?.message || String(error)).trim();
}
