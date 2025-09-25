import frameworksJson from "../data/frameworks.json";

export type PlanTier = "free" | "pro" | "enterprise";

export interface AvailabilityRequirements {
  experimental?: boolean;
  minPlan?: PlanTier;
  regionAllow?: string[];
  rolloutPct?: number;
  prerequisites?: string[];
}

export interface Availability {
  status: "experimental" | "ga";
  requires?: AvailabilityRequirements;
}

export type FrameworkId =
  | "hipaa"
  | "gdpr"
  | "soc2"
  | "iso27001"
  | "edu-us"
  | "edu-eu-ie";

export interface FrameworkMeta {
  id: FrameworkId;
  title: string;
  availability: Availability;
  bundles: string[];
  tags: string[];
}

const frameworksList = (frameworksJson as unknown as FrameworkMeta[]).map(entry => ({
  ...entry,
  availability: {
    status: entry.availability?.status ?? "experimental",
    requires: entry.availability?.requires ?? {},
  },
}));

const frameworkById = new Map<FrameworkId, FrameworkMeta>();
for (const entry of frameworksList) {
  frameworkById.set(entry.id, Object.freeze({
    ...entry,
    availability: {
      ...entry.availability,
      requires: entry.availability.requires ? { ...entry.availability.requires } : undefined,
    },
    bundles: [...entry.bundles],
    tags: [...entry.tags],
  }));
}

export const FRAMEWORKS: Record<FrameworkId, FrameworkMeta> = Object.freeze(
  Array.from(frameworkById.entries()).reduce<Record<FrameworkId, FrameworkMeta>>((acc, [id, meta]) => {
    acc[id] = meta;
    return acc;
  }, {} as Record<FrameworkId, FrameworkMeta>)
);

export class FrameworkRegistry {
  private readonly items: Map<FrameworkId, FrameworkMeta>;

  constructor(entries: Iterable<FrameworkMeta> = frameworkById.values()) {
    this.items = new Map(Array.from(entries, entry => [entry.id, entry] as const));
  }

  get(id: FrameworkId): FrameworkMeta | undefined {
    return this.items.get(id);
  }

  list(): FrameworkMeta[] {
    return Array.from(this.items.values(), entry => ({
      ...entry,
      availability: {
        ...entry.availability,
        requires: entry.availability.requires ? { ...entry.availability.requires } : undefined,
      },
      bundles: [...entry.bundles],
      tags: [...entry.tags],
    }));
  }

  toRecord(): Record<FrameworkId, FrameworkMeta> {
    return this.list().reduce<Record<FrameworkId, FrameworkMeta>>((acc, entry) => {
      acc[entry.id] = entry;
      return acc;
    }, {} as Record<FrameworkId, FrameworkMeta>);
  }
}

export function createFrameworkRegistry(): FrameworkRegistry {
  return new FrameworkRegistry(frameworkById.values());
}

const PLAN_ORDER: Record<PlanTier, number> = {
  free: 0,
  pro: 1,
  enterprise: 2,
};

function planSatisfies(actual: PlanTier | undefined, required: PlanTier | undefined): boolean {
  if (!required) return true;
  const normalizedActual = actual ?? "free";
  return PLAN_ORDER[normalizedActual] >= PLAN_ORDER[required];
}

export function isFrameworkAllowed(
  id: FrameworkId,
  options: { experimentalEnabled: boolean; plan?: PlanTier; registry?: FrameworkRegistry } = {
    experimentalEnabled: false,
  }
): boolean {
  const registry = options.registry ?? new FrameworkRegistry(frameworkById.values());
  const meta = registry.get(id);
  if (!meta) {
    return false;
  }

  const availability = meta.availability;
  const requiresExperimental = availability.requires?.experimental ?? (availability.status === "experimental");
  if (requiresExperimental && !options.experimentalEnabled) {
    return false;
  }
  if (!planSatisfies(options.plan, availability.requires?.minPlan)) {
    return false;
  }
  return true;
}

export function listFrameworks(): FrameworkMeta[] {
  return new FrameworkRegistry(frameworkById.values()).list();
}
