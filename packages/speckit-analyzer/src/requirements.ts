import type { RequirementRecord, RunEvent } from "./types.js";

const CLI_KEYWORDS = [
  "pnpm",
  "npm",
  "yarn",
  "npx",
  "go",
  "python",
  "pytest",
  "pipenv",
  "poetry",
  "cargo",
  "composer",
  "bundle",
  "rails",
  "gradle",
  "mvn",
  "make",
  "docker",
  "kubectl",
  "helm",
  "bash",
  "sh",
];

const FILE_EXTENSION_PATTERN =
  /[A-Za-z0-9_./-]+\.(?:ts|tsx|js|jsx|cjs|mjs|json|yaml|yml|toml|ini|cfg|conf|md|mdx|txt|py|rs|go|java|kt|cs|rb|php|sh|bash|zsh|sql|css|scss|sass|less|html|vue|svelte)/;

const imperativePatterns = [
  /^(must|should|ensure|create|add|update|implement|run|avoid|verify|write|check|document)\b/i,
  /^-\s*[A-Z]/,
];

function sanitizeLine(line: string): string {
  return line.replace(/^[-*]\s*/, "").trim();
}

export function extractImperative(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (imperativePatterns.some((pattern) => pattern.test(trimmed))) {
    return sanitizeLine(trimmed);
  }
  const lower = trimmed.toLowerCase();
  if (lower.includes(" must ") || lower.includes(" ensure ") || lower.startsWith("ensure ")) {
    return sanitizeLine(trimmed);
  }
  return null;
}

export function deriveRequirements(prompt: string): RequirementRecord[] {
  const lines = prompt.split(/\r?\n/);
  const requirements: RequirementRecord[] = [];
  let counter = 1;
  for (const line of lines) {
    const imperative = extractImperative(line);
    if (!imperative) continue;
    const id = `REQ-${counter.toString().padStart(3, "0")}`;
    const constraints = imperative.includes(";")
      ? imperative.split(";").map((part) => part.trim()).filter(Boolean)
      : undefined;
    requirements.push({
      id,
      text: imperative,
      source: "prompt",
      category: imperative.toLowerCase().includes("test") ? "validation" : undefined,
      constraints,
      status: "unknown",
      evidence: [],
    });
    counter += 1;
  }
  if (requirements.length === 0) {
    requirements.push({
      id: "REQ-000",
      text: "Prompt missing or could not be parsed. Manual requirement entry needed.",
      source: "coach",
      category: "meta",
      status: "unknown",
      evidence: [],
      notes: "Added automatically due to missing prompt.",
    });
  }
  return requirements;
}

