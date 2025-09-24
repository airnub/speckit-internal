import { createHash } from "node:crypto";
import path from "node:path";
import fs from "fs-extra";
import { parse } from "yaml";

export type LoadedSpec = {
  raw: string;
  data: any;
};

export async function loadSpecYaml(repoRoot: string): Promise<LoadedSpec> {
  const specPath = path.join(repoRoot, ".speckit", "spec.yaml");
  const raw = await fs.readFile(specPath, "utf8");
  const data = parse(raw);
  return { raw, data };
}

export async function hashSpecYaml(repoRoot: string): Promise<string> {
  const specPath = path.join(repoRoot, ".speckit", "spec.yaml");
  const raw = await fs.readFile(specPath);
  const digest = createHash("sha256").update(raw).digest("hex");
  return `sha256:${digest}`;
}
