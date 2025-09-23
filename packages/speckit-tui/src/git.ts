import { execa } from "execa";

export type GitCommandResult = { ok: boolean; output: string };

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
export async function gitFetch(cwd?: string): Promise<GitCommandResult> {
  return runGitCommand(["fetch", "--prune"], cwd);
}
export async function gitPull(cwd?: string): Promise<GitCommandResult> {
  return runGitCommand(["pull", "--ff-only"], cwd);
}
export async function gitPush(cwd?: string): Promise<GitCommandResult> {
  return runGitCommand(["push"], cwd);
}
export async function runCmd(cwd: string, bin: string, args: string[]) {
  try {
    const { stdout } = await execa(bin, args, { cwd });
    return stdout;
  } catch (e:any) {
    return (e?.stdout || e?.stderr || String(e)) as string;
  }
}

async function runGitCommand(args: string[], cwd?: string): Promise<GitCommandResult> {
  try {
    const { stdout, stderr } = await execa("git", args, { cwd });
    const output = [stdout, stderr].filter(Boolean).join("\n").trim();
    return { ok: true, output };
  } catch (error: any) {
    const message = (error?.stderr || error?.stdout || error?.shortMessage || error?.message || String(error)).trim();
    return { ok: false, output: message };
  }
}
