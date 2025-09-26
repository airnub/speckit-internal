import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import YAML from "yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const DEFAULT_RTM_PATH = "RTM.md";
const ARTIFACT_DIR = path.join(ROOT, ".speckit");
const START_MARKER = "<!-- speckit:rtm:start -->";
const END_MARKER = "<!-- speckit:rtm:end -->";

interface RequirementRecord {
  id: string;
  text: string;
  status?: "unknown" | "satisfied" | "violated" | "in-progress";
  evidence?: string[];
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
  events: RunEvent[];
}

async function readConfigRTMPath(): Promise<string> {
  const configPath = path.join(ROOT, "speckit.config.yaml");
  try {
    const raw = await fs.readFile(configPath, "utf8");
    const parsed = YAML.parse(raw) ?? {};
    const rtmPath = parsed?.artifacts?.rtm_path;
    if (typeof rtmPath === "string" && rtmPath.trim().length > 0) {
      return path.resolve(ROOT, rtmPath.trim());
    }
  } catch (error) {
    console.warn(`[speckit-update-rtm] Unable to read speckit.config.yaml: ${(error as Error).message}`);
  }
  return path.join(ROOT, DEFAULT_RTM_PATH);
}

async function readRequirements(): Promise<RequirementRecord[]> {
  const requirementsPath = path.join(ARTIFACT_DIR, "requirements.jsonl");
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
        console.warn(`[speckit-update-rtm] Skipping malformed requirement line: ${(error as Error).message}`);
      }
    }
    return records;
  } catch (error) {
    console.warn(`[speckit-update-rtm] No requirements.jsonl found: ${(error as Error).message}`);
    return [];
  }
}

async function readRun(): Promise<RunArtifact | null> {
  const runPath = path.join(ARTIFACT_DIR, "Run.json");
  try {
    const raw = await fs.readFile(runPath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.events)) {
      return parsed as RunArtifact;
    }
  } catch (error) {
    console.warn(`[speckit-update-rtm] Unable to parse Run.json: ${(error as Error).message}`);
  }
  return null;
}

function humanizeEvidence(event: RunEvent | undefined): string {
  if (!event) return "—";
  const base = event.subtype || event.kind;
  if (typeof event.output === "string" && event.output.trim().length > 0) {
    const snippet = event.output.replace(/\s+/g, " ");
    return `${base}: ${snippet.length > 120 ? snippet.slice(0, 117) + "..." : snippet}`;
  }
  if (typeof event.input === "string" && event.input.trim().length > 0) {
    const snippet = event.input.replace(/\s+/g, " ");
    return `${base}: ${snippet.length > 120 ? snippet.slice(0, 117) + "..." : snippet}`;
  }
  if (event.files_changed && event.files_changed.length > 0) {
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

export async function updateRTM(): Promise<void> {
  const [requirements, run] = await Promise.all([readRequirements(), readRun()]);
  const rtmPath = await readConfigRTMPath();
  let existing = "";
  try {
    existing = await fs.readFile(rtmPath, "utf8");
  } catch (error) {
    console.warn(`[speckit-update-rtm] Creating new RTM at ${rtmPath}`);
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  updateRTM().catch((error) => {
    console.error("[speckit-update-rtm] Failed to update RTM:", error);
    process.exitCode = 1;
  });
}
