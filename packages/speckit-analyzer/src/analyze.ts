import {
  type AnalyzeOptions,
  type AnalyzerEvent,
  type AnalyzerResult,
  type EventsLogSource,
  type LogSource,
  type LogSourceInput,
  type NormalizedLog,
  type NormalizedLogSource,
  type RawLogSource,
} from "./types.js";
import {
  buildRunArtifact,
  detectPrompt,
  mergeNormalized,
  normalizeLogContent,
  normalizedFromEvents,
} from "./normalize.js";
import { deriveRequirements, attachEvidence } from "./requirements.js";
import { computeMetrics } from "./metrics.js";
import { applyFailureLabels, labelsToHints } from "./rules.js";

function isPromiseLike<T>(value: unknown): value is Promise<T> {
  return typeof value === "object" && value !== null && "then" in value && typeof (value as any).then === "function";
}

function isNormalizedLogSource(value: any): value is NormalizedLogSource {
  return value && typeof value === "object" && "log" in value && Array.isArray((value as NormalizedLogSource).log.events);
}

function isEventsLogSource(value: any): value is EventsLogSource {
  return value && typeof value === "object" && Array.isArray((value as EventsLogSource).events);
}

function isRawLogSource(value: any): value is RawLogSource {
  return value && typeof value === "object" && typeof (value as RawLogSource).content === "string";
}

async function resolveInput(input: LogSourceInput): Promise<LogSource | string> {
  if (isPromiseLike<LogSource | string>(input)) {
    return resolveInput(await input);
  }
  return input;
}

interface NormalizedPart {
  id?: string;
  normalized: NormalizedLog;
}

async function normalizeSource(
  source: LogSource | string,
  index: number,
  fallbackStart: Date
): Promise<NormalizedPart> {
  if (typeof source === "string") {
    const sourceId = `source-${index + 1}`;
    const normalized = normalizeLogContent(source, {
      fallbackStart,
      source: sourceId,
    });
    return { id: sourceId, normalized };
  }
  if (isNormalizedLogSource(source)) {
    return { id: source.id, normalized: source.log };
  }
  if (isEventsLogSource(source)) {
    return {
      id: source.id,
      normalized: normalizedFromEvents(source.events, source.promptCandidates ?? [], source.plainText),
    };
  }
  if (isRawLogSource(source)) {
    const normalized = normalizeLogContent(source.content, {
      fallbackStart,
      source: source.id,
      format: source.format,
    });
    return { id: source.id ?? `source-${index + 1}`, normalized };
  }
  throw new Error("Unsupported log source provided to analyzer");
}

async function* iterateSources(
  sources: AnalyzeOptions["sources"]
): AsyncGenerator<LogSource | string, void, unknown> {
  if ((sources as AsyncIterable<LogSourceInput>)[Symbol.asyncIterator]) {
    for await (const entry of sources as AsyncIterable<LogSourceInput>) {
      yield await resolveInput(entry);
    }
  } else {
    for (const entry of sources as Iterable<LogSourceInput>) {
      yield await resolveInput(entry);
    }
  }
}

function combineNormalized(parts: NormalizedPart[]): NormalizedLog {
  if (parts.length === 0) {
    return { events: [], promptCandidates: [], plainText: "" };
  }
  let aggregate = parts[0].normalized;
  for (let i = 1; i < parts.length; i += 1) {
    aggregate = mergeNormalized(aggregate, parts[i].normalized);
  }
  const annotatedPlain = parts
    .map((part) => {
      const header = part.id ? `# Source: ${part.id}\n` : "";
      return `${header}${part.normalized.plainText}`.trim();
    })
    .filter((chunk) => chunk.length > 0)
    .join("\n\n");
  return {
    events: aggregate.events,
    promptCandidates: aggregate.promptCandidates,
    plainText: annotatedPlain || aggregate.plainText,
  };
}

export async function* analyzeStream(options: AnalyzeOptions): AsyncGenerator<AnalyzerEvent, AnalyzerResult, void> {
  const now = options.now?.() ?? new Date();
  const parts: NormalizedPart[] = [];
  const sourceIds: string[] = [];
  let index = 0;

  for await (const source of iterateSources(options.sources)) {
    const fallbackStart = new Date(now.getTime() + index * 60_000);
    const part = await normalizeSource(source, index, fallbackStart);
    parts.push(part);
    sourceIds.push(part.id ?? `source-${index + 1}`);
    yield { type: "normalized", normalized: part.normalized, source: part.id };
    index += 1;
  }

  const normalized = combineNormalized(parts);
  yield { type: "combined", normalized };

  const run = buildRunArtifact(sourceIds, normalized, options.runId, options.metadata);
  yield { type: "run", run };

  const prompt = options.prompt ?? detectPrompt(normalized.promptCandidates, normalized.plainText);
  yield { type: "prompt", prompt };

  const requirements = attachEvidence(deriveRequirements(prompt), run.events);
  yield { type: "requirements", requirements };

  const metrics = computeMetrics(requirements, run.events);
  yield { type: "metrics", metrics };

  const rules = options.rules ?? [];
  const labels = applyFailureLabels(rules, normalized.plainText, run.events);
  if (requirements.some((req) => req.id === "REQ-000")) {
    labels.add("prompt.missing");
  }
  const hints = labelsToHints(labels, rules);
  yield { type: "labels", labels: Array.from(labels), hints };

  const result: AnalyzerResult = {
    run,
    normalized,
    prompt,
    requirements,
    metrics,
    labels,
    hints,
  };
  yield { type: "complete", result };
  return result;
}

export async function analyze(options: AnalyzeOptions): Promise<AnalyzerResult> {
  let final: AnalyzerResult | null = null;
  for await (const event of analyzeStream(options)) {
    if (event.type === "complete") {
      final = event.result;
    }
  }
  if (!final) {
    throw new Error("Analyzer stream completed without producing a result");
  }
  return final;
}
