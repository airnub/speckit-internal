import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { globby } from "globby";
import stripAnsi from "strip-ansi";
import YAML from "yaml";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const DEFAULT_ARTIFACT_DIR = path.join(ROOT, ".speckit");

interface AnalyzerOptions {
  rawLogPatterns: string[];
  runId?: string;
  outDir?: string;
  rtmPath?: string;
}

interface FailureRule {
  id: string;
  label: string;
  description?: string;
  patterns: string[];
  remediation?: string;
}

interface RunEvent {
  id: string;
  timestamp: string;
  kind: string;
  subtype?: string | null;
  role?: string | null;
  input?: unknown;
  output?: unknown;
  error?: unknown;
  files_changed?: string[];
}

interface RunArtifact {
  run_id: string;
  source_logs: string[];
  started_at: string | null;
  finished_at: string | null;
  events: RunEvent[];
  metadata?: Record<string, unknown>;
}

interface RequirementRecord {
  id: string;
  text: string;
  source?: string;
  category?: string | null;
  constraints?: string[];
  status: "unknown" | "satisfied" | "violated" | "in-progress";
  evidence: string[];
  notes?: string;
}

interface Metrics {
  ReqCoverage: number;
  BacktrackRatio: number;
  ToolPrecisionAt1: number;
  EditLocality: number;
  ReflectionDensity: number;
  TTFPSeconds: number | null;
}

interface MemoArtifact {
  generated_at: string;
  generated_from: {
    run_id: string;
    sources: string[];
  };
  lessons: string[];
  guardrails: string[];
  checklist: string[];
  labels: string[];
}

interface VerificationRequirementEntry {
  id: string;
  description: string;
  status: string;
  evidence: string[];
  check: string;
}

interface VerificationArtifact {
  version: number;
  generated_at: string;
  requirements: VerificationRequirementEntry[];
}

function parseArgs(argv: string[]): AnalyzerOptions {
  const options: AnalyzerOptions = { rawLogPatterns: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--raw-log" && argv[i + 1]) {
      options.rawLogPatterns.push(argv[i + 1]);
      i += 1;
    } else if (arg.startsWith("--run-id=")) {
      options.runId = arg.split("=")[1];
    } else if (arg === "--run-id" && argv[i + 1]) {
      options.runId = argv[i + 1];
      i += 1;
    } else if (arg === "--out" && argv[i + 1]) {
      options.outDir = argv[i + 1];
      i += 1;
    } else if (arg.startsWith("--out=")) {
      options.outDir = arg.slice("--out=".length);
    } else if (arg === "--write-rtm" && argv[i + 1]) {
      options.rtmPath = argv[i + 1];
      i += 1;
    } else if (arg.startsWith("--write-rtm=")) {
      options.rtmPath = arg.slice("--write-rtm=".length);
    }
  }
  return options;
}

function ensureIsoTimestamp(value: unknown, fallback: () => Date, index: number): string {
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  const base = fallback();
  return new Date(base.getTime() + index * 1000).toISOString();
}

function normalizeEvent(event: any, fallback: () => Date, index: number, explicitKind?: string): RunEvent {
  const kind = explicitKind ?? (typeof event.kind === "string" ? event.kind : "log");
  const filesChanged: string[] | undefined = Array.isArray(event.files_changed)
    ? event.files_changed.filter((entry) => typeof entry === "string")
    : undefined;
  return {
    id: typeof event.id === "string" ? event.id : `evt-${index}`,
    timestamp: ensureIsoTimestamp(event.timestamp, fallback, index),
    kind,
    subtype: typeof event.subtype === "string" ? event.subtype : undefined,
    role: typeof event.role === "string" ? event.role : undefined,
    input: event.input ?? event.prompt ?? undefined,
    output: event.output ?? event.message ?? event.text ?? undefined,
    error: event.error ?? event.err ?? undefined,
    files_changed: filesChanged,
  };
}

interface ParsedLogResult {
  events: RunEvent[];
  promptCandidates: string[];
  plainText: string;
}

