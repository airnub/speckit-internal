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

import RunCoach from "./tui/RunCoach.js";
import type { CoachState } from "./tui/RunCoach.js";
import {
  analyze,
  summarizeMetrics,
  type NormalizedLog,
  type RequirementRecord,
} from "@speckit/analyzer";
import { createFileLogSource, loadFailureRulesFromFs } from "@speckit/analyzer/adapters/node";
import { writeArtifacts } from "./writers/artifacts.js";
import { updateRTM } from "./writers/rtm.js";
import { redactSecrets } from "./utils/redact.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

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

async function readStdin(): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  const chunks: string[] = [];
  for await (const line of rl) {
    chunks.push(line);
  }
  rl.close();
  return chunks.join("\n");
}

interface AnalyzeResult {
  runId: string;
  requirements: RequirementRecord[];
  metricsSummary: ReturnType<typeof summarizeMetrics>;
  labels: Set<string>;
  normalized: NormalizedLog;
  artifacts: Awaited<ReturnType<typeof writeArtifacts>>;
}

async function runAnalysis(
  logPaths: string[],
  options: { runId?: string; outDir?: string }
): Promise<AnalyzeResult> {
  if (logPaths.length === 0) {
    throw new Error("No log files found. Provide --log <glob> or ensure runs/ contains logs.");
  }
  const resolvedOutDir = options.outDir
    ? path.isAbsolute(options.outDir)
      ? options.outDir
      : path.join(ROOT, options.outDir)
    : path.join(ROOT, ".speckit");
  const sources = await Promise.all(logPaths.map((filePath) => createFileLogSource(filePath)));
  const rules = await loadFailureRulesFromFs(ROOT, resolvedOutDir);
  const analysis = await analyze({ sources, rules, runId: options.runId });
  const artifacts = await writeArtifacts({
    rootDir: ROOT,
    outDir: resolvedOutDir,
    run: analysis.run,
    requirements: analysis.requirements,
    metrics: analysis.metrics,
    labels: analysis.labels,
  });
  await updateRTM({ rootDir: ROOT, outDir: resolvedOutDir, rtmPath: undefined });
  return {
    runId: analysis.run.runId,
    requirements: analysis.requirements,
    metricsSummary: summarizeMetrics(analysis.metrics),
    labels: analysis.labels,
    normalized: analysis.normalized,
    artifacts,
  };
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
}

function formatLogSource(paths: string[]): string {
  if (paths.length === 0) return "waiting for logs";
  if (paths.length === 1) return path.relative(ROOT, paths[0]);
  const first = path.relative(ROOT, paths[0]);
  return `${first} (+${paths.length - 1})`;
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
    const normalizedEmpty: NormalizedLog = { events: [], promptCandidates: [], plainText: "" };
    let normalized = normalizedEmpty;
    let lastAnalysis: AnalyzeResult | null = null;

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
    });

    const useTui = Boolean(process.stdout.isTTY);
    let ink: Instance | null = null;
    let logUnsubscribe: (() => void) | null = null;

    if (useTui) {
      ink = render(
        <RunCoach initialState={emitter.state} subscribe={(listener) => emitter.subscribe(listener)} />
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
    };

    const refreshFromFiles = async () => {
      logPaths = await gatherLogPaths(args.log);
      if (logPaths.length === 0) {
        emitter.update({ logSource: args.stdin ? 'stdin' : 'waiting for logs' });
        return;
      }
      const sources = await Promise.all(logPaths.map((filePath) => createFileLogSource(filePath)));
      const rules = await loadFailureRulesFromFs(ROOT, outDir);
      const analysis = await analyze({ sources, rules });
      normalized = analysis.normalized;
      const hints = [...analysis.hints];
      if (analysis.labels.has("prompt.missing")) {
        hints.push("Ensure the full system+planner prompt is captured in the log before analyzing.");
      }
      const latestEvent = analysis.run.events[analysis.run.events.length - 1];
      emitter.update({
        logSource: formatLogSource(logPaths),
        currentStep: latestEvent?.kind ?? emitter.state.currentStep,
        metrics: summarizeMetrics(analysis.metrics),
        hints,
        labels: Array.from(analysis.labels),
      });
      lastAnalysis = {
        runId: analysis.run.runId,
        requirements: analysis.requirements,
        metricsSummary: summarizeMetrics(analysis.metrics),
        labels: analysis.labels,
        normalized: analysis.normalized,
        artifacts: {
          runPath: "",
          requirementsPath: "",
          memoPath: "",
          verificationPath: "",
          metricsPath: "",
          summaryPath: "",
        },
      };
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
      if (!lastAnalysis || logPaths.length === 0) {
        cleanupRenderer();
        resolve();
        return;
      }
      const analysis = await runAnalysis(logPaths, { outDir });
      const artifacts = analysis.artifacts;
      emitter.update({
        completed: true,
        artifacts: Object.values(artifacts).map((file) => path.relative(ROOT, file)),
        metrics: analysis.metricsSummary,
        labels: Array.from(analysis.labels),
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
  const result = await runAnalysis(logPaths, { runId: args.runId, outDir: args.out });
  console.log(chalk.green(`[speckit] Run ${result.runId} analyzed.`));
  console.log(`Metrics:`);
  for (const entry of result.metricsSummary) {
    console.log(`  ${entry.label}: ${entry.value}`);
  }
  if (result.labels.size > 0) {
    console.log(`Labels: ${Array.from(result.labels).join(", ")}`);
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
          const result = await runAnalysis(logPaths, { outDir: args.out as string | undefined });
          console.log(chalk.green(`[speckit] Run ${result.runId} analyzed.`));
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

main().catch((error) => {
  const { redacted } = redactSecrets(error.stack ?? String(error));
  console.error("[speckit] Failed:", redacted);
  process.exitCode = 1;
});
