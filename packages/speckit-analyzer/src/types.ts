export type RunEventKind =
  | "plan"
  | "search"
  | "edit"
  | "run"
  | "eval"
  | "reflect"
  | "tool"
  | "log"
  | "summary"
  | "error";

export interface RunEvent {
  id: string;
  timestamp: string;
  kind: RunEventKind | string;
  subtype?: string | null;
  role?: string | null;
  input?: unknown;
  output?: unknown;
  error?: unknown;
  files_changed?: string[];
  meta?: Record<string, unknown>;
}

export interface NormalizedLog {
  events: RunEvent[];
  promptCandidates: string[];
  plainText: string;
}

export interface NormalizeOptions {
  fallbackStart?: Date;
  source?: string;
  format?: "auto" | "json" | "ndjson" | "text";
}

export const RUN_ARTIFACT_SCHEMA_VERSION = 1 as const;

export interface RunArtifact {
  schema: number;
  runId: string;
  sourceLogs: string[];
  startedAt: string | null;
  finishedAt: string | null;
  events: RunEvent[];
  metadata?: Record<string, unknown>;
}

export interface RequirementRecord {
  id: string;
  text: string;
  source?: string;
  category?: string | null;
  constraints?: string[];
  status: "unknown" | "satisfied" | "violated" | "in-progress";
  evidence: string[];
  notes?: string;
}

export interface Metrics {
  ReqCoverage: number;
  BacktrackRatio: number;
  ToolPrecisionAt1: number;
  EditLocality: number;
  ReflectionDensity: number;
  TTFPSeconds: number | null;
}

export interface FailureRule {
  id: string;
  label?: string;
  description?: string;
  patterns: string[];
  remediation?: string;
  hint?: string;
}

export interface RawLogSource {
  id?: string;
  content: string;
  format?: NormalizeOptions["format"];
}

export interface NormalizedLogSource {
  id?: string;
  log: NormalizedLog;
}

export interface EventsLogSource {
  id?: string;
  events: RunEvent[];
  promptCandidates?: string[];
  plainText?: string;
}

export type LogSource = RawLogSource | NormalizedLogSource | EventsLogSource;
export type LogSourceInput = LogSource | string | Promise<LogSource | string>;

export interface AnalyzerResult {
  run: RunArtifact;
  normalized: NormalizedLog;
  prompt: string;
  requirements: RequirementRecord[];
  metrics: Metrics;
  labels: Set<string>;
  hints: string[];
}

export type AnalyzerEvent =
  | { type: "normalized"; normalized: NormalizedLog; source?: string }
  | { type: "combined"; normalized: NormalizedLog }
  | { type: "run"; run: RunArtifact }
  | { type: "prompt"; prompt: string }
  | { type: "requirements"; requirements: RequirementRecord[] }
  | { type: "metrics"; metrics: Metrics }
  | { type: "labels"; labels: string[]; hints: string[] }
  | { type: "complete"; result: AnalyzerResult };

export interface AnalyzeOptions {
  sources: Iterable<LogSourceInput> | AsyncIterable<LogSourceInput>;
  rules?: FailureRule[];
  runId?: string;
  prompt?: string;
  metadata?: Record<string, unknown>;
  now?: () => Date;
}
