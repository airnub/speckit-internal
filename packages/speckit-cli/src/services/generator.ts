import { createHash } from "node:crypto";
import path from "node:path";
import fs from "fs-extra";
import nunjucks from "nunjucks";
import matter from "gray-matter";
import type { GenerationMode, SpecModel } from "@speckit/engine";
import { loadSpecModel, hashSpecYaml } from "./spec.js";
import {
  loadCatalogLock,
  loadBundle,
  assertSpeckitCompatibility,
  assertSpecCompatibility,
  assertDialectCompatibility,
} from "./catalog.js";
import { getSpeckitVersion, isLikelyCommitSha } from "./version.js";
import { appendManifestRun, updateManifestSpeckit } from "./manifest.js";
import { resolveDefaultGenerationMode } from "./mode.js";
import type { EntitlementProvider, EvaluationContext, FeatureFlags } from "../config/featureFlags.js";
import { assertModeAllowed, getFlags, isExperimentalEnabled, resolveCliEntitlements } from "../config/featureFlags.js";
import { FRAMEWORKS, type FrameworkId, type FrameworkMeta } from "../config/frameworkRegistry.js";

type Provenance = {
  tool: "speckit";
  tool_version: string;
  tool_commit: string;
  mode: GenerationMode;
  experimental: boolean;
  frameworks: { id: string; status: FrameworkStatus }[];
  dialect: { id: string; version: string };
  template: { id: string; version: string; sha: string };
  spec: { version: string; digest: string };
  generated_at: string;
};

type FrameworkStatus = FrameworkMeta["availability"]["status"];

type PreparedOutput = {
  relPath: string;
  absPath: string;
  content: string;
  provenance: Provenance;
  digest: string;
  changed: boolean;
};

export type GenerateOptions = {
  repoRoot?: string;
  write: boolean;
  stdout?: NodeJS.WritableStream;
  mode?: GenerationMode;
  flags?: FeatureFlags;
  entitlements?: EntitlementProvider;
  evaluationContext?: EvaluationContext;
};

export type GenerateResult = {
  outputs: { path: string; changed: boolean }[];
};

