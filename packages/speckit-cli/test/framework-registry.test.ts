import assert from "node:assert/strict";
import { test } from "node:test";
import { FRAMEWORKS, isFrameworkAllowed, assertFrameworksAllowed } from "../src/config/frameworkRegistry.js";
import type { FeatureFlags } from "../src/config/featureFlags.js";
import { DEFAULT_FEATURE_FLAGS } from "../src/config/featureFlags.js";

test("GA frameworks remain available when experimental gate is off", () => {
  const originalStatus = FRAMEWORKS.hipaa.status;
  FRAMEWORKS.hipaa.status = "ga";
  try {
    const flags: FeatureFlags = {
      experimental: { enabled: false, features: {} },
      modes: {
        classic: { experimental: DEFAULT_FEATURE_FLAGS.modes.classic.experimental },
        secure: { experimental: DEFAULT_FEATURE_FLAGS.modes.secure.experimental },
      },
    };
    assert.equal(isFrameworkAllowed("hipaa", flags), true);
    assert.doesNotThrow(() => assertFrameworksAllowed(["hipaa"], flags));
  } finally {
    FRAMEWORKS.hipaa.status = originalStatus;
  }
});

test("Experimental frameworks are blocked when the gate is off", () => {
  const flags: FeatureFlags = {
    experimental: { enabled: false, features: {} },
    modes: {
      classic: { experimental: DEFAULT_FEATURE_FLAGS.modes.classic.experimental },
      secure: { experimental: DEFAULT_FEATURE_FLAGS.modes.secure.experimental },
    },
  };
  assert.equal(isFrameworkAllowed("hipaa", flags), false);
  assert.throws(
    () => assertFrameworksAllowed(["hipaa"], flags),
    /Frameworks not available without Experimental/
  );
});

test("Experimental frameworks are allowed once the gate is enabled", () => {
  const flags: FeatureFlags = {
    experimental: { enabled: true, features: {} },
    modes: {
      classic: { experimental: DEFAULT_FEATURE_FLAGS.modes.classic.experimental },
      secure: { experimental: DEFAULT_FEATURE_FLAGS.modes.secure.experimental },
    },
  };
  assert.equal(isFrameworkAllowed("hipaa", flags), true);
  assert.doesNotThrow(() => assertFrameworksAllowed(["hipaa"], flags));
});
