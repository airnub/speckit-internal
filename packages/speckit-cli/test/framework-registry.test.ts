import assert from "node:assert/strict";
import { test } from "node:test";
import { FRAMEWORKS, FrameworkRegistry } from "../src/config/frameworkRegistry.js";
import type { FeatureFlags } from "../src/config/featureFlags.js";
import {
  DEFAULT_FEATURE_FLAGS,
  LocalEntitlements,
  assertFrameworksAllowed,
  createEvaluationContext,
} from "../src/config/featureFlags.js";

function buildBundle(
  registry: FrameworkRegistry,
  flags: FeatureFlags
): { registry: FrameworkRegistry; entitlements: LocalEntitlements; context: ReturnType<typeof createEvaluationContext> } {
  const entitlements = new LocalEntitlements(registry, flags);
  const context = createEvaluationContext(flags, { plan: "free" });
  return { registry, entitlements, context };
}

test("GA frameworks remain available when experimental gate is off", async () => {
  const flags: FeatureFlags = {
    experimental: { enabled: false, features: {} },
    modes: {
      classic: { experimental: DEFAULT_FEATURE_FLAGS.modes.classic.experimental },
      secure: { experimental: DEFAULT_FEATURE_FLAGS.modes.secure.experimental },
    },
  };
  const registry = new FrameworkRegistry([
    {
      ...FRAMEWORKS.hipaa,
      availability: { status: "ga", requires: {} },
    },
  ]);
  const bundle = buildBundle(registry, flags);
  const decision = await bundle.entitlements.isAllowed("framework.hipaa", bundle.context);
  assert.equal(decision.allowed, true);
  await assertFrameworksAllowed(["hipaa"], bundle);
});

test("Experimental frameworks are blocked when the gate is off", async () => {
  const flags: FeatureFlags = {
    experimental: { enabled: false, features: {} },
    modes: {
      classic: { experimental: DEFAULT_FEATURE_FLAGS.modes.classic.experimental },
      secure: { experimental: DEFAULT_FEATURE_FLAGS.modes.secure.experimental },
    },
  };
  const registry = new FrameworkRegistry([FRAMEWORKS.hipaa]);
  const bundle = buildBundle(registry, flags);
  const decision = await bundle.entitlements.isAllowed("framework.hipaa", bundle.context);
  assert.equal(decision.allowed, false);
  await assert.rejects(
    () => assertFrameworksAllowed(["hipaa"], bundle),
    /Frameworks not available without Experimental/
  );
});

test("Experimental frameworks are allowed once the gate is enabled", async () => {
  const flags: FeatureFlags = {
    experimental: { enabled: true, features: {} },
    modes: {
      classic: { experimental: DEFAULT_FEATURE_FLAGS.modes.classic.experimental },
      secure: { experimental: DEFAULT_FEATURE_FLAGS.modes.secure.experimental },
    },
  };
  const registry = new FrameworkRegistry([FRAMEWORKS.hipaa]);
  const bundle = buildBundle(registry, flags);
  const decision = await bundle.entitlements.isAllowed("framework.hipaa", bundle.context);
  assert.equal(decision.allowed, true);
  await assert.doesNotReject(() => assertFrameworksAllowed(["hipaa"], bundle));
});