export async function generateDocs(options: GenerateOptions): Promise<GenerateResult> {
  const repoRoot = options.repoRoot ?? process.cwd();
  const { model, dialect, data } = await loadSpecModel(repoRoot);
  const specVersion = typeof model.version === "string" ? model.version.trim() : "";
  if (!specVersion) {
    throw new Error("SpecModel.version is required");
  }
  const specDigest = await hashSpecYaml(repoRoot);
  const resolvedMode = options.mode ?? resolveDefaultGenerationMode(data);
  const flags = options.flags ?? getFlags({ cwd: repoRoot });
  let provider = options.entitlements;
  let context = options.evaluationContext;
  if (!provider || !context) {
    const resolved = resolveCliEntitlements(flags);
    provider = provider ?? resolved.provider;
    context = context ?? resolved.context;
  }
  if (!provider || !context) {
    throw new Error("Unable to resolve entitlements for generation");
  }
  await assertModeAllowed(resolvedMode, provider, context);
  const experimentalEnabled = isExperimentalEnabled(flags);
  const frameworksForProvenance = resolveFrameworksForProvenance(data);

  const speckitInfo = await getSpeckitVersion(repoRoot);
  if (!isLikelyCommitSha(speckitInfo.commit)) {
    throw new Error(
      "Unable to determine the Speckit git commit. Ensure the repository has commits and git metadata is available."
    );
  }
  await updateManifestSpeckit(repoRoot, speckitInfo);
  const catalogEntries = await loadCatalogLock(repoRoot);
  if (!catalogEntries.length) {
    throw new Error(".speckit/catalog.lock has no bundles");
  }

  const results: { path: string; changed: boolean }[] = [];

  for (const entry of catalogEntries) {
    const bundle = await loadBundle(repoRoot, entry);
    assertSpeckitCompatibility(speckitInfo.version, entry, bundle);
    assertSpecCompatibility(specVersion, bundle);
    assertDialectCompatibility(dialect, entry, bundle);

    const env = nunjucks.configure(bundle.dir, {
      autoescape: false,
      throwOnUndefined: true,
      noCache: true,
    });

    const context = createRenderingContext(model, dialect);
    const runTimestamp = new Date().toISOString();

    const preparedOutputs: PreparedOutput[] = [];

    for (const output of bundle.outputs) {
      const templatePath = path.join(bundle.dir, output.from);
      const templateSource = await fs.readFile(templatePath, "utf8");
      registerLiteralPlaceholders(env, templateSource);
      const rendered = env.render(output.from, context);
      const targetRel = env.renderString(output.to, context).trim();
      if (!targetRel) {
        throw new Error(`Bundle '${bundle.id}' produced empty target path for output '${output.id}'`);
      }
      const targetPath = path.join(repoRoot, targetRel);
      const existing = await readIfExists(targetPath);

      const baseProvenance: Provenance = {
        tool: "speckit",
        tool_version: speckitInfo.version,
        tool_commit: speckitInfo.commit,
        mode: resolvedMode,
        experimental: experimentalEnabled,
        frameworks: frameworksForProvenance,
        dialect: { ...dialect },
        template: { id: bundle.id, version: bundle.version, sha: entry.sha },
        spec: { version: specVersion, digest: specDigest },
        generated_at: runTimestamp,
      };

      const prepared = prepareOutput(rendered, targetRel, baseProvenance, existing);

      const digest = hashContent(prepared.content);
      const changed = existing === null || normalise(existing) !== normalise(prepared.content);

      preparedOutputs.push({
        relPath: targetRel,
        absPath: targetPath,
        content: prepared.content,
        provenance: prepared.provenance,
        digest,
        changed,
      });

      results.push({ path: targetRel, changed });
    }

    const changedOutputs = preparedOutputs.filter(p => p.changed);

    if (options.write) {
      for (const output of changedOutputs) {
        await fs.ensureDir(path.dirname(output.absPath));
        await fs.writeFile(output.absPath, output.content, "utf8");
        options.stdout?.write(`Updated ${output.relPath}\n`);
      }

      if (preparedOutputs.length > 0) {
        const first = preparedOutputs[0];
        await appendManifestRun(repoRoot, speckitInfo, {
          at: first.provenance.generated_at,
          mode: resolvedMode,
          experimental: experimentalEnabled,
          dialect,
          synced_with: { version: speckitInfo.version, commit: speckitInfo.commit },
          spec: { version: specVersion, digest: specDigest },
          template: {
            id: bundle.id,
            version: bundle.version,
            sha: entry.sha,
          },
          frameworks: frameworksForProvenance,
          outputs: preparedOutputs.map(o => ({ path: o.relPath, digest: o.digest })),
        });
      }
    }
  }

  return { outputs: results };
}

function normalise(value: string): string {
  return value.replace(/\r\n/g, "\n");
}

async function readIfExists(filePath: string): Promise<string | null> {
  if (!(await fs.pathExists(filePath))) return null;
  return await fs.readFile(filePath, "utf8");
}

function hashContent(content: string): string {
  const digest = createHash("sha256").update(content, "utf8").digest("hex");
  return `sha256:${digest}`;
}

function prepareOutput(
  rendered: string,
  targetRel: string,
  provenance: Provenance,
  existing: string | null
): { content: string; provenance: Provenance } {
  const ext = path.extname(targetRel).toLowerCase();
  if (ext === ".md" || ext === ".mdx") {
    return prepareMarkdown(rendered, provenance, existing);
  }
  return prepareWithComment(rendered, provenance, existing, ext);
}

function prepareMarkdown(
  rendered: string,
  provenance: Provenance,
  existing: string | null
): { content: string; provenance: Provenance } {
  const parsed = matter(normalise(rendered));
  const body = parsed.content;
  let finalProv = { ...provenance };

  if (existing) {
    const existingParsed = matter(normalise(existing));
    const existingProv = existingParsed.data?.speckit_provenance;
    if (existingProv && typeof existingProv === "object") {
      const { generated_at: prevGeneratedAt, ...restExisting } = existingProv as Record<string, unknown>;
      const { generated_at: newGeneratedAt, ...restNew } = provenance;
      const bodySame = normalise(existingParsed.content) === normalise(body);
      if (bodySame && deepEqual(restExisting, restNew) && typeof prevGeneratedAt === "string" && prevGeneratedAt.trim()) {
        finalProv = { ...provenance, generated_at: prevGeneratedAt.trim() };
      }
    }
  }

  const data = { ...parsed.data, speckit_provenance: finalProv };
  const stringified = matter.stringify(body, data).replace(/\r\n/g, "\n");
  return { content: ensureTrailingNewline(stringified), provenance: finalProv };
}

