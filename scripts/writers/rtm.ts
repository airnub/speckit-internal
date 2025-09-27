import { promises as fs } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import type { RequirementRecord, RunArtifact } from "@speckit/analyzer";

const START_MARKER = "<!-- speckit:rtm:start -->";
const END_MARKER = "<!-- speckit:rtm:end -->";

export interface UpdateRTMOptions {
  rootDir: string;
  outDir?: string;
  rtmPath?: string;
}

async function readConfigRTMPath(rootDir: string): Promise<string | null> {
  const configPath = path.join(rootDir, "speckit.config.yaml");
  try {
    const raw = await fs.readFile(configPath, "utf8");
    const parsed = YAML.parse(raw) ?? {};
    const candidate = parsed?.artifacts?.rtm_path;
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return path.resolve(rootDir, candidate.trim());
    }
  } catch (error) {
    console.warn(`[rtm] Unable to read speckit.config.yaml: ${(error as Error).message}`);
  }
  return null;
}

async function readRequirements(outDir: string): Promise<RequirementRecord[]> {
  const requirementsPath = path.join(outDir, "requirements.jsonl");
  try {
    const raw = await fs.readFile(requirementsPath, "utf8");
    const records: RequirementRecord[] = [];
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed.id === "string" && typeof parsed.text === "string") {
          records.push(parsed as RequirementRecord);
        }
      } catch (error) {
        console.warn(`[rtm] Skipping malformed requirement line: ${(error as Error).message}`);
      }
    }
    return records;
  } catch (error) {
    console.warn(`[rtm] No requirements.jsonl found in ${outDir}: ${(error as Error).message}`);
    return [];
  }
}

async function readRun(outDir: string): Promise<RunArtifact | null> {
  const runPath = path.join(outDir, "Run.json");
  try {
    const raw = await fs.readFile(runPath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as any).events)) {
      return {
        runId: parsed.run_id,
        sourceLogs: parsed.source_logs ?? [],
        startedAt: parsed.started_at ?? null,
        finishedAt: parsed.finished_at ?? null,
        events: parsed.events ?? [],
      };
    }
  } catch (error) {
    console.warn(`[rtm] Unable to parse Run.json: ${(error as Error).message}`);
  }
  return null;
}

function humanizeEvidence(event: any): string {
  if (!event) return "—";
  const base = event.subtype || event.kind || "log";
  if (typeof event.output === "string" && event.output.trim().length > 0) {
    const snippet = event.output.replace(/\s+/g, " ");
    return `${base}: ${snippet.length > 120 ? `${snippet.slice(0, 117)}...` : snippet}`;
  }
  if (typeof event.input === "string" && event.input.trim().length > 0) {
    const snippet = event.input.replace(/\s+/g, " ");
    return `${base}: ${snippet.length > 120 ? `${snippet.slice(0, 117)}...` : snippet}`;
  }
  if (Array.isArray(event.files_changed) && event.files_changed.length > 0) {
    return `${base}: ${event.files_changed.join(", ")}`;
  }
  return base;
}

function deriveEvidence(requirement: RequirementRecord, run: RunArtifact | null): string {
  if (!run) return "—";
  const evidenceId = requirement.evidence?.[0];
  if (evidenceId) {
    const match = run.events.find((event) => event.id === evidenceId);
    if (match) return humanizeEvidence(match);
  }
  const needle = requirement.text.split(/\s+/).slice(0, 6).join(" ");
  const fallback = run.events.find((event) => {
    if (typeof event.output === "string" && event.output.includes(needle)) return true;
    if (typeof event.input === "string" && event.input.includes(needle)) return true;
    return false;
  });
  return humanizeEvidence(fallback);
}

function buildTable(requirements: RequirementRecord[], run: RunArtifact | null): string {
  if (requirements.length === 0) {
    return "| — | — | — | — |";
  }
  return requirements
    .map((req) => {
      const covered = req.status === "satisfied" || req.status === "in-progress";
      const violations = req.status === "violated" ? 1 : 0;
      const evidence = deriveEvidence(req, run);
      return `| ${req.id} | ${covered ? "✅" : "❌"} | ${violations} | ${evidence || "—"} |`;
    })
    .join("\n");
}

function ensureBlock(content: string): string {
  if (content.includes(START_MARKER) && content.includes(END_MARKER)) {
    return content;
  }
  const block = `${START_MARKER}\n| Req | Covered | Violations | Evidence |\n|-----|---------|-----------|----------|\n${END_MARKER}`;
  return content.trim().length === 0 ? `# Run Traceability Matrix\n\n${block}\n` : `${content.trim()}\n\n${block}\n`;
}

export async function updateRTM(options: UpdateRTMOptions): Promise<void> {
  const outDir = options.outDir ?? path.join(options.rootDir, ".speckit");
  const [requirements, run] = await Promise.all([readRequirements(outDir), readRun(outDir)]);
  const configuredPath = options.rtmPath ?? (await readConfigRTMPath(options.rootDir));
  const rtmPath = configuredPath ?? path.join(options.rootDir, "RTM.md");

  let existing = "";
  try {
    existing = await fs.readFile(rtmPath, "utf8");
  } catch (error) {
    console.warn(`[rtm] Creating new RTM at ${rtmPath}`);
  }

  const prepared = ensureBlock(existing ?? "");
  const tableBody = buildTable(requirements, run);
  const header = "| Req | Covered | Violations | Evidence |\n|-----|---------|-----------|----------|";
  const replacement = `${START_MARKER}\n${header}\n${tableBody}\n${END_MARKER}`;

  const startIndex = prepared.indexOf(START_MARKER);
  const endIndex = prepared.indexOf(END_MARKER, startIndex >= 0 ? startIndex : 0);
  let next = prepared;
  if (startIndex >= 0 && endIndex >= 0) {
    const before = prepared.slice(0, startIndex);
    const after = prepared.slice(endIndex + END_MARKER.length);
    const normalizedAfter = after.startsWith("\n") ? after : `\n${after}`;
    next = `${before}${replacement}${normalizedAfter}`;
  }

  await fs.mkdir(path.dirname(rtmPath), { recursive: true });
  await fs.writeFile(rtmPath, next.endsWith("\n") ? next : `${next}\n`, "utf8");
}
