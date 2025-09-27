import { promises as fs } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import {
  MEMO_ARTIFACT_VERSION,
  METRICS_ARTIFACT_VERSION,
  type Metrics,
  type RequirementRecord,
  type RunArtifact,
  generateRequirementCheck,
} from "@speckit/analyzer";
import type { ExperimentAssignment } from "../config/experiments.js";
import { updateMemoHistory } from "./memo-history.js";

const RUN_ARTIFACT_SCHEMA_FALLBACK = 1;

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
  experiments?: ExperimentAssignment[];
  hints?: string[];
}

export interface WrittenArtifacts {
  runPath: string;
  requirementsPath: string;
  memoPath: string;
  memoHistoryPath: string;
  verificationPath: string;
  metricsPath: string;
  summaryPath: string;
  summaryJsonPath: string;
  promotedLessons: string[];
  promotedGuardrails: string[];
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
      metadata: experiment.metadata,
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

function buildSummary(
  options: WriteArtifactsOptions,
  memo: MemoArtifact,
  artifactPaths: Pick<WrittenArtifacts, "runPath" | "requirementsPath" | "metricsPath" | "summaryPath" | "memoPath" | "verificationPath">
): string {
  const { run, metrics, requirements, labels, experiments = [] } = options;
  const metricRows = Object.entries(metrics)
    .map(([key, value]) => `| ${key} | ${value ?? "—"} |`)
    .join("\n");
  const sanitizerRow = `| Sanitizer Hits | ${options.sanitizerHits ?? 0} |`;
  const labelList = memo.labels.length > 0 ? memo.labels.map((label) => `- ${label}`).join("\n") : "- None";
  const requirementRows = requirements.map((req) => `- ${req.id} (${req.status}): ${req.text}`).join("\n");
  const hints = options.hints ?? [];
  const hintsSection = hints.length > 0 ? hints.map((hint) => `- ${hint}`).join("\n") : "- None";
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
  const relative = (absolute: string) => path.relative(options.rootDir, absolute);
  const artifactLinks = [
    { label: "Run events", path: relative(artifactPaths.runPath) },
    { label: "Requirements", path: relative(artifactPaths.requirementsPath) },
    { label: "Metrics", path: relative(artifactPaths.metricsPath) },
    { label: "Summary (JSON)", path: relative(artifactPaths.summaryPath.replace(/\.md$/, ".json")) },
    { label: "Memo", path: relative(artifactPaths.memoPath) },
    { label: "Verification", path: relative(artifactPaths.verificationPath) },
  ]
    .map((item) => `- [${item.label}](${item.path.replace(/\\/g, "/")})`)
    .join("\n");
  return `# SpecKit Run Forensics\n\n- Run ID: ${run.runId}\n- Source logs: ${run.sourceLogs
    .map((file) => path.relative(options.rootDir, file))
    .join(", ")}\n- Events analyzed: ${run.events.length}\n\n## Experiments\n${experimentLines}\n\n## Metrics\n| Metric | Value\n|\n|--------|-------|\n${metricRows}\n${sanitizerRow}\n\n## Labels\n${labelList}\n\n## Next Run Hints\n${hintsSection}\n\n## Requirements\n${requirementRows}\n\n## Artifact Links\n${artifactLinks}`;
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

  const runPath = path.join(outDir, "Run.json");
  const requirementsPath = path.join(outDir, "requirements.jsonl");
  const memoPath = path.join(outDir, "memo.json");
  const verificationPath = path.join(outDir, "verification.yaml");
  const metricsPath = path.join(outDir, "metrics.json");
  const summaryPath = path.join(outDir, "summary.md");
  const summaryJsonPath = summaryPath.replace(/\.md$/, ".json");

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
      metadata: experiment.metadata,
    })),
  });
  const summary = buildSummary(options, memoWithPromotions, {
    runPath,
    requirementsPath,
    metricsPath,
    summaryPath,
    memoPath,
    verificationPath,
  });
  await fs.writeFile(summaryPath, summary + "\n", "utf8");
  await writeJson(summaryJsonPath, {
    version: 1,
    generated_at: new Date().toISOString(),
    run: {
      id: options.run.runId,
      sources: options.run.sourceLogs.map((file) => path.relative(options.rootDir, file)),
      events: options.run.events.length,
    },
    metrics: {
      ...options.metrics,
      sanitizer_hits: options.sanitizerHits ?? 0,
    },
    labels: Array.from(options.labels),
    requirements: options.requirements.map((req) => ({
      id: req.id,
      status: req.status,
      text: req.text,
      evidence: req.evidence,
    })),
    hints: options.hints ?? [],
    artifacts: {
      run: path.relative(options.rootDir, runPath),
      requirements: path.relative(options.rootDir, requirementsPath),
      metrics: path.relative(options.rootDir, metricsPath),
      summary: path.relative(options.rootDir, summaryPath),
      summary_json: path.relative(options.rootDir, summaryJsonPath),
      memo: path.relative(options.rootDir, memoPath),
      verification: path.relative(options.rootDir, verificationPath),
    },
  });

  return {
    runPath,
    requirementsPath,
    memoPath,
    memoHistoryPath: memoHistory.historyPath,
    verificationPath,
    metricsPath,
    summaryPath,
    summaryJsonPath,
    promotedLessons: memoHistory.promotedLessons,
    promotedGuardrails: memoHistory.promotedGuardrails,
  };
}
