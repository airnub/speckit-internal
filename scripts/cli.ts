import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import EventEmitter from "node:events";
import readline from "node:readline";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { globby } from "globby";
import chokidar from "chokidar";
import { render, type Instance } from "ink";
import chalk from "chalk";
import YAML from "yaml";

import RunCoach, {
  type CoachState,
  type CoachQuickAction,
  type CoachDiffEntry,
  type CoachHeatmapEntry,
  type CoachTimelineEntry,
} from "./tui/RunCoach.js";
import RunReplay from "./tui/RunReplay.js";
import {
  analyzeLogs,
  summarizeMetrics,
  type AnalyzeResult,
  type EventsLogSource,
  type RunEvent,
} from "@speckit/core";
import { createFileLogSource, loadFailureRulesFromFs } from "@speckit/core";
import { updateRTM } from "./writers/rtm.js";
import { redactSecrets } from "./utils/redact.js";
import { loadExperimentAssignments } from "./config/experiments.js";
import { emitAnalyzerArtifacts, runAnalysis, type RunAnalysisResult } from "./run-analysis.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

function coerceSummary(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function extractMetaText(
  meta: Record<string, unknown> | undefined,
  keys: string[]
): string | undefined {
  if (!meta) return undefined;
  for (const key of keys) {
    const candidate = meta[key];
    if (typeof candidate === "string") {
      const summary = coerceSummary(candidate);
      if (summary) return summary;
    }
  }
  return undefined;
}

function normalizeFiles(files: unknown): string[] {
  if (!Array.isArray(files)) return [];
  return files
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .map((file) => (path.isAbsolute(file) ? path.relative(ROOT, file) : file));
}

function buildCoachTimeline(events: RunEvent[]): CoachTimelineEntry[] {
  return events.map((event, index) => {
    const meta = event.meta && typeof event.meta === "object" && !Array.isArray(event.meta)
      ? (event.meta as Record<string, unknown>)
      : undefined;
    const summary =
      extractMetaText(meta, ["summary", "message", "note"]) ??
      coerceSummary(event.output) ??
      coerceSummary(event.input);
    return {
      index,
      timestamp: event.timestamp ?? new Date().toISOString(),
      kind: typeof event.kind === "string" ? event.kind : "unknown",
      subtype: typeof event.subtype === "string" ? event.subtype : null,
      files: normalizeFiles(event.files_changed),
      summary,
    };
  });
}

function buildCoachDiffs(events: RunEvent[]): CoachDiffEntry[] {
  return events
    .map((event, index) => {
      const meta = event.meta && typeof event.meta === "object" && !Array.isArray(event.meta)
        ? (event.meta as Record<string, unknown>)
        : undefined;
      const diffText =
        extractMetaText(meta, ["diff", "patch", "details"]) ??
        coerceSummary(event.output) ??
        coerceSummary(event.input);
      const kind = typeof event.kind === "string" ? event.kind.toLowerCase() : "";
      const files = normalizeFiles(event.files_changed);
      if (!diffText && !(kind === "edit" || kind === "run")) {
        return null;
      }
      return {
        index,
        timestamp: event.timestamp ?? new Date().toISOString(),
        files,
        summary: diffText ?? undefined,
      } satisfies CoachDiffEntry;
    })
    .filter((entry): entry is CoachDiffEntry => entry !== null);
}

function buildCoachHeatmap(timeline: CoachTimelineEntry[]): CoachHeatmapEntry[] {
  const counts = new Map<string, { touches: number; lastTouchedAt: string }>();
  for (const entry of timeline) {
    for (const file of entry.files) {
      const record = counts.get(file);
      if (record) {
        record.touches += 1;
        record.lastTouchedAt = entry.timestamp;
      } else {
        counts.set(file, { touches: 1, lastTouchedAt: entry.timestamp });
      }
    }
  }
  return Array.from(counts.entries())
    .map(([file, value]) => ({ file, touches: value.touches, lastTouchedAt: value.lastTouchedAt }))
    .sort((a, b) => {
      if (b.touches === a.touches) return a.file.localeCompare(b.file);
      return b.touches - a.touches;
    })
    .slice(0, 12);
}

interface SpeckitConfig {
  artifacts?: {
    out_dir?: string;
    rtm_path?: string;
  };
  thresholds?: {
    coverage?: number;
    tool_precision?: number;
    backtrack_ratio_max?: number;
  };
  verify?: {
    enforce_in_ci?: boolean;
    block_on_violation?: string[];
  };
}

async function loadConfig(): Promise<SpeckitConfig> {
  const configPath = path.join(ROOT, "speckit.config.yaml");
  try {
    const raw = await fs.readFile(configPath, "utf8");
    return (YAML.parse(raw) as SpeckitConfig) ?? {};
  } catch (error) {
    console.warn(`[speckit] Unable to read speckit.config.yaml: ${(error as Error).message}`);
    return {};
  }
}

async function gatherLogPaths(patterns: string[] | undefined): Promise<string[]> {
  const globs = patterns && patterns.length > 0 ? patterns : ["runs/**/*.{log,txt,ndjson,json}"];
  const matches = await globby(globs, { cwd: ROOT, absolute: true });
  return matches;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

async function readStdin(): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  const chunks: string[] = [];
  for await (const line of rl) {
    chunks.push(line);
  }
  rl.close();
  return chunks.join("\n");
}

function logAnalysisSummary(result: RunAnalysisResult): void {
  console.log(chalk.green(`[speckit] Run ${result.runId} analyzed.`));
  console.log(`Metrics:`);
  for (const entry of result.metricsSummary) {
    console.log(`  ${entry.label}: ${entry.value}`);
  }
  if (result.labels.size > 0) {
    console.log(`Labels: ${Array.from(result.labels).join(", ")}`);
  }
  if (result.artifacts.promotedLessons.length > 0) {
    console.log(`Lessons reinforced from history:`);
    for (const lesson of result.artifacts.promotedLessons) {
      console.log(`  - ${lesson}`);
    }
  }
  if (result.artifacts.promotedGuardrails.length > 0) {
    console.log(`Guardrails promoted from history:`);
    for (const guardrail of result.artifacts.promotedGuardrails) {
      console.log(`  - ${guardrail}`);
    }
  }
}

class CoachEmitter extends EventEmitter {
  state: CoachState;

  constructor(initial: CoachState) {
    super();
    this.state = initial;
  }

  update(patch: Partial<CoachState>): void {
    this.state = { ...this.state, ...patch };
    this.emit("update", this.state);
  }

  subscribe(listener: (state: CoachState) => void): () => void {
    listener(this.state);
    this.on("update", listener);
    return () => this.off("update", listener);
  }

  dispatch(action: CoachQuickAction): void {
    this.emit("action", action);
  }

  onAction(listener: (action: CoachQuickAction) => void): () => void {
    this.on("action", listener);
    return () => this.off("action", listener);
  }
}

function formatLogSource(paths: string[]): string {
  if (paths.length === 0) return "waiting for logs";
  if (paths.length === 1) return path.relative(ROOT, paths[0]);
  const first = path.relative(ROOT, paths[0]);
  return `${first} (+${paths.length - 1})`;
}

function formatSourceList(paths: string[]): string {
  if (paths.length === 0) {
    return "unknown";
  }
  const absolute = paths.map((entry) => (path.isAbsolute(entry) ? entry : path.join(ROOT, entry)));
  return formatLogSource(absolute);
}

async function runCoachCommand(args: {
  log?: string[];
  watch?: boolean;
  stdin?: boolean;
  out?: string;
}): Promise<void> {
  const config = await loadConfig();
  const configuredOut = args.out ?? config.artifacts?.out_dir ?? path.join(ROOT, ".speckit");
  const outDir = path.isAbsolute(configuredOut)
    ? configuredOut
    : path.join(ROOT, configuredOut);
  await new Promise<void>(async (resolve) => {
    let logPaths = await gatherLogPaths(args.log);
    let lastAnalyzerResult: AnalyzeResult | null = null;

    const emitter = new CoachEmitter({
      repoName: path.basename(ROOT),
      logSource: args.stdin ? "stdin" : formatLogSource(logPaths),
      currentStep: undefined,
      metrics: [],
      hints: [],
      labels: [],
      completed: false,
      artifacts: [],
      startTime: Date.now(),
      timeline: [],
      diffs: [],
      heatmap: [],
    });

    const useTui = Boolean(process.stdout.isTTY);
    let ink: Instance | null = null;
    let logUnsubscribe: (() => void) | null = null;
    let actionUnsubscribe: (() => void) | null = null;

    const handleQuickAction = (action: CoachQuickAction) => {
      void (async () => {
        if (action.type === "openFile") {
          const fallback = emitter.state.heatmap[0]?.file ?? emitter.state.timeline[0]?.files?.[0];
          const target = action.file ?? fallback;
          if (!target) {
            console.log("[speckit] No file edits detected yet.");
            return;
          }
          const relative = path.relative(ROOT, path.isAbsolute(target) ? target : path.join(ROOT, target));
          const message = `Inspect ${relative} for the most recent edits.`;
          const hints = Array.from(new Set([...(emitter.state.hints ?? []), message]));
          emitter.update({ hints });
          console.log(`[speckit] ${message}`);
          return;
        }

        if (!lastAnalyzerResult) {
          console.log("[speckit] Analyzer context not ready — wait for the next event batch.");
          return;
        }

        try {
          const experiments = await loadExperimentAssignments({
            rootDir: ROOT,
            seed: lastAnalyzerResult.run.runId ?? `run-${Date.now()}`,
          });
          const artifacts = await emitAnalyzerArtifacts({
            rootDir: ROOT,
            outDir,
            run: lastAnalyzerResult.run,
            requirements: lastAnalyzerResult.requirements,
            metrics: lastAnalyzerResult.metrics,
            labels: lastAnalyzerResult.labels,
            experiments,
          });
          await updateRTM({ rootDir: ROOT, outDir, rtmPath: undefined });
          const artifactPathsAbsolute = [
            artifacts.runPath,
            artifacts.requirementsPath,
            artifacts.memoPath,
            artifacts.memoHistoryPath,
            artifacts.verificationPath,
            artifacts.metricsPath,
            artifacts.summaryPath,
          ];
          const artifactPaths = artifactPathsAbsolute.map((file) => path.relative(ROOT, file));
          const verificationRelative = path.relative(ROOT, artifacts.verificationPath);
          const memoRelative = path.relative(ROOT, artifacts.memoPath);
          const message =
            action.type === "insertVerification"
              ? `Verification checklist refreshed (${verificationRelative}).`
              : `Memo regenerated (${memoRelative}).`;
          const hints = Array.from(new Set([...(emitter.state.hints ?? []), message]));
          emitter.update({ artifacts: artifactPaths, hints });
          console.log(`[speckit] ${message}`);
        } catch (error) {
          console.error(`[speckit] Quick action failed: ${(error as Error).message}`);
        }
      })();
    };

    actionUnsubscribe = emitter.onAction(handleQuickAction);

    if (useTui) {
      ink = render(
        <RunCoach
          initialState={emitter.state}
          subscribe={(listener) => emitter.subscribe(listener)}
          dispatch={(action) => emitter.dispatch(action)}
        />
      );
    } else {
      let lastPrinted = "";
      logUnsubscribe = emitter.subscribe((state) => {
        const metricsText =
          state.metrics.length > 0
            ? state.metrics.map((entry) => `${entry.label}: ${entry.value ?? "—"}`).join(", ")
            : "None";
        const hintsText = state.hints.length > 0 ? state.hints.join(" | ") : "None";
        const labelsText = state.labels.length > 0 ? state.labels.join(", ") : "None";
        const timelineText =
          state.timeline.length > 0
            ? state.timeline
                .slice(-5)
                .map((entry) => {
                  const time = new Date(entry.timestamp).toISOString();
                  const files = entry.files.length > 0 ? ` — ${entry.files.join(", ")}` : "";
                  const summaryValue = entry.summary ?? "";
                  const summarySnippet = summaryValue.length > 0
                    ? ` — ${summaryValue.length > 80 ? `${summaryValue.slice(0, 77)}…` : summaryValue}`
                    : "";
                  return `  • [${time}] ${entry.kind}${files}${summarySnippet}`;
                })
                .join("\n")
            : "  (none)";
        const heatmapText =
          state.heatmap.length > 0
            ? state.heatmap
                .slice(0, 6)
                .map((entry) => `  • ${entry.file} (${entry.touches})`)
                .join("\n")
            : "  (none)";
        const diffsPreview =
          state.diffs.length > 0
            ? state.diffs
                .slice(-3)
                .map((entry) => {
                  const summary = entry.summary ?? "(no diff captured)";
                  const snippet = summary.length > 80 ? `${summary.slice(0, 77)}…` : summary;
                  return `  • ${entry.files.join(", ") || "(no files)"}: ${snippet}`;
                })
                .join("\n")
            : "  (none)";
        const artifactText =
          state.completed && state.artifacts.length > 0
            ? `Artifacts: ${state.artifacts.join(", ")}`
            : null;
        const lines = [
          `[speckit] Coach — ${state.repoName}`,
          `Source: ${state.logSource}`,
          `Step: ${state.currentStep ?? "—"}`,
          `Metrics: ${metricsText}`,
          `Hints: ${hintsText}`,
          `Labels: ${labelsText}`,
          `Timeline:\n${timelineText}`,
          `Diffs:\n${diffsPreview}`,
          `Heatmap:\n${heatmapText}`,
        ];
        if (artifactText) {
          lines.push(artifactText);
        }
        const output = lines.join("\n");
        if (output !== lastPrinted) {
          console.log(`${output}\n`);
          lastPrinted = output;
        }
      });
    }

    const cleanupRenderer = () => {
      if (ink) {
        ink.unmount();
        ink = null;
      }
      if (logUnsubscribe) {
        logUnsubscribe();
        logUnsubscribe = null;
      }
      if (actionUnsubscribe) {
        actionUnsubscribe();
        actionUnsubscribe = null;
      }
    };

    const refreshFromFiles = async () => {
      logPaths = await gatherLogPaths(args.log);
      if (logPaths.length === 0) {
        emitter.update({ logSource: args.stdin ? 'stdin' : 'waiting for logs' });
        return;
      }
      const sources = await Promise.all(logPaths.map((filePath) => createFileLogSource(filePath)));
      const rules = await loadFailureRulesFromFs(ROOT, outDir);
      const analysis = await analyzeLogs(sources, { rules });
      lastAnalyzerResult = analysis;
      const timeline = buildCoachTimeline(analysis.run.events);
      const diffs = buildCoachDiffs(analysis.run.events);
      const heatmap = buildCoachHeatmap(timeline);
      const quickActionPrefixes = [
        "Inspect ",
        "Verification checklist refreshed",
        "Memo regenerated",
      ];
      const persistedHints = (emitter.state.hints ?? []).filter((hint) =>
        quickActionPrefixes.some((prefix) => hint.startsWith(prefix))
      );
      const hintsSet = new Set<string>([...persistedHints, ...analysis.hints]);
      if (analysis.labels.has("prompt.missing")) {
        hintsSet.add("Ensure the full system+planner prompt is captured in the log before analyzing.");
      }
      const hints = Array.from(hintsSet);
      const latestEvent = analysis.run.events[analysis.run.events.length - 1];
      emitter.update({
        logSource: formatLogSource(logPaths),
        currentStep: latestEvent?.kind ?? emitter.state.currentStep,
        metrics: summarizeMetrics(analysis.metrics),
        hints,
        labels: Array.from(analysis.labels),
        timeline,
        diffs,
        heatmap,
      });
    };

    if (args.stdin) {
      const stdinContent = await readStdin();
      const tempPath = path.join(ROOT, "runs", `stdin-${Date.now()}.log`);
      await fs.mkdir(path.dirname(tempPath), { recursive: true });
      await fs.writeFile(tempPath, stdinContent, "utf8");
      logPaths = [tempPath];
    }

    await refreshFromFiles();

    let watcher: chokidar.FSWatcher | null = null;
    if (args.watch && !args.stdin) {
      watcher = chokidar.watch(args.log && args.log.length > 0 ? args.log : "runs/**/*", {
        cwd: ROOT,
        ignoreInitial: true,
      });
      watcher.on("add", refreshFromFiles);
      watcher.on("change", refreshFromFiles);
    }

    const finalize = async () => {
      if (!lastAnalyzerResult || logPaths.length === 0) {
        cleanupRenderer();
        resolve();
        return;
      }
      const analysis = await runAnalysis(logPaths, { outDir }, { rootDir: ROOT });
      const artifacts = analysis.artifacts;
      const artifactPaths = [
        artifacts.runPath,
        artifacts.requirementsPath,
        artifacts.memoPath,
        artifacts.memoHistoryPath,
        artifacts.verificationPath,
        artifacts.metricsPath,
        artifacts.summaryPath,
      ].map((file) => path.relative(ROOT, file));
      const promotionHints = [
        ...artifacts.promotedLessons.map((lesson) => `Lesson reinforced: ${lesson}`),
        ...artifacts.promotedGuardrails.map((guardrail) => `Guardrail promoted: ${guardrail}`),
      ];
      const mergedHints = promotionHints.length > 0
        ? Array.from(new Set([...(emitter.state.hints ?? []), ...promotionHints]))
        : emitter.state.hints;
      emitter.update({
        completed: true,
        artifacts: artifactPaths,
        metrics: analysis.metricsSummary,
        labels: Array.from(analysis.labels),
        hints: mergedHints,
      });
      cleanupRenderer();
      resolve();
    };

    process.once("SIGINT", async () => {
      await finalize();
      if (watcher) await watcher.close();
    });

    process.once("exit", async () => {
      if (watcher) await watcher.close();
      cleanupRenderer();
      if (!emitter.state.completed) {
        resolve();
      }
    });
  });
}

async function runAnalyzeCommand(args: { rawLog: string[]; runId?: string; out?: string }): Promise<void> {
  const logPaths = await gatherLogPaths(args.rawLog);
  const result = await runAnalysis(logPaths, { runId: args.runId, outDir: args.out }, { rootDir: ROOT });
  logAnalysisSummary(result);
}

interface SerializedRunArtifact {
  run_id?: string;
  source_logs?: string[];
  events?: RunEvent[];
  prompt_candidates?: string[];
  plain_text?: string;
  metadata?: Record<string, unknown>;
}

function formatConsolePayload(payload: unknown): string {
  if (payload === null || payload === undefined) return "—";
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    return trimmed.length > 0 ? trimmed : "—";
  }
  try {
    return JSON.stringify(payload, null, 2) ?? "—";
  } catch (error) {
    return String(payload);
  }
}

