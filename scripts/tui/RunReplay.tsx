import React, { useMemo, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import chalk from "chalk";

import type { RunEvent } from "@speckit/analyzer";

import type { CoachMetricsEntry } from "./RunCoach.js";

type Section = "events" | "hints" | "metrics" | "labels";

export interface RunReplayProps {
  runId: string;
  repoName: string;
  logSource: string;
  events: RunEvent[];
  metrics: CoachMetricsEntry[];
  hints: string[];
  labels: string[];
}

const SECTIONS: Section[] = ["events", "hints", "metrics", "labels"];

function formatIndex(current: number, total: number): string {
  if (total === 0) return "0/0";
  return `${current + 1}/${total}`;
}

function formatPayload(payload: unknown): string {
  if (payload === null || payload === undefined) return "—";
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (trimmed.length === 0) return "—";
    return trimmed.length > 480 ? `${trimmed.slice(0, 477)}…` : trimmed;
  }
  try {
    const json = JSON.stringify(payload, null, 2);
    if (!json) return "—";
    return json.length > 480 ? `${json.slice(0, 477)}…` : json;
  } catch (error) {
    return String(payload);
  }
}

function EventView({ event }: { event: RunEvent | undefined }): JSX.Element {
  if (!event) {
    return (
      <Box flexDirection="column">
        <Text>{chalk.dim("No events recorded. Use speckit analyze to produce a run artifact.")}</Text>
      </Box>
    );
  }
  const files = Array.isArray(event.files_changed) ? event.files_changed : [];
  return (
    <Box flexDirection="column">
      <Text>{chalk.bold(`${event.kind ?? "unknown"}`)} {chalk.dim(event.subtype ? `(${event.subtype})` : "")}</Text>
      <Text>{chalk.dim(new Date(event.timestamp).toLocaleString())}</Text>
      {event.role ? <Text>{chalk.cyan(`Role: ${event.role}`)}</Text> : null}
      {files.length > 0 ? <Text>{chalk.yellow(`Files: ${files.join(", ")}`)}</Text> : null}
      {event.input ? (
        <Text>{chalk.green("Input:")} {formatPayload(event.input)}</Text>
      ) : null}
      {event.output ? (
        <Text>{chalk.blue("Output:")} {formatPayload(event.output)}</Text>
      ) : null}
      {event.error ? (
        <Text>{chalk.red("Error:")} {formatPayload(event.error)}</Text>
      ) : null}
      {event.meta ? (
        <Text>{chalk.magenta("Meta:")} {formatPayload(event.meta)}</Text>
      ) : null}
    </Box>
  );
}

function ListView({
  items,
  cursor,
  emptyMessage,
}: {
  items: string[];
  cursor: number;
  emptyMessage: string;
}): JSX.Element {
  if (items.length === 0) {
    return (
      <Box flexDirection="column">
        <Text>{chalk.dim(emptyMessage)}</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column">
      {items.map((item, index) => (
        <Text key={`${item}-${index}`}>
          {index === cursor ? chalk.cyan("➤") : "  "} {item}
        </Text>
      ))}
    </Box>
  );
}

function MetricsView({
  metrics,
  cursor,
}: {
  metrics: CoachMetricsEntry[];
  cursor: number;
}): JSX.Element {
  if (metrics.length === 0) {
    return (
      <Box flexDirection="column">
        <Text>{chalk.dim("No metrics recorded. Run analyze to compute coverage and precision.")}</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column">
      {metrics.map((entry, index) => {
        const value = entry.value === null || entry.value === undefined ? "—" : entry.value;
        const formatted =
          typeof value === "number" && entry.label !== "TTFP"
            ? `${Math.round(value * 100)}%`
            : `${value}`;
        const line = `${entry.label.padEnd(18)} ${formatted}`;
        return (
          <Text key={entry.label}>
            {index === cursor ? chalk.cyan("➤") : "  "} {line}
          </Text>
        );
      })}
    </Box>
  );
}

export function RunReplay({
  runId,
  repoName,
  logSource,
  events,
  metrics,
  hints,
  labels,
}: RunReplayProps): JSX.Element {
  const { exit } = useApp();
  const [sectionIndex, setSectionIndex] = useState<number>(0);
  const [cursors, setCursors] = useState<Record<Section, number>>({
    events: 0,
    hints: 0,
    metrics: 0,
    labels: 0,
  });

  const section = SECTIONS[sectionIndex] ?? "events";

  const lengths = useMemo(
    () => ({
      events: events.length,
      hints: hints.length,
      metrics: metrics.length,
      labels: labels.length,
    }),
    [events.length, hints.length, metrics.length, labels.length]
  );

  useInput((input, key) => {
    if (key.escape || (input && input.toLowerCase() === "q")) {
      exit();
      return;
    }
    if (key.leftArrow) {
      setSectionIndex((prev) => (prev - 1 + SECTIONS.length) % SECTIONS.length);
      return;
    }
    if (key.rightArrow || key.tab) {
      setSectionIndex((prev) => (prev + 1) % SECTIONS.length);
      return;
    }
    if (key.upArrow) {
      setCursors((prev) => {
        const current = prev[section] ?? 0;
        const max = lengths[section];
        if (max === 0) return prev;
        const next = Math.max(0, Math.min(max - 1, current - 1));
        if (next === current) return prev;
        return { ...prev, [section]: next };
      });
      return;
    }
    if (key.downArrow) {
      setCursors((prev) => {
        const current = prev[section] ?? 0;
        const max = lengths[section];
        if (max === 0) return prev;
        const next = Math.max(0, Math.min(max - 1, current + 1));
        if (next === current) return prev;
        return { ...prev, [section]: next };
      });
    }
  });

  const sectionLabel = section.charAt(0).toUpperCase() + section.slice(1);
  const cursor = cursors[section] ?? 0;
  const total = lengths[section] ?? 0;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="green" padding={1} width={100}>
      <Box justifyContent="space-between" marginBottom={1}>
        <Text>{chalk.bold(`${repoName} — ${logSource}`)}</Text>
        <Text>{chalk.cyan(`Run ${runId}`)}</Text>
      </Box>
      <Box marginBottom={1}>
        <Text>{chalk.dim("←/→ switch section · ↑/↓ scroll · Q or Esc exit")}</Text>
      </Box>
      <Box flexDirection="column" flexGrow={1}>
        {section === "events" ? (
          <EventView event={events[cursor]} />
        ) : section === "hints" ? (
          <ListView items={hints} cursor={cursor} emptyMessage="No hints recorded." />
        ) : section === "metrics" ? (
          <MetricsView metrics={metrics} cursor={cursor} />
        ) : (
          <ListView items={labels} cursor={cursor} emptyMessage="No labels detected." />
        )}
      </Box>
      <Box marginTop={1} justifyContent="space-between">
        <Text>{chalk.bold(sectionLabel)}</Text>
        <Text>{chalk.dim(formatIndex(cursor, total))}</Text>
      </Box>
    </Box>
  );
}

export default RunReplay;
