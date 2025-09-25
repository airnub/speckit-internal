import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";

import {
  createFrameworkRegistry,
  FrameworkRegistry,
  type FrameworkId,
  type FrameworkMeta,
  type PlanTier,
} from "@speckit/framework-registry";

export type Plan = PlanTier;

export interface EvaluationContext {
  userId?: string;
  orgId?: string;
  plan?: Plan;
  experimentalEnabled: boolean;
  region?: string;
  cohort?: string;
}

export interface EntitlementDecision {
  allowed: boolean;
  reason?: string;
}

export interface EntitlementProvider {
  isAllowed(capabilityKey: string, ctx: EvaluationContext): Promise<EntitlementDecision>;
}

export interface FeatureFlags {
  experimental: { enabled: boolean; features: Record<string, boolean> };
  modes: {
    classic: { experimental: false };
    secure: { experimental: boolean };
  };
  killswitches?: Record<string, boolean>;
}

export interface FeatureFlagOverrides {
  cwd?: string;
  experimental?: boolean;
  noExperimental?: boolean;
  experimentalFeatures?: Record<string, boolean> | string[] | string | null;
}

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  experimental: { enabled: false, features: {} },
  modes: {
    classic: { experimental: false },
    secure: { experimental: true },
  },
  killswitches: {},
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
    killswitches: DEFAULT_FEATURE_FLAGS.killswitches
      ? { ...DEFAULT_FEATURE_FLAGS.killswitches }
      : undefined,
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

function applyFeaturesList(
  target: Record<string, boolean>,
  value: string[] | string | Record<string, boolean> | null | undefined
): void {
  if (!value) return;
  if (!Array.isArray(value) && typeof value === "object") {
    applyFeatureMap(target, value);
    return;
  }
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
  if (input.killswitches && typeof input.killswitches === "object") {
    flags.killswitches = flags.killswitches ?? {};
    applyFeatureMap(flags.killswitches, input.killswitches);
  }
}

export function getFlags(overrides: FeatureFlagOverrides = {}): FeatureFlags {
  const flags = cloneDefaults();
  const cwd = overrides.cwd ? path.resolve(overrides.cwd) : process.cwd();

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

  if (overrides.experimental === true) {
    flags.experimental.enabled = true;
  }
  if (overrides.noExperimental === true) {
    flags.experimental.enabled = false;
  }
  applyFeaturesList(flags.experimental.features, overrides.experimentalFeatures ?? null);

  return flags;
}

export function isExperimentalEnabled(flags: FeatureFlags): boolean {
  return flags.experimental.enabled === true;
}

const PLAN_ORDER: Record<Plan, number> = {
  free: 0,
  pro: 1,
  enterprise: 2,
};

function planSatisfies(actual: Plan | undefined, required: Plan | undefined): boolean {
  if (!required) return true;
  const normalizedActual = actual ?? "free";
  return PLAN_ORDER[normalizedActual] >= PLAN_ORDER[required];
}

const FRAMEWORK_PREFIX = "framework.";

export class LocalEntitlements implements EntitlementProvider {
  constructor(private readonly registry: FrameworkRegistry, private readonly flags: FeatureFlags) {}

  async isAllowed(capabilityKey: string, ctx: EvaluationContext): Promise<EntitlementDecision> {
    return this.evaluateCapability(capabilityKey, ctx, new Set());
  }

  private evaluateCapability(
    capabilityKey: string,
    ctx: EvaluationContext,
    visited: Set<string>
  ): EntitlementDecision {
    if (visited.has(capabilityKey)) {
      return { allowed: false, reason: "Capability prerequisites are cyclical" };
    }
    visited.add(capabilityKey);

    try {
      if (this.flags.killswitches?.[capabilityKey] === true) {
        return { allowed: false, reason: "Capability disabled by kill switch" };
      }

      if (capabilityKey === "mode.classic") {
        return { allowed: true };
      }

      if (capabilityKey === "mode.secure") {
        if (this.flags.modes.secure.experimental && !ctx.experimentalEnabled) {
          return {
            allowed: false,
            reason:
              "Secure mode is experimental. Enable experimental features with `--experimental`, set SPECKIT_EXPERIMENTAL=1, or update settings.experimental.enabled to true.",
          };
        }
        return { allowed: true };
      }

      if (capabilityKey.startsWith(FRAMEWORK_PREFIX)) {
        const frameworkId = capabilityKey.slice(FRAMEWORK_PREFIX.length) as FrameworkId;
        const meta = this.registry.get(frameworkId);
        if (!meta) {
          return { allowed: false, reason: `Unknown framework: ${frameworkId}` };
        }
        return this.evaluateFramework(meta, ctx, visited, capabilityKey);
      }

      const experimentalFlag = this.flags.experimental.features[capabilityKey];
      if (experimentalFlag === false) {
        return { allowed: false, reason: `Capability ${capabilityKey} disabled` };
      }
      if (experimentalFlag === true && !ctx.experimentalEnabled) {
        return {
          allowed: false,
          reason: "Experimental features are disabled. Enable with --experimental or SPECKIT_EXPERIMENTAL=1.",
        };
      }

      return { allowed: true };
    } finally {
      visited.delete(capabilityKey);
    }
  }

