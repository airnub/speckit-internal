import { describe, expect, it } from "vitest";

import { metrics } from "../src/metrics.js";

const SAMPLE_METRICS = {
  ReqCoverage: 0.9,
  BacktrackRatio: 0.1,
  ToolPrecisionAt1: 0.8,
  EditLocality: 0.85,
  ReflectionDensity: 0.15,
  TTFPSeconds: 42,
} as const;

describe("metrics", () => {
  it("produces formatted rows with thresholds", () => {
    const rows = metrics(SAMPLE_METRICS, { sanitizerHits: 0 });
    const coverage = rows.find(row => row.key === "ReqCoverage");
    expect(coverage?.label).toBe("Requirement Coverage");
    expect(coverage?.value).toBe("0.90");
    const sanitizer = rows.find(row => row.key === "SanitizerHits");
    expect(sanitizer?.value).toBe("0");
    expect(sanitizer?.met).toBe(true);
  });
});
