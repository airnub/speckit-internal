import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";
import YAML from "yaml";

import type { Metrics, RequirementRecord, RunArtifact } from "../src/types.js";
import {
  MEMO_ARTIFACT_VERSION,
  METRICS_ARTIFACT_VERSION,
  RUN_ARTIFACT_SCHEMA_VERSION,
} from "../src/types.js";

vi.mock("@speckit/analyzer", async () => {
  const actual = await vi.importActual<typeof import("../src/index.js")>("../src/index.js");
  return actual;
});

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

    const { writeArtifacts } = await import("../../speckit-core/src/metrics.ts");

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

    const memoRaw = await readFile(path.join(outDir, "memo.json"), "utf8");
    const memo = JSON.parse(memoRaw);
    expect(memo.version).toBe(MEMO_ARTIFACT_VERSION);

    const metricsRaw = await readFile(path.join(outDir, "metrics.json"), "utf8");
    const metricsArtifact = JSON.parse(metricsRaw);
    expect(metricsArtifact.version).toBe(METRICS_ARTIFACT_VERSION);
  });

  it("records deterministic verification commands for each requirement", async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), "speckit-artifacts-"));
    const run: RunArtifact = {
      schema: RUN_ARTIFACT_SCHEMA_VERSION,
      runId: "run-test",
      sourceLogs: [],
      startedAt: null,
      finishedAt: null,
      events: [],
    };
    const requirements: RequirementRecord[] = [
      {
        id: "REQ-001",
        text: "Run `pnpm test --filter api` to confirm handler behavior.",
        status: "satisfied",
        evidence: ["event-a"],
      },
      {
        id: "REQ-002",
        text: "Ensure lint passes before merging.",
        status: "violated",
        evidence: [],
      },
      {
        id: "REQ-003",
        text: "Update the README.md usage notes.",
        status: "unknown",
        evidence: [],
      },
    ];
    const metrics: Metrics = {
      ReqCoverage: 0,
      BacktrackRatio: 0,
      ToolPrecisionAt1: 0,
      EditLocality: 0,
      ReflectionDensity: 0,
      TTFPSeconds: null,
    };

    const { writeArtifacts } = await import("../../speckit-core/src/metrics.ts");

    await writeArtifacts({
      rootDir: outDir,
      outDir,
      run,
      requirements,
      metrics,
      labels: new Set(),
    });

    const raw = await readFile(path.join(outDir, "verification.yaml"), "utf8");
    const parsed = YAML.parse(raw);

    expect(parsed.requirements).toEqual([
      {
        id: "REQ-001",
        description: "Run `pnpm test --filter api` to confirm handler behavior.",
        status: "satisfied",
        evidence: ["event-a"],
        check: "Regression guard: run `pnpm test --filter api` to reconfirm. Evidence: event-a.",
      },
      {
        id: "REQ-002",
        description: "Ensure lint passes before merging.",
        status: "violated",
        evidence: [],
        check: "Remediate failure and re-run `pnpm lint`. No run evidence captured yet.",
      },
      {
        id: "REQ-003",
        description: "Update the README.md usage notes.",
        status: "unknown",
        evidence: [],
        check: "Plan check: run `git diff --stat README.md` to establish coverage. No run evidence captured yet.",
      },
    ]);
  });
});
