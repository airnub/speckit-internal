import fs from "fs-extra";
import { parse } from "yaml";
import { z } from "zod";
import type { Requirement, SpecModel, Reference } from "@speckit/engine";

const ReferenceLinkSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
});

const RequirementSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  citation: z.string().min(1).optional(),
});

const FrameworkSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  authority: z.string().min(1),
  citation: z.string().min(1).optional(),
  requirements: z.array(RequirementSchema).nonempty(),
});

const StateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  authority: z.string().min(1),
  citation: z.string().min(1).optional(),
  url: z.string().url().optional(),
  requirements: z.array(RequirementSchema).nonempty(),
});

const CatalogSchema = z.object({
  version: z.string().min(1),
  title: z.string().min(1),
  references: z.object({
    ferpa: ReferenceLinkSchema,
    coppa: ReferenceLinkSchema,
    cipa: ReferenceLinkSchema,
    ppra: ReferenceLinkSchema,
  }),
  frameworks: z.array(FrameworkSchema).nonempty(),
  states: z.array(StateSchema).default([]),
});

type Catalog = z.infer<typeof CatalogSchema>;
type Framework = z.infer<typeof FrameworkSchema>;
type State = z.infer<typeof StateSchema>;
type CatalogReferences = Catalog["references"];

export async function loadToModel(specYamlPath: string): Promise<SpecModel> {
  const raw = await fs.readFile(specYamlPath, "utf8");
  const catalog = CatalogSchema.parse(parse(raw));

  const requirements: Requirement[] = [];
  for (const framework of catalog.frameworks) {
    for (const item of framework.requirements) {
      requirements.push(mapFederalRequirement(framework, item, catalog.references));
    }
  }
  for (const state of catalog.states) {
    for (const item of state.requirements) {
      requirements.push(mapStateRequirement(state, item));
    }
  }

  const metaFrameworks = catalog.frameworks.map(framework => mapFrameworkMeta(framework));
  const metaStates = catalog.states.map(state => mapStateMeta(state));

  const meta: Record<string, unknown> = {
    title: catalog.title,
    frameworks: metaFrameworks,
    states: metaStates,
    sources: buildSources(catalog),
    references: catalog.references,
  };

  return {
    version: catalog.version,
    meta,
    requirements,
  };
}

function mapFrameworkMeta(framework: Framework) {
  const frameworkId = normaliseContainerId(framework.id);
  return {
    id: frameworkId,
    key: framework.id,
    name: framework.name,
    authority: framework.authority,
    citation: framework.citation,
    requirements: framework.requirements.map(item => ({
      id: item.id,
      requirement_id: buildRequirementId("federal", frameworkId, item.id),
      title: item.title,
      citation: item.citation,
      description: item.description,
    })),
  };
}

function mapStateMeta(state: State) {
  const stateId = normaliseContainerId(state.id);
  return {
    id: stateId,
    key: state.id,
    name: state.name,
    authority: state.authority,
    citation: state.citation,
    url: state.url,
    requirements: state.requirements.map(item => ({
      id: item.id,
      requirement_id: buildRequirementId("state", stateId, item.id),
      title: item.title,
      citation: item.citation,
      description: item.description,
    })),
  };
}

function mapFederalRequirement(
  framework: Framework,
  requirement: z.infer<typeof RequirementSchema>,
  references: CatalogReferences,
): Requirement {
  const containerId = normaliseContainerId(framework.id);
  const id = buildRequirementId("federal", containerId, requirement.id);
  const tags = buildFederalTags(containerId, requirement.id);
  const refs = buildFederalReferences(framework, requirement, references);

  return {
    id,
    title: requirement.title.trim(),
    description: requirement.description.trim(),
    tags,
    refs,
  };
}

function mapStateRequirement(state: State, requirement: z.infer<typeof RequirementSchema>): Requirement {
  const containerId = normaliseContainerId(state.id);
  const id = buildRequirementId("state", containerId, requirement.id);
  const tags = buildStateTags(containerId, requirement.id);
  const refs = buildStateReferences(state, requirement);

  return {
    id,
    title: requirement.title.trim(),
    description: requirement.description.trim(),
    tags,
    refs,
  };
}

function buildSources(catalog: Catalog): Reference[] {
  const sources: Reference[] = [];
  sources.push({ kind: "url", value: catalog.references.ferpa.url });
  sources.push({ kind: "url", value: catalog.references.coppa.url });
  sources.push({ kind: "url", value: catalog.references.cipa.url });
  sources.push({ kind: "url", value: catalog.references.ppra.url });
  for (const state of catalog.states) {
    if (state.url) {
      sources.push({ kind: "url", value: state.url });
    }
  }
  return dedupeReferences(sources);
}

function buildFederalTags(containerId: string, requirementId: string): string[] {
  const tags = new Set<string>();
  const slug = slugify(requirementId);
  tags.add("edu-us");
  tags.add("edu-us:federal");
  tags.add(`edu-us:${containerId}`);
  tags.add(containerId);
  tags.add(`${containerId}:${slug}`);
  tags.add(`framework:${containerId}`);
  return Array.from(tags);
}

function buildStateTags(containerId: string, requirementId: string): string[] {
  const tags = new Set<string>();
  const slug = slugify(requirementId);
  const regionTag = containerId.replace(/-/g, ":");
  tags.add("edu-us");
  tags.add("edu-us:state");
  tags.add(`edu-us:${containerId}`);
  tags.add(`state:${containerId}`);
  tags.add(regionTag);
  tags.add(`${containerId}:${slug}`);
  tags.add(`overlay:${containerId}`);
  return Array.from(tags);
}

function buildFederalReferences(
  framework: Framework,
  requirement: z.infer<typeof RequirementSchema>,
  references: CatalogReferences,
): Reference[] {
  const refs: Reference[] = [];
  if (framework.citation) {
    refs.push({ kind: "doc", value: `${framework.name} ${framework.citation}` });
  }
  if (requirement.citation) {
    refs.push({ kind: "doc", value: `${framework.name} ${requirement.citation}` });
  }
  const reference = references[normaliseContainerKey(framework.id)];
  if (reference) {
    refs.push({ kind: "url", value: reference.url });
  }
  return dedupeReferences(refs);
}

function buildStateReferences(state: State, requirement: z.infer<typeof RequirementSchema>): Reference[] {
  const refs: Reference[] = [];
  if (state.citation) {
    refs.push({ kind: "doc", value: `${state.name} ${state.citation}` });
  }
  if (requirement.citation) {
    refs.push({ kind: "doc", value: `${state.name} ${requirement.citation}` });
  }
  if (state.url) {
    refs.push({ kind: "url", value: state.url });
  }
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

function buildRequirementId(scope: "federal" | "state", containerId: string, requirementId: string): string {
  const prefix = scope === "federal" ? "EDU-US" : "EDU-US-STATE";
  const containerSegment = normaliseSegment(containerId);
  const requirementSegment = normaliseSegment(requirementId);
  return `${prefix}-${containerSegment}-${requirementSegment}`;
}

function normaliseSegment(value: string): string {
  return value
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normaliseContainerId(value: string): string {
  return value.trim().toLowerCase();
}

function normaliseContainerKey(value: string): keyof CatalogReferences {
  const key = value.trim().toLowerCase();
  if (key === "ferpa" || key === "coppa" || key === "cipa" || key === "ppra") {
    return key;
  }
  throw new Error(`Unknown framework reference '${value}'`);
}
