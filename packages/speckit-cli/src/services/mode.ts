import type { GenerationMode, TemplateEntry } from "@speckit/core";

export const DEFAULT_GENERATION_MODE: GenerationMode = "classic";
export const GENERATION_MODES: GenerationMode[] = ["classic", "secure"];

const MODE_SET = new Set<GenerationMode>(GENERATION_MODES);

export function parseGenerationMode(value: unknown): GenerationMode | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  const candidate = normalized as GenerationMode;
  return MODE_SET.has(candidate) ? candidate : null;
}

export function resolveDefaultGenerationMode(specData: any): GenerationMode {
  const candidates: unknown[] = [];
  if (specData) {
    const engineMode = specData?.engine?.mode ?? specData?.generator?.mode;
    const legacy = specData?.speckit?.mode ?? specData?.mode;
    if (engineMode !== undefined) candidates.push(engineMode);
    if (legacy !== undefined) candidates.push(legacy);
  }
  candidates.push(process.env.SPECKIT_DEFAULT_MODE);
  candidates.push(process.env.SPECKIT_MODE);

  for (const candidate of candidates) {
    const parsed = parseGenerationMode(candidate);
    if (parsed) return parsed;
  }
  return DEFAULT_GENERATION_MODE;
}

export function templateModes(template: TemplateEntry): GenerationMode[] {
  const list = template?.modes ?? [];
  const seen = new Set<GenerationMode>();
  for (const entry of list) {
    const parsed = parseGenerationMode(entry);
    if (parsed) {
      seen.add(parsed);
    }
  }
  if (seen.size > 0) {
    return Array.from(seen);
  }
  return [DEFAULT_GENERATION_MODE];
}
