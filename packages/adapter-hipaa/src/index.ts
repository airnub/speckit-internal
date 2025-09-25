import fs from "fs-extra";
import { parse } from "yaml";
import { z } from "zod";
import type { Requirement, SpecModel, Reference } from "@speckit/engine";

const ReferenceLinkSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
});

const SafeguardSchema = z.object({
  id: z.string().min(1),
  citation: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  nist_800_53r5: z.array(z.string().min(1)).nonempty(),
});

const FamilySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  citation: z.string().min(1),
  description: z.string().min(1),
  safeguards: z.array(SafeguardSchema).nonempty(),
});

const CatalogSchema = z.object({
  version: z.string().min(1),
  title: z.string().min(1),
  references: z.object({
    nist_sp_800_66r2: ReferenceLinkSchema,
    olir_mapping: ReferenceLinkSchema,
  }),
  families: z.array(FamilySchema).nonempty(),
});

type Catalog = z.infer<typeof CatalogSchema>;
type Family = z.infer<typeof FamilySchema>;
type Safeguard = z.infer<typeof SafeguardSchema>;

type FamilyMeta = {
  id: string;
  key: string;
  name: string;
  citation: string;
  description: string;
  safeguards: {
    id: string;
    requirement_id: string;
    citation: string;
    title: string;
    description: string;
    nist_800_53r5: string[];
  }[];
};

export async function loadToModel(specYamlPath: string): Promise<SpecModel> {
  const raw = await fs.readFile(specYamlPath, "utf8");
  const parsed = CatalogSchema.parse(parse(raw));

  const families = parsed.families.map(family => mapFamily(family));
  const requirements: Requirement[] = [];

  for (const family of parsed.families) {
    for (const safeguard of family.safeguards) {
      requirements.push(mapRequirement(family, safeguard, parsed.references));
    }
  }

  const meta: Record<string, unknown> = {
    title: parsed.title,
    crosswalks: {
      nist_sp_800_66r2: parsed.references.nist_sp_800_66r2,
      olir_mapping: parsed.references.olir_mapping,
    },
    families,
    sources: [
      { kind: "url", value: parsed.references.nist_sp_800_66r2.url },
      { kind: "url", value: parsed.references.olir_mapping.url },
    ],
  };

  return {
    version: parsed.version,
    meta,
    requirements,
  };
}

function mapFamily(family: Family): FamilyMeta {
  const familyId = normaliseFamilyId(family.id);
  return {
    id: familyId,
    key: family.id,
    name: family.name,
    citation: family.citation,
    description: family.description,
    safeguards: family.safeguards.map(safeguard => ({
      id: safeguard.id,
      requirement_id: buildRequirementId(familyId, safeguard.id),
      citation: safeguard.citation,
      title: safeguard.title,
      description: safeguard.description,
      nist_800_53r5: safeguard.nist_800_53r5,
    })),
  };
}

function mapRequirement(
  family: Family,
  safeguard: Safeguard,
  references: Catalog["references"],
): Requirement {
  const familyId = normaliseFamilyId(family.id);
  const requirementId = buildRequirementId(familyId, safeguard.id);
  const description = safeguard.description.trim();
  const tags = buildTags(familyId, safeguard);
  const refs = buildReferences(family, safeguard, references);

  return {
    id: requirementId,
    title: safeguard.title.trim(),
    description,
    tags,
    refs,
  };
}

function buildTags(familyId: string, safeguard: Safeguard): string[] {
  const tags = new Set<string>();
  tags.add("hipaa");
  tags.add("hipaa:security-rule");
  tags.add(`hipaa:family:${familyId.toLowerCase()}`);
  tags.add(`hipaa:safeguard:${normaliseSegment(safeguard.id).toLowerCase()}`);
  tags.add(`hipaa:citation:${normaliseCitation(safeguard.citation)}`);
  return Array.from(tags);
}

function buildReferences(
  family: Family,
  safeguard: Safeguard,
  references: Catalog["references"],
): Reference[] {
  const refs: Reference[] = [];
  const hipaaRef = `${family.citation} ${safeguard.citation}`.trim();
  refs.push({ kind: "doc", value: `HIPAA Security Rule ${hipaaRef}` });
  for (const control of safeguard.nist_800_53r5) {
    refs.push({ kind: "doc", value: `NIST SP 800-53r5 ${control}` });
  }
  refs.push({ kind: "url", value: references.nist_sp_800_66r2.url });
  refs.push({ kind: "url", value: references.olir_mapping.url });
  return dedupeReferences(refs);
}

function dedupeReferences(refs: Reference[]): Reference[] {
  const seen = new Set<string>();
  const result: Reference[] = [];
  for (const ref of refs) {
    const key = `${ref.kind}:${ref.value}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(ref);
    }
  }
  return result;
}

function normaliseFamilyId(value: string): string {
  const segment = normaliseSegment(value);
  return segment ? segment.toUpperCase() : value.toUpperCase();
}

function buildRequirementId(familyId: string, safeguardId: string): string {
  const segment = normaliseSegment(safeguardId);
  return `HIPAA-SR-${familyId}-${segment}`;
}

function normaliseSegment(value: string): string {
  return value
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
}

function normaliseCitation(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, "")
    .replace(/§/g, "sec")
    .replace(/[^A-Za-z0-9:-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}
