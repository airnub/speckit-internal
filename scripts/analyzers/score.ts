import type { RunEvent } from "./normalize.js";
import type { RequirementRecord } from "./requirements.js";

export interface Metrics {
  ReqCoverage: number;
  BacktrackRatio: number;
  ToolPrecisionAt1: number;
  EditLocality: number;
  ReflectionDensity: number;
  TTFPSeconds: number | null;
}

export function computeMetrics(requirements: RequirementRecord[], events: RunEvent[]): Metrics {
  const satisfied = requirements.filter(
    (req) => req.status === "satisfied" || req.status === "in-progress"
  );
  const toolEvents = events.filter((event) => event.kind === "tool" || event.kind === "action" || event.kind === "run");
  const toolErrors = toolEvents.filter((event) => {
    if (event.error === null || event.error === undefined || event.error === false) return false;
    if (typeof event.error === "string" && event.error.trim().length === 0) return false;
    if (typeof event.output === "string" && /error|failed|exception/i.test(event.output)) return true;
    return true;
  });
  const totalTools = toolEvents.length;
  const backtrackRatio = totalTools === 0 ? 0 : toolErrors.length / totalTools;
  const toolPrecision = totalTools === 0 ? 1 : (toolEvents.length - toolErrors.length) / totalTools;

  const changedFiles = new Set<string>();
  let editTouches = 0;
  for (const event of events) {
    if (Array.isArray(event.files_changed)) {
      event.files_changed.forEach((file) => changedFiles.add(file));
      editTouches += event.files_changed.length;
    }
  }
  const editLocality = editTouches === 0 ? 1 : Math.max(0, 1 - (changedFiles.size - 1) / Math.max(changedFiles.size, editTouches));

  const reasoningEvents = events.filter(
    (event) => event.kind === "log" || event.kind === "plan" || event.kind === "summary" || event.kind === "reflect"
  );
  const reflective = reasoningEvents.filter((event) => {
    if (typeof event.output === "string" && /reflect|lesson|next run|improve/i.test(event.output)) return true;
    if (typeof event.input === "string" && /reflect|lesson/i.test(event.input)) return true;
    return false;
  });
  const reflectionDensity = reasoningEvents.length === 0 ? 0 : reflective.length / reasoningEvents.length;

  const sortedEvents = [...events].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  const start = sortedEvents[0] ? new Date(sortedEvents[0].timestamp).getTime() : null;
  let ttfp: number | null = null;
  if (start !== null) {
    for (const event of sortedEvents) {
      const hasFiles = Array.isArray(event.files_changed) && event.files_changed.length > 0;
      if (hasFiles || event.kind === "edit") {
        ttfp = (new Date(event.timestamp).getTime() - start) / 1000;
        break;
      }
    }
  }

  return {
    ReqCoverage: requirements.length === 0 ? 0 : satisfied.length / requirements.length,
    BacktrackRatio: Number(backtrackRatio.toFixed(3)),
    ToolPrecisionAt1: Number(toolPrecision.toFixed(3)),
    EditLocality: Number(editLocality.toFixed(3)),
    ReflectionDensity: Number(reflectionDensity.toFixed(3)),
    TTFPSeconds: ttfp !== null ? Number(ttfp.toFixed(2)) : null,
  };
}

export function summarizeMetrics(metrics: Metrics): { label: string; value: number | null }[] {
  return [
    { label: "ReqCoverage", value: metrics.ReqCoverage },
    { label: "BacktrackRatio", value: metrics.BacktrackRatio },
    { label: "ToolPrecision@1", value: metrics.ToolPrecisionAt1 },
    { label: "EditLocality", value: metrics.EditLocality },
    { label: "ReflectionDensity", value: metrics.ReflectionDensity },
    { label: "TTFP", value: metrics.TTFPSeconds },
  ];
}
