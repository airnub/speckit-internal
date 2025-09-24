import path from "node:path";
import fs from "fs-extra";
import { parse } from "yaml";
import { z } from "zod";
import semver from "semver";
import { isLikelyCommitSha } from "./version.js";

const SemverRangeSchema = z
  .string()
  .min(1)
  .transform(value => value.trim())
  .refine(value => semver.validRange(value, { includePrerelease: true }) !== null, {
    message: "Invalid semver range",
  });

const SemverVersionSchema = z
  .string()
  .min(1)
  .transform(value => value.trim())
  .refine(value => Boolean(semver.valid(value, { includePrerelease: true })), {
    message: "Invalid semver version",
  });

const CommitSchema = z
  .string()
  .min(1)
  .transform(value => value.trim().toLowerCase())
  .refine(value => isLikelyCommitSha(value), {
    message: "Invalid git commit",
  });

const CatalogLockSchema = z.array(
  z.object({
    id: z.string(),
    sha: z.string(),
    version: SemverVersionSchema,
    requires_speckit: SemverRangeSchema,
    synced_with: z.object({ version: SemverVersionSchema, commit: CommitSchema }),
  })
);

const BundleSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  kind: z.string(),
  version: SemverVersionSchema,
  engine: z.enum(["nunjucks"]),
  requires_spec: SemverRangeSchema.optional(),
  requires_speckit: SemverRangeSchema,
  outputs: z.array(
    z.object({ id: z.string(), from: z.string(), to: z.string() })
  ),
  validators: z.array(z.unknown()).optional(),
});

export type CatalogLockEntry = z.infer<typeof CatalogLockSchema>[number];
export type BundleDefinition = z.infer<typeof BundleSchema> & { dir: string };

export async function loadCatalogLock(repoRoot: string): Promise<CatalogLockEntry[]> {
  const lockPath = path.join(repoRoot, ".speckit", "catalog.lock");
  if (!(await fs.pathExists(lockPath))) {
    throw new Error(".speckit/catalog.lock is missing");
  }
  const raw = await fs.readFile(lockPath, "utf8");
  const parsed = parse(raw || "[]");
  const entries = CatalogLockSchema.parse(parsed);
  return entries;
}

function ensureBundleDir(repoRoot: string, bundleId: string): { dir: string; kind: string } {
  const catalogRoot = path.join(repoRoot, ".speckit", "catalog");
  const kinds = ["specs", "prompts"];
  for (const kind of kinds) {
    const candidate = path.join(catalogRoot, kind, bundleId);
    if (fs.existsSync(candidate)) {
      return { dir: candidate, kind };
    }
  }
  throw new Error(`Bundle '${bundleId}' not found under .speckit/catalog`);
}

export async function loadBundle(repoRoot: string, entry: CatalogLockEntry): Promise<BundleDefinition> {
  const { dir, kind } = ensureBundleDir(repoRoot, entry.id);
  const bundlePath = path.join(dir, "bundle.yaml");
  const raw = await fs.readFile(bundlePath, "utf8");
  const bundle = BundleSchema.parse(parse(raw));
  if (bundle.kind !== kind) {
    throw new Error(`Bundle '${entry.id}' declared kind '${bundle.kind}' but lives under '${kind}'`);
  }
  return { ...bundle, dir };
}

export function assertSpeckitCompatibility(
  version: string,
  entry: CatalogLockEntry,
  bundle: BundleDefinition
) {
  const ranges = [entry.requires_speckit, bundle.requires_speckit].filter(Boolean) as string[];
  if (ranges.length === 0) {
    throw new Error(`Bundle '${bundle.id}' is missing a requires_speckit range`);
  }
  for (const range of ranges) {
    if (!semver.validRange(range, { includePrerelease: true })) {
      throw new Error(`Invalid requires_speckit range '${range}' for bundle '${bundle.id}'`);
    }
    if (!semver.satisfies(version, range, { includePrerelease: true })) {
      throw new Error(
        `Bundle '${bundle.id}' requires Speckit ${range} but current version is ${version}`
      );
    }
  }
}

export function assertSpecCompatibility(
  specVersion: string,
  bundle: BundleDefinition
) {
  if (!bundle.requires_spec) return;
  const range = bundle.requires_spec;
  if (!semver.validRange(range, { includePrerelease: true })) {
    throw new Error(`Invalid requires_spec range '${range}' for bundle '${bundle.id}'`);
  }
  if (!semver.satisfies(specVersion, range, { includePrerelease: true })) {
    throw new Error(
      `Bundle '${bundle.id}' requires spec version ${range} but current spec is ${specVersion}`
    );
  }
}
