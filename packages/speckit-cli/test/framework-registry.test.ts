import assert from "node:assert/strict";
import { test } from "node:test";
import { FRAMEWORKS, isFrameworkAllowed } from "../src/config/frameworkRegistry.js";
import {
  DEFAULT_FEATURE_FLAGS,
  resolveCliEntitlements,
  assertFrameworksAllowed,
  type FeatureFlags,
} from "../src/config/featureFlags.js";

function cloneFlags(): FeatureFlags {
  return {
    experimental: { enabled: false, features: {} },
    modes: {
      classic: { experimental: DEFAULT_FEATURE_FLAGS.modes.classic.experimental },
      secure: { experimental: DEFAULT_FEATURE_FLAGS.modes.secure.experimental },
    },
  };
}

test("GA frameworks remain available when experimental gate is off", async () => {
  const originalStatus = FRAMEWORKS.hipaa.availability.status;
  FRAMEWORKS.hipaa.availability.status = "ga";
  try {
    const flags = cloneFlags();
    const { provider, context } = resolveCliEntitlements(flags);
    assert.equal(isFrameworkAllowed("hipaa", { experimentalEnabled: false }), true);
    await assertFrameworksAllowed(["hipaa"], provider, context);
  } finally {
    FRAMEWORKS.hipaa.availability.status = originalStatus;
  }
});

test("Experimental frameworks are blocked when the gate is off", async () => {
  const flags = cloneFlags();
  const { provider, context } = resolveCliEntitlements(flags);
  assert.equal(isFrameworkAllowed("hipaa", { experimentalEnabled: false }), false);
  await assert.rejects(async () => {
    await assertFrameworksAllowed(["hipaa"], provider, context);
  });
});

test("Experimental frameworks are allowed once the gate is enabled", async () => {
  const flags = cloneFlags();
  flags.experimental.enabled = true;
  const { provider, context } = resolveCliEntitlements(flags);
  assert.equal(isFrameworkAllowed("hipaa", { experimentalEnabled: true }), true);
  await assert.doesNotReject(async () => assertFrameworksAllowed(["hipaa"], provider, context));
});