function renderReplayConsole(options: {
  runId: string;
  repoName: string;
  logSource: string;
  metrics: ReturnType<typeof summarizeMetrics>;
  hints: string[];
  labels: string[];
  events: RunEvent[];
}): void {
  console.log(chalk.bold(`[speckit] Replay — ${options.repoName}`));
  console.log(`Run: ${options.runId}`);
  console.log(`Source: ${options.logSource}`);
  console.log("Metrics:");
  if (options.metrics.length === 0) {
    console.log("  (none)");
  } else {
    for (const entry of options.metrics) {
      const value = entry.value === null || entry.value === undefined ? "—" : entry.value;
      const formatted = typeof value === "number" && entry.label !== "TTFP" ? `${Math.round(value * 100)}%` : `${value}`;
      console.log(`  ${entry.label.padEnd(18)} ${formatted}`);
    }
  }
  console.log("Hints:");
  if (options.hints.length === 0) {
    console.log("  (none)");
  } else {
    for (const hint of options.hints) {
      console.log(`  • ${hint}`);
    }
  }
  console.log("Labels:");
  if (options.labels.length === 0) {
    console.log("  (none)");
  } else {
    for (const label of options.labels) {
      console.log(`  • ${label}`);
    }
  }
  console.log("Events:");
  if (options.events.length === 0) {
    console.log("  (none)");
  } else {
    options.events.forEach((event, index) => {
      const timestamp = new Date(event.timestamp).toISOString();
      const subtype = event.subtype ? ` (${event.subtype})` : "";
      console.log(`  ${index + 1}. [${timestamp}] ${event.kind}${subtype}`);
      if (event.role) {
        console.log(`     Role: ${event.role}`);
      }
      if (Array.isArray(event.files_changed) && event.files_changed.length > 0) {
        console.log(`     Files: ${event.files_changed.join(", ")}`);
      }
      if (event.input) {
        console.log(`     Input: ${formatConsolePayload(event.input)}`);
      }
      if (event.output) {
        console.log(`     Output: ${formatConsolePayload(event.output)}`);
      }
      if (event.error) {
        console.log(`     Error: ${formatConsolePayload(event.error)}`);
      }
      if (event.meta) {
        console.log(`     Meta: ${formatConsolePayload(event.meta)}`);
      }
    });
  }
}

