import envPaths from "env-paths";
import fs from "fs-extra";
import type { SpeckitConfig } from "@speckit/core";

const paths = envPaths("spec-studio");
const configPath = `${paths.config}/config.json`;

const CONFIG_FILE_MODE = 0o600; // Restrict config file permissions to protect stored secrets.

const DEFAULTS: SpeckitConfig = {
  ai: { enabled: false },
  analytics: { enabled: false },
  provider: "openai",
  openai: {
    model: "gpt-5-2025-08-07",
    models: [
      "gpt-5-2025-08-07",
      "gpt-5-mini-2025-08-07",
      "gpt-5-nano-2025-08-07",
      "gpt-4.1-2025-04-14",
      "codex-mini-latest"
    ]
  },
  github: {
    model: "openai/gpt-5",
    endpoint: "https://models.inference.ai.azure.com",
    models: [
      "openai/gpt-5",
      "openai/gpt-5-mini",
      "openai/gpt-5-nano",
      "openai/gpt-5-chat",
      "openai/gpt-4.1",
      "openai/gpt-4.1-nano",
      "openai/gpt-4.1-mini"
    ]
  },
  repo: { mode: "local", localPath: process.cwd(), branch: "main", specRoot: "docs/specs" },
  workspaces: { root: `${paths.cache}/speckit/workspaces` },
  recent: []
};

export async function loadConfig(): Promise<SpeckitConfig> {
  await fs.ensureDir(paths.config);
  if (!(await fs.pathExists(configPath))) {
    await fs.writeJson(configPath, DEFAULTS, { spaces: 2, mode: CONFIG_FILE_MODE });
    await enforceConfigPermissions();
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
  await fs.writeJson(configPath, rest, { spaces: 2, mode: CONFIG_FILE_MODE });
  await enforceConfigPermissions();
}

async function enforceConfigPermissions(): Promise<void> {
  try {
    await fs.chmod(configPath, CONFIG_FILE_MODE);
  } catch {
    // Ignore errors on platforms that do not support chmod for this file.
  }
}
