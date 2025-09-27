import { analyze, type AnalyzerResult, type AnalyzeOptions, type FailureRule, type LogSourceInput } from "@speckit/analyzer";
import { createFileLogSource, loadFailureRulesFromFs } from "@speckit/analyzer/adapters/node";

export type { AnalyzerResult } from "@speckit/analyzer";
export type { MetricRow, MetricsSummaryOptions } from "./metrics.js";
export type {
  SanitizeLogsInput,
  SanitizeLogsOptions,
  SanitizeLogsResult,
  SanitizeTextResult,
  SanitizerPatternDefinition,
} from "./sanitizer.js";

export { metrics } from "./metrics.js";
export {
  sanitizeLogs,
  sanitizeText,
  defaultSanitizerPatterns,
  defaultSanitizerPatternSources,
} from "./sanitizer.js";

export interface AnalyzeLogsOptions {
  files?: string[];
  sources?: Iterable<LogSourceInput> | AsyncIterable<LogSourceInput>;
  runId?: AnalyzeOptions["runId"];
  prompt?: AnalyzeOptions["prompt"];
  metadata?: AnalyzeOptions["metadata"];
  rules?: FailureRule[];
  failureRulesRoot?: string;
  failureRulesOutDir?: string;
}

async function resolveSources(options: AnalyzeLogsOptions): Promise<Iterable<LogSourceInput> | AsyncIterable<LogSourceInput>> {
  if (options.sources) {
    return options.sources;
  }
  if (options.files && options.files.length > 0) {
    const sources = await Promise.all(options.files.map(file => createFileLogSource(file)));
    return sources;
  }
  throw new Error("analyzeLogs requires either sources or files to be provided");
}

async function resolveFailureRules(options: AnalyzeLogsOptions): Promise<FailureRule[] | undefined> {
  if (options.rules) {
    return options.rules;
  }
  if (options.failureRulesRoot) {
    const outDir = options.failureRulesOutDir ?? ".speckit";
    try {
      return await loadFailureRulesFromFs(options.failureRulesRoot, outDir);
    } catch (error) {
      const err = error as Error;
      throw new Error(`Unable to load failure rules: ${err.message}`);
    }
  }
  return undefined;
}

export async function analyzeLogs(options: AnalyzeLogsOptions): Promise<AnalyzerResult> {
  const sources = await resolveSources(options);
  const rules = await resolveFailureRules(options);
  return analyze({
    sources,
    runId: options.runId,
    prompt: options.prompt,
    metadata: options.metadata,
    rules,
  });
}