async function runReplayCommand(args: { run?: string; log?: string[] }): Promise<void> {
  const defaultRunPath = path.join(ROOT, ".speckit", "Run.json");
  const resolvedRunPath = args.run
    ? path.isAbsolute(args.run)
      ? args.run
      : path.join(ROOT, args.run)
    : defaultRunPath;

  const hasRunArtifact = await fileExists(resolvedRunPath);
  const logGlobs = args.log as string[] | undefined;
  const logPaths = logGlobs ? await gatherLogPaths(logGlobs) : [];

  let sources: (EventsLogSource | Awaited<ReturnType<typeof createFileLogSource>>)[] = [];
  let rawSourcePaths: string[] = [];
  let runId: string | undefined;
  let metadata: Record<string, unknown> | undefined;

  if (hasRunArtifact) {
    const raw = await fs.readFile(resolvedRunPath, "utf8");
    const parsed = JSON.parse(raw) as SerializedRunArtifact;
    if (!Array.isArray(parsed.events) || parsed.events.length === 0) {
      throw new Error(`Run artifact at ${resolvedRunPath} does not include any events.`);
    }
    runId = typeof parsed.run_id === "string" ? parsed.run_id : undefined;
    metadata = parsed.metadata ?? undefined;
    const promptCandidates = Array.isArray(parsed.prompt_candidates)
      ? parsed.prompt_candidates.map((entry) => String(entry))
      : undefined;
    const plainText = typeof parsed.plain_text === "string" ? parsed.plain_text : undefined;
    rawSourcePaths = Array.isArray(parsed.source_logs)
      ? parsed.source_logs.map((entry) => String(entry))
      : [resolvedRunPath];
    const sourceId = rawSourcePaths[0] ?? resolvedRunPath;
    const eventSource = {
      id: sourceId,
      events: parsed.events,
      promptCandidates,
      plainText,
    } satisfies EventsLogSource;
    sources = [eventSource];
  } else if (logPaths.length > 0) {
    sources = await Promise.all(logPaths.map((filePath) => createFileLogSource(filePath)));
    rawSourcePaths = logPaths;
  } else {
    throw new Error(
      `No run artifact found at ${resolvedRunPath} and no raw logs were provided. Pass --run <path> or --log <glob>.`
    );
  }

  const rulesBaseDir = hasRunArtifact ? path.dirname(resolvedRunPath) : path.join(ROOT, ".speckit");
  const rules = await loadFailureRulesFromFs(ROOT, rulesBaseDir);
  const analysis = await analyzeLogs(sources, {
    rules,
    runId,
    metadata,
  });

  if (Array.isArray(rawSourcePaths) && rawSourcePaths.length > 0) {
    analysis.run.sourceLogs = rawSourcePaths;
  }

  const metricsSummary = summarizeMetrics(analysis.metrics);
  const labels = Array.from(analysis.labels);
  const hints = analysis.hints;
  const repoName = path.basename(ROOT);
  const displaySources = analysis.run.sourceLogs.length > 0 ? analysis.run.sourceLogs : rawSourcePaths;
  const logSource = formatSourceList(displaySources);
  const useTui = Boolean(process.stdout.isTTY);

  if (useTui) {
    const ink = render(
      <RunReplay
        runId={analysis.run.runId}
        repoName={repoName}
        logSource={logSource}
        events={analysis.run.events}
        metrics={metricsSummary}
        hints={hints}
        labels={labels}
      />
    );
    await ink.waitUntilExit();
  } else {
    renderReplayConsole({
      runId: analysis.run.runId,
      repoName,
      logSource,
      metrics: metricsSummary,
      hints,
      labels,
      events: analysis.run.events,
    });
  }
}

