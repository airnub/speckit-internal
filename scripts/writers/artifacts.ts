import { promises as fs } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import type { Metrics, RequirementRecord, RunArtifact } from "@speckit/analyzer";

const RUN_ARTIFACT_SCHEMA_FALLBACK = 1;

export interface MemoArtifact {
  generated_at: string;
  generated_from: {
    run_id: string;
    sources: string[];
  };
  lessons: string[];
  guardrails: string[];
  checklist: string[];
  labels: string[];
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
}

export interface WrittenArtifacts {
  runPath: string;
  requirementsPath: string;
  memoPath: string;
  verificationPath: string;
  metricsPath: string;
  summaryPath: string;
}

function buildMemo(options: WriteArtifactsOptions): MemoArtifact {
  const { run, requirements, labels } = options;
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
    generated_at: generatedAt,
    generated_from: {
      run_id: run.runId,
      sources: run.sourceLogs,
    },
    lessons,
    guardrails,
    checklist,
    labels: Array.from(labels),
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
      check: req.status === "satisfied" ? "Confirmed via run evidence" : "Pending manual verification",
    })),
  };
}

function buildSummary(options: WriteArtifactsOptions, memo: MemoArtifact): string {
  const { run, metrics, requirements, labels } = options;
  const metricRows = Object.entries(metrics)
    .map(([key, value]) => `| ${key} | ${value ?? "—"} |`)
    .join("\n");
  const labelList = memo.labels.length > 0 ? memo.labels.map((label) => `- ${label}`).join("\n") : "- None";
  const requirementRows = requirements.map((req) => `- ${req.id} (${req.status}): ${req.text}`).join("\n");
  return `# SpecKit Run Forensics\n\n- Run ID: ${run.runId}\n- Source logs: ${run.sourceLogs
    .map((file) => path.relative(options.rootDir, file))
    .join(", ")}\n- Events analyzed: ${run.events.length}\n\n## Metrics\n| Metric | Value |\n|--------|-------|\n${metricRows}\n\n## Labels\n${labelList}\n\n## Requirements\n${requirementRows}`;
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
  const verification = buildVerification(options.requirements);
  const summary = buildSummary(options, memo);

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
  });
  await writeJsonl(requirementsPath, options.requirements);
  await writeJson(memoPath, memo);
  await fs.writeFile(verificationPath, YAML.stringify(verification), "utf8");
  await writeJson(metricsPath, {
    ReqCoverage: options.metrics.ReqCoverage ?? 0,
    ToolPrecisionAt1: options.metrics.ToolPrecisionAt1 ?? 0,
    BacktrackRatio: options.metrics.BacktrackRatio ?? 0,
    EditLocality: options.metrics.EditLocality ?? 0,
    labels: Array.from(options.labels),
    sanitizer_hits: options.sanitizerHits ?? 0,
  });
  await fs.writeFile(summaryPath, summary + "\n", "utf8");

  return { runPath, requirementsPath, memoPath, verificationPath, metricsPath, summaryPath };
}