function parseJsonPayload(content: string, fallback: () => Date, fileId: string): ParsedLogResult | null {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      const events = parsed.map((item, index) => normalizeEvent(item, fallback, index));
      const prompts = parsed
        .map((item: any) => (typeof item.prompt === "string" ? item.prompt : undefined))
        .filter((value): value is string => typeof value === "string");
      return { events, promptCandidates: prompts, plainText: content };
    }
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as any).events)) {
      const events = (parsed as any).events.map((item: any, index: number) => normalizeEvent(item, fallback, index));
      const prompt = typeof (parsed as any).prompt === "string" ? [(parsed as any).prompt] : [];
      return { events, promptCandidates: prompt, plainText: content };
    }
  } catch (error) {
    console.warn(`[speckit-analyze-run] ${fileId} is not JSON array/object: ${(error as Error).message}`);
  }
  return null;
}

function parseNdjson(content: string, fallback: () => Date, fileId: string): ParsedLogResult | null {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const events: RunEvent[] = [];
  const prompts: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    try {
      const parsed = JSON.parse(lines[i]);
      events.push(normalizeEvent(parsed, fallback, events.length));
      if (typeof parsed.prompt === "string") {
        prompts.push(parsed.prompt);
      }
    } catch (error) {
      console.warn(`[speckit-analyze-run] NDJSON parse failure in ${fileId} (line ${i + 1}): ${(error as Error).message}`);
      return null;
    }
  }
  return { events, promptCandidates: prompts, plainText: content };
}

function parseTextLog(content: string, fallback: () => Date): ParsedLogResult {
  const lines = content.split(/\r?\n/);
  const events: RunEvent[] = [];
  const prompts: string[] = [];
  let capturePrompt = false;
  let promptBuffer: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    const timestampMatch = line.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)/);
    const timestamp = timestampMatch ? timestampMatch[1] : undefined;
    const kindMatch = trimmed.match(/^(PLAN|ACTION|TOOL|EDIT|TEST|LOG|SUMMARY|ERROR)[:|-]/i);
    let kind = "log";
    if (kindMatch) {
      const rawKind = kindMatch[1].toLowerCase();
      if (rawKind === "action") kind = "tool";
      else if (rawKind === "error") kind = "error";
      else kind = rawKind;
    }
    events.push(
      normalizeEvent(
        {
          id: `line-${i + 1}`,
          timestamp,
          kind,
          output: trimmed,
          error: kind === "error" ? trimmed : undefined,
        },
        fallback,
        events.length,
        kind
      )
    );

    if (/prompt start/i.test(trimmed) || /system prompt/i.test(trimmed)) {
      capturePrompt = true;
      promptBuffer = [];
      continue;
    }
    if (capturePrompt) {
      if (trimmed.length === 0 || /prompt end/i.test(trimmed)) {
        if (promptBuffer.length > 0) {
          prompts.push(promptBuffer.join("\n"));
        }
        capturePrompt = false;
        promptBuffer = [];
        continue;
      }
      promptBuffer.push(line.replace(/^\s*>\s?/, "").trimEnd());
    }
  }
  if (capturePrompt && promptBuffer.length > 0) {
    prompts.push(promptBuffer.join("\n"));
  }
  return { events, promptCandidates: prompts, plainText: content };
}

async function loadFailureRules(failureRulesPath: string): Promise<FailureRule[]> {
  const searchPaths = [failureRulesPath];
  const defaultPath = path.join(DEFAULT_ARTIFACT_DIR, "failure-rules.yaml");
  const resolvedDefault = path.resolve(defaultPath);
  if (!searchPaths.some((candidate) => path.resolve(candidate) === resolvedDefault)) {
    searchPaths.push(defaultPath);
  }
  for (const candidate of searchPaths) {
    try {
      const raw = await fs.readFile(candidate, "utf8");
      const schema = z.object({
        rules: z
          .array(
            z.object({
              id: z.string(),
              label: z.string().optional(),
              description: z.string().optional(),
              patterns: z.array(z.string()),
              remediation: z.string().optional(),
            })
          )
          .default([]),
      });
      const parsed = schema.parse(YAML.parse(raw));
      return parsed.rules.map((rule) => ({
        id: rule.id,
        label: rule.label ?? rule.id,
        description: rule.description,
        patterns: rule.patterns,
        remediation: rule.remediation,
      }));
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
        console.warn(
          `[speckit-analyze-run] Unable to load failure rules from ${candidate}: ${(error as Error).message}`
        );
      }
    }
  }
  console.warn(`[speckit-analyze-run] No failure rules found; proceeding without label enforcement.`);
  return [];
}

