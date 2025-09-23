import { TemplateEntry } from "@speckit/core";
import { execa } from "execa";
import fs from "fs-extra";
import path from "node:path";
import { globby } from "globby";

export type TemplateVarPrompt = {
  key: string;
  prompt: string;
  defaultValue: string;
  meta: unknown;
};

export type TemplatePostInitEvent =
  | { type: "start"; command: string }
  | { type: "stdout"; command: string; data: string }
  | { type: "stderr"; command: string; data: string }
  | { type: "exit"; command: string; code: number | null }
  | { type: "error"; command: string; error: unknown };

export type UseTemplateOptions = {
  mergeIntoCwd: boolean;
  promptVars: boolean;
  runPostInit: boolean;
  cwd?: string;
  specRoot?: string;
  prompt?: (prompt: TemplateVarPrompt) => Promise<string>;
  onPostInitEvent?: (event: TemplatePostInitEvent) => void;
};

export async function useTemplateIntoDir(t: TemplateEntry, targetDir: string, opts: UseTemplateOptions) {
  if (t.type === "blank") {
    const specRoot = opts.specRoot || "docs/specs";
    const specsDir = path.join(targetDir, specRoot);
    const templatesDir = path.join(specsDir, "templates");
    const base = path.join(templatesDir, "base.md");
    await fs.ensureDir(templatesDir);
    if (!(await fs.pathExists(base))) {
      const now = new Date().toISOString();
      await fs.writeFile(
        base,
        `---\ntitle: "New Spec"\nversion: "0.1.0"\nstatus: "draft"\nowners: []\ncreated: "${now}"\nupdated: "${now}"\n---\n\n# Summary\n`,
        "utf8"
      );
    }
    await fs.ensureDir(specsDir);
    const dest = path.join(specsDir, `spec_${Date.now()}.md`);
    await fs.copyFile(base, dest);
    return;
  }
  const base = opts.mergeIntoCwd ? (opts.cwd ?? process.cwd()) : targetDir;

  if (t.type === "local") {
    if (!t.localPath) {
      throw new Error(`Template '${t.name}' is missing a localPath.`);
    }
    await fs.ensureDir(base);
    await copyInto(base, t.localPath);
  } else if (t.type === "github" && t.repo) {
    const branchArgs = t.branch ? ["--branch", t.branch] : [];
    if (!opts.mergeIntoCwd) {
      await fs.ensureDir(path.dirname(targetDir));
      await execa(
        "git",
        ["clone", "--depth", "1", ...branchArgs, `https://github.com/${t.repo}.git`, targetDir],
        { stdio: "inherit" }
      );
    } else {
      const tmp = path.join(process.cwd(), `.speckit-tpl-${Date.now()}`);
      await execa(
        "git",
        ["clone", "--depth", "1", ...branchArgs, `https://github.com/${t.repo}.git`, tmp],
        { stdio: "inherit" }
      );
      await copyInto(base, tmp);
      await fs.remove(tmp);
    }
  } else {
    throw new Error(`Unsupported template type: ${t.type}`);
  }

  const varsPath = t.varsFile ? path.join(base, t.varsFile) : undefined;
  let vars: Record<string,string> = {};
  if (opts.promptVars && varsPath && await fs.pathExists(varsPath)) {
    const json = await fs.readJson(varsPath);
    const ask = opts.prompt ?? defaultPrompt;
    for (const [key, meta] of Object.entries<any>(json)) {
      const def = typeof meta === "object" ? meta.default ?? "" : "";
      const defaultValue = typeof def === "string" ? def : String(def ?? "");
      const promptText = typeof meta === "object" ? (meta.prompt || key) : key;
      vars[key] = await ask({
        key,
        prompt: promptText,
        defaultValue,
        meta,
      });
    }
    await applyVars(base, vars);
  }
  if (opts.runPostInit && t.postInit?.length) {
    for (const cmd of t.postInit) {
      const trimmed = cmd.trim();
      if (!trimmed) continue;
      const [bin, ...args] = trimmed.split(/\s+/);
      const commandLabel = [bin, ...args].join(" ");
      if (!opts.onPostInitEvent) {
        await execa(bin, args, { cwd: base, stdio: "inherit" });
        continue;
      }
      opts.onPostInitEvent({ type: "start", command: commandLabel });
      try {
        const child = execa(bin, args, { cwd: base });
        child.stdout?.on("data", chunk => {
          opts.onPostInitEvent?.({ type: "stdout", command: commandLabel, data: chunk.toString() });
        });
        child.stderr?.on("data", chunk => {
          opts.onPostInitEvent?.({ type: "stderr", command: commandLabel, data: chunk.toString() });
        });
        await child;
        opts.onPostInitEvent({ type: "exit", command: commandLabel, code: child.exitCode ?? 0 });
      } catch (error) {
        opts.onPostInitEvent({ type: "error", command: commandLabel, error });
        throw error;
      }
    }
  }
}

async function copyInto(dst: string, src: string) {
  const files = await globby(["**/*", "!**/.git/**"], { cwd: src, dot: true });
  for (const f of files) {
    await fs.copy(path.join(src, f), path.join(dst, f), { overwrite: true });
  }
}

async function applyVars(base: string, vars: Record<string,string>) {
  const files = await globby(["**/*", "!**/.git/**", "!node_modules/**", "!dist/**"], { cwd: base, dot: true });
  for (const rel of files) {
    const fp = path.join(base, rel);
    if ((await fs.stat(fp)).isDirectory()) continue;
    const buf = await fs.readFile(fp);
    if (buf.length > 2_000_000) continue;
    const text = buf.toString("utf8");
    if (!text) continue;
    const replaced = text.replace(/\{\{([A-Z0-9_\-]+)\}\}/g, (_match, key: string) => vars[key] ?? `{{${key}}}`);
    if (replaced !== text) await fs.writeFile(fp, replaced, "utf8");
  }
}

async function defaultPrompt(info: TemplateVarPrompt): Promise<string> {
  const { input } = await import("@inquirer/prompts");
  return input({ message: info.prompt, default: info.defaultValue });
}
