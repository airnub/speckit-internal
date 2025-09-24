import { createHash } from "node:crypto";
import path from "node:path";
import fs from "fs-extra";
import nunjucks from "nunjucks";
import matter from "gray-matter";
import {
  loadSpecYaml,
  hashSpecYaml,
} from "./spec.js";
import {
  loadCatalogLock,
  loadBundle,
  assertSpeckitCompatibility,
  assertSpecCompatibility,
} from "./catalog.js";
import { getSpeckitVersion } from "./version.js";
import { appendManifestRun } from "./manifest.js";

type Provenance = {
  tool: "speckit";
  tool_version: string;
  tool_commit: string;
  template: { id: string; version: string; sha: string };
  spec: { version: string; digest: string };
  generated_at: string;
};

type PreparedOutput = {
  relPath: string;
  absPath: string;
  content: string;
  provenance: Provenance;
  digest: string;
  changed: boolean;
};

type PrepareOutputOptions = {
  outputId?: string;
  specMeta?: unknown;
};

export type GenerateOptions = {
  repoRoot?: string;
  write: boolean;
  stdout?: NodeJS.WritableStream;
};

export type GenerateResult = {
  outputs: { path: string; changed: boolean }[];
};

export async function generateDocs(options: GenerateOptions): Promise<GenerateResult> {
  const repoRoot = options.repoRoot ?? process.cwd();
  const { data: specData } = await loadSpecYaml(repoRoot);
  const spec = specData?.spec;
  if (!spec) {
    throw new Error("spec.yaml missing root 'spec' object");
  }
  const specMeta = spec.meta ?? {};
  if (!specMeta || typeof specMeta.version !== "string" || !specMeta.version.trim()) {
    throw new Error("spec.meta.version is required");
  }
  const specVersion = specMeta.version.trim();
  const specDigest = await hashSpecYaml(repoRoot);

  const speckitInfo = await getSpeckitVersion(repoRoot);
  const catalogEntries = await loadCatalogLock(repoRoot);
  if (!catalogEntries.length) {
    throw new Error(".speckit/catalog.lock has no bundles");
  }

  const results: { path: string; changed: boolean }[] = [];

  for (const entry of catalogEntries) {
    const bundle = await loadBundle(repoRoot, entry);
    assertSpeckitCompatibility(speckitInfo.version, entry, bundle);
    assertSpecCompatibility(specVersion, bundle);

    const env = nunjucks.configure(bundle.dir, {
      autoescape: false,
      throwOnUndefined: true,
      noCache: true,
    });

    const context = createRenderingContext(specData, spec);
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
        template: { id: bundle.id, version: bundle.version, sha: entry.sha },
        spec: { version: specVersion, digest: specDigest },
        generated_at: runTimestamp,
      };

      const prepared = prepareOutput(rendered, targetRel, baseProvenance, existing, {
        outputId: output.id,
        specMeta,
      });

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

      if (changedOutputs.length > 0) {
        const first = changedOutputs[0];
        await appendManifestRun(repoRoot, speckitInfo, {
          at: first.provenance.generated_at,
          spec: { version: specVersion, digest: specDigest },
          template: {
            id: bundle.id,
            version: bundle.version,
            sha: entry.sha,
          },
          outputs: changedOutputs.map(o => ({ path: o.relPath, digest: o.digest })),
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
  existing: string | null,
  options: PrepareOutputOptions = {}
): { content: string; provenance: Provenance } {
  const ext = path.extname(targetRel).toLowerCase();
  if (ext === ".md" || ext === ".mdx") {
    return prepareMarkdown(rendered, provenance, existing, options);
  }
  return prepareWithComment(rendered, provenance, existing, ext);
}

function prepareMarkdown(
  rendered: string,
  provenance: Provenance,
  existing: string | null,
  options: PrepareOutputOptions = {}
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

  const withWhyItMatters = maybeInjectWhyItMatters(body, options);
  const data = { ...parsed.data, speckit_provenance: finalProv };
  const stringified = matter.stringify(withWhyItMatters, data).replace(/\r\n/g, "\n");
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

function maybeInjectWhyItMatters(
  body: string,
  options: PrepareOutputOptions
): string {
  const whyItMatters = extractWhyItMatters(options);
  if (!whyItMatters || hasWhyItMattersSection(body)) {
    return body;
  }
  const trimmed = body.replace(/\s+$/, "");
  const section = formatWhyItMattersSection(whyItMatters);
  if (!trimmed) {
    return `${section}\n`;
  }
  return `${trimmed}\n\n${section}\n`;
}

function extractWhyItMatters(options: PrepareOutputOptions): string[] | undefined {
  if (!options || options.outputId !== "spec") {
    return undefined;
  }
  const meta = options.specMeta;
  if (!meta || typeof meta !== "object") {
    return undefined;
  }
  const candidate =
    (meta as Record<string, unknown>)["why_it_matters"] ??
    (meta as Record<string, unknown>)["whyItMatters"];
  if (!Array.isArray(candidate)) {
    return undefined;
  }
  const cleaned = candidate
    .filter((item): item is string => typeof item === "string")
    .map(item => item.trim())
    .filter(item => item.length > 0);
  return cleaned.length ? cleaned : undefined;
}

function hasWhyItMattersSection(body: string): boolean {
  return /(^|\n)##\s+Why it matters\b/i.test(body);
}

function formatWhyItMattersSection(points: string[]): string {
  const bullets = points.map(point => `- ${point}`).join("\n");
  return `## Why it matters\n\n${bullets}`;
}

function buildComment(provenance: Provenance, ext: string): string {
  const message = `Generated by Speckit ${provenance.tool_version} (${provenance.tool_commit}) using template ${provenance.template.id}@${provenance.template.sha} for spec ${provenance.spec.version} (${provenance.spec.digest}).`;
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

function createRenderingContext(specData: any, spec: any): any {
  const base = { ...specData, spec };
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
