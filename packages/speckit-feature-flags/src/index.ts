import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import type { FrameworkId, FrameworkRegistry } from "@speckit/framework-registry";
import {
  createFrameworkRegistry,
  isFrameworkAllowed as isFrameworkAvailable,
  FRAMEWORKS,
  type PlanId,
} from "@speckit/framework-registry";

export type Plan = PlanId;

export interface EvaluationContext {
  userId?: string;
  orgId?: string;
  plan?: Plan;
  experimentalEnabled: boolean;
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
}

export interface CliArgs {
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
  const cliExperimental = cliArgs.experimentalFeatures ?? null;
  if (cliExperimental && typeof cliExperimental === "object" && !Array.isArray(cliExperimental)) {
    applyFeatureMap(flags.experimental.features, cliExperimental);
  } else {
    applyFeaturesList(
      flags.experimental.features,
      cliExperimental as string[] | string | null | undefined
    );
  }

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

function meetsPlanRequirement(current: Plan | undefined, required: Plan): boolean {
  const currentRank = PLAN_ORDER[current ?? "free"] ?? 0;
  const requiredRank = PLAN_ORDER[required];
  return currentRank >= requiredRank;
}

function inferPlan(ctx: EvaluationContext): Plan {
  return ctx.plan ?? "free";
}

function capabilityKeyForFramework(id: FrameworkId): string {
  return `framework.${id}`;
}

function isFrameworkCapability(key: string): key is `framework.${FrameworkId}` {
  return key.startsWith("framework.");
}

function parseFrameworkIdFromKey(key: string): FrameworkId | null {
  if (!isFrameworkCapability(key)) {
    return null;
  }
  const id = key.slice("framework.".length) as FrameworkId;
  return id;
}

export class LocalEntitlements implements EntitlementProvider {
  constructor(private registry: FrameworkRegistry = createFrameworkRegistry(FRAMEWORKS), private flags: FeatureFlags = DEFAULT_FEATURE_FLAGS) {}

  async isAllowed(capabilityKey: string, ctx: EvaluationContext): Promise<EntitlementDecision> {
    if (this.isKillSwitchActive(capabilityKey)) {
      return { allowed: false, reason: "killswitch" };
    }

    if (capabilityKey === "mode.secure") {
      return this.evaluateSecureMode(ctx);
    }

    const frameworkId = parseFrameworkIdFromKey(capabilityKey);
    if (frameworkId) {
      return this.evaluateFrameworkCapability(frameworkId, ctx);
    }

    return { allowed: true };
  }

  private evaluateSecureMode(ctx: EvaluationContext): EntitlementDecision {
    if (!this.flags.modes.secure.experimental) {
      return { allowed: true };
    }
    if (ctx.experimentalEnabled) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason:
        "Secure mode is experimental. Enable experimental features with `--experimental`, set SPECKIT_EXPERIMENTAL=1, or update settings.experimental.enabled to true.",
    };
  }

  private evaluateFrameworkCapability(id: FrameworkId, ctx: EvaluationContext): EntitlementDecision {
    const meta = this.registry.get(id);
    if (!meta) {
      return { allowed: false, reason: "unknown_framework" };
    }

    const experimentalAllowed = isFrameworkAvailable(id, { experimentalEnabled: ctx.experimentalEnabled });
    if (!experimentalAllowed) {
      return {
        allowed: false,
        reason:
          "Enable experimental with `--experimental` (or via SPECKIT_EXPERIMENTAL/config) to try these frameworks.",
      };
    }

    const minPlan = meta.availability.requires?.minPlan;
    if (minPlan && !meetsPlanRequirement(inferPlan(ctx), minPlan)) {
      return { allowed: false, reason: `plan_${minPlan}` };
    }

    return { allowed: true };
  }

  private isKillSwitchActive(key: string): boolean {
    const killFlag = this.flags.experimental.features[`killswitch:${key}`];
    if (killFlag === true) {
      return true;
    }
    return false;
  }
}

export function createLocalEntitlements(flags: FeatureFlags, registry?: FrameworkRegistry): LocalEntitlements {
  return new LocalEntitlements(registry ?? createFrameworkRegistry(FRAMEWORKS), flags);
}

export function buildEvaluationContext(
  flags: FeatureFlags,
  overrides?: Partial<Omit<EvaluationContext, "experimentalEnabled">> & { experimentalEnabled?: boolean }
): EvaluationContext {
  return {
    experimentalEnabled: overrides?.experimentalEnabled ?? isExperimentalEnabled(flags),
    plan: overrides?.plan,
    userId: overrides?.userId,
    orgId: overrides?.orgId,
  };
}

export async function assertModeAllowed(
  mode: "classic" | "secure",
  provider: EntitlementProvider,
  ctx: EvaluationContext
): Promise<void> {
  if (mode === "classic") {
    return;
  }
  const result = await provider.isAllowed("mode.secure", ctx);
  if (!result.allowed) {
    throw new Error(result.reason ?? "Secure mode is not available");
  }
}

export async function assertFrameworksAllowed(
  ids: FrameworkId[],
  provider: EntitlementProvider,
  ctx: EvaluationContext
): Promise<void> {
  const uniqueIds = Array.from(new Set(ids));
  const blocked: { id: FrameworkId; reason?: string }[] = [];
  for (const id of uniqueIds) {
    const key = capabilityKeyForFramework(id);
    const result = await provider.isAllowed(key, ctx);
    if (!result.allowed) {
      blocked.push({ id, reason: result.reason });
    }
  }
  if (blocked.length === 0) {
    return;
  }
  const details = blocked.map(entry => formatFrameworkBlock(entry.id, entry.reason)).join(", ");
  throw new Error(`Frameworks not available: ${details}.`);
}

function thisNameForFramework(id: FrameworkId): string {
  const meta = FRAMEWORKS[id];
  return meta?.title ?? id;
}

function formatFrameworkBlock(id: FrameworkId, reason?: string): string {
  const name = thisNameForFramework(id);
  if (!reason) {
    return name;
  }
  if (reason.startsWith("plan_")) {
    const plan = reason.slice("plan_".length);
    return `${name} (requires ${plan} plan)`;
  }
  if (reason === "killswitch") {
    return `${name} (temporarily disabled)`;
  }
  if (reason === "unknown_framework") {
    return `${name} (unknown framework)`;
  }
  return `${name} (${reason})`;
}