async function runDoctorCommand(): Promise<void> {
  const checks: { name: string; status: "pass" | "warn" | "fail"; detail: string }[] = [];
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  if (nodeMajor >= 20) {
    checks.push({ name: "Node version", status: "pass", detail: `Detected Node ${process.versions.node}` });
  } else {
    checks.push({ name: "Node version", status: "fail", detail: `Node ${process.versions.node} < 20` });
  }
  const execFileAsync = promisify(execFile);
  try {
    const { stdout } = await execFileAsync("pnpm", ["--version"], { cwd: ROOT });
    checks.push({ name: "pnpm", status: "pass", detail: `pnpm ${stdout.trim()}` });
  } catch (error) {
    checks.push({ name: "pnpm", status: "fail", detail: `pnpm not found: ${(error as Error).message}` });
  }
  const testFiles = await globby(["**/*.test.*", "**/__tests__/**/*"], {
    cwd: ROOT,
    ignore: ["node_modules", "dist", ".speckit"],
  });
  if (testFiles.length === 0) {
    checks.push({ name: "Tests", status: "warn", detail: "No test files detected. Add at least one to enable verification." });
  } else {
    checks.push({ name: "Tests", status: "pass", detail: `${testFiles.length} test files detected.` });
  }
  const forbiddenEdits = [".speckit", "dist", "docs/site/build"];
  checks.push({
    name: "Protected directories",
    status: "pass",
    detail: `Avoid editing ${forbiddenEdits.join(", ")}`,
  });

  let exitCode = 0;
  for (const check of checks) {
    const symbol = check.status === "pass" ? "✅" : check.status === "warn" ? "⚠️" : "❌";
    console.log(`${symbol} ${check.name} — ${check.detail}`);
    if (check.status === "fail") exitCode = 1;
  }
  process.exitCode = exitCode;
}

