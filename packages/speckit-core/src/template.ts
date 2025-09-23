import fs from "fs-extra";
import path from "node:path";
import { globby } from "globby";

export type TemplateVarPrompt = {
  key: string;
  prompt: string;
  defaultValue: string;
};

export type TemplateApplyResult = {
  missingKeys: string[];
  replacedFiles: number;
};

export type TemplatePostInitExecutor = (bin: string, args: string[], cwd: string) => Promise<string | void>;

export type TemplatePostInitResult = {
  command: string;
  args: string[];
  output?: string;
};

export type TemplatePostInitProgressHandler = (result: TemplatePostInitResult) => void | Promise<void>;

export function parseTemplateVars(data: unknown): TemplateVarPrompt[] {
  if (!data || typeof data !== "object") return [];
  const entries = Object.entries(data as Record<string, any>);
  return entries.map(([key, meta]) => {
    if (meta && typeof meta === "object") {
      const prompt = typeof meta.prompt === "string" && meta.prompt.trim().length > 0
        ? meta.prompt
        : key;
      const def = meta.default != null ? String(meta.default) : "";
      return { key, prompt, defaultValue: def };
    }
    return { key, prompt: key, defaultValue: "" };
  });
}

export async function applyTemplateVars(baseDir: string, vars: Record<string, string>): Promise<TemplateApplyResult> {
  const files = await globby(["**/*", "!**/.git/**", "!node_modules/**", "!dist/**"], { cwd: baseDir, dot: true });
  const missing = new Set<string>();
  let replacedFiles = 0;
  for (const rel of files) {
    const filePath = path.join(baseDir, rel);
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) continue;
    if (stat.size > 2_000_000) continue;
    const buf = await fs.readFile(filePath);
    if (buf.length === 0) continue;
    const text = buf.toString("utf8");
    let changed = false;
    const replaced = text.replace(/\{\{([A-Z0-9_\-]+)\}\}/g, (_match: string, key: string) => {
      if (Object.prototype.hasOwnProperty.call(vars, key)) {
        changed = true;
        return vars[key] ?? "";
      }
      missing.add(key);
      return _match;
    });
    if (changed) {
      await fs.writeFile(filePath, replaced, "utf8");
      replacedFiles += 1;
    }
  }
  return { missingKeys: Array.from(missing).sort(), replacedFiles };
}

export async function runTemplatePostInit(
  cwd: string,
  commands: string[],
  executor: TemplatePostInitExecutor,
  onProgress?: TemplatePostInitProgressHandler
): Promise<TemplatePostInitResult[]> {
  const results: TemplatePostInitResult[] = [];
  for (const command of commands) {
    if (!command || !command.trim()) continue;
    const parts = splitCommand(command);
    if (parts.length === 0) continue;
    const [bin, ...args] = parts;
    const output = await executor(bin, args, cwd);
    const result: TemplatePostInitResult = {
      command,
      args,
      output: output == null ? undefined : String(output)
    };
    results.push(result);
    if (onProgress) {
      await onProgress(result);
    }
  }
  return results;
}

function splitCommand(command: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inQuote: string | null = null;
  let escape = false;
  for (let i = 0; i < command.length; i += 1) {
    const char = command[i];
    if (escape) {
      current += char;
      escape = false;
      continue;
    }
    if (char === "\\") {
      escape = true;
      continue;
    }
    if (inQuote) {
      if (char === inQuote) {
        inQuote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === "\"" || char === "'") {
      inQuote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        parts.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current) parts.push(current);
  return parts;
}
