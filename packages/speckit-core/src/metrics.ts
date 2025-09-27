import type { AnalyzerResult, Metrics } from "@speckit/analyzer";

export type MetricKey = keyof Metrics;

export interface MetricRow {
  key: MetricKey | "SanitizerHits";
  label: string;
  value: string;
  raw: number | null;
  target?: number | null;
  met?: boolean | null;
}

export interface MetricsSummaryOptions {
  decimals?: number;
  targets?: Partial<Record<MetricKey, number>>;
  sanitizerHits?: number | null;
}

const METRIC_LABELS: Record<MetricKey, string> = {
  ReqCoverage: "Requirement Coverage",
  BacktrackRatio: "Backtrack Ratio",
  ToolPrecisionAt1: "Tool Precision @1",
  EditLocality: "Edit Locality",
  ReflectionDensity: "Reflection Density",
  TTFPSeconds: "Time to First Patch (s)",
};

const DEFAULT_TARGETS: Partial<Record<MetricKey, number>> = {
  ReqCoverage: 1,
  ToolPrecisionAt1: 0.7,
  BacktrackRatio: 0.2,
  EditLocality: 0.75,
  ReflectionDensity: 0.25,
};

function formatValue(value: number | null, decimals: number): string {
  if (value === null || value === undefined) {
    return "—";
  }
  if (!Number.isFinite(value)) {
    return String(value);
  }
  return value.toFixed(decimals);
}

function evaluateMetric(key: MetricKey, value: number | null, target: number | null): boolean | null {
  if (value === null || target === null || target === undefined) {
    return null;
  }
  if (!Number.isFinite(value) || !Number.isFinite(target)) {
    return null;
  }
  switch (key) {
    case "BacktrackRatio":
    case "ReflectionDensity":
      return value <= target;
    case "TTFPSeconds":
      return value <= target;
    default:
      return value >= target;
  }
}

export function metrics(
  input: Metrics | AnalyzerResult,
  options: MetricsSummaryOptions = {}
): MetricRow[] {
  const decimals = options.decimals ?? 2;
  const rawMetrics: Metrics = "metrics" in input ? input.metrics : (input as Metrics);
  const targets = { ...DEFAULT_TARGETS, ...(options.targets ?? {}) };

  const rows: MetricRow[] = (Object.entries(METRIC_LABELS) as Array<[MetricKey, string]>).map(([key, label]) => {
    const value = rawMetrics[key];
    const target = key === "TTFPSeconds" ? (targets[key] ?? null) : targets[key] ?? null;
    return {
      key,
      label,
      raw: value ?? null,
      value: formatValue(value ?? null, key === "TTFPSeconds" ? 1 : decimals),
      target,
      met: evaluateMetric(key, value ?? null, target ?? null),
    };
  });

  if (options.sanitizerHits !== undefined && options.sanitizerHits !== null) {
    rows.push({
      key: "SanitizerHits",
      label: "Sanitizer Hits",
      raw: options.sanitizerHits,
      value: options.sanitizerHits.toString(),
      target: 0,
      met: options.sanitizerHits === 0,
    });
  }

  return rows;
}

export { METRIC_LABELS };
