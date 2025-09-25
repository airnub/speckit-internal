import frameworksJson from "./data/frameworks.json" assert { type: "json" };

export type PlanId = "free" | "pro" | "enterprise";

export const FRAMEWORK_IDS = [
  "hipaa",
  "gdpr",
  "soc2",
  "iso27001",
  "edu-us",
  "edu-eu-ie",
] as const;

export type FrameworkId = (typeof FRAMEWORK_IDS)[number];

export interface AvailabilityRequirements {
  experimental?: boolean;
  minPlan?: Exclude<PlanId, "free">;
  regionAllow?: string[];
  rolloutPct?: number;
  prerequisites?: string[];
}

export interface Availability {
  status: "experimental" | "ga";
  requires?: AvailabilityRequirements;
}

export interface FrameworkMeta {
  id: FrameworkId;
  title: string;
  availability: Availability;
  bundles: string[];
  tags: string[];
}

export type FrameworkRegistryData = Record<FrameworkId, FrameworkMeta>;

const registryData = frameworksJson as FrameworkRegistryData;

export const FRAMEWORKS: FrameworkRegistryData = registryData;

export interface FrameworkRegistry {
  get(id: FrameworkId): FrameworkMeta | undefined;
  list(): FrameworkMeta[];
}

export function createFrameworkRegistry(data: FrameworkRegistryData = FRAMEWORKS): FrameworkRegistry {
  return {
    get(id) {
      return data[id];
    },
    list() {
      return FRAMEWORK_IDS.map(id => data[id]).filter((meta): meta is FrameworkMeta => !!meta);
    },
  } satisfies FrameworkRegistry;
}

export interface FrameworkAvailabilityContext {
  experimentalEnabled: boolean;
}

export function isFrameworkAllowed(
  id: FrameworkId,
  context: FrameworkAvailabilityContext,
  data: FrameworkRegistryData = FRAMEWORKS
): boolean {
  const meta = data[id];
  if (!meta) {
    return false;
  }
  return isFrameworkStatusAllowed(meta, context);
}

export function isFrameworkStatusAllowed(meta: FrameworkMeta, context: FrameworkAvailabilityContext): boolean {
  if (meta.availability.status === "ga") {
    return true;
  }
  const requiresExperimental = meta.availability.requires?.experimental ?? true;
  if (requiresExperimental) {
    return context.experimentalEnabled === true;
  }
  return true;
}

export function listFrameworks(data: FrameworkRegistryData = FRAMEWORKS): FrameworkMeta[] {
  return FRAMEWORK_IDS.map(id => data[id]).filter((meta): meta is FrameworkMeta => !!meta);
}
