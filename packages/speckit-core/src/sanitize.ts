import { promises as fs } from "node:fs";
import path from "node:path";

import { globby } from "globby";

import type {
  RedactionExample,
  RedactionHit,
  SanitizeLogsOptions,
  SanitizeLogsResult,
  SanitizerPattern,
} from "./types.js";

const DEFAULT_INCLUDE = [
  "**/*.log",
  "**/*.txt",
  "**/*.md",
  "**/*.json",
  "**/*.jsonl",
  "**/*.ndjson",
  "**/*.yaml",
  "**/*.yml",
];

const DEFAULT_IGNORE = ["**/node_modules/**", "**/.git/**", "**/.speckit/**"];

const DEFAULT_PATTERNS: SanitizerPattern[] = [
  { pattern: /(sk-[a-z0-9]{20,})/gi, replacement: "[redacted-token]", description: "OpenAI-style API token" },
  { pattern: /(gh[pous]_[a-z0-9]{20,})/gi, replacement: "[redacted-token]", description: "GitHub token" },
  {
    pattern: /(eyJ[0-9a-zA-Z_-]{10,}\.[0-9a-zA-Z_-]{10,}\.[0-9a-zA-Z_-]{10,})/g,
    replacement: "[redacted-jwt]",
    description: "JWT token",
  },
  { pattern: /(sessionid=)[^;\s]+/gi, replacement: "$1[redacted]", description: "Session cookie" },
  { pattern: /(cookie:)[^\n]+/gi, replacement: "$1 [redacted-cookie]", description: "Cookie header" },
  { pattern: /(https?:\/\/[^\s]+:[^@\s]+@)/gi, replacement: "[redacted-url]", description: "Embedded credentials" },
];

const DEFAULT_MAX_EXAMPLES = 3;

function ensureGlobal(pattern: RegExp): RegExp {
  return pattern.global ? pattern : new RegExp(pattern.source, pattern.flags + "g");
}

function buildNewlineIndex(text: string): number[] {
  const index: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10 /* \n */) {
      index.push(i);
    }
  }
  return index;
}

function lineNumberAt(position: number, newlineIndex: number[]): number {
  let low = 0;
  let high = newlineIndex.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (newlineIndex[mid] < position) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low + 1;
}

function sanitizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function buildPreview(text: string, start: number, end: number, replacement: string): string {
  const before = sanitizeWhitespace(text.slice(Math.max(0, start - 16), start));
  const after = sanitizeWhitespace(text.slice(end, Math.min(text.length, end + 16)));
  const snippet = `${before} ${replacement} ${after}`.trim();
  return snippet || replacement;
}

interface PatternApplicationResult {
  redacted: string;
  hits: Omit<RedactionHit, "file">[];
  totalHits: number;
}

function applyPatterns(
  content: string,
  patterns: SanitizerPattern[],
  maxExamples: number
): PatternApplicationResult {
  let working = content;
  const collected: Omit<RedactionHit, "file">[] = [];
  let totalHits = 0;

  for (const entry of patterns) {
    const regex = ensureGlobal(entry.pattern);
    const matches = Array.from(working.matchAll(regex));
    if (matches.length === 0) continue;

    const newlineIndex = buildNewlineIndex(working);
    const examples: RedactionExample[] = [];
    for (const match of matches.slice(0, maxExamples)) {
      const index = match.index ?? 0;
      const line = lineNumberAt(index, newlineIndex);
      const preview = buildPreview(working, index, index + match[0].length, entry.replacement);
      examples.push({ line, preview });
    }

    collected.push({
      pattern: entry.description ?? entry.pattern.toString(),
      replacement: entry.replacement,
      count: matches.length,
      examples,
    });
    totalHits += matches.length;

    const replaceRegex = ensureGlobal(entry.pattern);
    working = working.replace(replaceRegex, entry.replacement);
  }

  return { redacted: working, hits: collected, totalHits };
}

async function resolveTarget(
  target: string,
  options: SanitizeLogsOptions
): Promise<string[]> {
  const cwd = options.cwd ?? process.cwd();
  const resolved = path.isAbsolute(target) ? target : path.join(cwd, target);
  try {
    const stats = await fs.stat(resolved);
    if (stats.isDirectory()) {
      return globby(options.include ?? DEFAULT_INCLUDE, {
        cwd: resolved,
        absolute: true,
        ignore: DEFAULT_IGNORE,
        onlyFiles: true,
      });
    }
    if (stats.isFile()) {
      return [resolved];
    }
  } catch (error) {
    // fall through to glob expansion below
  }
  return globby([target], {
    cwd,
    absolute: true,
    ignore: DEFAULT_IGNORE,
    onlyFiles: true,
  });
}

export function redactText(
  text: string,
  options: Pick<SanitizeLogsOptions, "patterns" | "maxExamplesPerFile"> = {}
): { redacted: string; totalHits: number; hits: Omit<RedactionHit, "file">[] } {
  const patterns = options.patterns ?? DEFAULT_PATTERNS;
  const maxExamples = options.maxExamplesPerFile ?? DEFAULT_MAX_EXAMPLES;
  return applyPatterns(text, patterns, maxExamples);
}

export const sanitizerPatterns = DEFAULT_PATTERNS.map((pattern) => pattern.pattern.source);

export async function sanitizeLogs(
  targets: string | string[],
  options: SanitizeLogsOptions = {}
): Promise<SanitizeLogsResult> {
  const entries = Array.isArray(targets) ? targets : [targets];
  const patterns = options.patterns ?? DEFAULT_PATTERNS;
  const maxExamples = options.maxExamplesPerFile ?? DEFAULT_MAX_EXAMPLES;
  const cwd = options.cwd ?? process.cwd();

  const files = new Set<string>();
  for (const entry of entries) {
    const resolved = await resolveTarget(entry, options);
    for (const file of resolved) {
      files.add(file);
    }
  }

  const hits: RedactionHit[] = [];
  const sanitizedFiles: string[] = [];
  let totalHits = 0;

  for (const file of files) {
    let content: string;
    try {
      content = await fs.readFile(file, "utf8");
    } catch (error) {
      console.warn(`[speckit:core] Unable to read ${path.relative(cwd, file)}: ${(error as Error).message}`);
      continue;
    }
    const result = applyPatterns(content, patterns, maxExamples);
    if (result.totalHits === 0) {
      continue;
    }

    if (!options.dryRun) {
      await fs.writeFile(file, result.redacted, "utf8");
    }

    totalHits += result.totalHits;
    const relative = path.isAbsolute(file) ? path.relative(cwd, file) : file;
    sanitizedFiles.push(relative);
    for (const hit of result.hits) {
      hits.push({ ...hit, file: relative });
    }
  }

  return { totalHits, hits, files: sanitizedFiles };
}

export { DEFAULT_PATTERNS as DEFAULT_SANITIZER_PATTERNS, DEFAULT_INCLUDE as DEFAULT_SANITIZER_GLOBS };
