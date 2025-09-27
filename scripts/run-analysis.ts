import { promises as fs } from "node:fs";
import path from "node:path";

import {
  analyze,
  summarizeMetrics,
  type AnalyzerResult,
  type NormalizedLog,
  type RequirementRecord,
} from "@speckit/analyzer";
import { createFileLogSource, loadFailureRulesFromFs } from "@speckit/analyzer/adapters/node";

import { writeArtifacts } from "./writers/artifacts.js";
import { updateRTM } from "./writers/rtm.js";
import { loadExperimentAssignments } from "./config/experiments.js";
import type { ExperimentAssignment } from "./config/experiments.js";

export interface RunAnalysisResult {
  runId: string;
  requirements: RequirementRecord[];
  metricsSummary: ReturnType<typeof summarizeMetrics>;
  labels: Set<string>;
  normalized: NormalizedLog;
  artifacts: Awaited<ReturnType<typeof writeArtifacts>>;
  experiments: ExperimentAssignment[];
  hints: string[];
}

export interface RunAnalysisOptions {
  runId?: string;
  outDir?: string;
}

function coerceHitCount(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function sumHitCounts(entries: unknown): number | undefined {
  if (!Array.isArray(entries)) return undefined;
  let total = 0;
  let found = false;
  for (const entry of entries) {
    let candidate: number | undefined;
    if (typeof entry === "object" && entry !== null) {
      const record = entry as Record<string, unknown>;
      candidate =
        coerceHitCount(record.hits) ??
        coerceHitCount(record.count) ??
        coerceHitCount(record.total) ??
        coerceHitCount(record.value);
    } else {
      candidate = coerceHitCount(entry);
    }
    if (candidate !== undefined) {
      found = true;
      total += candidate;
    }
  }
  return found ? total : undefined;
}

function extractSanitizerHits(report: unknown): number | undefined {
  if (report === null || report === undefined) return undefined;
  const direct = coerceHitCount(report);
  if (direct !== undefined) {
    return direct;
  }
  if (Array.isArray(report)) {
    return sumHitCounts(report);
  }
  if (typeof report === "object") {
    const record = report as Record<string, unknown>;
    const keys = ["hits", "total_hits", "totalHits", "sanitizer_hits", "sanitizerHits", "count", "value"];
    for (const key of keys) {
      const candidate = coerceHitCount(record[key]);
      if (candidate !== undefined) {
        return candidate;
      }
    }
    const nestedKeys = ["entries", "reports", "redactions", "records"];
    for (const key of nestedKeys) {
      const candidate = sumHitCounts(record[key]);
      if (candidate !== undefined) {
        return candidate;
      }
    }
  }
  return undefined;
}

async function readSanitizerHits(outDir: string, rootDir: string): Promise<number | undefined> {
  const reportPath = path.join(outDir, "sanitizer-report.json");
  try {
    const raw = await fs.readFile(reportPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return extractSanitizerHits(parsed);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") {
      return undefined;
    }
    console.warn(
      `[speckit] Unable to read sanitizer report at ${path.relative(rootDir, reportPath)}: ${nodeError?.message ?? error}`
    );
    return undefined;
  }
}

type AnalyzerArtifactsInput = Pick<AnalyzerResult, "run" | "requirements" | "metrics" | "labels" | "hints"> & {
  rootDir: string;
  outDir: string;
  experiments: ExperimentAssignment[];
};

export async function emitAnalyzerArtifacts(
  options: AnalyzerArtifactsInput
): Promise<Awaited<ReturnType<typeof writeArtifacts>>> {
  const sanitizerHits = await readSanitizerHits(options.outDir, options.rootDir);
  return writeArtifacts({
    rootDir: options.rootDir,
    outDir: options.outDir,
    run: options.run,
    requirements: options.requirements,
    metrics: options.metrics,
    labels: options.labels,
    sanitizerHits,
    experiments: options.experiments,
    hints: options.hints,
  });
}

export async function runAnalysis(
  logPaths: string[],
  options: RunAnalysisOptions,
  context: { rootDir: string }
): Promise<RunAnalysisResult> {
  if (logPaths.length === 0) {
    throw new Error("No log files found. Provide --log <glob> or ensure runs/ contains logs.");
  }
  const resolvedOutDir = options.outDir
    ? path.isAbsolute(options.outDir)
      ? options.outDir
      : path.join(context.rootDir, options.outDir)
    : path.join(context.rootDir, ".speckit");
  const sources = await Promise.all(logPaths.map((filePath) => createFileLogSource(filePath)));
  const rules = await loadFailureRulesFromFs(context.rootDir, resolvedOutDir);
  const runId = options.runId ?? `run-${Date.now()}`;
  const experiments = await loadExperimentAssignments({ rootDir: context.rootDir, seed: runId });
  const metadata =
    experiments.length > 0
      ? {
          experiments: experiments.map((experiment) => ({
            key: experiment.key,
            description: experiment.description,
            variant: experiment.variantKey,
            variant_description: experiment.variantDescription,
            bucket: experiment.bucket,
            metadata: experiment.metadata,
          })),
        }
      : undefined;
  const analysis = await analyze({ sources, rules, runId, metadata });
  if (metadata && !analysis.run.metadata) {
    analysis.run.metadata = metadata;
  }
  const artifacts = await emitAnalyzerArtifacts({
    rootDir: context.rootDir,
    outDir: resolvedOutDir,
    run: analysis.run,
    requirements: analysis.requirements,
    metrics: analysis.metrics,
    labels: analysis.labels,
    hints: analysis.hints,
    experiments,
  });
  await updateRTM({ rootDir: context.rootDir, outDir: resolvedOutDir, rtmPath: undefined });
  return {
    runId: analysis.run.runId,
    requirements: analysis.requirements,
    metricsSummary: summarizeMetrics(analysis.metrics),
    labels: analysis.labels,
    normalized: analysis.normalized,
    artifacts,
    experiments,
    hints: analysis.hints,
  };
}
