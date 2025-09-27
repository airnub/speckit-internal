import React, { useEffect, useState } from "react";
import { Box, Text, useApp } from "ink";
import chalk from "chalk";

export interface CoachMetricsEntry {
  label: string;
  value: number | null;
}

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
}

export interface RunCoachProps {
  initialState: CoachState;
  subscribe: (listener: (state: CoachState) => void) => () => void;
}

function formatValue(entry: CoachMetricsEntry): string {
  if (entry.value === null || entry.value === undefined) return "—";
  if (entry.label === "ReqCoverage" || entry.label === "BacktrackRatio" || entry.label === "ToolPrecision@1" || entry.label === "EditLocality" || entry.label === "ReflectionDensity") {
    return `${Math.round(entry.value * 100)}%`;
  }
  return `${entry.value}`;
}

export function RunCoach({ initialState, subscribe }: RunCoachProps): JSX.Element {
  const [state, setState] = useState<CoachState>(initialState);
  const [elapsed, setElapsed] = useState<number>(0);
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

  const header = `${state.repoName} — ${state.logSource}`;
  const minute = Math.floor(elapsed / 60)
    .toString()
    .padStart(2, "0");
  const second = Math.floor(elapsed % 60)
    .toString()
    .padStart(2, "0");
  const timer = `${minute}:${second}`;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" padding={1} width={80}>
      <Box justifyContent="space-between" marginBottom={1}>
        <Text>{chalk.bold(header)}</Text>
        <Text>{chalk.cyan(timer)}</Text>
      </Box>
      <Box marginBottom={1}>
        <Text>
          Step: {state.currentStep ? chalk.yellow(state.currentStep) : chalk.dim("waiting for events...")}
        </Text>
      </Box>
      <Box flexDirection="column" marginBottom={1}>
        <Text>{chalk.bold("Metrics")}</Text>
        {state.metrics.length === 0 ? (
          <Text>{chalk.dim("No metrics yet — waiting for requirements and tool usage...")}</Text>
        ) : (
          state.metrics.map((entry) => (
            <Text key={entry.label}>
              {entry.label.padEnd(18)} {formatValue(entry)}
            </Text>
          ))
        )}
      </Box>
      <Box flexDirection="column" marginBottom={1}>
        <Text>{chalk.bold("Hints")}</Text>
        {state.hints.length === 0 ? (
          <Text>{chalk.dim("Stay methodical: plan → search → edit → test → reflect.")}</Text>
        ) : (
          state.hints.map((hint, index) => (
            <Text key={`${hint}-${index}`}>• {hint}</Text>
          ))
        )}
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
    </Box>
  );
}

export default RunCoach;
