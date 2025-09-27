import { promises as fs } from "node:fs";
import path from "node:path";

import type { MemoArtifact } from "./artifacts.js";

export const DEFAULT_MEMO_HISTORY_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
export const DEFAULT_PROMOTION_MIN_COUNT = 2;
export const MAX_PROMOTED_ITEMS = 10;

function coerceTimestamp(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function readHistory(historyPath: string): Promise<MemoArtifact[]> {
  try {
    const raw = await fs.readFile(historyPath, "utf8");
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as MemoArtifact;
        } catch (error) {
          console.warn(`[speckit] Skipping malformed memo history entry: ${(error as Error).message}`);
          return null;
        }
      })
      .filter((entry): entry is MemoArtifact => entry !== null);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function dedupeByRun(entries: MemoArtifact[]): MemoArtifact[] {
  const sorted = entries
    .map((entry) => ({
      entry,
      timestamp: coerceTimestamp(entry.generated_at) ?? 0,
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
  const map = new Map<string, MemoArtifact>();
  for (const { entry } of sorted) {
    const runId = entry.generated_from?.run_id ?? "";
    map.set(runId, entry);
  }
  return Array.from(map.values());
}

function promoteValues(
  entries: MemoArtifact[],
  pick: (entry: MemoArtifact) => string[],
  baseline: string[],
  minimumCount: number
): string[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const rawValue of pick(entry)) {
      const value = rawValue.trim();
      if (!value) continue;
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  const promoted = Array.from(counts.entries())
    .filter(([value, count]) => count >= minimumCount && !baseline.includes(value))
    .sort((a, b) => {
      if (b[1] === a[1]) return a[0].localeCompare(b[0]);
      return b[1] - a[1];
    })
    .slice(0, MAX_PROMOTED_ITEMS)
    .map(([value]) => value);
  return promoted;
}

function uniqueConcat(base: string[], additions: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const value of [...base, ...additions]) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    merged.push(trimmed);
  }
  return merged;
}

export interface UpdateMemoHistoryOptions {
  historyPath: string;
  memo: MemoArtifact;
  ttlMs?: number;
  now?: Date;
  promotionMinCount?: number;
}

export interface MemoHistoryUpdateResult {
  historyPath: string;
  entries: MemoArtifact[];
  memo: MemoArtifact;
  promotedLessons: string[];
  promotedGuardrails: string[];
}

export async function updateMemoHistory(
  options: UpdateMemoHistoryOptions
): Promise<MemoHistoryUpdateResult> {
  const ttlMs = options.ttlMs ?? DEFAULT_MEMO_HISTORY_TTL_MS;
  const promotionMinCount = options.promotionMinCount ?? DEFAULT_PROMOTION_MIN_COUNT;
  const now = options.now ?? new Date();
  const historyPath = options.historyPath;
  const cutoff = now.getTime() - ttlMs;

  const existingEntries = await readHistory(historyPath);
  const filtered = existingEntries.filter((entry) => {
    const timestamp = coerceTimestamp(entry.generated_at);
    if (timestamp === null) return false;
    return timestamp >= cutoff;
  });

  const deduped = dedupeByRun(filtered);
  const initialMemo: MemoArtifact = {
    ...options.memo,
    guardrails: [...options.memo.guardrails],
    lessons: [...options.memo.lessons],
  };

  const baseEntries = deduped.filter(
    (entry) => entry.generated_from?.run_id !== initialMemo.generated_from.run_id
  );
  const combinedForCounts = [...baseEntries, initialMemo];

  const promotedLessons = promoteValues(
    combinedForCounts,
    (entry) => entry.lessons ?? [],
    initialMemo.lessons ?? [],
    promotionMinCount
  );
  const promotedGuardrails = promoteValues(
    combinedForCounts,
    (entry) => entry.guardrails ?? [],
    initialMemo.guardrails ?? [],
    promotionMinCount
  );

  const enhancedMemo: MemoArtifact = {
    ...initialMemo,
    guardrails: uniqueConcat(initialMemo.guardrails ?? [], promotedGuardrails),
    lessons: uniqueConcat(initialMemo.lessons ?? [], promotedLessons),
  };

  const finalEntries = [...baseEntries, enhancedMemo].sort((a, b) => {
    const aTime = coerceTimestamp(a.generated_at) ?? 0;
    const bTime = coerceTimestamp(b.generated_at) ?? 0;
    return aTime - bTime;
  });

  await fs.mkdir(path.dirname(historyPath), { recursive: true });
  const payload = finalEntries.map((entry) => JSON.stringify(entry)).join("\n");
  await fs.writeFile(historyPath, payload + (finalEntries.length > 0 ? "\n" : ""), "utf8");

  return {
    historyPath,
    entries: finalEntries,
    memo: enhancedMemo,
    promotedLessons,
    promotedGuardrails,
  };
}
