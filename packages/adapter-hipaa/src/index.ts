import fs from "fs-extra";
import { parse } from "yaml";
import { z } from "zod";
import type { Requirement, SpecModel, Reference } from "@speckit/core";

export const HIPAA_SECURITY_RULE_FILE = "hipaa-security-rule.yaml";

const SourceSchema = z.object({
  title: z.string(),
  url: z.string(),
});

const SafeguardSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  implementation: z.array(z.string()).min(1),
  nist80053: z.array(z.string()).min(1),
});

const CategorySchema = z.object({
  id: z.string(),
  title: z.string(),
  citation: z.string(),
  safeguards: z.array(SafeguardSchema).min(1),
});

const CatalogSchema = z.object({
  version: z.string(),
  meta: z.object({
    framework: z.string(),
    authority: z.string(),
    description: z.string().optional(),
    sources: z.array(SourceSchema).optional(),
  }),
  categories: z.array(CategorySchema).min(1),
});

export type HipaaCatalog = z.infer<typeof CatalogSchema>;
export type HipaaCategory = z.infer<typeof CategorySchema>;
export type HipaaSafeguard = z.infer<typeof SafeguardSchema>;

export async function loadCatalog(catalogPath: string): Promise<HipaaCatalog> {
  const raw = await fs.readFile(catalogPath, "utf8");
  const data = parse(raw);
  return CatalogSchema.parse(data);
}

export async function loadToModel(catalogPath: string): Promise<SpecModel> {
  const catalog = await loadCatalog(catalogPath);

  const meta: Record<string, unknown> = {
    framework: catalog.meta.framework,
    authority: catalog.meta.authority,
    description: catalog.meta.description,
    crosswalks: {
      nist_sp_800_66_rev2: catalog.meta.sources?.find(source =>
        source.title.toLowerCase().includes("800-66")
      ),
      nist_olir_hipaa_800_53r5: catalog.meta.sources?.find(source =>
        source.title.toLowerCase().includes("olir")
      ),
    },
  };

  const requirements: Requirement[] = [];
  for (const category of catalog.categories) {
    for (const safeguard of category.safeguards) {
      requirements.push(mapSafeguard(category, safeguard));
    }
  }

  return {
    version: catalog.version,
    meta: { ...meta, version: catalog.version },
    requirements,
  };
}

function mapSafeguard(category: HipaaCategory, safeguard: HipaaSafeguard): Requirement {
  const requirementId = buildRequirementId(category.id, safeguard.id);
  const refs: Reference[] = [
    { kind: "hipaa", value: `45 CFR §${safeguard.id}` },
    ...safeguard.nist80053.map<Reference>(control => ({ kind: "nist-800-53", value: control })),
    { kind: "doc", value: category.citation },
  ];

  const tags = new Set<string>([
    "hipaa",
    "hipaa:security-rule",
    `hipaa:category:${category.id}`,
    `hipaa:safeguard:${normaliseTagId(safeguard.id)}`,
  ]);

  return {
    id: requirementId,
    title: safeguard.title,
    description: safeguard.summary,
    acceptance: [...safeguard.implementation],
    refs,
    tags: Array.from(tags),
  };
}

function buildRequirementId(categoryId: string, safeguardId: string): string {
  return `hipaa.security.${normaliseTagId(categoryId)}.${normaliseTagId(safeguardId)}`;
}

function normaliseTagId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
