import { describe, expect, it } from "vitest";

import {
  sanitizeLogs,
  sanitizeText,
  defaultSanitizerPatternSources,
} from "../src/sanitizer.js";

describe("sanitizeText", () => {
  it("redacts known API tokens and counts hits", () => {
    const sample = "sk-abc1234567890123456789 is secret";
    const { redacted, hits } = sanitizeText(sample);
    expect(redacted).toContain("[redacted-token]");
    expect(redacted).not.toContain("sk-abc");
    expect(hits).toBeGreaterThan(0);
  });

  it("redacts multi-line key blocks", () => {
    const sample = `-----BEGIN PRIVATE KEY-----\nabc123\n-----END PRIVATE KEY-----`;
    const { redacted, hits } = sanitizeText(sample);
    expect(redacted.trim()).toBe("[redacted-key-block]");
    expect(hits).toBe(1);
  });
});

describe("sanitizeLogs", () => {
  it("aggregates hits across entries", () => {
    const logs = [
      { id: "a", content: "sessionid=abc" },
      { id: "b", content: "cookie: secret-token" },
    ];
    const result = sanitizeLogs(logs);
    expect(result.totalHits).toBeGreaterThanOrEqual(2);
    expect(result.entries[0].redacted).toContain("[redacted]");
    expect(result.entries[1].redacted).toContain("[redacted-cookie]");
    expect(Object.keys(result.patternHits).length).toBeGreaterThan(0);
  });
});

describe("defaultSanitizerPatternSources", () => {
  it("exposes the compiled regular expressions for downstream use", () => {
    const sources = defaultSanitizerPatternSources();
    expect(sources.some(source => source.includes("sk-"))).toBe(true);
  });
});
