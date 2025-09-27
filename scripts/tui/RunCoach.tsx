import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import chalk from "chalk";

export interface CoachMetricsEntry {
  label: string;
  value: number | null;
}

export interface CoachTimelineEntry {
  index: number;
  timestamp: string;
  kind: string;
  subtype?: string | null;
  files: string[];
  summary?: string;
}

export interface CoachDiffEntry {
  index: number;
  timestamp: string;
  files: string[];
  summary?: string;
}

export interface CoachHeatmapEntry {
  file: string;
  touches: number;
  lastTouchedAt: string;
}

export type CoachQuickAction =
  | { type: "insertVerification" }
  | { type: "openFile"; file?: string }
  | { type: "regenerateMemo" };

export interface CoachState {
  repoName: string;
  logSource: string;
  currentStep?: string;
  metrics: CoachMetricsEntry[];
  hints: string[];
  labels: string[];
  completed: boolean;
  artifacts?: string[];
  startTime: number;
  timeline: CoachTimelineEntry[];
  diffs: CoachDiffEntry[];
  heatmap: CoachHeatmapEntry[];
}

export interface RunCoachProps {
  initialState: CoachState;
  subscribe: (listener: (state: CoachState) => void) => () => void;
  dispatch: (action: CoachQuickAction) => void;
}

function formatValue(entry: CoachMetricsEntry): string {
  if (entry.value === null || entry.value === undefined) return "—";
  if (entry.label === "ReqCoverage" || entry.label === "BacktrackRatio" || entry.label === "ToolPrecision@1" || entry.label === "EditLocality" || entry.label === "ReflectionDensity") {
    return `${Math.round(entry.value * 100)}%`;
  }
  return `${entry.value}`;
}

type CoachTab = "timeline" | "metrics" | "hints" | "diffs";

const TABS: CoachTab[] = ["timeline", "metrics", "hints", "diffs"];

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function truncate(text: string, max = 64): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function renderTabLabel(tab: CoachTab, isActive: boolean): string {
  const label =
    tab === "timeline"
      ? "Timeline"
      : tab === "metrics"
      ? "Metrics"
      : tab === "hints"
      ? "Hints"
      : "Diffs";
  return isActive ? chalk.black.bgCyan(` ${label} `) : chalk.cyan(` ${label} `);
}

