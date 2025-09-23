import { input } from "@inquirer/prompts";
import {
  TemplateEntry,
  TemplateVarPrompt,
  parseTemplateVars,
  applyTemplateVars,
  runTemplatePostInit
} from "@speckit/core";
import { execa } from "execa";
import fs from "fs-extra";
import path from "node:path";
import { globby } from "globby";

type UseOptions = { mergeIntoCwd: boolean; promptVars: boolean; runPostInit: boolean };

export async function useTemplateIntoDir(t: TemplateEntry, targetDir: string, opts: UseOptions) {
  if (t.type === "blank") {
    await fs.ensureDir(path.join(targetDir, "docs/specs"));
    const file = path.join(targetDir, "docs/specs/spec_" + Date.now() + ".md");
    await fs.outputFile(file, `---\ntitle: New Spec\nversion: 0.1.0\nstatus: draft\n---\n\n# Summary\n`);
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
    const vars: Record<string, string> = {};
    if (opts.promptVars && varsPath && await fs.pathExists(varsPath)) {
      const json = await fs.readJson(varsPath);
      const prompts: TemplateVarPrompt[] = parseTemplateVars(json);
      for (const prompt of prompts) {
        vars[prompt.key] = await input({ message: prompt.prompt, default: prompt.defaultValue });
      }
      await applyTemplateVars(base, vars);
    }
    if (opts.runPostInit && t.postInit?.length) {
      await runTemplatePostInit(base, t.postInit, async (bin, args, cwd) => {
        await execa(bin, args, { cwd, stdio: "inherit" });
      });
    }
  }
}

async function copyInto(dst: string, src: string) {
  const files = await globby(["**/*", "!**/.git/**"], { cwd: src, dot: true });
  for (const f of files) {
    await fs.copy(path.join(src, f), path.join(dst, f), { overwrite: true });
  }
}

