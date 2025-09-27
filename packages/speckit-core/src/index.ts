export { analyzeLogs } from "./analyze.js";

export type {
  AnalyzeEvent,
  AnalyzeLogsOptions,
  AnalyzeResult,
  AnalyzeSourceInput,
  AnalyzerCoreOptions,
  EventsLogSource,
  FailureLabel,
  FailureRule,
  LogSource,
  NormalizedLog,
  NormalizedLogSource,
  RawLogSource,
  Metrics,
  RequirementRecord,
  RunArtifact,
  RunEvent,
  RedactionHit,
  RedactionExample,
  SanitizeLogsOptions,
  SanitizeLogsResult,
  SanitizerPattern,
} from "./types.js";

export {
  sanitizeLogs,
  redactText,
  sanitizerPatterns,
  DEFAULT_SANITIZER_PATTERNS,
  DEFAULT_SANITIZER_GLOBS,
} from "./sanitize.js";

export {
  writeArtifacts,
  updateMemoHistory,
  RUN_ARTIFACT_SCHEMA_FALLBACK,
  DEFAULT_MEMO_HISTORY_TTL_MS,
  DEFAULT_PROMOTION_MIN_COUNT,
  MAX_PROMOTED_ITEMS,
} from "./metrics.js";

export type {
  MemoArtifact,
  ExperimentSummary,
  ExperimentMemoEntry,
  VerificationArtifact,
  VerificationRequirementEntry,
  WriteArtifactsOptions,
  WrittenArtifacts,
  UpdateMemoHistoryOptions,
  MemoHistoryUpdateResult,
} from "./metrics.js";

export { summarizeMetrics, computeMetrics } from "@speckit/analyzer";

export type { AnalyzerEvent } from "@speckit/analyzer";

export {
  RUN_ARTIFACT_SCHEMA_VERSION,
  MEMO_ARTIFACT_VERSION,
  METRICS_ARTIFACT_VERSION,
  buildLabelTrendSeries,
  rollingAverageSeries,
  sparkline,
} from "@speckit/analyzer";

export type { LabelDailyRecord, LabelTrendPoint, LabelTrendSeries } from "@speckit/analyzer";

export {
  createFileLogSource,
  loadLogSourcesFromFiles,
  loadFailureRulesFromFs,
} from "@speckit/analyzer/adapters/node";

export type { FileLogSourceOptions } from "@speckit/analyzer/adapters/node";
