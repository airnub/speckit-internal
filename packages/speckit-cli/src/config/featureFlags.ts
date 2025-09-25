import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";

export interface FeatureFlags {
  experimental: { enabled: boolean; features: Record<string, boolean> };
  modes: {
    classic: { experimental: false };
    secure: { experimental: boolean };
  };
}

export interface CliArgs {
  cwd?: string;
  experimental?: boolean;
  noExperimental?: boolean;
  experimentalFeatures?: Record<string, boolean> | string[] | string | null;
}

const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  experimental: { enabled: false, features: {} },
  modes: {
    classic: { experimental: false },
    secure: { experimental: true },
  },
};

const USER_CONFIG_PATH = path.join(os.homedir(), ".config", "speckit", "config.yaml");
const PROJECT_CONFIG_FILENAME = "speckit.config.yaml";

function cloneDefaults(): FeatureFlags {
  return {
    experimental: {
      enabled: DEFAULT_FEATURE_FLAGS.experimental.enabled,
      features: { ...DEFAULT_FEATURE_FLAGS.experimental.features },
    },
    modes: {
      classic: { ...DEFAULT_FEATURE_FLAGS.modes.classic },
      secure: { ...DEFAULT_FEATURE_FLAGS.modes.secure },
    },
  };
}

function parseBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;
    if (["1", "true", "t", "yes", "y", "on", "enable", "enabled"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "f", "no", "n", "off", "disable", "disabled"].includes(normalized)) {
      return false;
    }
  }
  return null;
}

function readYamlFile(filePath: string): any {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw.trim()) {
      return null;
    }
    return YAML.parse(raw);
  } catch {
    return null;
  }
}

function applyFeatureMap(target: Record<string, boolean>, source: unknown): void {
  if (!source || typeof source !== "object") {
    return;
  }
  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    const normalizedKey = typeof key === "string" ? key.trim() : String(key);
    if (!normalizedKey) continue;
    const parsed = parseBoolean(value);
    if (parsed === null) continue;
    target[normalizedKey] = parsed;
  }
}

function applyFeaturesList(target: Record<string, boolean>, value: string[] | string | null | undefined): void {
  if (!value) return;
  const list = Array.isArray(value)
    ? value.map(entry => (typeof entry === "string" ? entry : String(entry))).filter(Boolean)
    : String(value)
        .split(",")
        .map(entry => entry.trim())
        .filter(Boolean);
  for (const key of list) {
    target[key] = true;
  }
}

function mergeExperimentalFlags(flags: FeatureFlags, input: any): void {
  if (!input || typeof input !== "object") {
    return;
  }
  const enabled = parseBoolean((input as any).enabled);
  if (enabled !== null) {
    flags.experimental.enabled = enabled;
  }
  applyFeatureMap(flags.experimental.features, (input as any).features);
  if (input.modes && typeof input.modes === "object") {
    const modes = input.modes as Record<string, any>;
    if (modes.secure && typeof modes.secure === "object") {
      const secureExperimental = parseBoolean(modes.secure.experimental);
      if (secureExperimental !== null) {
        flags.modes.secure.experimental = secureExperimental;
      }
    }
  }
}

export function getFlags(cliArgs: CliArgs): FeatureFlags {
  const flags = cloneDefaults();
  const cwd = cliArgs.cwd ? path.resolve(cliArgs.cwd) : process.cwd();

  const userConfig = readYamlFile(USER_CONFIG_PATH);
  mergeExperimentalFlags(flags, userConfig?.settings?.experimental ?? userConfig?.experimental);

  const projectConfigPath = path.join(cwd, ".speckit", PROJECT_CONFIG_FILENAME);
  const projectConfig = readYamlFile(projectConfigPath);
  mergeExperimentalFlags(flags, projectConfig?.settings?.experimental ?? projectConfig?.experimental);

  const envExperimental = parseBoolean(process.env.SPECKIT_EXPERIMENTAL);
  if (envExperimental !== null) {
    flags.experimental.enabled = envExperimental;
  }
  applyFeaturesList(flags.experimental.features, process.env.SPECKIT_EXPERIMENTAL_FEATURES ?? null);

  if (cliArgs.experimental === true) {
    flags.experimental.enabled = true;
  }
  if (cliArgs.noExperimental === true) {
    flags.experimental.enabled = false;
  }
  applyFeaturesList(flags.experimental.features, cliArgs.experimentalFeatures ?? null);

  return flags;
}

export function isExperimentalEnabled(flags: FeatureFlags): boolean {
  return flags.experimental.enabled === true;
}

export function assertModeAllowed(mode: "classic" | "secure", flags: FeatureFlags): void {
  if (mode === "classic") {
    return;
  }
  if (flags.modes.secure.experimental && !isExperimentalEnabled(flags)) {
    const hint =
      "Secure mode is experimental. Enable experimental features with `--experimental`, " +
      "set SPECKIT_EXPERIMENTAL=1, or update settings.experimental.enabled to true.";
    throw new Error(hint);
  }
}

export { DEFAULT_FEATURE_FLAGS };
