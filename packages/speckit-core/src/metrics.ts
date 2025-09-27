import { promises as fs } from "node:fs";
import path from "node:path";

import YAML from "yaml";

import {
  MEMO_ARTIFACT_VERSION,
  METRICS_ARTIFACT_VERSION,
  generateRequirementCheck,
} from "@speckit/analyzer";

import type { Metrics, RequirementRecord, RunArtifact } from "./types.js";

export const RUN_ARTIFACT_SCHEMA_FALLBACK = 1;
export const DEFAULT_MEMO_HISTORY_TTL_MS = 1000 * 60 * 60 * 24 * 30;
export const DEFAULT_PROMOTION_MIN_COUNT = 2;
export const MAX_PROMOTED_ITEMS = 10;

export interface MemoArtifact {
  version: number;
  generated_at: string;
  generated_from: {
    run_id: string;
    sources: string[];
  };
  lessons: string[];
  guardrails: string[];
  checklist: string[];
  labels: string[];
  experiments: ExperimentMemoEntry[];
}

export interface ExperimentSummary {
  key: string;
  description?: string;
  variantKey: string;
  variantDescription?: string;
  bucket: number;
  metadata?: Record<string, unknown>;
}

export interface ExperimentMemoEntry {
  key: string;
  variant: string;
  bucket: number;
  description?: string;
  variant_description?: string;
  metadata: Record<string, unknown>;
}

export interface VerificationRequirementEntry {
  id: string;
  description: string;
  status: string;
  evidence: string[];
  check: string;
}

export interface VerificationArtifact {
  version: number;
  generated_at: string;
  requirements: VerificationRequirementEntry[];
}

export interface WriteArtifactsOptions {
  rootDir: string;
  outDir?: string;
  run: RunArtifact;
  requirements: RequirementRecord[];
  metrics: Metrics;
  labels: Set<string>;
  sanitizerHits?: number;
  experiments?: ExperimentSummary[];
}

export interface WrittenArtifacts {
  runPath: string;
  requirementsPath: string;
  memoPath: string;
  memoHistoryPath: string;
  verificationPath: string;
  metricsPath: string;
  summaryPath: string;
  promotedLessons: string[];
  promotedGuardrails: string[];
}

function coerceTimestamp(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitizeSummaryValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number" && Number.isFinite(value)) return value.toString();
  if (typeof value === "string" && value.trim().length > 0) return value;
  return JSON.stringify(value);
}

function buildMemo(options: WriteArtifactsOptions): MemoArtifact {
  const { run, requirements, labels, experiments = [] } = options;
  const generatedAt = new Date().toISOString();
  const lessons: string[] = [];
  if (labels.size > 0) {
    lessons.push(...Array.from(labels).map((label) => `Investigate label: ${label}`));
  } else {
    lessons.push("Maintain steady tool hygiene and keep requirements in view.");
  }
  const guardrails = requirements
    .filter((req) => req.status === "violated")
    .map((req) => `Prevent regression on ${req.id}: ${req.text}`);
  const checklist = requirements.map((req) => `${req.id}: ${req.text}`);
  return {
    version: MEMO_ARTIFACT_VERSION,
    generated_at: generatedAt,
    generated_from: {
      run_id: run.runId,
      sources: run.sourceLogs,
    },
    lessons,
    guardrails,
    checklist,
    labels: Array.from(labels),
    experiments: experiments.map((experiment) => ({
      key: experiment.key,
      description: experiment.description,
      variant: experiment.variantKey,
      variant_description: experiment.variantDescription,
      bucket: experiment.bucket,
      metadata: { ...(experiment.metadata ?? {}) },
    })),
  };
}

function buildVerification(requirements: RequirementRecord[]): VerificationArtifact {
  return {
    version: 1,
    generated_at: new Date().toISOString(),
    requirements: requirements.map((req) => ({
      id: req.id,
      description: req.text,
      status: req.status,
      evidence: req.evidence,
      check: generateRequirementCheck(req),
    })),
  };
}

function uniqueConcat(values: string[], additions: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const value of [...values, ...additions]) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    merged.push(trimmed);
  }
  return merged;
}