async function runInjectCommand(): Promise<void> {
  const injector = await import(pathToFileURL(path.join(__dirname, "speckit-inject-artifacts.ts")).href);
  if (typeof injector.default === "function") {
    await injector.default();
  } else if (typeof injector.main === "function") {
    await injector.main();
  } else if (typeof injector.updateCodingAgentBrief === "function") {
    await injector.updateCodingAgentBrief();
  }
}

async function main(): Promise<void> {
  yargs(hideBin(process.argv))
    .command(
      "run",
      "Run SpecKit analysis or live coach",
      (command) =>
        command
          .option("coach", { type: "boolean", default: false })
          .option("log", { type: "array" })
          .option("watch", { type: "boolean", default: false })
          .option("stdin", { type: "boolean", default: false })
          .option("out", { type: "string" }),
      async (args) => {
        if (args.coach) {
          await runCoachCommand({ log: args.log as string[] | undefined, watch: args.watch as boolean, stdin: args.stdin as boolean, out: args.out as string | undefined });
        } else {
          const logPaths = await gatherLogPaths(args.log as string[] | undefined);
          const result = await runAnalysis(logPaths, { outDir: args.out as string | undefined }, { rootDir: ROOT });
          logAnalysisSummary(result);
        }
      }
    )
    .command(
      "doctor",
      "Preflight checks for SpecKit",
      () => {},
      async () => {
        await runDoctorCommand();
      }
    )
    .command(
      "analyze",
      "Analyze run logs and emit artifacts",
      (command) =>
        command
          .option("raw-log", { type: "array", demandOption: true })
          .option("run-id", { type: "string" })
          .option("out", { type: "string" }),
      async (args) => {
        await runAnalyzeCommand({ rawLog: args["raw-log"] as string[], runId: args["run-id"] as string | undefined, out: args.out as string | undefined });
      }
    )
    .command(
      "replay",
      "Replay a normalized run artifact and browse events",
      (command) =>
        command.option("run", { type: "string" }).option("log", { type: "array" }),
      async (args) => {
        await runReplayCommand({ run: args.run as string | undefined, log: args.log as string[] | undefined });
      }
    )
    .command(
      "inject",
      "Inject memo + verification snippets into prompts",
      () => {},
      async () => {
        await runInjectCommand();
      }
    )
    .demandCommand(1)
    .help()
    .strict()
    .parse();
}

const isDirectInvocation =
  typeof process.argv[1] === "string" &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectInvocation) {
  main().catch((error) => {
    const { redacted } = redactSecrets(error.stack ?? String(error));
    console.error("[speckit] Failed:", redacted);
    process.exitCode = 1;
  });
}
