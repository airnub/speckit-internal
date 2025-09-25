import type { FrameworkMeta } from "./config/frameworkRegistry.js";

export { useTemplateIntoDir } from "./services/template.js";
export type { PostInitCommandEvent } from "./services/template.js";
export {
  getFlags,
  isExperimentalEnabled,
  assertModeAllowed,
  assertFrameworksAllowed,
  DEFAULT_FEATURE_FLAGS,
  createLocalEntitlements,
  buildEvaluationContext,
  resolveCliEntitlements,
} from "./config/featureFlags.js";
export type {
  FeatureFlags,
  CliArgs,
  EntitlementProvider,
  EvaluationContext,
} from "./config/featureFlags.js";
export {
  FRAMEWORKS,
  FRAMEWORK_IDS,
  createFrameworkRegistry,
  isFrameworkAllowed,
  listFrameworks,
} from "./config/frameworkRegistry.js";
export type {
  FrameworkId,
  FrameworkMeta,
  Availability,
  AvailabilityRequirements,
} from "./config/frameworkRegistry.js";
export type FrameworkStatus = FrameworkMeta["availability"]["status"];
