import { createFrameworkRegistry } from "@speckit/framework-registry";
import {
  assertFrameworksAllowed as assertFrameworksAllowedWithEntitlements,
  assertModeAllowed,
  createEvaluationContext,
  createLocalEntitlements,
  DEFAULT_FEATURE_FLAGS,
  getFlags,
  isExperimentalEnabled,
  LocalEntitlements,
  type EvaluationContext,
  type FeatureFlagOverrides,
  type FeatureFlags,
} from "@speckit/feature-flags";

import type { FrameworkRegistry, FrameworkId } from "@speckit/framework-registry";

export type { FeatureFlags } from "@speckit/feature-flags";
export type CliArgs = FeatureFlagOverrides;
export {
  DEFAULT_FEATURE_FLAGS,
  getFlags,
  isExperimentalEnabled,
  assertModeAllowed,
  createEvaluationContext,
  createLocalEntitlements,
  LocalEntitlements,
};

export interface LocalEntitlementsBundle {
  registry: FrameworkRegistry;
  entitlements: LocalEntitlements;
  context: EvaluationContext;
}

export function createLocalEntitlementsBundle(flags: FeatureFlags): LocalEntitlementsBundle {
  const registry = createFrameworkRegistry();
  const entitlements = createLocalEntitlements(flags, registry);
  const context = createEvaluationContext(flags, { plan: "free" });
  return { registry, entitlements, context };
}

export async function assertFrameworksAllowed(
  ids: FrameworkId[],
  bundle: LocalEntitlementsBundle
): Promise<void> {
  await assertFrameworksAllowedWithEntitlements(ids, bundle.registry, bundle.entitlements, bundle.context);
}
