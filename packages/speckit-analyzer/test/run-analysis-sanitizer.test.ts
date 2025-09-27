import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("@speckit/analyzer", async () => {
  const actual = await vi.importActual<typeof import("../src/index.js")>("../src/index.js");
  return {
    ...actual,
    analyze: vi.fn(async (options: { runId: string }) => ({
      run: {
        runId: options.runId,
        sourceLogs: [],
        startedAt: null,
        finishedAt: null,
        events: [],
        metadata: undefined,
      },
      requirements: [],
      metrics: {
        ReqCoverage: 0,
        BacktrackRatio: 0,
        ToolPrecisionAt1: 0,
        EditLocality: 0,
        ReflectionDensity: 0,
        TTFPSeconds: null,
      },
      labels: new Set<string>(),
      normalized: {} as any,
    })),
    summarizeMetrics: vi.fn(() => []),
  };
});

vi.mock("@speckit/analyzer/adapters/node", () => ({
  createFileLogSource: vi.fn(async (filePath: string) => ({ filePath })),
  loadFailureRulesFromFs: vi.fn(async () => []),
}));

vi.mock("../../../scripts/writers/rtm.js", () => ({
  updateRTM: vi.fn(async () => {}),
}));

vi.mock("../../../scripts/config/experiments.js", () => ({
  loadExperimentAssignments: vi.fn(async () => []),
}));

describe("runAnalysis sanitizer regression", () => {
  it("keeps sanitizer hits from the existing report", async () => {
    const rootDir = path.resolve(__dirname, "../../..");
    const outDir = await mkdtemp(path.join(tmpdir(), "speckit-sanitizer-"));
    try {
      await writeFile(path.join(outDir, "sanitizer-report.json"), JSON.stringify({ hits: 5 }));
      const logPaths = [path.join(outDir, "run.ndjson")];
      const { runAnalysis } = await import("../../../scripts/run-analysis.ts");

      await runAnalysis(logPaths, { runId: "run-test", outDir }, { rootDir });

      const metricsRaw = await readFile(path.join(outDir, "metrics.json"), "utf8");
      const metrics = JSON.parse(metricsRaw);
      expect(metrics.sanitizer_hits).toBe(5);
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });
});