function promoteValues(
  entries: MemoArtifact[],
  pick: (entry: MemoArtifact) => string[],
  baseline: string[],
  minimumCount: number
): string[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const value of pick(entry)) {
      const candidate = value.trim();
      if (!candidate) continue;
      counts.set(candidate, (counts.get(candidate) ?? 0) + 1);
    }
  }
  const promoted = Array.from(counts.entries())
    .filter(([value, count]) => count >= minimumCount && !baseline.includes(value))
    .sort((a, b) => {
      if (b[1] === a[1]) return a[0].localeCompare(b[0]);
      return b[1] - a[1];
    })
    .slice(0, MAX_PROMOTED_ITEMS)
    .map(([value]) => value);
  return promoted;
}

export interface UpdateMemoHistoryOptions {
  historyPath: string;
  memo: MemoArtifact;
  ttlMs?: number;
  now?: Date;
  promotionMinCount?: number;
}

export interface MemoHistoryUpdateResult {
  historyPath: string;
  entries: MemoArtifact[];
  memo: MemoArtifact;
  promotedLessons: string[];
  promotedGuardrails: string[];
}

async function readHistory(historyPath: string): Promise<MemoArtifact[]> {
  try {
    const raw = await fs.readFile(historyPath, "utf8");
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as MemoArtifact;
        } catch (error) {
          console.warn(`[speckit:core] Skipping malformed memo history entry: ${(error as Error).message}`);
          return null;
        }
      })
      .filter((entry): entry is MemoArtifact => entry !== null);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function dedupeByRun(entries: MemoArtifact[]): MemoArtifact[] {
  const sorted = entries
    .map((entry) => ({
      entry,
      timestamp: coerceTimestamp(entry.generated_at) ?? 0,
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
  const map = new Map<string, MemoArtifact>();
  for (const { entry } of sorted) {
    const runId = entry.generated_from?.run_id ?? "";
    map.set(runId, entry);
  }
  return Array.from(map.values());
}

export async function updateMemoHistory(
  options: UpdateMemoHistoryOptions
): Promise<MemoHistoryUpdateResult> {
  const ttlMs = options.ttlMs ?? DEFAULT_MEMO_HISTORY_TTL_MS;
  const promotionMinCount = options.promotionMinCount ?? DEFAULT_PROMOTION_MIN_COUNT;
  const now = options.now ?? new Date();
  const historyPath = options.historyPath;
  const cutoff = now.getTime() - ttlMs;

  const existingEntries = await readHistory(historyPath);
  const filtered = existingEntries.filter((entry) => {
    const timestamp = coerceTimestamp(entry.generated_at);
    if (timestamp === null) return false;
    return timestamp >= cutoff;
  });

  const deduped = dedupeByRun(filtered);
  const initialMemo: MemoArtifact = {
    ...options.memo,
    guardrails: [...options.memo.guardrails],
    lessons: [...options.memo.lessons],
  };

  const baseEntries = deduped.filter(
    (entry) => entry.generated_from?.run_id !== initialMemo.generated_from.run_id
  );
  const combinedForCounts = [...baseEntries, initialMemo];

  const promotedLessons = promoteValues(
    combinedForCounts,
    (entry) => entry.lessons ?? [],
    initialMemo.lessons ?? [],
    promotionMinCount
  );
  const promotedGuardrails = promoteValues(
    combinedForCounts,
    (entry) => entry.guardrails ?? [],
    initialMemo.guardrails ?? [],
    promotionMinCount
  );

  const enhancedMemo: MemoArtifact = {
    ...initialMemo,
    guardrails: uniqueConcat(initialMemo.guardrails ?? [], promotedGuardrails),
    lessons: uniqueConcat(initialMemo.lessons ?? [], promotedLessons),
  };

  const finalEntries = [...baseEntries, enhancedMemo].sort((a, b) => {
    const aTime = coerceTimestamp(a.generated_at) ?? 0;
    const bTime = coerceTimestamp(b.generated_at) ?? 0;
    return aTime - bTime;
  });

  await fs.mkdir(path.dirname(historyPath), { recursive: true });
  const payload = finalEntries.map((entry) => JSON.stringify(entry)).join("\n");
  await fs.writeFile(historyPath, payload + (finalEntries.length > 0 ? "\n" : ""), "utf8");

  return {
    historyPath,
    entries: finalEntries,
    memo: enhancedMemo,
    promotedLessons,
    promotedGuardrails,
  };
}

function buildSummary(options: WriteArtifactsOptions, memo: MemoArtifact): string {
  const { run, metrics, requirements, labels, experiments = [] } = options;
  const metricRows = Object.entries(metrics)
    .map(([key, value]) => `| ${key} | ${sanitizeSummaryValue(value)} |`)
    .join("\n");
  const labelList = memo.labels.length > 0 ? memo.labels.map((label) => `- ${label}`).join("\n") : "- None";
  const requirementRows = requirements.map((req) => `- ${req.id} (${req.status}): ${req.text}`).join("\n");
  const experimentLines =
    experiments.length > 0
      ? experiments
          .map((experiment) => {
            const description = experiment.variantDescription ?? experiment.description;
            const metadataEntries = Object.entries(experiment.metadata ?? {});
            const metadataText =
              metadataEntries.length > 0
                ? ` — ${metadataEntries.map(([key, value]) => `${key}: ${String(value)}`).join(", ")}`
                : "";
            const descriptionText = description ? ` — ${description}` : "";
            return `- ${experiment.key}: ${experiment.variantKey} (bucket ${experiment.bucket})${descriptionText}${metadataText}`;
          })
          .join("\n")
      : "- None";
  return `# SpecKit Run Forensics\n\n- Run ID: ${run.runId}\n- Source logs: ${run.sourceLogs
    .map((file) => path.relative(options.rootDir, file))
    .join(", ")}\n- Events analyzed: ${run.events.length}\n\n## Experiments\n${experimentLines}\n\n## Metrics\n| Metric | Value |\n|--------|-------|\n${metricRows}\n\n## Labels\n${labelList}\n\n## Requirements\n${requirementRows}`;
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function writeJsonl(filePath: string, rows: any[]): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const payload = rows.map((row) => JSON.stringify(row)).join("\n");
  await fs.writeFile(filePath, payload + (rows.length > 0 ? "\n" : ""), "utf8");
}

export async function writeArtifacts(options: WriteArtifactsOptions): Promise<WrittenArtifacts> {
  const outDir = options.outDir ?? path.join(options.rootDir, ".speckit");
  const memo = buildMemo(options);
  const memoHistory = await updateMemoHistory({
    historyPath: path.join(outDir, "memo-history.jsonl"),
    memo,
  });
  const memoWithPromotions = memoHistory.memo;
  const verification = buildVerification(options.requirements);
  const summary = buildSummary(options, memoWithPromotions);

  const runPath = path.join(outDir, "Run.json");
  const requirementsPath = path.join(outDir, "requirements.jsonl");
  const memoPath = path.join(outDir, "memo.json");
  const verificationPath = path.join(outDir, "verification.yaml");
  const metricsPath = path.join(outDir, "metrics.json");
  const summaryPath = path.join(outDir, "summary.md");

  await writeJson(runPath, {
    schema: typeof options.run.schema === "number" ? options.run.schema : RUN_ARTIFACT_SCHEMA_FALLBACK,
    run_id: options.run.runId,
    source_logs: options.run.sourceLogs,
    started_at: options.run.startedAt,
    finished_at: options.run.finishedAt,
    events: options.run.events,
    metadata: options.run.metadata ?? undefined,
  });
  await writeJsonl(requirementsPath, options.requirements);
  await writeJson(memoPath, memoWithPromotions);
  await fs.writeFile(verificationPath, YAML.stringify(verification), "utf8");
  await writeJson(metricsPath, {
    version: METRICS_ARTIFACT_VERSION,
    ReqCoverage: options.metrics.ReqCoverage ?? 0,
    ToolPrecisionAt1: options.metrics.ToolPrecisionAt1 ?? 0,
    BacktrackRatio: options.metrics.BacktrackRatio ?? 0,
    EditLocality: options.metrics.EditLocality ?? 0,
    ReflectionDensity: options.metrics.ReflectionDensity ?? 0,
    TTFPSeconds: options.metrics.TTFPSeconds ?? null,
    labels: Array.from(options.labels),
    sanitizer_hits: options.sanitizerHits ?? 0,
    experiments: (options.experiments ?? []).map((experiment) => ({
      key: experiment.key,
      description: experiment.description,
      variant: experiment.variantKey,
      variant_description: experiment.variantDescription,
      bucket: experiment.bucket,
      metadata: experiment.metadata ?? {},
    })),
  });
  await fs.writeFile(summaryPath, summary + "\n", "utf8");

  return {
    runPath,
    requirementsPath,
    memoPath,
    memoHistoryPath: memoHistory.historyPath,
    verificationPath,
    metricsPath,
    summaryPath,
    promotedLessons: memoHistory.promotedLessons,
    promotedGuardrails: memoHistory.promotedGuardrails,
  };
}
