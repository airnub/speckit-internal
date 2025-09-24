import path from "node:path";
import { URL } from "node:url";
import fs from "fs-extra";
import { parse } from "yaml";
import Ajv2020 from "ajv/dist/2020";
import type { ValidateFunction } from "ajv";
import type { SpecModel, Requirement, Reference, Level } from "@speckit/core";

const ajv = new Ajv2020({ allErrors: true, strict: false });
let validator: ValidateFunction | null = null;

export async function loadToModel(specYamlPath: string): Promise<SpecModel> {
  const raw = await fs.readFile(specYamlPath, "utf8");
  const data = parse(raw);
  await validateAgainstSchema(specYamlPath, data);

  const spec = data?.spec ?? {};
  const meta = normaliseMeta(spec?.meta);
  const version = typeof meta.version === "string" && meta.version.trim();
  if (!version) {
    throw new Error("spec.meta.version is required");
  }

  const requirements: Requirement[] = Array.isArray(spec?.requirements)
    ? (spec.requirements as unknown[])
        .map(item => mapRequirement(item))
        .filter((item: Requirement | null): item is Requirement => item !== null)
    : [];

  return {
    version,
    meta: { ...meta, version },
    requirements,
  };
}

async function validateAgainstSchema(specYamlPath: string, data: unknown): Promise<void> {
  const compiled = await loadSchemaValidator(specYamlPath);
  if (!compiled(data)) {
    const message = (compiled.errors ?? [])
      .map(error => `${error.instancePath || "/"} ${error.message || "invalid"}`.trim())
      .join(", ");
    throw new Error(`spec.yaml failed schema validation: ${message || "unknown error"}`);
  }
}

async function loadSchemaValidator(specYamlPath: string): Promise<ValidateFunction> {
  if (validator) {
    return validator;
  }
  const schemaPath = path.join(path.dirname(specYamlPath), "schema", "spec.schema.json");
  const schema = await fs.readJson(schemaPath);
  validator = ajv.compile(schema);
  return validator;
}

function normaliseMeta(meta: unknown): Record<string, unknown> {
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    return { ...(meta as Record<string, unknown>) };
  }
  return {};
}

function mapRequirement(input: unknown): Requirement | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const raw = input as Record<string, unknown>;
  const id = asTrimmedString(raw.id);
  const title = asTrimmedString(raw.title);
  if (!id || !title) {
    return null;
  }

  const requirement: Requirement = {
    id,
    title,
  };

  const description = asTrimmedString(raw.description);
  if (description) {
    requirement.description = description;
  }

  const acceptance = normaliseAcceptance(raw.acceptance);
  if (acceptance.length) {
    requirement.acceptance = acceptance;
  }

  const tags = normaliseStringArray(raw.tags);
  if (tags.length) {
    requirement.tags = tags;
  }

  const refs = normaliseReferences(raw.refs);
  if (refs.length) {
    requirement.refs = refs;
  }

  const dependsOn = normaliseStringArray(raw.dependsOn);
  if (dependsOn.length) {
    requirement.dependsOn = dependsOn;
  }

  const level = normaliseLevel(raw.level, tags);
  if (level) {
    requirement.level = level;
  }

  return requirement;
}

function normaliseAcceptance(input: unknown): string[] {
  if (!input) return [];
  const items = Array.isArray(input) ? input : [input];
  const acceptance: string[] = [];
  for (const item of items) {
    if (typeof item === "string") {
      const trimmed = item.trim();
      if (trimmed) {
        acceptance.push(trimmed);
      }
      continue;
    }
    if (item && typeof item === "object") {
      const given = asTrimmedString((item as Record<string, unknown>).given);
      const when = asTrimmedString((item as Record<string, unknown>).when);
      const then = asTrimmedString((item as Record<string, unknown>).then);
      const text = asTrimmedString((item as Record<string, unknown>).text);
      const parts = [
        given ? `Given ${given}` : undefined,
        when ? `When ${when}` : undefined,
        then ? `Then ${then}` : undefined,
        text,
      ].filter((part): part is string => typeof part === "string" && part.trim().length > 0);
      if (parts.length) {
        acceptance.push(parts.join("; "));
      }
    }
  }
  return acceptance;
}

function normaliseStringArray(input: unknown): string[] {
  if (!input) return [];
  const values = Array.isArray(input) ? input : [input];
  return values
    .map(value => (typeof value === "string" ? value.trim() : ""))
    .filter((value): value is string => value.length > 0);
}

function normaliseReferences(input: unknown): Reference[] {
  if (!input) return [];
  const values = Array.isArray(input) ? input : [input];
  const refs: Reference[] = [];
  for (const value of values) {
    if (!value) continue;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) continue;
      refs.push({ kind: inferReferenceKind(trimmed), value: trimmed });
      continue;
    }
    if (typeof value === "object") {
      const ref = value as Record<string, unknown>;
      const rawKind = asTrimmedString(ref.kind);
      const rawValue = asTrimmedString(ref.value);
      if (rawValue) {
        refs.push({ kind: normaliseReferenceKind(rawKind, rawValue), value: rawValue });
      }
    }
  }
  return refs;
}

function inferReferenceKind(value: string): Reference["kind"] {
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return "url";
    }
  } catch {
    // ignore parsing failure
  }
  if (value.toLowerCase().startsWith("owasp:")) {
    return "owasp";
  }
  if (/^rfc\s*\d+/i.test(value)) {
    return "rfc";
  }
  return "doc";
}

function normaliseReferenceKind(kind: string | undefined, value: string): Reference["kind"] {
  if (kind === "url" || kind === "owasp" || kind === "rfc" || kind === "doc") {
    return kind;
  }
  return inferReferenceKind(value);
}

function normaliseLevel(input: unknown, tags: string[]): Level {
  const fromInput = asTrimmedString(input);
  const candidates = [...tags];
  if (fromInput) {
    candidates.unshift(fromInput);
  }
  for (const candidate of candidates) {
    if (candidate === "L1" || candidate === "L2" || candidate === "L3") {
      return candidate;
    }
  }
  return undefined;
}

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
