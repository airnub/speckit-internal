import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { Metrics, RequirementRecord, RunArtifact } from "../src/types.js";
import { RUN_ARTIFACT_SCHEMA_VERSION } from "../src/types.js";

describe("artifact writer", () => {
  it("writes Run.json with the schema version", async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), "speckit-artifacts-"));
    const run: RunArtifact = {
      schema: RUN_ARTIFACT_SCHEMA_VERSION,
      runId: "run-test",
      sourceLogs: [path.join(outDir, "log.ndjson")],
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      events: [],
    };
    const requirements: RequirementRecord[] = [];
    const metrics: Metrics = {
      ReqCoverage: 0,
      BacktrackRatio: 0,
      ToolPrecisionAt1: 0,
      EditLocality: 0,
      ReflectionDensity: 0,
      TTFPSeconds: null,
    };

    const { writeArtifacts } = await import("../../../scripts/writers/artifacts.ts");

    await writeArtifacts({
      rootDir: outDir,
      outDir,
      run,
      requirements,
      metrics,
      labels: new Set(),
    });

    const raw = await readFile(path.join(outDir, "Run.json"), "utf8");
    const parsed = JSON.parse(raw);

    expect(parsed.schema).toBe(RUN_ARTIFACT_SCHEMA_VERSION);
    expect(parsed.run_id).toBe(run.runId);
  });
});