function detectPrompt(candidates: string[], fallbackText: string): string {
  if (candidates.length > 0) {
    return candidates.sort((a, b) => b.length - a.length)[0];
  }
  const guardrailIndex = fallbackText.toLowerCase().indexOf("guard rail");
  if (guardrailIndex >= 0) {
    return fallbackText.slice(guardrailIndex);
  }
  return fallbackText.slice(0, 2000);
}

function extractImperatives(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("- ")) {
    const rest = trimmed.slice(2);
    if (rest.length > 0) return rest;
  }
  const imperativePatterns = [/^(must|should|ensure|create|add|update|implement|run|avoid|verify)\b/i];
  if (imperativePatterns.some((pattern) => pattern.test(trimmed))) {
    return trimmed;
  }
  if (lower.includes(" must ") || lower.includes(" ensure ") || lower.includes(" deliver")) {
    return trimmed;
  }
  return null;
}

function deriveRequirements(prompt: string): RequirementRecord[] {
  const lines = prompt.split(/\r?\n/);
  const requirements: RequirementRecord[] = [];
  let counter = 1;
  for (const line of lines) {
    const imperative = extractImperatives(line);
    if (!imperative) continue;
    const id = `REQ-${counter.toString().padStart(2, "0")}`;
    requirements.push({
      id,
      text: imperative.trim(),
      source: "prompt",
      category: imperative.toLowerCase().includes("test") ? "validation" : undefined,
      constraints: imperative.includes(";") ? imperative.split(";").map((part) => part.trim()) : undefined,
      status: "unknown",
      evidence: [],
    });
    counter += 1;
  }
  return requirements;
}

