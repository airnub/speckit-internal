import envPaths from "env-paths";
import fs from "fs-extra";
import type { SpeckitConfig } from "@speckit/core";

const paths = envPaths("spec-studio");
const configPath = `${paths.config}/config.json`;

const DEFAULTS: SpeckitConfig = {
  ai: { enabled: false },
  analytics: { enabled: false },
  provider: "openai",
  openai: { model: "gpt-4o-mini" },
  repo: { mode: "local", localPath: process.cwd(), branch: "main", specRoot: "docs/specs" },
  workspaces: { root: `${paths.cache}/speckit/workspaces` },
  recent: []
};

export async function loadConfig(): Promise<SpeckitConfig> {
  await fs.ensureDir(paths.config);
  if (!(await fs.pathExists(configPath))) {
    await fs.writeJson(configPath, DEFAULTS, { spaces: 2 });
    return DEFAULTS;
  }
  const cfg = await fs.readJson(configPath);
  return { ...DEFAULTS, ...cfg };
}

export async function saveConfig(cfg: SpeckitConfig): Promise<void> {
  await fs.ensureDir(paths.config);
  await fs.writeJson(configPath, cfg, { spaces: 2 });
}