  private evaluateFramework(
    meta: FrameworkMeta,
    ctx: EvaluationContext,
    visited: Set<string>,
    capabilityKey: string
  ): EntitlementDecision {
    const availability = meta.availability;
    const requiresExperimental = availability.requires?.experimental ?? (availability.status === "experimental");
    if (requiresExperimental && !ctx.experimentalEnabled) {
      return {
        allowed: false,
        reason: "Enable experimental with `--experimental` (or via SPECKIT_EXPERIMENTAL/config) to try these frameworks.",
      };
    }

    if (!planSatisfies(ctx.plan, availability.requires?.minPlan as Plan | undefined)) {
      const needed = availability.requires?.minPlan;
      return { allowed: false, reason: `${meta.title} requires ${needed} plan or higher.` };
    }

    if (availability.requires?.regionAllow?.length) {
      if (!ctx.region || !availability.requires.regionAllow.includes(ctx.region)) {
        return { allowed: false, reason: `${meta.title} unavailable in this region.` };
      }
    }

    if (availability.requires?.prerequisites?.length) {
      for (const prerequisite of availability.requires.prerequisites) {
        const decision = this.evaluateCapability(prerequisite, ctx, visited);
        if (!decision.allowed) {
          return {
            allowed: false,
            reason: decision.reason ?? `Prerequisite ${prerequisite} blocked for ${capabilityKey}.`,
          };
        }
      }
    }

    return { allowed: true };
  }
}

export function createLocalEntitlements(
  flags: FeatureFlags,
  registry: FrameworkRegistry = createFrameworkRegistry()
): LocalEntitlements {
  return new LocalEntitlements(registry, flags);
}

export function createEvaluationContext(
  flags: FeatureFlags,
  overrides: Partial<EvaluationContext> = {}
): EvaluationContext {
  return {
    userId: overrides.userId,
    orgId: overrides.orgId,
    plan: overrides.plan ?? "free",
    experimentalEnabled: overrides.experimentalEnabled ?? isExperimentalEnabled(flags),
    region: overrides.region,
    cohort: overrides.cohort,
  };
}

export async function assertModeAllowed(
  mode: "classic" | "secure",
  entitlements: EntitlementProvider,
  ctx: EvaluationContext
): Promise<void> {
  const capabilityKey = `mode.${mode}`;
  const decision = await entitlements.isAllowed(capabilityKey, ctx);
  if (!decision.allowed) {
    throw new Error(decision.reason ?? `Mode ${mode} is not allowed.`);
  }
}

export async function assertFrameworksAllowed(
  ids: FrameworkId[],
  registry: FrameworkRegistry,
  entitlements: EntitlementProvider,
  ctx: EvaluationContext
): Promise<void> {
  const uniqueIds = Array.from(new Set(ids));
  const blocked: Array<{ id: FrameworkId; reason?: string }> = [];
  for (const id of uniqueIds) {
    const decision = await entitlements.isAllowed(`${FRAMEWORK_PREFIX}${id}`, ctx);
    if (!decision.allowed) {
      blocked.push({ id, reason: decision.reason });
    }
  }

  if (blocked.length === 0) {
    return;
  }

  const names = blocked
    .map(entry => registry.get(entry.id)?.title ?? entry.id)
    .join(", ");
  const reason = blocked.find(entry => entry.reason)?.reason;
  if (reason && reason.includes("Enable experimental")) {
    throw new Error(`Frameworks not available without Experimental: ${names}. ${reason}`);
  }
  throw new Error(`Frameworks not available: ${names}.${reason ? ` ${reason}` : ""}`);
}
