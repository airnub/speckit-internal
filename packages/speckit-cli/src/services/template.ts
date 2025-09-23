import { input as inquirerInput } from "@inquirer/prompts";
import { TemplateEntry } from "@speckit/core";
import { execa } from "execa";
import fs from "fs-extra";
import path from "node:path";
import { globby } from "globby";

type UseOptions = {
  mergeIntoCwd: boolean;
  promptVars: boolean;
  runPostInit: boolean;
  promptFn?: TemplatePromptHandler;
  providedVars?: Record<string, string>;
  onPostInitEvent?: TemplatePostInitListener;
};
type TemplateManifest = { varsFile?: string };

type InputPrompt = typeof inquirerInput;

let promptInput: InputPrompt = inquirerInput;

export type TemplateVarPrompt = {
  key: string;
  prompt: string;
  defaultValue: string;
};

export type TemplatePromptHandler = (prompt: TemplateVarPrompt) => Promise<string>;

export type TemplatePostInitEvent =
  | { type: "start"; command: string; cwd: string }
  | { type: "stdout"; command: string; data: string }
  | { type: "stderr"; command: string; data: string }
  | { type: "exit"; command: string; code: number | null; signal: NodeJS.Signals | null }
  | { type: "error"; command: string; error: unknown };

type TemplatePostInitListener = (event: TemplatePostInitEvent) => void | Promise<void>;

export function __setTemplatePromptInput(fn: InputPrompt) {
  promptInput = fn;
}

export function __resetTemplatePromptInput() {
  promptInput = inquirerInput;
}

export async function useTemplateIntoDir(t: TemplateEntry, targetDir: string, opts: UseOptions) {
  if (t.type === "blank") {
    const specRoot = t.specRoot || "docs/specs";
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
  const vars: Record<string, string> = { ...(opts.providedVars || {}) };

  if (varsPath && (opts.promptVars || Object.keys(vars).length > 0) && (await fs.pathExists(varsPath))) {
    const prompts = await readTemplatePrompts(varsPath);
    if (opts.promptVars) {
      const handler: TemplatePromptHandler =
        opts.promptFn ?? (async prompt => promptInput({ message: prompt.prompt, default: prompt.defaultValue }));
      for (const prompt of prompts) {
        if (vars[prompt.key] != null) continue;
        vars[prompt.key] = await handler(prompt);
      }
    }
  }

  if (Object.keys(vars).length > 0) {
    await applyVars(base, vars);
  }

  if (opts.runPostInit && t.postInit?.length) {
    for (const cmd of t.postInit) {
      await runPostInitCommand(base, cmd, opts.onPostInitEvent);
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

async function readTemplatePrompts(varsPath: string): Promise<TemplateVarPrompt[]> {
  const json = await fs.readJson(varsPath);
  const entries: TemplateVarPrompt[] = [];
  for (const [key, meta] of Object.entries<any>(json)) {
    entries.push(normalizeVarMeta(key, meta));
  }
  return entries;
}

function normalizeVarMeta(key: string, meta: any): TemplateVarPrompt {
  if (typeof meta !== "object" || meta === null) {
    return { key, prompt: key, defaultValue: "" };
  }
  const prompt = typeof meta.prompt === "string" && meta.prompt.trim().length > 0
    ? meta.prompt
    : key;
  const defaultRaw = meta.default;
  const defaultValue = defaultRaw == null ? "" : String(defaultRaw);
  return { key, prompt, defaultValue };
}

async function runPostInitCommand(base: string, command: string, emit?: TemplatePostInitListener) {
  const parts = command.split(" ").filter(Boolean);
  if (parts.length === 0) {
    return;
  }
  const [bin, ...args] = parts;

  if (!emit) {
    await execa(bin, args, { cwd: base, stdio: "inherit" });
    return;
  }

  await emit({ type: "start", command, cwd: base });
  const child = execa(bin, args, { cwd: base });

  child.stdout?.on("data", chunk => {
    const text = toText(chunk);
    if (text) {
      void emit({ type: "stdout", command, data: text });
    }
  });

  child.stderr?.on("data", chunk => {
    const text = toText(chunk);
    if (text) {
      void emit({ type: "stderr", command, data: text });
    }
  });

  try {
    const result = await child;
    await emit({
      type: "exit",
      command,
      code: result.exitCode ?? 0,
      signal: result.signal ?? null,
    });
  } catch (error: any) {
    if (error?.stdout) {
      const text = toText(error.stdout);
      if (text) {
        await emit({ type: "stdout", command, data: text });
      }
    }
    if (error?.stderr) {
      const text = toText(error.stderr);
      if (text) {
        await emit({ type: "stderr", command, data: text });
      }
    }
    await emit({ type: "error", command, error });
    throw error;
  }
}

function toText(value: any): string {
  if (typeof value === "string") {
    return value;
  }
  if (Buffer.isBuffer(value)) {
    return value.toString();
  }
  if (value == null) {
    return "";
  }
  return String(value);
}
