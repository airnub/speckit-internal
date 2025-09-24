import envPaths from "env-paths";
import fs from "fs-extra";
import path from "node:path";
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
      "gpt-5-codex",
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
  repo: { mode: "local", branch: "main", specRoot: "docs/specs" },
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
  const {
    config: sanitizedConfig,
    openaiModels,
    githubModels,
    changed
  } = normalizeConfig(raw);

  const merged: SpeckitConfig = {
    ...DEFAULTS,
    ...sanitizedConfig,
    ai: { ...DEFAULTS.ai, ...(sanitizedConfig.ai ?? {}) },
    analytics: { ...DEFAULTS.analytics, ...(sanitizedConfig.analytics ?? {}) },
    openai: { ...DEFAULTS.openai, ...(sanitizedConfig.openai ?? {}) },
    github: { ...DEFAULTS.github, ...(sanitizedConfig.github ?? {}) },
    repo: { ...DEFAULTS.repo, ...(sanitizedConfig.repo ?? {}) },
    workspaces: { ...DEFAULTS.workspaces, ...(sanitizedConfig.workspaces ?? {}) }
  };

  if (Array.isArray(openaiModels)) {
    merged.openai = { ...(merged.openai ?? {}), models: openaiModels };
  }
  if (Array.isArray(githubModels)) {
    merged.github = { ...(merged.github ?? {}), models: githubModels };
  }

  if (changed) {
    const toSave: Record<string, any> = { ...sanitizedConfig };
    if (openaiModels !== undefined) {
      toSave.openaiModels = openaiModels;
    }
    if (githubModels !== undefined) {
      toSave.githubModels = githubModels;
    }
    await fs.writeJson(configPath, toSave, { spaces: 2, mode: CONFIG_FILE_MODE });
    await enforceConfigPermissions();
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

type RawConfig = SpeckitConfig & {
  openaiModels?: unknown;
  githubModels?: unknown;
  [key: string]: unknown;
};

function normalizeConfig(raw: unknown): {
  config: SpeckitConfig;
  openaiModels?: string[];
  githubModels?: string[];
  changed: boolean;
} {
  if (!isPlainObject(raw)) {
    return { config: DEFAULTS, changed: false };
  }

  const openaiModels = Array.isArray(raw.openaiModels) ? [...raw.openaiModels] : undefined;
  const githubModels = Array.isArray(raw.githubModels) ? [...raw.githubModels] : undefined;

  const configData: Record<string, any> = { ...(raw as RawConfig) };
  delete configData.openaiModels;
  delete configData.githubModels;

  const legacyLocalPath = detectLegacyFirstRunLocalPath(raw);
  const repoInput = isPlainObject(configData.repo) ? { ...configData.repo } : {};
  const { repo: sanitizedRepo, changed } = sanitizeRepoLocalPath(repoInput, legacyLocalPath);
  configData.repo = sanitizedRepo;

  return {
    config: configData as SpeckitConfig,
    openaiModels,
    githubModels,
    changed
  };
}

function sanitizeRepoLocalPath(
  repo: Record<string, any>,
  legacyLocalPath: string | null
): { repo: SpeckitConfig["repo"]; changed: boolean } {
  const result: Record<string, any> = { ...repo };
  const rawLocalPath = result.localPath;
  const trimmedLocalPath = typeof rawLocalPath === "string" ? rawLocalPath.trim() : "";
  const normalizedLocalPath = trimmedLocalPath ? path.resolve(trimmedLocalPath) : null;
  const normalizedLegacy = legacyLocalPath ? path.resolve(legacyLocalPath) : null;

  const shouldDropLocalPath =
    !trimmedLocalPath ||
    (normalizedLegacy && normalizedLocalPath && normalizedLocalPath === normalizedLegacy);

  let changed = false;
  if (shouldDropLocalPath) {
    if ("localPath" in result) {
      delete result.localPath;
      if (rawLocalPath !== undefined) {
        changed = true;
      }
    }
  } else if (result.localPath !== trimmedLocalPath) {
    result.localPath = trimmedLocalPath;
    changed = true;
  }

  return { repo: result as SpeckitConfig["repo"], changed };
}

function detectLegacyFirstRunLocalPath(raw: unknown): string | null {
  if (!isPlainObject(raw)) return null;
  const repo = raw.repo;
  if (!isPlainObject(repo)) return null;
  if (typeof repo.localPath !== "string") return null;
  const trimmedLocalPath = repo.localPath.trim();
  if (!trimmedLocalPath) return null;

  const allowedRepoKeys = new Set(["mode", "localPath", "branch", "specRoot"]);
  for (const key of Object.keys(repo)) {
    if (!allowedRepoKeys.has(key) && repo[key] !== undefined) {
      return null;
    }
  }

  if ((repo.mode ?? DEFAULTS.repo.mode) !== DEFAULTS.repo.mode) return null;
  if ((repo.branch ?? DEFAULTS.repo.branch) !== DEFAULTS.repo.branch) return null;
  if ((repo.specRoot ?? DEFAULTS.repo.specRoot) !== DEFAULTS.repo.specRoot) return null;

  const allowedTopKeys = new Set([
    "ai",
    "analytics",
    "provider",
    "openai",
    "github",
    "repo",
    "workspaces",
    "recent"
  ]);
  for (const key of Object.keys(raw)) {
    if (!allowedTopKeys.has(key) && (raw as Record<string, unknown>)[key] !== undefined) {
      return null;
    }
  }

  if (!sectionMatches(raw.ai, DEFAULTS.ai)) return null;
  if (!sectionMatches(raw.analytics, DEFAULTS.analytics)) return null;

  const provider = (raw as Record<string, unknown>).provider ?? DEFAULTS.provider;
  if (provider !== DEFAULTS.provider) return null;

  if (!sectionMatches(raw.openai, DEFAULTS.openai)) return null;
  if (!sectionMatches(raw.github, DEFAULTS.github)) return null;
  if (!sectionMatches(raw.workspaces, DEFAULTS.workspaces)) return null;

  const recent = (raw as Record<string, unknown>).recent;
  if (recent !== undefined) {
    if (!Array.isArray(recent) || recent.length !== 0) {
      return null;
    }
  } else if (Array.isArray(DEFAULTS.recent) && DEFAULTS.recent.length !== 0) {
    return null;
  }

  return path.resolve(trimmedLocalPath);
}

function sectionMatches(value: unknown, expected: unknown): boolean {
  if (expected === undefined) {
    return value === undefined;
  }
  if (value === undefined) {
    return false;
  }
  return deepEqual(value, expected);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const aEntries = Object.entries(a).filter(([, value]) => value !== undefined);
    const bEntries = Object.entries(b).filter(([, value]) => value !== undefined);
    if (aEntries.length !== bEntries.length) return false;
    const bMap = new Map(bEntries);
    for (const [key, value] of aEntries) {
      if (!bMap.has(key)) return false;
      if (!deepEqual(value, bMap.get(key))) return false;
    }
    return true;
  }
  return false;
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
