import {
  DEFAULT_FEATURE_FLAGS,
  getFlags,
  isExperimentalEnabled,
  createLocalEntitlements,
  buildEvaluationContext,
  assertModeAllowed as assertModeAllowedInternal,
  assertFrameworksAllowed as assertFrameworksAllowedInternal,
  type FeatureFlags,
  type CliArgs,
  type EntitlementProvider,
  type EvaluationContext,
} from "@speckit/feature-flags";
import { createFrameworkRegistry } from "@speckit/framework-registry";

const sharedFrameworkRegistry = createFrameworkRegistry();

export {
  DEFAULT_FEATURE_FLAGS,
  getFlags,
  isExperimentalEnabled,
  createLocalEntitlements,
  buildEvaluationContext,
  assertModeAllowedInternal as assertModeAllowed,
  assertFrameworksAllowedInternal as assertFrameworksAllowed,
};

export type { FeatureFlags, CliArgs, EntitlementProvider, EvaluationContext };

export function resolveCliEntitlements(flags: FeatureFlags): {
  provider: EntitlementProvider;
  context: EvaluationContext;
} {
  const provider = createLocalEntitlements(flags, sharedFrameworkRegistry);
  const context = buildEvaluationContext(flags, { plan: "free" });
  return { provider, context };
}
