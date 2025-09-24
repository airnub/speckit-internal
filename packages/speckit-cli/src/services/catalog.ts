import fs from "fs-extra";
import path from "node:path";
import { globby } from "globby";
import { parse } from "yaml";
import { execa } from "execa";
import semver from "semver";

import type { SpeckitVersion } from "./provenance.js";

export type BundleOutput = {
  id: string;
  from: string;
  to: string;
};

export type BundleDefinition = {
  id: string;
  name: string;
  kind: string;
  version: string;
  engine: string;
  outputs: BundleOutput[];
  requires_spec?: string;
  requires_speckit?: string;
  validators?: unknown[];
  dir: string;
};

export type CatalogLockEntry = {
  id: string;
  sha: string;
  version: string;
  requires_speckit?: string;
  synced_with?: SpeckitVersion;
};

export async function loadBundles(repoRoot = process.cwd()): Promise<BundleDefinition[]> {
  const catalogDir = path.join(repoRoot, ".speckit", "catalog");
  const bundleFiles = await globby(["**/bundle.yaml"], { cwd: catalogDir, dot: false });

  const bundles: BundleDefinition[] = [];

  for (const relPath of bundleFiles) {
    const fullPath = path.join(catalogDir, relPath);
    const dir = path.dirname(fullPath);
    const raw = await fs.readFile(fullPath, "utf8");
    const data = parse(raw) as any;

    if (!data || typeof data !== "object") {
      throw new Error(`Invalid bundle definition at ${fullPath}`);
    }

    const outputs: BundleOutput[] = Array.isArray(data.outputs)
      ? data.outputs.map((entry: any) => ({
          id: String(entry.id),
          from: String(entry.from),
          to: String(entry.to)
        }))
      : [];

    if (Array.isArray(data.outputs) && outputs.length !== data.outputs.length) {
      throw new Error(`Bundle ${data.id || relPath} has malformed outputs entries.`);
    }

    bundles.push({
      id: String(data.id),
      name: String(data.name || data.id),
      kind: String(data.kind || ""),
      version: String(data.version || "0.0.0"),
      engine: String(data.engine || "nunjucks"),
      outputs,
      requires_spec: typeof data.requires_spec === "string" ? data.requires_spec : undefined,
      requires_speckit: typeof data.requires_speckit === "string" ? data.requires_speckit : undefined,
      validators: Array.isArray(data.validators) ? data.validators : undefined,
      dir
    });
  }

  return bundles;
}

export async function loadCatalogLock(repoRoot = process.cwd()): Promise<CatalogLockEntry[]> {
  const lockPath = path.join(repoRoot, ".speckit", "catalog.lock");
  if (!(await fs.pathExists(lockPath))) {
    return [];
  }

  try {
    const text = await fs.readFile(lockPath, "utf8");
    if (!text.trim()) return [];
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("catalog.lock must contain a JSON array.");
    }
    return parsed.map(entry => normalizeLockEntry(entry));
  } catch (error: any) {
    throw new Error(`Failed to parse catalog.lock: ${error?.message || error}`);
  }
}

export function findLockEntry(entries: CatalogLockEntry[], id: string): CatalogLockEntry | undefined {
  return entries.find(entry => entry.id === id);
}

export function assertSpeckitVersionSatisfies(range: string | undefined, version: string, bundleId: string) {
  if (!range) return;
  if (!semver.validRange(range)) {
    throw new Error(`Bundle ${bundleId} declares invalid requires_speckit range '${range}'.`);
  }
  if (!semver.satisfies(version, range, { includePrerelease: true })) {
    throw new Error(`Bundle ${bundleId} requires Speckit ${range}, but current version is ${version}.`);
  }
}

export async function resolveBundleGitSha(repoRoot: string, bundleDir: string): Promise<string | null> {
  const relDir = path.relative(repoRoot, bundleDir).replace(/\\/g, "/");
  try {
    const { stdout } = await execa("git", ["rev-parse", `HEAD:${relDir}`], { cwd: repoRoot });
    return stdout.trim();
  } catch {
    return null;
  }
}

function normalizeLockEntry(value: any): CatalogLockEntry {
  if (!value || typeof value !== "object") {
    throw new Error("catalog.lock entry must be an object.");
  }
  const entry: CatalogLockEntry = {
    id: String((value as any).id),
    sha: String((value as any).sha),
    version: String((value as any).version)
  };

  if (typeof (value as any).requires_speckit === "string") {
    entry.requires_speckit = (value as any).requires_speckit;
  }

  if (value.synced_with && typeof value.synced_with === "object") {
    const sync = value.synced_with as any;
    entry.synced_with = {
      version: typeof sync.version === "string" ? sync.version : "",
      commit: typeof sync.commit === "string" ? sync.commit : ""
    };
  }

  return entry;
}
