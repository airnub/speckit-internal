export { useTemplateIntoDir } from "./services/template.js";
export type { PostInitCommandEvent } from "./services/template.js";
export {
  getFlags,
  isExperimentalEnabled,
  assertModeAllowed,
  createLocalEntitlements,
  createEvaluationContext,
  createLocalEntitlementsBundle,
  assertFrameworksAllowed,
  DEFAULT_FEATURE_FLAGS,
} from "./config/featureFlags.js";
export type { FeatureFlags, CliArgs, LocalEntitlementsBundle } from "./config/featureFlags.js";
export {
  FRAMEWORKS,
  isFrameworkAllowed,
} from "./config/frameworkRegistry.js";
export type { FrameworkId, FrameworkMeta, FrameworkStatus } from "./config/frameworkRegistry.js";
