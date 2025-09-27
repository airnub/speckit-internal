import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import YAML from "yaml";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");

const VariantSchema = z
  .object({
    key: z.string(),
    description: z.string().optional(),
    weight: z.number().positive().default(1),
    metadata: z.record(z.any()).default({}),
  })
  .strict();

const ExperimentSchema = z
  .object({
    key: z.string(),
    description: z.string().optional(),
    enabled: z.boolean().default(true),
    bucket_count: z.number().int().positive().max(10_000).default(1_000),
    variants: z.array(VariantSchema).min(1),
  })
  .strict();

const ExperimentsFileSchema = z
  .object({
    version: z.literal(1).default(1),
    experiments: z.array(ExperimentSchema).default([]),
  })
  .strict();

export type ExperimentsConfig = z.infer<typeof ExperimentsFileSchema>;
export type ExperimentDefinition = z.infer<typeof ExperimentSchema>;
export type ExperimentVariant = z.infer<typeof VariantSchema>;

export interface ExperimentAssignment {
  key: string;
  description?: string;
  variantKey: string;
  variantDescription?: string;
  bucket: number;
  weight: number;
  metadata: Record<string, unknown>;
}

export interface LoadExperimentAssignmentsOptions {
  rootDir?: string;
  seed: string;
}

function hashToUnitInterval(input: string): number {
  const hash = crypto.createHash("sha256").update(input).digest();
  const sample = hash.readUIntBE(0, 6);
  const max = 0xffffffffffff;
  return sample / max;
}

async function readConfig(rootDir: string): Promise<ExperimentsConfig> {
  const configPath = path.join(rootDir, "speckit.experiments.yaml");
  try {
    const raw = await fs.readFile(configPath, "utf8");
    const parsed = YAML.parse(raw) ?? {};
    return ExperimentsFileSchema.parse(parsed);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return { version: 1, experiments: [] };
    }
    throw new Error(`Failed to read speckit.experiments.yaml: ${(error as Error).message}`);
  }
}

function pickVariant(experiment: ExperimentDefinition, seed: string): ExperimentVariant {
  const totalWeight = experiment.variants.reduce((sum, variant) => sum + variant.weight, 0);
  const normalizedTotal = totalWeight > 0 ? totalWeight : experiment.variants.length;
  const unit = hashToUnitInterval(`${seed}:${experiment.key}`);
  let cumulative = 0;
  for (const variant of experiment.variants) {
    const weight = variant.weight > 0 ? variant.weight : normalizedTotal / experiment.variants.length;
    cumulative += weight / normalizedTotal;
    if (unit <= cumulative) {
      return variant;
    }
  }
  return experiment.variants[experiment.variants.length - 1];
}

export async function loadExperimentAssignments(
  options: LoadExperimentAssignmentsOptions
): Promise<ExperimentAssignment[]> {
  const rootDir = options.rootDir ?? ROOT;
  const config = await readConfig(rootDir);
  if (!config.experiments || config.experiments.length === 0) {
    return [];
  }
  const seed = options.seed;
  return config.experiments
    .filter((experiment) => experiment.enabled)
    .map((experiment) => {
      const variant = pickVariant(experiment, seed);
      const bucketCount = experiment.bucket_count ?? 1_000;
      const unit = hashToUnitInterval(`${seed}:${experiment.key}:bucket`);
      const bucket = Math.min(bucketCount - 1, Math.floor(unit * bucketCount));
      return {
        key: experiment.key,
        description: experiment.description,
        variantKey: variant.key,
        variantDescription: variant.description,
        bucket,
        weight: variant.weight,
        metadata: variant.metadata ?? {},
      } satisfies ExperimentAssignment;
    });
}

export async function loadExperimentsConfig(rootDir = ROOT): Promise<ExperimentsConfig> {
  return readConfig(rootDir);
}
