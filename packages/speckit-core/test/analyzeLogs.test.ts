import { beforeEach, describe, expect, it, vi } from "vitest";

import { analyzeLogs } from "../src/index.js";

const analyzeMock = vi.hoisted(() =>
  vi.fn(async () => ({
    run: {
      runId: "mock-run",
      sourceLogs: ["log.ndjson"],
      startedAt: null,
      finishedAt: null,
      events: [],
    },
    requirements: [],
    metrics: {
      ReqCoverage: 1,
      BacktrackRatio: 0,
      ToolPrecisionAt1: 1,
      EditLocality: 1,
      ReflectionDensity: 0,
      TTFPSeconds: null,
    },
    labels: new Set<string>(),
    normalized: { events: [], promptCandidates: [], plainText: "" },
    hints: ["Capture logs"],
    prompt: "",
  }))
);

vi.mock("@speckit/analyzer", () => ({
  analyze: analyzeMock,
}));

vi.mock("@speckit/analyzer/adapters/node", () => ({
  createFileLogSource: vi.fn(async (file: string) => ({ id: file, content: "" })),
  loadFailureRulesFromFs: vi.fn(async () => []),
}));

describe("analyzeLogs", () => {
  beforeEach(() => {
    analyzeMock.mockClear();
  });

  it("passes arguments through to the analyzer", async () => {
    const result = await analyzeLogs({ files: ["log.ndjson"], runId: "test-run" });
    expect(analyzeMock).toHaveBeenCalled();
    expect(result.run.runId).toBe("mock-run");
    expect(result.metrics.ReqCoverage).toBe(1);
  });
});
