import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { MEMO_ARTIFACT_VERSION } from "../src/types.js";
import type { MemoArtifact } from "../../../scripts/writers/artifacts.ts";
import { updateMemoHistory } from "../../../scripts/writers/memo-history.ts";

function createMemo(overrides: Partial<MemoArtifact>): MemoArtifact {
  return {
    version: MEMO_ARTIFACT_VERSION,
    generated_at: overrides.generated_at ?? new Date().toISOString(),
    generated_from:
      overrides.generated_from ?? {
        run_id: overrides.generated_from?.run_id ?? `run-${Math.random().toString(36).slice(2)}`,
        sources: overrides.generated_from?.sources ?? [],
      },
    lessons: overrides.lessons ?? [],
    guardrails: overrides.guardrails ?? [],
    checklist: overrides.checklist ?? [],
    labels: overrides.labels ?? [],
  };
}

describe("memo history", () => {
  it("replaces history entries when the same run is processed again", async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), "memo-history-"));
    const historyPath = path.join(outDir, "memo-history.jsonl");

    const firstMemo = createMemo({
      generated_at: new Date("2025-01-01T00:00:00Z").toISOString(),
      generated_from: { run_id: "run-1", sources: ["a.log"] },
      lessons: ["Initial lesson"],
      guardrails: ["Prevent regression on R1"],
    });
    await updateMemoHistory({ historyPath, memo: firstMemo, now: new Date("2025-01-01T01:00:00Z") });

    const secondMemo = createMemo({
      generated_at: new Date("2025-01-02T00:00:00Z").toISOString(),
      generated_from: { run_id: "run-1", sources: ["b.log"] },
      lessons: ["Follow-up lesson"],
      guardrails: ["Maintain coverage"],
    });
    const update = await updateMemoHistory({
      historyPath,
      memo: secondMemo,
      now: new Date("2025-01-02T01:00:00Z"),
    });

    expect(update.entries).toHaveLength(1);
    expect(update.entries[0].generated_from.run_id).toBe("run-1");
    expect(update.entries[0].lessons).toContain("Follow-up lesson");
    expect(update.entries[0].guardrails).toContain("Maintain coverage");

    const persisted = await readFile(historyPath, "utf8");
    const rows = persisted
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as MemoArtifact);
    expect(rows).toHaveLength(1);
    expect(rows[0].generated_from.run_id).toBe("run-1");
    expect(rows[0].lessons).toContain("Follow-up lesson");
  });

  it("promotes recurring lessons and guardrails while pruning expired history", async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), "memo-history-"));
    const historyPath = path.join(outDir, "memo-history.jsonl");
    const ttlMs = 1000 * 60 * 60 * 72; // 72 hours

    const expiredMemo = createMemo({
      generated_at: new Date("2025-01-01T00:00:00Z").toISOString(),
      generated_from: { run_id: "run-expired", sources: ["old.log"] },
      lessons: ["Expired lesson"],
      guardrails: ["Expired guardrail"],
    });
    await updateMemoHistory({
      historyPath,
      memo: expiredMemo,
      now: new Date("2025-01-01T12:00:00Z"),
      ttlMs,
    });

    const memoA = createMemo({
      generated_at: new Date("2025-01-03T00:00:00Z").toISOString(),
      generated_from: { run_id: "run-a", sources: ["a.log"] },
      lessons: ["Repeat lesson"],
      guardrails: ["Repeat guardrail"],
    });
    await updateMemoHistory({
      historyPath,
      memo: memoA,
      now: new Date("2025-01-03T12:00:00Z"),
      ttlMs,
    });

    const memoB = createMemo({
      generated_at: new Date("2025-01-04T00:00:00Z").toISOString(),
      generated_from: { run_id: "run-b", sources: ["b.log"] },
      lessons: ["Repeat lesson"],
      guardrails: ["Repeat guardrail"],
    });
    await updateMemoHistory({
      historyPath,
      memo: memoB,
      now: new Date("2025-01-04T12:00:00Z"),
      ttlMs,
    });

    const latestMemo = createMemo({
      generated_at: new Date("2025-01-05T00:00:00Z").toISOString(),
      generated_from: { run_id: "run-c", sources: ["c.log"] },
      lessons: ["Fresh lesson"],
      guardrails: ["Fresh guardrail"],
    });
    const latestUpdate = await updateMemoHistory({
      historyPath,
      memo: latestMemo,
      now: new Date("2025-01-05T12:00:00Z"),
      ttlMs,
    });

    expect(latestUpdate.entries.map((entry) => entry.generated_from.run_id)).toEqual([
      "run-a",
      "run-b",
      "run-c",
    ]);
    expect(latestUpdate.promotedGuardrails).toContain("Repeat guardrail");
    expect(latestUpdate.promotedLessons).toContain("Repeat lesson");
    expect(latestUpdate.memo.guardrails).toEqual([
      "Fresh guardrail",
      "Repeat guardrail",
    ]);
    expect(latestUpdate.memo.lessons).toEqual([
      "Fresh lesson",
      "Repeat lesson",
    ]);
  });
});
