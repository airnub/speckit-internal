import { input as inquirerInput } from "@inquirer/prompts";
import { TemplateEntry } from "@speckit/core";
import { execa } from "execa";
import fs from "fs-extra";
import path from "node:path";
import { globby } from "globby";
import stringArgv from "string-argv";

type InputPrompt = typeof inquirerInput;

export type PostInitCommandEvent = {
  command: string;
  bin: string;
  args: string[];
  cwd: string;
  result: {
    ok: boolean;
    stdout: string;
    stderr: string;
    error?: unknown;
  };
};

type UseOptions = {
  mergeIntoCwd: boolean;
  promptVars: boolean;
  runPostInit: boolean;
  promptInput?: InputPrompt;
  onPostInitCommand?: (event: PostInitCommandEvent) => Promise<void> | void;
};

type TemplateManifest = { varsFile?: string };

let promptInput: InputPrompt = inquirerInput;

export function __setTemplatePromptInput(fn: InputPrompt) {
  promptInput = fn;
}

export function __resetTemplatePromptInput() {
  promptInput = inquirerInput;
}

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

  const varsFile = await selectVarsFile(base, t.varsFile);
  const varsPath = varsFile ? path.join(base, varsFile) : undefined;
  let vars: Record<string,string> = {};
  if (opts.promptVars && varsPath && await fs.pathExists(varsPath)) {
    const json = await fs.readJson(varsPath);
    const ask = opts.promptInput ?? promptInput;
    for (const [key, meta] of Object.entries<any>(json)) {
      const def = typeof meta === "object" ? meta.default ?? "" : "";
      const prompt = typeof meta === "object" ? (meta.prompt || key) : key;
      vars[key] = await ask({ message: prompt, default: def });
    }
    await applyVars(base, vars);
  }
  if (opts.runPostInit && t.postInit?.length) {
    for (const cmd of t.postInit) {
      const [bin, ...args] = stringArgv(cmd);
      if (!bin) continue;
      if (opts.onPostInitCommand) {
        try {
          const { stdout = "", stderr = "" } = await execa(bin, args, { cwd: base });
          await opts.onPostInitCommand({
            command: cmd,
            bin,
            args,
            cwd: base,
            result: { ok: true, stdout, stderr }
          });
        } catch (error: any) {
          await opts.onPostInitCommand({
            command: cmd,
            bin,
            args,
            cwd: base,
            result: {
              ok: false,
              stdout: error?.stdout ?? "",
              stderr: error?.stderr ?? "",
              error
            }
          });
          throw error;
        }
      } else {
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

async function selectVarsFile(base: string, explicit?: string): Promise<string | undefined> {
  if (explicit) {
    const explicitPath = path.join(base, explicit);
    if (await fs.pathExists(explicitPath)) {
      return explicit;
    }
  }

  const discovered = await discoverVarsFile(base);
  if (discovered) {
    return discovered;
  }

  return undefined;
}

async function discoverVarsFile(base: string): Promise<string | undefined> {
  const manifest = await readTemplateManifest(base);
  const manifestVars = typeof manifest?.varsFile === "string" ? manifest.varsFile : undefined;
  if (manifestVars) {
    const manifestPath = path.join(base, manifestVars);
    if (await fs.pathExists(manifestPath)) {
      return manifestVars;
    }
  }

  const fallback = "template.vars.json";
  if (await fs.pathExists(path.join(base, fallback))) {
    return fallback;
  }

  return undefined;
}

async function readTemplateManifest(base: string): Promise<TemplateManifest | null> {
  const candidates = ["template.json", "template.config.json", "template.meta.json"];
  for (const file of candidates) {
    const full = path.join(base, file);
    if (await fs.pathExists(full)) {
      try {
        return await fs.readJson(full);
      } catch (error: any) {
        throw new Error(`Failed to parse ${full}: ${error?.message || error}`);
      }
    }
  }
  return null;
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
