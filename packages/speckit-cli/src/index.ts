export { useTemplateIntoDir } from "./services/template.js";
export type { PostInitCommandEvent } from "./services/template.js";
export {
  getFlags,
  isExperimentalEnabled,
  assertModeAllowed,
  DEFAULT_FEATURE_FLAGS,
} from "./config/featureFlags.js";
export type { FeatureFlags, CliArgs } from "./config/featureFlags.js";
export {
  FRAMEWORKS,
  isFrameworkAllowed,
  assertFrameworksAllowed,
} from "./config/frameworkRegistry.js";
export type { FrameworkId, FrameworkMeta, FrameworkStatus } from "./config/frameworkRegistry.js";