function scoreRequirements(requirements: RequirementRecord[], events: RunEvent[]): RequirementRecord[] {
  const keywords = {
    success: [/completed/i, /done/i, /satisfied/i, /pass/i, /implemented/i],
    failure: [/failed/i, /error/i, /unable/i, /missing/i],
  };

  return requirements.map((req) => {
    const tokens = req.text.split(/\s+/).slice(0, 6).filter(Boolean);
    if (tokens.length === 0) {
      return req;
    }
    const pattern = new RegExp(tokens.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*"), "i");
    let chosenEvent: RunEvent | undefined;
    let status: RequirementRecord["status"] = req.status;
    for (const event of events) {
      const haystacks: string[] = [];
      if (typeof event.output === "string") haystacks.push(event.output);
      if (typeof event.input === "string") haystacks.push(event.input);
      if (!haystacks.some((field) => pattern.test(field))) continue;
      if (haystacks.some((field) => keywords.failure.some((regex) => regex.test(field)))) {
        status = "violated";
        chosenEvent = event;
        break;
      }
      if (haystacks.some((field) => keywords.success.some((regex) => regex.test(field)))) {
        status = "satisfied";
        chosenEvent = event;
      } else if (!chosenEvent) {
        status = "in-progress";
        chosenEvent = event;
      }
    }
    return {
      ...req,
      status,
      evidence: chosenEvent ? [chosenEvent.id] : [],
    };
  });
}

function computeMetrics(requirements: RequirementRecord[], events: RunEvent[]): Metrics {
  const satisfied = requirements.filter((req) => req.status === "satisfied" || req.status === "in-progress");
  const toolEvents = events.filter((event) => event.kind === "tool" || event.kind === "action");
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

  const reasoningEvents = events.filter((event) => event.kind === "log" || event.kind === "plan" || event.kind === "summary");
  const reflective = reasoningEvents.filter((event) => {
    if (typeof event.output === "string" && /reflect|lesson|next run|improve/i.test(event.output)) return true;
    if (typeof event.input === "string" && /reflect|lesson/i.test(event.input)) return true;
    return false;
  });
  const reflectionDensity = reasoningEvents.length === 0 ? 0 : reflective.length / reasoningEvents.length;

  const sortedEvents = [...events].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
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

function applyFailureLabels(rules: FailureRule[], text: string, events: RunEvent[]): Set<string> {
  const labels = new Set<string>();
  const haystack = `${text}\n${events
    .map((event) => {
      const output = typeof event.output === "string" ? event.output : "";
      const input = typeof event.input === "string" ? event.input : "";
      const error = typeof event.error === "string" ? event.error : "";
      return `${output}\n${input}\n${error}`;
    })
    .join("\n")}`;
  for (const rule of rules) {
    for (const pattern of rule.patterns) {
      const regex = new RegExp(pattern, "i");
      if (regex.test(haystack)) {
        labels.add(rule.label ?? rule.id);
        break;
      }
    }
  }
  return labels;
}

function buildMemo(runId: string, sources: string[], requirements: RequirementRecord[], labels: Set<string>, rules: FailureRule[]): MemoArtifact {
  const generatedAt = new Date().toISOString();
  const lessons: string[] = [];
  const guardrails: string[] = [];

  for (const label of labels) {
    const rule = rules.find((item) => item.label === label || item.id === label);
    if (rule) {
      if (rule.remediation) lessons.push(rule.remediation);
      if (rule.description) guardrails.push(rule.description);
    }
  }

  if (lessons.length === 0) {
    lessons.push("Review analyzer output and iterate on missing coverage before the next run.");
  }
  if (guardrails.length === 0) {
    guardrails.push("Keep diffs focused and validate artifacts before commit.");
  }

  const checklist = requirements.map((req) => {
    const icon = req.status === "satisfied" ? "✅" : req.status === "violated" ? "❌" : req.status === "in-progress" ? "🟡" : "⬜";
    return `${req.id}: ${icon} ${req.text}`;
  });

  return {
    generated_at: generatedAt,
    generated_from: {
      run_id: runId,
      sources,
    },
    lessons,
    guardrails,
    checklist,
    labels: Array.from(labels),
  };
}

function buildVerification(requirements: RequirementRecord[]): VerificationArtifact {
  return {
    version: 1,
    generated_at: new Date().toISOString(),
    requirements: requirements.map((req) => ({
      id: req.id,
      description: req.text,
      status: req.status,
      evidence: req.evidence,
      check: req.status === "satisfied" ? "Confirmed via run evidence" : "Pending manual verification",
    })),
  };
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function writeJsonl(filePath: string, rows: any[]): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const payload = rows.map((row) => JSON.stringify(row)).join("\n");
  await fs.writeFile(filePath, payload + (rows.length > 0 ? "\n" : ""), "utf8");
}

function buildSummary(run: RunArtifact, metrics: Metrics, memo: MemoArtifact, requirements: RequirementRecord[]): string {
  const metricRows = Object.entries(metrics)
    .map(([key, value]) => `| ${key} | ${value ?? "—"} |`)
    .join("\n");
  const labelList = memo.labels.length > 0 ? memo.labels.map((label) => `- ${label}`).join("\n") : "- None";
  const requirementRows = requirements
    .map((req) => `- ${req.id} (${req.status}): ${req.text}`)
    .join("\n");
  return `# SpecKit Run Forensics\n\n- Run ID: ${run.run_id}\n- Source logs: ${run.source_logs.map((file) => path.relative(ROOT, file)).join(", ")}\n- Events analyzed: ${run.events.length}\n\n## Metrics\n| Metric | Value |\n|--------|-------|\n${metricRows}\n\n## Labels\n${labelList}\n\n## Requirements\n${requirementRows}`;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.rawLogPatterns.length === 0) {
    throw new Error("No --raw-log pattern provided. Pass one or more glob patterns.");
  }
  const logPaths = await globby(options.rawLogPatterns, { absolute: true });
  if (logPaths.length === 0) {
    throw new Error(`No log files found for patterns: ${options.rawLogPatterns.join(", ")}`);
  }

  const artifactDir = options.outDir ? path.resolve(ROOT, options.outDir) : DEFAULT_ARTIFACT_DIR;
  const failureRulesPath = path.join(artifactDir, "failure-rules.yaml");
  const resolvedRtmPath = options.rtmPath ? path.resolve(ROOT, options.rtmPath) : undefined;

  const rules = await loadFailureRules(failureRulesPath);
  const allEvents: RunEvent[] = [];
  const promptCandidates: string[] = [];
  let plainTextAggregate = "";
  const fallbackStart = new Date();

  for (const [index, filePath] of logPaths.entries()) {
    const raw = await fs.readFile(filePath, "utf8");
    const content = stripAnsi(raw);
    plainTextAggregate += `\n\n# File: ${filePath}\n${content}`;
    const fallback = () => new Date(fallbackStart.getTime() + index * 60_000);
    const jsonParsed = parseJsonPayload(content, fallback, filePath);
    if (jsonParsed) {
      allEvents.push(...jsonParsed.events);
      promptCandidates.push(...jsonParsed.promptCandidates);
      continue;
    }
    const ndjsonParsed = parseNdjson(content, fallback, filePath);
    if (ndjsonParsed) {
      allEvents.push(...ndjsonParsed.events);
      promptCandidates.push(...ndjsonParsed.promptCandidates);
      continue;
    }
    const textParsed = parseTextLog(content, fallback);
    allEvents.push(...textParsed.events);
    promptCandidates.push(...textParsed.promptCandidates);
  }

  const sortedEvents = allEvents.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const runId = options.runId ?? `run-${Date.now()}`;
  const runArtifact: RunArtifact = {
    run_id: runId,
    source_logs: logPaths,
    started_at: sortedEvents[0]?.timestamp ?? null,
    finished_at: sortedEvents[sortedEvents.length - 1]?.timestamp ?? null,
    events: sortedEvents,
  };

  const prompt = detectPrompt(promptCandidates, plainTextAggregate);
  const requirements = scoreRequirements(deriveRequirements(prompt), sortedEvents);
  const metrics = computeMetrics(requirements, sortedEvents);
  const labels = applyFailureLabels(rules, plainTextAggregate, sortedEvents);
  const memo = buildMemo(runArtifact.run_id, runArtifact.source_logs, requirements, labels, rules);
  const verification = buildVerification(requirements);
  const summary = buildSummary(runArtifact, metrics, memo, requirements);

  await fs.mkdir(artifactDir, { recursive: true });
  await writeJson(path.join(artifactDir, "Run.json"), runArtifact);
  await writeJsonl(path.join(artifactDir, "requirements.jsonl"), requirements);
  const metricsPayload = {
    run_id: runArtifact.run_id,
    generated_at: new Date().toISOString(),
    ReqCoverage: metrics.ReqCoverage,
    BacktrackRatio: metrics.BacktrackRatio,
    ToolPrecisionAt1: metrics.ToolPrecisionAt1,
    ToolPrecision1: metrics.ToolPrecisionAt1,
    EditLocality: metrics.EditLocality,
    ReflectionDensity: metrics.ReflectionDensity,
    TTFPSeconds: metrics.TTFPSeconds,
    FailureLabels: Array.from(labels),
    metrics,
    labels: Array.from(labels),
    requirements: {
      total: requirements.length,
      satisfied: requirements.filter((req) => req.status === "satisfied").length,
      violated: requirements.filter((req) => req.status === "violated").length,
    },
  };
  await writeJson(path.join(artifactDir, "metrics.json"), metricsPayload);
  await writeJson(path.join(artifactDir, "memo.json"), memo);
  await fs.writeFile(path.join(artifactDir, "verification.yaml"), YAML.stringify(verification), "utf8");
  await fs.writeFile(path.join(artifactDir, "summary.md"), summary + "\n", "utf8");

  // @ts-ignore Dynamic import of sibling TypeScript module handled at runtime by tsx
  const updater = await import(pathToFileURL(path.join(__dirname, "speckit-update-rtm.ts")).href);
  if (typeof updater.updateRTM === "function") {
    await updater.updateRTM({
      artifactDir,
      targetPath: resolvedRtmPath,
    });
  }

  console.log(`[speckit-analyze-run] Run ${runArtifact.run_id} analyzed. ${requirements.length} requirements detected.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error("[speckit-analyze-run] Failed:", error);
    process.exitCode = 1;
  });
}
