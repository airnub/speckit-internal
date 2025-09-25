import { createHash } from "node:crypto";
import path from "node:path";
import fs from "fs-extra";
import { parse } from "yaml";
import semver from "semver";
import type { SpecModel } from "@speckit/engine";
import { loadToModel as loadSpeckitV1 } from "@speckit/adapter-speckit-v1";
import { loadToModel as loadAsvsV4 } from "@speckit/adapter-owasp-asvs-v4";

export type LoadedSpec = {
  raw: string;
  data: any;
};

export type DialectInfo = {
  id: string;
  version: string;
};

type AdapterLoader = (specYamlPath: string) => Promise<SpecModel>;

const KNOWN_DIALECTS: Record<string, { range: string; loader: AdapterLoader }> = {
  "speckit.v1": { range: ">=1.0.0 <2.0.0", loader: loadSpeckitV1 },
  "owasp.asvs.v4": { range: ">=4.0.0 <5.0.0", loader: loadAsvsV4 },
};

export async function loadSpecYaml(repoRoot: string): Promise<LoadedSpec> {
  const specPath = path.join(repoRoot, ".speckit", "spec.yaml");
  const raw = await fs.readFile(specPath, "utf8");
  const data = parse(raw);
  return { raw, data };
}

export type LoadedSpecModel = {
  model: SpecModel;
  dialect: DialectInfo;
  data: any;
};

export async function loadSpecModel(repoRoot: string): Promise<LoadedSpecModel> {
  const { data } = await loadSpecYaml(repoRoot);
  const dialect = resolveDialect(data);
  const specPath = path.join(repoRoot, ".speckit", "spec.yaml");
  const adapter = selectAdapter(dialect);
  const model = await adapter(specPath);
  return { model, dialect, data };
}

export async function hashSpecYaml(repoRoot: string): Promise<string> {
  const specPath = path.join(repoRoot, ".speckit", "spec.yaml");
  const raw = await fs.readFile(specPath);
  const digest = createHash("sha256").update(raw).digest("hex");
  return `sha256:${digest}`;
}

export function resolveDialect(data: any): DialectInfo {
  const candidate =
    normaliseDialect(data?.dialect) ?? normaliseDialect(data?.spec?.meta?.dialect);
  if (!candidate) {
    throw new Error("spec.yaml must declare dialect.id and dialect.version");
  }
  if (!semver.valid(candidate.version, { includePrerelease: true })) {
    throw new Error(`Invalid dialect version '${candidate.version}'`);
  }
  return candidate;
}

function normaliseDialect(input: unknown): DialectInfo | null {
  if (!input) return null;
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return null;
    const [idPart, versionPart] = trimmed.split("@");
    if (idPart && versionPart) {
      const id = idPart.trim();
      const version = versionPart.trim();
      return id && version ? { id, version } : null;
    }
    return null;
  }
  if (typeof input === "object") {
    const raw = input as Record<string, unknown>;
    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    const version = typeof raw.version === "string" ? raw.version.trim() : "";
    if (id && version) {
      return { id, version };
    }
  }
  return null;
}

function selectAdapter(dialect: DialectInfo): AdapterLoader {
  const entry = KNOWN_DIALECTS[dialect.id];
  if (!entry) {
    throw new Error(`Unsupported dialect '${dialect.id}'`);
  }
  if (!semver.satisfies(dialect.version, entry.range, { includePrerelease: true })) {
    throw new Error(
      `Dialect ${dialect.id}@${dialect.version} is not supported (expected ${entry.range})`
    );
  }
  return entry.loader;
}
