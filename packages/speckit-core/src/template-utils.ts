import fs from "fs-extra";
import path from "node:path";
import { globby } from "globby";

const TEMPLATE_FILE_GLOBS = ["**/*", "!**/.git/**", "!node_modules/**", "!dist/**"];
const MAX_TEMPLATE_FILE_BYTES = 2_000_000;
const PLACEHOLDER_PATTERN = /\{\{([A-Z0-9_\-]+)\}\}/g;

async function listTemplateFiles(baseDir: string): Promise<string[]> {
  return globby(TEMPLATE_FILE_GLOBS, { cwd: baseDir, dot: true });
}

export async function applyTemplateVariables(baseDir: string, vars: Record<string, string>) {
  const files = await listTemplateFiles(baseDir);
  for (const rel of files) {
    const filePath = path.join(baseDir, rel);
    const stats = await fs.stat(filePath);
    if (stats.isDirectory()) continue;
    if (stats.size > MAX_TEMPLATE_FILE_BYTES) continue;
    const buffer = await fs.readFile(filePath);
    if (buffer.length === 0) continue;
    const text = buffer.toString("utf8");
    if (!text) continue;
    const replaced = text.replace(PLACEHOLDER_PATTERN, (_match: string, key: string) => {
      const value = vars[key];
      return value == null ? `{{${key}}}` : value;
    });
    if (replaced !== text) {
      await fs.writeFile(filePath, replaced, "utf8");
    }
  }
}

export async function findTemplatePlaceholders(baseDir: string): Promise<string[]> {
  const files = await listTemplateFiles(baseDir);
  const placeholders = new Set<string>();
  for (const rel of files) {
    const filePath = path.join(baseDir, rel);
    const stats = await fs.stat(filePath);
    if (stats.isDirectory()) continue;
    if (stats.size > MAX_TEMPLATE_FILE_BYTES) continue;
    const buffer = await fs.readFile(filePath);
    if (buffer.length === 0) continue;
    const text = buffer.toString("utf8");
    if (!text) continue;
    const matcher = /\{\{([A-Z0-9_\-]+)\}\}/g;
    let match: RegExpExecArray | null;
    while ((match = matcher.exec(text)) !== null) {
      placeholders.add(match[1]);
    }
  }
  return Array.from(placeholders).sort();
}

export function parseTemplateCommand(command: string): { bin: string; args: string[] } | null {
  if (!command) return null;
  const trimmed = command.trim();
  if (!trimmed) return null;
  const tokens: string[] = [];
  let current = "";
  let inQuotes = false;
  let quoteChar = "";
  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];
    if (inQuotes) {
      if (char === quoteChar) {
        inQuotes = false;
      } else if (char === "\\" && i + 1 < trimmed.length && trimmed[i + 1] === quoteChar) {
        current += quoteChar;
        i++;
      } else {
        current += char;
      }
    } else {
      if (char === "\"" || char === "'") {
        inQuotes = true;
        quoteChar = char;
      } else if (/\s/.test(char)) {
        if (current) {
          tokens.push(current);
          current = "";
        }
      } else {
        current += char;
      }
    }
  }
  if (current) {
    tokens.push(current);
  }
  if (tokens.length === 0) return null;
  return { bin: tokens[0], args: tokens.slice(1) };
}
