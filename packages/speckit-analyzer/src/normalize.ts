import stripAnsi from "strip-ansi";
import { sha1 } from "@noble/hashes/sha1";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";

import {
  RUN_ARTIFACT_SCHEMA_VERSION,
  type NormalizeOptions,
  type NormalizedLog,
  type RunArtifact,
  type RunEvent,
} from "./types.js";

const HASH_KIND_PREFIX: Record<string, string> = {
  plan: "plan",
  search: "srch",
  edit: "edit",
  run: "run",
  eval: "eval",
  reflect: "refl",
  tool: "tool",
  log: "log",
  summary: "sum",
  error: "err",
};

function basename(input: string): string {
  const normalized = input.replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length === 0) return input;
  return segments[segments.length - 1] || input;
}

function computeHashId(value: unknown, kind: string, source?: string): string {
  const payload = typeof value === "string" ? value : JSON.stringify(value);
  const hex = bytesToHex(sha1(utf8ToBytes(payload))).slice(0, 12);
  const prefix = HASH_KIND_PREFIX[kind] ?? "evt";
  const scope = source ? basename(source) : "run";
  return `${prefix}-${scope}-${hex}`;
}

function ensureIsoTimestamp(value: unknown, fallback: Date, offsetSeconds: number): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  const fallbackDate = new Date(fallback.getTime() + offsetSeconds * 1000);
  return fallbackDate.toISOString();
}

function normalizeEvent(
  raw: any,
  fallbackStart: Date,
  index: number,
  explicitKind?: string,
  source?: string
): RunEvent {
  const kind: string =
    explicitKind ??
    (typeof raw.kind === "string"
      ? raw.kind
      : typeof raw.phase === "string"
      ? raw.phase
      : typeof raw.step === "string"
      ? raw.step
      : "log");

  const filesChanged = Array.isArray(raw.files_changed)
    ? raw.files_changed.filter((entry: unknown): entry is string => typeof entry === "string")
    : undefined;

  const materialized = {
    timestamp: ensureIsoTimestamp(raw.timestamp, fallbackStart, index),
    kind,
    subtype: typeof raw.subtype === "string" ? raw.subtype : undefined,
    role: typeof raw.role === "string" ? raw.role : undefined,
    input: raw.input ?? raw.prompt ?? raw.message ?? undefined,
    output: raw.output ?? raw.result ?? raw.text ?? raw.message ?? undefined,
    error: raw.error ?? raw.err ?? undefined,
    files_changed: filesChanged,
    meta: typeof raw.meta === "object" && raw.meta !== null ? raw.meta : undefined,
  } satisfies Omit<RunEvent, "id">;

  const baseId = typeof raw.id === "string" && raw.id.trim().length > 0 ? raw.id : undefined;
  const id = baseId ?? computeHashId({ ...materialized, source }, kind, source);

  return {
    id,
    ...materialized,
  };
}

function parseJsonPayload(content: string, fallback: Date, source?: string): NormalizedLog | null {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      const events = parsed.map((item, index) => normalizeEvent(item, fallback, index, undefined, source));
      const prompts = parsed
        .map((item: any) => (typeof item.prompt === "string" ? item.prompt : undefined))
        .filter((value): value is string => typeof value === "string");
      return { events, promptCandidates: prompts, plainText: content };
    }
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as any).events)) {
      const events = (parsed as any).events.map((item: any, index: number) =>
        normalizeEvent(item, fallback, index, undefined, source)
      );
      const prompt = typeof (parsed as any).prompt === "string" ? [(parsed as any).prompt] : [];
      return { events, promptCandidates: prompt, plainText: content };
    }
  } catch (error) {
    console.warn(`[analyzer:normalize] ${source ?? "payload"} is not JSON array/object: ${(error as Error).message}`);
  }
  return null;
}

function parseNdjson(content: string, fallback: Date, source?: string): NormalizedLog | null {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const events: RunEvent[] = [];
  const prompts: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    try {
      const parsed = JSON.parse(lines[i]);
      events.push(normalizeEvent(parsed, fallback, events.length, undefined, source));
      if (typeof parsed.prompt === "string") {
        prompts.push(parsed.prompt);
      }
    } catch (error) {
      console.warn(
        `[analyzer:normalize] NDJSON parse failure in ${source ?? "payload"} (line ${i + 1}): ${(error as Error).message}`
      );
      return null;
    }
  }
  return { events, promptCandidates: prompts, plainText: content };
}

