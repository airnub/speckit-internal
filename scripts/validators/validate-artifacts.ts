import { promises as fs } from "node:fs";
import path from "node:path";

import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";

interface ValidationResult {
  file: string;
  ok: boolean;
  errors: string[];
}

const ROOT = process.cwd();
const SPECKIT_DIR = path.join(ROOT, ".speckit");
const SCHEMA_DIR = path.join(ROOT, "schemas");

async function readJson(filePath: string): Promise<unknown> {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as unknown;
}

async function validateJsonFile(
  ajv: Ajv,
  filePath: string,
  schemaPath: string,
  description: string
): Promise<ValidationResult> {
  try {
    const data = await readJson(filePath);
    const schema = await readJson(schemaPath);
    const validate = ajv.compile(schema);
    const ok = validate(data);
    const errors = ok ? [] : (validate.errors ?? []).map((error) => `${error.instancePath || "/"} ${error.message ?? "invalid"}`);
    return { file: description, ok: Boolean(ok), errors };
  } catch (error) {
    const err = error as Error & { code?: string };
    if (err.code === "ENOENT") {
      return { file: description, ok: false, errors: ["file not found"] };
    }
    return { file: description, ok: false, errors: [err.message] };
  }
}

async function validateJsonlFile(
  ajv: Ajv,
  filePath: string,
  schemaPath: string,
  description: string
): Promise<ValidationResult> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const schema = await readJson(schemaPath);
    const validate = ajv.compile(schema);
    const errors: string[] = [];
    const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      try {
        const parsed = JSON.parse(line) as unknown;
        const ok = validate(parsed);
        if (!ok) {
          const details = (validate.errors ?? [])
            .map((error) => `${error.instancePath || "/"} ${error.message ?? "invalid"}`)
            .join(", ");
          errors.push(`line ${index + 1}: ${details}`);
        }
      } catch (error) {
        errors.push(`line ${index + 1}: ${(error as Error).message}`);
      }
    }
    return { file: description, ok: errors.length === 0, errors };
  } catch (error) {
    const err = error as Error & { code?: string };
    if (err.code === "ENOENT") {
      return { file: description, ok: false, errors: ["file not found"] };
    }
    return { file: description, ok: false, errors: [err.message] };
  }
}

async function main(): Promise<void> {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const results: ValidationResult[] = [];

  results.push(
    await validateJsonFile(
      ajv,
      path.join(SPECKIT_DIR, "metrics.json"),
      path.join(SCHEMA_DIR, "metrics.v1.schema.json"),
      "metrics.json"
    )
  );

  results.push(
    await validateJsonFile(
      ajv,
      path.join(SPECKIT_DIR, "summary.json"),
      path.join(SCHEMA_DIR, "summary.v1.schema.json"),
      "summary.json"
    )
  );

  results.push(
    await validateJsonlFile(
      ajv,
      path.join(SPECKIT_DIR, "requirements.jsonl"),
      path.join(SCHEMA_DIR, "requirements.v1.schema.json"),
      "requirements.jsonl"
    )
  );

  let ok = true;
  for (const result of results) {
    if (result.ok) {
      console.log(`✅ ${result.file}`);
    } else {
      ok = false;
      console.error(`❌ ${result.file}`);
      for (const error of result.errors) {
        console.error(`   - ${error}`);
      }
    }
  }

  if (!ok) {
    process.exitCode = 1;
    throw new Error("Artifact schema validation failed");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