export function attachEvidence(
  requirements: RequirementRecord[],
  events: RunEvent[]
): RequirementRecord[] {
  const successRegex = [/completed/i, /done/i, /satisfied/i, /pass/i, /implemented/i];
  const failureRegex = [/failed/i, /error/i, /unable/i, /missing/i];
  return requirements.map((req) => {
    const tokens = req.text.split(/\s+/).slice(0, 6).filter(Boolean);
    if (tokens.length === 0) {
      return req;
    }
    const pattern = new RegExp(tokens.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*"), "i");
    let status: RequirementRecord["status"] = req.status;
    let chosen: RunEvent | undefined;
    for (const event of events) {
      const haystacks: string[] = [];
      if (typeof event.output === "string") haystacks.push(event.output);
      if (typeof event.input === "string") haystacks.push(event.input);
      if (!haystacks.some((field) => pattern.test(field))) continue;
      if (haystacks.some((field) => failureRegex.some((regex) => regex.test(field)))) {
        status = "violated";
        chosen = event;
        break;
      }
      if (haystacks.some((field) => successRegex.some((regex) => regex.test(field)))) {
        status = "satisfied";
        chosen = event;
      } else if (!chosen) {
        status = "in-progress";
        chosen = event;
      }
    }
    return {
      ...req,
      status,
      evidence: chosen ? [chosen.id] : req.evidence,
    };
  });
}

export function combineRequirements(
  baseline: RequirementRecord[],
  updates: RequirementRecord[]
): RequirementRecord[] {
  const map = new Map<string, RequirementRecord>();
  for (const req of baseline) {
    map.set(req.id, req);
  }
  for (const req of updates) {
    map.set(req.id, req);
  }
  return Array.from(map.values());
}

function sanitizeCommand(candidate: string): string {
  return candidate.replace(/[\s.;:,]+$/, "").trim();
}

function extractInlineCommand(text: string): string | null {
  const match = text.match(/`([^`]+)`/);
  if (match) {
    return sanitizeCommand(match[1]);
  }
  const quoted = text.match(/"([^"]*\b(?:pnpm|npm|yarn|npx|go|python|pytest|cargo|make|docker|kubectl)[^\"]*)"/i);
  if (quoted) {
    return sanitizeCommand(quoted[1]);
  }
  return null;
}

function detectDirectCommand(text: string): string | null {
  const pattern = new RegExp(`\\b(${CLI_KEYWORDS.join("|")})\\b[^\\n]*`, "i");
  const match = text.match(pattern);
  if (!match) return null;
  const truncated = match[0].split(/\b(?:and|then|after)\b/i)[0];
  return sanitizeCommand(truncated);
}

function detectFileTarget(text: string): string | null {
  const match = text.match(FILE_EXTENSION_PATTERN);
  if (!match) return null;
  return match[0];
}

function buildSearchFallback(req: RequirementRecord): string {
  const withoutCode = req.text.replace(/`[^`]+`/g, " ");
  const tokens = withoutCode
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 3);
  const phrase = tokens.slice(0, 3).join(" ");
  if (phrase) {
    return `rg "${phrase}" -n`;
  }
  return `rg "${req.id.toLowerCase()}" -n`;
}

function inferVerificationCommand(req: RequirementRecord): string {
  const inline = extractInlineCommand(req.text);
  if (inline) return inline;

  const direct = detectDirectCommand(req.text);
  if (direct) return direct;

  const normalized = req.text.toLowerCase();

  if (normalized.includes("lint")) {
    return "pnpm lint";
  }
  if (normalized.includes("type check") || normalized.includes("type-check") || normalized.includes("typecheck")) {
    return "pnpm typecheck";
  }
  if (normalized.includes("coverage")) {
    return "pnpm test -- --coverage";
  }
  if (normalized.includes("build")) {
    return "pnpm build";
  }
  if (normalized.includes("format") || normalized.includes("prettier")) {
    return "pnpm format";
  }

  const fileTarget = detectFileTarget(req.text);
  if (fileTarget) {
    return `git diff --stat ${fileTarget}`;
  }

  if (
    req.category === "validation" ||
    normalized.includes("test") ||
    normalized.includes("assert") ||
    normalized.includes("verify")
  ) {
    return "pnpm test";
  }
  if (normalized.includes("doc") || normalized.includes("readme") || normalized.includes("guide")) {
    return "pnpm docs:build";
  }

  return buildSearchFallback(req);
}

function formatEvidenceNote(req: RequirementRecord): string {
  if (req.evidence.length === 0) {
    return "No run evidence captured yet.";
  }
  return `Evidence: ${req.evidence.join(", ")}.`;
}

export function generateRequirementCheck(req: RequirementRecord): string {
  const command = inferVerificationCommand(req);
  const evidenceNote = formatEvidenceNote(req);
  switch (req.status) {
    case "satisfied":
      return `Regression guard: run \`${command}\` to reconfirm. ${evidenceNote}`;
    case "violated":
      return `Remediate failure and re-run \`${command}\`. ${evidenceNote}`;
    case "in-progress":
      return `Next step: execute \`${command}\` and capture output as evidence. ${evidenceNote}`;
    case "unknown":
    default:
      return `Plan check: run \`${command}\` to establish coverage. ${evidenceNote}`;
  }
}
