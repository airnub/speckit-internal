export { RUN_ARTIFACT_SCHEMA_VERSION } from "./types.js";

export type {
  AnalyzeOptions,
  AnalyzerEvent,
  AnalyzerResult,
  EventsLogSource,
  FailureRule,
  LogSource,
  LogSourceInput,
  Metrics,
  NormalizedLog,
  NormalizeOptions,
  RequirementRecord,
  RunArtifact,
  RunEvent,
  RunEventKind,
} from "./types.js";

export {
  analyze,
  analyzeStream,
} from "./analyze.js";

export {
  buildRunArtifact,
  detectPrompt,
  mergeNormalized,
  normalizeLogContent,
  normalizedFromEvents,
} from "./normalize.js";

export {
  deriveRequirements,
  attachEvidence,
  combineRequirements,
  extractImperative,
} from "./requirements.js";

export { computeMetrics, summarizeMetrics } from "./metrics.js";

export {
  applyFailureLabels,
  labelsToHints,
  parseFailureRules,
  FailureRulesSchema,
  type FailureRulesConfig,
} from "./rules.js";
