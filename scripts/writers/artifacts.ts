export {
  RUN_ARTIFACT_SCHEMA_FALLBACK,
  DEFAULT_MEMO_HISTORY_TTL_MS,
  DEFAULT_PROMOTION_MIN_COUNT,
  MAX_PROMOTED_ITEMS,
  writeArtifacts,
  updateMemoHistory,
} from "@speckit/core/metrics";

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
} from "@speckit/core/metrics";
