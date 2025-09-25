import fs from "fs-extra";
import { parse } from "yaml";
import { z } from "zod";
import type { Level, Requirement, SpecModel, Reference } from "@speckit/engine";

const LevelSchema = z
  .object({
    L1: z.boolean().optional(),
    L2: z.boolean().optional(),
    L3: z.boolean().optional(),
  })
  .partial()
  .optional();

const RequirementSchema = z.object({
  id: z.union([z.string(), z.number()]),
  title: z.string().optional(),
  description: z.string().optional(),
  text: z.string().optional(),
  requirement: z.string().optional(),
  narrative: z.string().optional(),
  controls: z.array(z.string()).optional(),
  verification: z.array(z.string()).optional(),
  verifications: z.array(z.string()).optional(),
  checks: z.array(z.string()).optional(),
  refs: z.array(z.string()).optional(),
  references: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  dependsOn: z.array(z.string()).optional(),
  dependencies: z.array(z.string()).optional(),
  level: LevelSchema,
  levels: LevelSchema,
});

const SectionSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  requirements: z.array(RequirementSchema),
});

const MetadataSchema = z
  .object({
    version: z.string(),
  })
  .catchall(z.unknown())
  .optional();

const AsvsSchema = z.object({
  meta: MetadataSchema,
  metadata: MetadataSchema,
  version: z.string().optional(),
  sections: z.array(SectionSchema),
});

export async function loadToModel(specYamlPath: string): Promise<SpecModel> {
  const raw = await fs.readFile(specYamlPath, "utf8");
  const data = parse(raw);
  const parsed = AsvsSchema.parse(data);

  const metaSource = (parsed.meta ?? parsed.metadata ?? {}) as Record<string, unknown>;
  const version = normaliseString(metaSource.version) || normaliseString(parsed.version);
  if (!version) {
    throw new Error("ASVS spec requires a meta.version value");
  }

  const meta: Record<string, unknown> = {
    ...metaSource,
    version,
  };

  const requirements: Requirement[] = [];
  for (const section of parsed.sections) {
    for (const requirement of section.requirements) {
      const mapped = mapRequirement(section.id, section.title, requirement);
      if (mapped) {
        requirements.push(mapped);
      }
    }
  }

  return {
    version,
    meta,
    requirements,
  };
}

function mapRequirement(sectionId: string, sectionTitle: string | undefined, input: z.infer<typeof RequirementSchema>): Requirement | null {
  const localId = normaliseId(input.id);
  if (!localId) {
    return null;
  }
  const requirementId = buildRequirementId(sectionId, localId);
  const title = selectFirst([input.title, input.requirement, input.text, input.description, sectionTitle, requirementId]);
  const description = selectFirst([input.description, input.text, input.narrative, input.requirement]);

  const acceptance = collectAcceptance(input);
  const tags = new Set<string>();
  tags.add(`owasp:${sectionId}`);
  tags.add(`owasp:${requirementId}`);
  for (const tag of input.tags ?? []) {
    const clean = normaliseString(tag);
    if (clean) {
      tags.add(clean);
    }
  }

  const levelInfo = pickLevel(input.level) ?? pickLevel(input.levels);
  const level = levelInfo?.level;
  for (const tag of levelInfo?.tags ?? []) {
    tags.add(tag);
  }

  const references = collectReferences(requirementId, input);
  const dependsOn = collectDependsOn(input);

  return {
    id: requirementId,
    title,
    description: description || undefined,
    acceptance: acceptance.length ? acceptance : undefined,
    tags: Array.from(tags),
    refs: references.length ? references : undefined,
    dependsOn: dependsOn.length ? dependsOn : undefined,
    level,
  };
}

function collectAcceptance(input: z.infer<typeof RequirementSchema>): string[] {
  const buckets: unknown[] = [input.controls, input.verification, input.verifications, input.checks];
  const acceptance: string[] = [];
  for (const bucket of buckets) {
    if (!bucket) continue;
    const list = Array.isArray(bucket) ? bucket : [bucket];
    for (const item of list) {
      if (typeof item === "string") {
        const trimmed = item.trim();
        if (trimmed) {
          acceptance.push(trimmed);
        }
      }
    }
  }
  return acceptance;
}

function collectReferences(requirementId: string, input: z.infer<typeof RequirementSchema>): Reference[] {
  const references: Reference[] = [{ kind: "owasp", value: requirementId }];
  const sources = [input.refs, input.references];
  for (const source of sources) {
    if (!source) continue;
    for (const item of source) {
      const trimmed = normaliseString(item);
      if (!trimmed) continue;
      references.push({ kind: inferReferenceKind(trimmed), value: trimmed });
    }
  }
  references.push({ kind: "doc", value: "OWASP ASVS v4" });
  return dedupeReferences(references);
}

function collectDependsOn(input: z.infer<typeof RequirementSchema>): string[] {
  const items = [...(input.dependsOn ?? []), ...(input.dependencies ?? [])];
  const result: string[] = [];
  for (const item of items) {
    const trimmed = normaliseString(item);
    if (trimmed) {
      result.push(trimmed);
    }
  }
  return Array.from(new Set(result));
}

function dedupeReferences(refs: Reference[]): Reference[] {
  const seen = new Set<string>();
  const result: Reference[] = [];
  for (const ref of refs) {
    const key = `${ref.kind}|${ref.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(ref);
  }
  return result;
}

function inferReferenceKind(value: string): Reference["kind"] {
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return "url";
  }
  if (value.toLowerCase().startsWith("owasp:")) {
    return "owasp";
  }
  if (/^rfc\s*\d+/i.test(value)) {
    return "rfc";
  }
  return "doc";
}

function pickLevel(level: z.infer<typeof LevelSchema>): { level: Level | undefined; tags: string[] } | null {
  if (!level) {
    return null;
  }
  const flags: Array<{ level: Level; enabled: boolean }> = [
    { level: "L1", enabled: Boolean(level?.L1) },
    { level: "L2", enabled: Boolean(level?.L2) },
    { level: "L3", enabled: Boolean(level?.L3) },
  ];
  const active = flags.filter(flag => flag.enabled);
  if (!active.length) {
    return { level: undefined, tags: [] };
  }
  const highest = active[active.length - 1].level;
  const tags = active.map(flag => flag.level!);
  return { level: highest, tags };
}

function buildRequirementId(sectionId: string, requirementId: string): string {
  const cleanSection = sectionId.replace(/^V/i, "V");
  if (requirementId.startsWith("V")) {
    return requirementId;
  }
  if (requirementId.includes(".")) {
    return `${cleanSection}.${requirementId}`;
  }
  return `${cleanSection}.${requirementId}`;
}

function normaliseString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function selectFirst(candidates: Array<string | undefined>): string {
  for (const candidate of candidates) {
    const trimmed = normaliseString(candidate);
    if (trimmed) {
      return trimmed;
    }
  }
  return "";
}

function normaliseId(value: unknown): string {
  if (typeof value === "number") {
    return value.toString();
  }
  return normaliseString(value);
}
