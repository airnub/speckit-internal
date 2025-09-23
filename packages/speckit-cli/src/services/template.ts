import { input } from "@inquirer/prompts";
import { TemplateEntry } from "@speckit/core";
import { execa } from "execa";
import fs from "fs-extra";
import path from "node:path";
import { globby } from "globby";

type UseOptions = { mergeIntoCwd: boolean; promptVars: boolean; runPostInit: boolean };

export async function useTemplateIntoDir(t: TemplateEntry, targetDir: string, opts: UseOptions) {
  if (t.type === "blank") {
    const specsDir = path.join(targetDir, "docs/specs");
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
  const base = opts.mergeIntoCwd ? process.cwd() : targetDir;

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
    for (const [key, meta] of Object.entries<any>(json)) {
      const def = typeof meta === "object" ? meta.default ?? "" : "";
      const prompt = typeof meta === "object" ? (meta.prompt || key) : key;
      vars[key] = await input({ message: prompt, default: def });
    }
    await applyVars(base, vars);
  }
  if (opts.runPostInit && t.postInit?.length) {
    for (const cmd of t.postInit) {
      const [bin, ...args] = cmd.split(" ");
      await execa(bin, args, { cwd: base, stdio: "inherit" });
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
