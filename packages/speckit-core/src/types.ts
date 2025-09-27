import type {
  AnalyzeOptions,
  AnalyzerEvent,
  AnalyzerResult,
  EventsLogSource,
  FailureRule,
  LogSourceInput,
  Metrics,
  NormalizedLog,
  RequirementRecord,
  RunArtifact,
  RunEvent,
} from "@speckit/analyzer";

export type {
  Metrics,
  RunArtifact,
  RunEvent,
  RequirementRecord,
  FailureRule,
  EventsLogSource,
};

export type { NormalizedLog };

export interface RawLogSource {
  id?: string;
  content: string;
  format?: "auto" | "json" | "ndjson" | "text";
}

export interface NormalizedLogSource {
  id?: string;
  log: NormalizedLog;
}

export type LogSource = RawLogSource | NormalizedLogSource | EventsLogSource;

export type AnalyzeResult = AnalyzerResult;
export type AnalyzeEvent = AnalyzerEvent;
export type AnalyzeSourceInput = LogSourceInput;

export interface AnalyzeLogsOptions {
  runId?: string;
  rules?: FailureRule[];
  prompt?: string;
  metadata?: Record<string, unknown>;
  now?: () => Date;
  onEvent?: (event: AnalyzeEvent) => void | Promise<void>;
}

export type FailureLabel = string;

export type AnalyzerCoreOptions = Omit<AnalyzeOptions, "sources">;

export interface RedactionExample {
  line: number;
  preview: string;
}

export interface RedactionHit {
  file: string;
  pattern: string;
  replacement: string;
  count: number;
  examples: RedactionExample[];
}

export interface SanitizeLogsOptions {
  cwd?: string;
  dryRun?: boolean;
  include?: string[];
  patterns?: SanitizerPattern[];
  maxExamplesPerFile?: number;
}

export interface SanitizeLogsResult {
  totalHits: number;
  hits: RedactionHit[];
  files: string[];
}

export interface SanitizerPattern {
  pattern: RegExp;
  replacement: string;
  description?: string;
}
