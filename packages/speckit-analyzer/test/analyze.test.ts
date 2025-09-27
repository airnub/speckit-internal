import { fileURLToPath } from "node:url";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  analyze,
  analyzeStream,
  parseFailureRules,
  type AnalyzerEvent,
} from "../src/index.js";
import { createFileLogSource } from "../src/adapters/node.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fixturePath = path.join(__dirname, "fixtures", "successful-run.ndjson");
const rulesYaml = `rules:\n  - id: doc.update\n    label: docs.update\n    patterns:\n      - "README"\n    remediation: "Confirm README changes"\n  - id: reflection\n    patterns:\n      - "Reflection"\n    hint: "Summarize reflection for UI"\n`;

describe("analyzer integration", () => {
  it("analyzes fixture logs and computes metrics", async () => {
    const source = await createFileLogSource(fixturePath);
    const result = await analyze({
      sources: [source],
      rules: parseFailureRules(rulesYaml),
      runId: "run-fixture",
    });

    expect(result.run.runId).toBe("run-fixture");
    expect(result.run.events).toHaveLength(6);
    expect(result.run.sourceLogs).toEqual([fixturePath]);
    expect(result.prompt).toContain("Ensure API logging is structured");

    expect(result.requirements).toHaveLength(2);
    expect(result.requirements.every((req) => req.status === "satisfied")).toBe(true);

    expect(result.metrics.ReqCoverage).toBe(1);
    expect(result.metrics.ToolPrecisionAt1).toBe(1);
    expect(result.metrics.BacktrackRatio).toBe(0);
    expect(result.metrics.EditLocality).toBeCloseTo(0.5, 2);
    expect(result.metrics.ReflectionDensity).toBeCloseTo(0.5, 2);
    expect(result.metrics.TTFPSeconds).toBe(300);

    expect(Array.from(result.labels)).toEqual(["docs.update", "reflection"]);
    expect(result.hints).toEqual([
      "Confirm README changes",
      "Summarize reflection for UI",
    ]);
  });

  it("streams incremental analyzer events", async () => {
    const source = await createFileLogSource(fixturePath);
    const events: AnalyzerEvent["type"][] = [];
    let streamedPrompt: string | null = null;

    for await (const event of analyzeStream({ sources: [source], rules: parseFailureRules(rulesYaml) })) {
      events.push(event.type);
      if (event.type === "prompt") {
        streamedPrompt = event.prompt;
      }
    }

    expect(events).toEqual([
      "normalized",
      "combined",
      "run",
      "prompt",
      "requirements",
      "metrics",
      "labels",
      "complete",
    ]);
    expect(streamedPrompt).toContain("Ensure API logging is structured");
  });

  it("flags missing prompts and derives fallback requirements", async () => {
    const rawLog = `2025-01-01T00:00:00Z LOG: Analyzer bootstrapped`;
    const result = await analyze({ sources: [{ content: rawLog, id: "stdin" }] });

    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0].id).toBe("REQ-000");
    expect(result.labels.has("prompt.missing")).toBe(true);
    expect(result.prompt).toContain("Analyzer bootstrapped");
  });
});