function prepareWithComment(
  rendered: string,
  provenance: Provenance,
  existing: string | null,
  ext: string
): { content: string; provenance: Provenance } {
  const comment = buildComment(provenance, ext);
  const body = normalise(rendered).replace(/^\uFEFF/, "").trimStart();
  const candidate = ensureTrailingNewline(`${comment}\n${body}`);
  if (existing && normalise(existing) === normalise(candidate)) {
    return { content: ensureTrailingNewline(existing), provenance: provenance };
  }
  return { content: candidate, provenance };
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function buildComment(provenance: Provenance, ext: string): string {
  const message =
    `Generated by Speckit ${provenance.tool_version} (${provenance.tool_commit}) ` +
    `using template ${provenance.template.id}@${provenance.template.sha} ` +
    `for spec ${provenance.spec.version} (${provenance.spec.digest}) ` +
    `dialect ${provenance.dialect.id}@${provenance.dialect.version}.`;
  switch (ext) {
    case ".yml":
    case ".yaml":
    case ".sh":
    case ".py":
      return `# ${message}`;
    case ".ts":
    case ".tsx":
    case ".js":
    case ".jsx":
    case ".json":
      return `/* ${message} */`;
    default:
      return `<!-- ${message} -->`;
  }
}

function resolveFrameworksForProvenance(data: any): { id: string; status: FrameworkStatus }[] {
  if (!Array.isArray(data?.compliance?.frameworks)) {
    return [];
  }
  const ids = data.compliance.frameworks
    .map((entry: any) => (typeof entry?.id === "string" ? entry.id.trim() : ""))
    .filter((id: string): id is string => Boolean(id));
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

function createRenderingContext(model: SpecModel, dialect: { id: string; version: string }): any {
  const legacySpec = buildLegacySpec(model);
  const base: Record<string, unknown> = {
    model,
    spec: legacySpec,
    dialect,
    meta: legacySpec.meta,
    requirements: legacySpec.requirements,
  };
  const placeholderPattern = /^[A-Z0-9_]+$/;
  return new Proxy(base, {
    get(target, prop, receiver) {
      if (typeof prop === "string") {
        if (Reflect.has(target, prop)) {
          return Reflect.get(target, prop, receiver);
        }
        if (placeholderPattern.test(prop)) {
          return `{{${prop}}}`;
        }
      }
      return Reflect.get(target, prop, receiver);
    },
    has(target, prop) {
      if (Reflect.has(target, prop)) return true;
      return typeof prop === "string" && placeholderPattern.test(prop);
    },
  });
}

function registerLiteralPlaceholders(env: nunjucks.Environment, source: string) {
  const regex = /\{\{\s*([A-Z0-9_]+)\s*\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source))) {
    const name = match[1];
    env.addGlobal(name, `{{${name}}}`);
  }
}

function buildLegacySpec(model: SpecModel): { meta: Record<string, unknown>; requirements: any[] } {
  const metaSource =
    model.meta && typeof model.meta === "object" && !Array.isArray(model.meta)
      ? (model.meta as Record<string, unknown>)
      : {};
  const meta = { ...metaSource, version: model.version };
  const requirements = model.requirements.map(requirement => ({
    ...requirement,
    acceptance: requirement.acceptance ? [...requirement.acceptance] : undefined,
    tags: requirement.tags ? [...requirement.tags] : undefined,
    refs: requirement.refs ? requirement.refs.map(ref => ({ ...ref })) : undefined,
    dependsOn: requirement.dependsOn ? [...requirement.dependsOn] : undefined,
  }));
  return { meta, requirements };
}

function deepEqual(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(v => stableStringify(v)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, val]) => [key, stableStringify(val)] as const)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, val]) => `${JSON.stringify(key)}:${val}`).join(",")}}`;
}