export function RunCoach({ initialState, subscribe, dispatch }: RunCoachProps): JSX.Element {
  const [state, setState] = useState<CoachState>(initialState);
  const [elapsed, setElapsed] = useState<number>(0);
  const [tabIndex, setTabIndex] = useState<number>(0);
  const [cursors, setCursors] = useState<Record<CoachTab, number>>({
    timeline: 0,
    metrics: 0,
    hints: 0,
    diffs: 0,
  });
  const { exit } = useApp();

  useEffect(() => {
    return subscribe((next) => {
      setState(next);
      if (next.completed) {
        setElapsed(Math.round((Date.now() - next.startTime) / 1000));
      }
    });
  }, [subscribe]);

  useEffect(() => {
    if (state.completed) return;
    const interval = setInterval(() => {
      setElapsed(Math.round((Date.now() - state.startTime) / 1000));
    }, 1_000);
    return () => clearInterval(interval);
  }, [state.completed, state.startTime]);

  useEffect(() => {
    if (state.completed) {
      const timeout = setTimeout(() => exit(), 2_000);
      return () => clearTimeout(timeout);
    }
    return () => {};
  }, [state.completed, exit]);

  useEffect(() => {
    setCursors((prev) => {
      const next: Record<CoachTab, number> = { ...prev };
      for (const tab of TABS) {
        const itemsLength =
          tab === "timeline"
            ? state.timeline.length
            : tab === "metrics"
            ? state.metrics.length
            : tab === "hints"
            ? state.hints.length
            : state.diffs.length;
        if (itemsLength === 0) {
          next[tab] = 0;
        } else {
          const current = prev[tab] ?? 0;
          next[tab] = Math.min(itemsLength - 1, current);
        }
      }
      return next;
    });
  }, [state.timeline.length, state.metrics.length, state.hints.length, state.diffs.length]);

  const activeTab = TABS[tabIndex] ?? "timeline";

  useInput((input, key) => {
    if (key.leftArrow) {
      setTabIndex((prev) => (prev - 1 + TABS.length) % TABS.length);
      return;
    }
    if (key.rightArrow || key.tab) {
      setTabIndex((prev) => (prev + 1) % TABS.length);
      return;
    }
    if (key.upArrow) {
      const itemsLength =
        activeTab === "timeline"
          ? state.timeline.length
          : activeTab === "metrics"
          ? state.metrics.length
          : activeTab === "hints"
          ? state.hints.length
          : state.diffs.length;
      if (itemsLength > 0) {
        setCursors((prev) => {
          const current = prev[activeTab] ?? 0;
          const next = Math.max(0, current - 1);
          if (next === current) return prev;
          return { ...prev, [activeTab]: next };
        });
      }
      return;
    }
    if (key.downArrow) {
      const itemsLength =
        activeTab === "timeline"
          ? state.timeline.length
          : activeTab === "metrics"
          ? state.metrics.length
          : activeTab === "hints"
          ? state.hints.length
          : state.diffs.length;
      if (itemsLength > 0) {
        setCursors((prev) => {
          const current = prev[activeTab] ?? 0;
          const next = Math.min(itemsLength - 1, current + 1);
          if (next === current) return prev;
          return { ...prev, [activeTab]: next };
        });
      }
      return;
    }
    if (input) {
      const normalized = input.toLowerCase();
      if (normalized === "v") {
        dispatch({ type: "insertVerification" });
        return;
      }
      if (normalized === "o") {
        const cursor = cursors.timeline ?? 0;
        const target = state.timeline[cursor]?.files?.[0] ?? state.heatmap[0]?.file;
        dispatch({ type: "openFile", file: target });
        return;
      }
      if (normalized === "m") {
        dispatch({ type: "regenerateMemo" });
      }
    }
  });

  const header = `${state.repoName} — ${state.logSource}`;
  const minute = Math.floor(elapsed / 60)
    .toString()
    .padStart(2, "0");
  const second = Math.floor(elapsed % 60)
    .toString()
    .padStart(2, "0");
  const timer = `${minute}:${second}`;

  const timelineCursor = cursors.timeline ?? 0;
  const metricsCursor = cursors.metrics ?? 0;
  const hintsCursor = cursors.hints ?? 0;
  const diffsCursor = cursors.diffs ?? 0;

  const heatmapMax = useMemo(
    () => state.heatmap.reduce((max, entry) => Math.max(max, entry.touches), 0),
    [state.heatmap]
  );

  const renderTimeline = () => {
    if (state.timeline.length === 0) {
      return <Text>{chalk.dim("No events yet — ingesting logs...")}</Text>;
    }
    return (
      <Box flexDirection="column">
        {state.timeline.map((entry, index) => {
          const prefix = index === timelineCursor ? chalk.cyan("➤") : chalk.dim("•");
          const subtype = entry.subtype ? ` (${entry.subtype})` : "";
          const filesText = entry.files.length > 0 ? chalk.yellow(entry.files.join(", ")) : chalk.dim("no files");
          const summary = entry.summary ? chalk.dim(truncate(entry.summary)) : null;
          return (
            <Text key={`${entry.timestamp}-${entry.index}`}>
              {prefix} {formatTimestamp(entry.timestamp)} {chalk.bold(entry.kind)}{chalk.dim(subtype)} {filesText}
              {summary ? ` — ${summary}` : ""}
            </Text>
          );
        })}
      </Box>
    );
  };

  const renderMetrics = () => {
    if (state.metrics.length === 0) {
      return <Text>{chalk.dim("No metrics yet — waiting for requirements and tool usage...")}</Text>;
    }
    return (
      <Box flexDirection="column">
        {state.metrics.map((entry, index) => (
          <Text key={entry.label}>
            {index === metricsCursor ? chalk.cyan("➤") : chalk.dim("•")} {entry.label.padEnd(18)} {formatValue(entry)}
          </Text>
        ))}
      </Box>
    );
  };

  const renderHints = () => {
    if (state.hints.length === 0) {
      return <Text>{chalk.dim("Stay methodical: plan → search → edit → test → reflect.")}</Text>;
    }
    return (
      <Box flexDirection="column">
        {state.hints.map((hint, index) => (
          <Text key={`${hint}-${index}`}>
            {index === hintsCursor ? chalk.cyan("➤") : chalk.dim("•")} {hint}
          </Text>
        ))}
      </Box>
    );
  };

  const renderDiffs = () => {
    if (state.diffs.length === 0) {
      return <Text>{chalk.dim("No diff outputs detected yet — check the timeline for edit context.")}</Text>;
    }
    return (
      <Box flexDirection="column">
        {state.diffs.map((entry, index) => {
          const filesText = entry.files.length > 0 ? chalk.yellow(entry.files.join(", ")) : chalk.dim("no files");
          const summary = entry.summary
            ? chalk.dim(truncate(entry.summary, 72))
            : chalk.dim("(no diff snippet captured)");
          return (
            <Text key={`${entry.timestamp}-${entry.index}`}>
              {index === diffsCursor ? chalk.cyan("➤") : chalk.dim("•")} {formatTimestamp(entry.timestamp)} {filesText} — {summary}
            </Text>
          );
        })}
      </Box>
    );
  };

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" padding={1} width={100}>
      <Box justifyContent="space-between" marginBottom={1}>
        <Text>{chalk.bold(header)}</Text>
        <Text>{chalk.cyan(timer)}</Text>
      </Box>
      <Box marginBottom={1}>
        <Text>
          Step: {state.currentStep ? chalk.yellow(state.currentStep) : chalk.dim("waiting for events...")}
        </Text>
      </Box>
      <Box marginBottom={1}>
        {TABS.map((tab, index) => (
          <Text key={tab}>
            {index > 0 ? " " : ""}
            {renderTabLabel(tab, index === tabIndex)}
          </Text>
        ))}
      </Box>
      <Box flexDirection="row" marginBottom={1}>
        <Box flexGrow={1} marginRight={2} flexDirection="column">
          <Text>
            {chalk.bold(
              activeTab === "timeline"
                ? "Timeline"
                : activeTab === "metrics"
                ? "Metrics"
                : activeTab === "hints"
                ? "Hints"
                : "Diffs"
            )}
          </Text>
          <Box flexDirection="column" marginTop={1}>
            {activeTab === "timeline"
              ? renderTimeline()
              : activeTab === "metrics"
              ? renderMetrics()
              : activeTab === "hints"
              ? renderHints()
              : renderDiffs()}
          </Box>
        </Box>
        <Box width={28} flexDirection="column">
          <Text>{chalk.bold("File heatmap")}</Text>
          {state.heatmap.length === 0 ? (
            <Text>{chalk.dim("Waiting for edit events...")}</Text>
          ) : (
            state.heatmap.map((entry) => {
              const relative = entry.file;
              const width = heatmapMax > 0 ? Math.max(1, Math.round((entry.touches / heatmapMax) * 8)) : 1;
              const bar = "█".repeat(width);
              return (
                <Text key={relative}>
                  {chalk.cyan(bar.padEnd(8, " "))} {truncate(relative, 16)} {chalk.dim(`(${entry.touches})`)}
                </Text>
              );
            })
          )}
        </Box>
      </Box>
      <Box flexDirection="column" marginBottom={1}>
        <Text>{chalk.bold("Labels")}</Text>
        {state.labels.length === 0 ? (
          <Text>{chalk.dim("No failure signatures detected.")}</Text>
        ) : (
          state.labels.map((label) => <Text key={label}>• {label}</Text>)
        )}
      </Box>
      {state.completed && state.artifacts && state.artifacts.length > 0 ? (
        <Box flexDirection="column">
          <Text>{chalk.green("Artifacts written:")}</Text>
          {state.artifacts.map((artifact) => (
            <Text key={artifact}>{artifact}</Text>
          ))}
        </Box>
      ) : null}
      <Box marginTop={1}>
        <Text>
          {chalk.dim("←/→ tabs • ↑/↓ scroll • v verification • o open file • m regen memo • Ctrl+C exit")}
        </Text>
      </Box>
    </Box>
  );
}

export default RunCoach;
