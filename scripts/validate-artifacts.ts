import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import Ajv, { type ErrorObject } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

interface ArtifactDefinition {
  name: string;
  schemaPath: string;
  artifactPath: string;
  optional?: boolean;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function loadJson(filePath: string): Promise<unknown> {
  const raw = await readFile(filePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to parse JSON at ${filePath}: ${(error as Error).message}`);
  }
}

function formatErrors(errors: ErrorObject[] | null | undefined): string {
  if (!errors || errors.length === 0) {
    return "";
  }
  return errors
    .map((error) => {
      const dataPath = error.instancePath || "(root)";
      return `  • ${dataPath} ${error.message ?? "validation error"}`;
    })
    .join("\n");
}

async function main(): Promise<void> {
  const rootDir = process.cwd();
  const schemaDir = path.join(rootDir, "schemas");
  const artifacts: ArtifactDefinition[] = [
    {
      name: "metrics",
      schemaPath: path.join(schemaDir, "metrics.v1.schema.json"),
      artifactPath: path.join(rootDir, ".speckit", "metrics.json"),
    },
    {
      name: "summary",
      schemaPath: path.join(schemaDir, "summary.v1.schema.json"),
      artifactPath: path.join(rootDir, ".speckit", "summary.json"),
      optional: true,
    },
    {
      name: "sanitizer report",
      schemaPath: path.join(schemaDir, "sanitizer-report.v1.schema.json"),
      artifactPath: path.join(rootDir, ".speckit", "sanitizer-report.json"),
      optional: true,
    },
  ];

  const ajv = new Ajv({
    strict: false,
    allErrors: true,
  });
  addFormats(ajv);

  let failures = 0;

  for (const artifact of artifacts) {
    const exists = await fileExists(artifact.artifactPath);
    if (!exists) {
      if (!artifact.optional) {
        console.warn(`[speckit] ${artifact.name} artifact not found at ${path.relative(rootDir, artifact.artifactPath)}`);
        failures += 1;
      } else {
        console.log(`[speckit] Skipping ${artifact.name}: ${path.relative(rootDir, artifact.artifactPath)} not found.`);
      }
      continue;
    }

    const schema = await loadJson(artifact.schemaPath);
    const validate = ajv.compile(schema);
    const data = await loadJson(artifact.artifactPath);
    const valid = validate(data);
    if (!valid) {
      failures += 1;
      console.error(`[speckit] ${artifact.name} failed schema validation (${path.relative(rootDir, artifact.schemaPath)})`);
      const details = formatErrors(validate.errors);
      if (details) {
        console.error(details);
      }
    } else {
      console.log(`[speckit] ${artifact.name} validated against ${path.relative(rootDir, artifact.schemaPath)}`);
    }
  }

  if (failures > 0) {
    process.exitCode = 1;
    throw new Error(`Artifact validation failed for ${failures} file${failures === 1 ? "" : "s"}.`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
