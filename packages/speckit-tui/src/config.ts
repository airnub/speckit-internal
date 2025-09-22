import envPaths from "env-paths";
import fs from "fs-extra";
import type { SpeckitConfig } from "@speckit/core";

const paths = envPaths("spec-studio");
const configPath = `${paths.config}/config.json`;

const DEFAULTS: SpeckitConfig = {
  ai: { enabled: false },
  analytics: { enabled: false },
  provider: "openai",
  openai: {
    model: "gpt-4o-mini",
    models: [
      "gpt-4o-mini",
      "gpt-4o",
      "o4-mini",
      "gpt-4.1",
      "gpt-4o-realtime-preview"
    ]
  },
  github: {
    model: "openai/gpt-4.1-mini",
    endpoint: "https://models.inference.ai.azure.com",
    models: [
      "openai/gpt-4.1-mini",
      "openai/gpt-4.1",
      "openai/gpt-4.1-nano",
      "openai/gpt-4o-mini",
      "openai/gpt-4o"
    ]
  },
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
  const raw = await fs.readJson(configPath);
  const { openaiModels, githubModels, ...cfg } = raw as SpeckitConfig & {
    openaiModels?: string[];
    githubModels?: string[];
  };
  const merged: SpeckitConfig = {
    ...DEFAULTS,
    ...cfg,
    ai: { ...DEFAULTS.ai, ...(cfg.ai ?? {}) },
    analytics: { ...DEFAULTS.analytics, ...(cfg.analytics ?? {}) },
    openai: { ...DEFAULTS.openai, ...(cfg.openai ?? {}) },
    github: { ...DEFAULTS.github, ...(cfg.github ?? {}) },
    repo: { ...DEFAULTS.repo, ...(cfg.repo ?? {}) },
    workspaces: { ...DEFAULTS.workspaces, ...(cfg.workspaces ?? {}) }
  };
  if (Array.isArray(openaiModels)) {
    merged.openai = { ...(merged.openai ?? {}), models: openaiModels };
  }
  if (Array.isArray(githubModels)) {
    merged.github = { ...(merged.github ?? {}), models: githubModels };
  }
  return merged;
}

export async function saveConfig(cfg: SpeckitConfig): Promise<void> {
  await fs.ensureDir(paths.config);
  const { openaiModels: _openaiModels, githubModels: _githubModels, ...rest } = cfg as SpeckitConfig & {
    openaiModels?: string[];
    githubModels?: string[];
  };
  await fs.writeJson(configPath, rest, { spaces: 2 });
}
