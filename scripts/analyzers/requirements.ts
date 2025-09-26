import type { RunEvent } from "./normalize.js";

export interface RequirementRecord {
  id: string;
  text: string;
  source?: string;
  category?: string | null;
  constraints?: string[];
  status: "unknown" | "satisfied" | "violated" | "in-progress";
  evidence: string[];
  notes?: string;
}

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
