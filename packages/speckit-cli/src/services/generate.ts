import fs from "fs-extra";
import path from "node:path";
import matter from "gray-matter";
import nunjucks from "nunjucks";
import { createHash } from "node:crypto";

import { loadSpec } from "./spec.js";
import { getSpeckitVersion, hashSpecYaml } from "./provenance.js";
import {
  loadBundles,
  loadCatalogLock,
  findLockEntry,
  assertSpeckitVersionSatisfies,
  resolveBundleGitSha,
  type BundleDefinition,
  type CatalogLockEntry
} from "./catalog.js";
import { readManifest, writeManifest } from "./manifest.js";
import { resolveRepoRoot } from "./workspace.js";

type GenerateOptions = {
  repoRoot?: string;
  write?: boolean;
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
};

type OutputRecord = {
  bundle: BundleDefinition;
  lock: CatalogLockEntry;
  relativePath: string;
  absolutePath: string;
  content: string;
  digest: string;
};

export async function generateAll(options: GenerateOptions = {}) {
  const repoRoot = await resolveRepoRoot(options.repoRoot || process.cwd());
  const stdout = options.stdout || process.stdout;
  const stderr = options.stderr || process.stderr;
  const shouldWrite = options.write ?? false;

  const spec = await loadSpec(repoRoot);
  const specDigest = await hashSpecYaml(repoRoot);
  const toolInfo = await getSpeckitVersion(repoRoot);
  const specData = (spec as any).spec || {};

  const bundles = await loadBundles(repoRoot);
  const lockEntries = await loadCatalogLock(repoRoot);

  if (!bundles.length) {
    stdout.write("No bundles discovered under .speckit/catalog.\n");
    return;
  }

  for (const bundle of bundles) {
    const lock = findLockEntry(lockEntries, bundle.id);
    if (!lock) {
      stderr.write(`Skipping bundle '${bundle.id}' (no catalog.lock entry).\n`);
      continue;
    }

    const bundleRange = bundle.requires_speckit || lock.requires_speckit;
    assertSpeckitVersionSatisfies(bundleRange, toolInfo.version, bundle.id);

    const actualSha = await resolveBundleGitSha(repoRoot, bundle.dir);
    if (actualSha && actualSha !== lock.sha) {
      throw new Error(`Bundle '${bundle.id}' SHA mismatch. Lock has ${lock.sha}, repo tree is ${actualSha}.`);
    }

    if (!Array.isArray(bundle.outputs) || !bundle.outputs.length) {
      stderr.write(`Bundle '${bundle.id}' declares no outputs; skipping.\n`);
      continue;
    }

    const env = nunjucks.configure(bundle.dir, { autoescape: false, noCache: true });
    const timestamp = new Date().toISOString();
    const records: OutputRecord[] = [];

    for (const output of bundle.outputs) {
      const context = { spec: specData };
      const renderedPath = env.renderString(output.to, context);
      if (!renderedPath || typeof renderedPath !== "string") {
        throw new Error(`Bundle '${bundle.id}' produced an empty output path for '${output.id}'.`);
      }

      if (path.isAbsolute(renderedPath)) {
        throw new Error(`Bundle '${bundle.id}' attempted to write absolute path '${renderedPath}'.`);
      }

      const relativePath = normalizeRelativePath(renderedPath);
      const absolutePath = path.join(repoRoot, relativePath);

      const raw = env.render(output.from, context);
      const content = withProvenance(raw, absolutePath, {
        bundle,
        lock,
        tool: toolInfo,
        specVersion: String((spec as any).spec?.meta?.version || ""),
        specDigest,
        generatedAt: timestamp
      });

      const digest = createHash("sha256").update(content).digest("hex");

      records.push({ bundle, lock, relativePath, absolutePath, content, digest });
    }

    if (shouldWrite) {
      for (const record of records) {
        await fs.ensureDir(path.dirname(record.absolutePath));
        await fs.writeFile(record.absolutePath, record.content, "utf8");
        stdout.write(`Wrote ${record.relativePath}\n`);
      }

      await appendManifest(repoRoot, {
        tool: toolInfo,
        specVersion: String((spec as any).spec?.meta?.version || ""),
        specDigest,
        bundle,
        lock,
        timestamp,
        outputs: records
      });
    } else {
      for (const record of records) {
        stdout.write(`Would write ${record.relativePath}\n`);
      }
    }
  }
}

function normalizeRelativePath(value: string): string {
  const sanitized = value.replace(/^\.\//, "");
  const normalized = path.normalize(sanitized);
  return normalized.replace(/\\/g, "/");
}

type ProvenanceContext = {
  bundle: BundleDefinition;
  lock: CatalogLockEntry;
  tool: { version: string; commit: string };
  specVersion: string;
  specDigest: string;
  generatedAt: string;
};

function withProvenance(raw: string, absolutePath: string, ctx: ProvenanceContext): string {
  const ext = path.extname(absolutePath).toLowerCase();
  const isMarkdown = [".md", ".mdx", ".markdown"].includes(ext);
  const provenance = {
    speckit_provenance: {
      tool: "speckit",
      tool_version: ctx.tool.version,
      tool_commit: ctx.tool.commit,
      template: {
        id: ctx.bundle.id,
        version: ctx.bundle.version,
        sha: ctx.lock.sha
      },
      spec: {
        version: ctx.specVersion,
        digest: ctx.specDigest
      },
      generated_at: ctx.generatedAt
    }
  };

  if (isMarkdown) {
    const parsed = matter(raw);
    const data = { ...(parsed.data || {}), ...provenance };
    let body = parsed.content || "";
    if (!body.endsWith("\n")) {
      body = `${body}\n`;
    }
    const output = matter.stringify(body, data, { lineFeed: "\n" });
    return ensureTrailingNewline(output);
  }

  const header = `<!-- Generated by Speckit v${ctx.tool.version} (${ctx.tool.commit}) using bundle ${ctx.bundle.id}@${ctx.lock.sha}; spec ${ctx.specDigest}; generated ${ctx.generatedAt} -->`;
  const withoutExisting = raw.replace(/^<!--\s*Generated by Speckit[\s\S]*?-->\s*/i, "");
  const content = `${header}\n${withoutExisting.replace(/^\s*/, "")}`;
  return ensureTrailingNewline(content);
}

function ensureTrailingNewline(value: string): string {
  if (value.endsWith("\n")) {
    return value;
  }
  return `${value}\n`;
}

type ManifestAppendContext = {
  tool: { version: string; commit: string };
  specVersion: string;
  specDigest: string;
  bundle: BundleDefinition;
  lock: CatalogLockEntry;
  timestamp: string;
  outputs: OutputRecord[];
};

async function appendManifest(repoRoot: string, ctx: ManifestAppendContext) {
  const manifest = await readManifest(repoRoot);
  manifest.speckit = { version: ctx.tool.version, commit: ctx.tool.commit };
  manifest.runs.push({
    at: ctx.timestamp,
    spec: { version: ctx.specVersion, digest: ctx.specDigest },
    template: { id: ctx.bundle.id, version: ctx.bundle.version, sha: ctx.lock.sha },
    outputs: ctx.outputs.map(output => ({
      path: output.relativePath,
      digest: `sha256:${output.digest}`
    }))
  });
  await writeManifest(repoRoot, manifest);
}
