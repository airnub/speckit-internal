import { input } from "@inquirer/prompts";
import { TemplateEntry, applyTemplateVariables, parseTemplateCommand } from "@speckit/core";
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
  if (t.type === "github" && t.repo) {
    if (!opts.mergeIntoCwd) {
      await fs.ensureDir(path.dirname(targetDir));
      await execa("git", ["clone", "--depth", "1", "--branch", t.branch || "main", `https://github.com/${t.repo}.git`, targetDir], { stdio: "inherit" });
    } else {
      const tmp = path.join(process.cwd(), `.speckit-tpl-${Date.now()}`);
      await execa("git", ["clone", "--depth", "1", "--branch", t.branch || "main", `https://github.com/${t.repo}.git`, tmp], { stdio: "inherit" });
      await copyInto(process.cwd(), tmp);
      await fs.remove(tmp);
    }
    const base = opts.mergeIntoCwd ? process.cwd() : targetDir;
    const varsPath = t.varsFile ? path.join(base, t.varsFile) : undefined;
    let vars: Record<string, string> = {};
    if (opts.promptVars && varsPath && await fs.pathExists(varsPath)) {
      const json = await fs.readJson(varsPath);
      for (const [key, meta] of Object.entries<any>(json)) {
        const def = typeof meta === "object" ? meta.default ?? "" : "";
        const prompt = typeof meta === "object" ? (meta.prompt || key) : key;
        vars[key] = await input({ message: prompt, default: def });
      }
      await applyTemplateVariables(base, vars);
    }
    if (opts.runPostInit && t.postInit?.length) {
      for (const cmd of t.postInit) {
        const parsed = parseTemplateCommand(cmd);
        if (!parsed) continue;
        const { bin, args } = parsed;
        await execa(bin, args, { cwd: base, stdio: "inherit" });
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