function parseTextLog(content: string, fallback: Date, source?: string): NormalizedLog {
  const lines = content.split(/\r?\n/);
  const events: RunEvent[] = [];
  const prompts: string[] = [];
  let capturePrompt = false;
  let promptBuffer: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    const timestampMatch = line.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)/);
    const timestamp = timestampMatch ? timestampMatch[1] : undefined;
    const kindMatch = trimmed.match(/^(PLAN|SEARCH|EDIT|RUN|EVAL|REFLECT|TOOL|LOG|SUMMARY|ERROR)[:|-]/i);
    let kind = "log";
    if (kindMatch) {
      const rawKind = kindMatch[1].toLowerCase();
      if (rawKind === "tool" || rawKind === "run") kind = "tool";
      else if (rawKind === "error") kind = "error";
      else kind = rawKind;
    }
    const event = normalizeEvent(
      {
        id: `${source ?? "text"}-line-${i + 1}`,
        timestamp,
        kind,
        output: trimmed,
        error: kind === "error" ? trimmed : undefined,
      },
      fallback,
      events.length,
      kind,
      source
    );
    events.push(event);

    if (/prompt start/i.test(trimmed) || /system prompt/i.test(trimmed)) {
      capturePrompt = true;
      promptBuffer = [];
      continue;
    }
    if (capturePrompt) {
      if (trimmed.length === 0 || /prompt end/i.test(trimmed)) {
        if (promptBuffer.length > 0) {
          prompts.push(promptBuffer.join("\n"));
        }
        capturePrompt = false;
        promptBuffer = [];
        continue;
      }
      promptBuffer.push(line.replace(/^\s*>\s?/, "").trimEnd());
    }
  }
  if (capturePrompt && promptBuffer.length > 0) {
    prompts.push(promptBuffer.join("\n"));
  }
  return { events, promptCandidates: prompts, plainText: content };
}

export function normalizeLogContent(content: string, options: NormalizeOptions = {}): NormalizedLog {
  const sanitized = stripAnsi(content ?? "");
  const fallback = options.fallbackStart ?? new Date();
  const source = options.source;
  const format = options.format ?? "auto";

  if (format === "json" || format === "auto") {
    const parsed = parseJsonPayload(sanitized, fallback, source);
    if (parsed) return parsed;
  }
  if (format === "ndjson" || format === "auto") {
    const ndjsonParsed = parseNdjson(sanitized, fallback, source);
    if (ndjsonParsed) return ndjsonParsed;
  }
  return parseTextLog(sanitized, fallback, source);
}

export function normalizedFromEvents(
  events: RunEvent[],
  promptCandidates: string[] = [],
  plainText?: string
): NormalizedLog {
  return {
    events: events.map((event, index) => ({
      ...event,
      id: typeof event.id === "string" && event.id.trim().length > 0 ? event.id : `evt-${index}`,
      timestamp: ensureIsoTimestamp(event.timestamp, new Date(), index),
    })),
    promptCandidates,
    plainText: plainText ?? events.map((event) => JSON.stringify(event)).join("\n"),
  };
}

export function mergeNormalized(base: NormalizedLog, incoming: NormalizedLog): NormalizedLog {
  const seen = new Set(base.events.map((event) => event.id));
  const mergedEvents = [...base.events];
  for (const event of incoming.events) {
    if (!seen.has(event.id)) {
      mergedEvents.push(event);
      seen.add(event.id);
    }
  }
  const prompts = [...base.promptCandidates, ...incoming.promptCandidates];
  const plainText = `${base.plainText}\n${incoming.plainText}`.trim();
  return { events: mergedEvents, promptCandidates: prompts, plainText };
}

export function buildRunArtifact(
  sourceLogs: string[],
  normalized: NormalizedLog,
  runId?: string,
  metadata?: Record<string, unknown>
): RunArtifact {
  const sortedEvents = [...normalized.events].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  return {
    schema: RUN_ARTIFACT_SCHEMA_VERSION,
    runId: runId ?? `run-${Date.now()}`,
    sourceLogs,
    startedAt: sortedEvents[0]?.timestamp ?? null,
    finishedAt: sortedEvents[sortedEvents.length - 1]?.timestamp ?? null,
    events: sortedEvents,
    metadata,
  };
}

export function detectPrompt(candidates: string[], fallbackText: string): string {
  if (candidates.length > 0) {
    return [...candidates].sort((a, b) => b.length - a.length)[0];
  }
  const lower = fallbackText.toLowerCase();
  const guardrailIndex = lower.indexOf("guard rail");
  if (guardrailIndex >= 0) {
    return fallbackText.slice(guardrailIndex, guardrailIndex + 2_000);
  }
  return fallbackText.slice(0, 2_000);
}
