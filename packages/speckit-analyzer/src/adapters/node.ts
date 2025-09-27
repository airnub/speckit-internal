import { promises as fs } from "node:fs";
import path from "node:path";

import type { FailureRule, RawLogSource } from "../types.js";
import { parseFailureRules } from "../rules.js";

export interface FileLogSourceOptions {
  id?: string;
  encoding?: BufferEncoding;
  format?: RawLogSource["format"];
}

export async function createFileLogSource(
  filePath: string,
  options: FileLogSourceOptions = {}
): Promise<RawLogSource> {
  const raw = await fs.readFile(filePath, { encoding: options.encoding ?? "utf8" });
  return {
    id: options.id ?? filePath,
    content: raw,
    format: options.format,
  };
}

export async function loadLogSourcesFromFiles(
  paths: string[],
  options: FileLogSourceOptions = {}
): Promise<RawLogSource[]> {
  return Promise.all(paths.map((filePath) => createFileLogSource(filePath, { ...options, id: options.id ?? filePath })));
}

export async function loadFailureRulesFromFs(
  rootDir: string,
  artifactDir?: string
): Promise<FailureRule[]> {
  const baseDir = artifactDir ?? path.join(rootDir, ".speckit");
  const rulesPath = path.join(baseDir, "failure-rules.yaml");
  try {
    const raw = await fs.readFile(rulesPath, "utf8");
    return parseFailureRules(raw);
  } catch (error) {
    console.warn(`[analyzer:node] Unable to load failure rules from ${rulesPath}: ${(error as Error).message}`);
    return [];
  }
}
