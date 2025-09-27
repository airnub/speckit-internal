import { analyze, analyzeStream } from "@speckit/analyzer";
import type { AnalyzeOptions } from "@speckit/analyzer";

import type { AnalyzeEvent, AnalyzeLogsOptions, AnalyzeResult, AnalyzeSourceInput } from "./types.js";

function toAnalyzeOptions(
  sources: Iterable<AnalyzeSourceInput> | AsyncIterable<AnalyzeSourceInput>,
  options: AnalyzeLogsOptions
): AnalyzeOptions {
  return {
    sources,
    rules: options.rules,
    runId: options.runId,
    prompt: options.prompt,
    metadata: options.metadata,
    now: options.now,
  };
}

async function emitEvents(
  iterator: AsyncIterable<AnalyzeEvent>,
  callback: (event: AnalyzeEvent) => void | Promise<void>
): Promise<AnalyzeResult> {
  let final: AnalyzeResult | null = null;
  for await (const event of iterator) {
    await callback(event);
    if (event.type === "complete") {
      final = event.result;
    }
  }
  if (!final) {
    throw new Error("analyzeLogs completed without producing a final result");
  }
  return final;
}

export async function analyzeLogs(
  sources: Iterable<AnalyzeSourceInput> | AsyncIterable<AnalyzeSourceInput>,
  options: AnalyzeLogsOptions = {}
): Promise<AnalyzeResult> {
  const baseOptions = toAnalyzeOptions(sources, options);
  if (options.onEvent) {
    return emitEvents(analyzeStream(baseOptions), options.onEvent);
  }
  return analyze(baseOptions);
}
