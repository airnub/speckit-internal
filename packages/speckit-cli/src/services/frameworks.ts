import type { GenerationMode } from "@speckit/engine";
import { frameworksFromMode } from "./mode.js";
import {
  FRAMEWORKS,
  type FrameworkId,
  type FrameworkMeta,
} from "../config/frameworkRegistry.js";
import type {
  EntitlementProvider,
  EvaluationContext,
} from "../config/featureFlags.js";

export type FrameworkSelection = {
  frameworks: string[];
  preset: "classic" | "secure";
  source: "explicit" | "preset" | "default";
};

type FrameworkBlock = { id: string; message: string };

export function parseFrameworkArgs(options: {
  frameworks?: string[];
  frameworksCsv?: string[];
}): string[] {
  const single = options.frameworks ?? [];
  const csv = options.frameworksCsv ?? [];
  const values = [...single, ...csv];
  const parsed = values
    .flatMap(value =>
      String(value)
        .split(",")
        .map(entry => entry.trim())
        .filter(entry => entry.length > 0)
    )
    .map(value => value.toLowerCase());
  const result: string[] = [];
  const seen = new Set<string>();
  for (const id of parsed) {
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

export function resolveFrameworkSelection(args: {
  explicitFrameworks?: string[];
  preset?: "classic" | "secure" | null;
}): FrameworkSelection {
  const explicit = args.explicitFrameworks ?? [];
  if (explicit.length > 0) {
    return { frameworks: explicit, preset: "classic", source: "explicit" };
  }
  const preset = args.preset ?? "classic";
  const source = args.preset ? "preset" : "default";
  return {
    frameworks: frameworksFromMode(preset),
    preset,
    source,
  };
}

export function partitionFrameworkIds(ids: string[]): {
  valid: FrameworkId[];
  unknown: string[];
} {
  const valid: FrameworkId[] = [];
  const unknown: string[] = [];
  for (const id of ids) {
    if (Object.hasOwn(FRAMEWORKS, id)) {
      valid.push(id as FrameworkId);
    } else {
      unknown.push(id);
    }
  }
  return { valid, unknown };
}

export function extractFrameworkIdsFromSpec(data: any): string[] {
  if (!Array.isArray(data?.compliance?.frameworks)) {
    return [];
  }
  return data.compliance.frameworks
    .map((entry: any) => (typeof entry?.id === "string" ? entry.id.trim().toLowerCase() : ""))
    .filter((id: string): id is string => Boolean(id));
}

export function resolveEffectiveFrameworkIds(args: {
  preset: GenerationMode;
  provided?: string[];
  spec?: string[];
}): string[] {
  const provided = dedupe(args.provided ?? []);
  if (provided.length > 0) {
    return provided;
  }
  const fromSpec = dedupe(args.spec ?? []);
  if (fromSpec.length > 0) {
    return fromSpec;
  }
  return frameworksFromMode(args.preset);
}

export function buildFrameworkProvenanceEntries(ids: string[]): { id: string; status: FrameworkStatus }[] {
  const seen = new Set<string>();
  const result: { id: string; status: FrameworkStatus }[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const meta = FRAMEWORKS[id as FrameworkId] as FrameworkMeta | undefined;
    const status: FrameworkStatus = meta?.availability.status ?? "experimental";
    result.push({ id, status });
  }
  return result;
}

export type FrameworkStatus = FrameworkMeta["availability"]["status"];

export async function ensureFrameworksAllowed(
  ids: FrameworkId[],
  provider: EntitlementProvider,
  ctx: EvaluationContext
): Promise<void> {
  const blocked: FrameworkBlock[] = [];
  for (const id of ids) {
    const result = await provider.isAllowed(`framework.${id}`, ctx);
    if (!result.allowed) {
      blocked.push({ id, message: formatFrameworkBlock(id, result.reason) });
    }
  }
  if (blocked.length > 0) {
    const detail = blocked.map(entry => `${entry.message}`).join(", ");
    throw new Error(`Framework selection blocked: ${detail}`);
  }
}

function formatFrameworkBlock(id: string, reason?: string): string {
  const meta: FrameworkMeta | undefined = FRAMEWORKS[id as FrameworkId];
  const name = meta?.title ?? id;
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
    return `${id} is not a recognised framework`;
  }
  if (reason.includes("Enable experimental")) {
    return `${name} is experimental. Enable with --experimental or set it in config.`;
  }
  return `${name} (${reason})`;
}

function dedupe(ids: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    const normalized = typeof id === "string" ? id.trim().toLowerCase() : "";
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}
