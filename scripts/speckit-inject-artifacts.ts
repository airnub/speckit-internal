import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import YAML from "yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const ARTIFACT_DIR = path.join(ROOT, ".speckit");

const CODING_AGENT_BRIEF_PATH = path.join(ROOT, "docs/internal/agents/coding-agent-brief.md");

const MEMO_GUARDRAILS_START = "<!-- speckit:memo-guardrails:start -->";
const MEMO_GUARDRAILS_END = "<!-- speckit:memo-guardrails:end -->";
const VERIFICATION_START = "<!-- speckit:verification:start -->";
const VERIFICATION_END = "<!-- speckit:verification:end -->";

interface MemoArtifact {
  version?: number;
  generated_at?: string;
  generated_from?: {
    run_id?: string;
  };
  lessons?: string[];
  guardrails?: string[];
  checklist?: string[];
}

interface VerificationRequirementEntry {
  id: string;
  description: string;
  status?: string;
}

interface VerificationArtifact {
  generated_at?: string;
  requirements?: VerificationRequirementEntry[];
}

async function loadMemo(): Promise<MemoArtifact | null> {
  const memoPath = path.join(ARTIFACT_DIR, "memo.json");
  try {
    const raw = await fs.readFile(memoPath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`[speckit-inject] Unable to load memo.json: ${(error as Error).message}`);
    return null;
  }
}

async function loadVerification(): Promise<VerificationArtifact | null> {
  const verificationPath = path.join(ARTIFACT_DIR, "verification.yaml");
  try {
    const raw = await fs.readFile(verificationPath, "utf8");
    return YAML.parse(raw) as VerificationArtifact;
  } catch (error) {
    console.warn(`[speckit-inject] Unable to load verification.yaml: ${(error as Error).message}`);
    return null;
  }
}

function formatGuardrails(memo: MemoArtifact | null): string {
  if (!memo || !memo.guardrails || memo.guardrails.length === 0) {
    return "- (Forensics) No guardrails recorded yet.";
  }
  return memo.guardrails.map((item) => `- (Forensics) ${item}`).join("\n");
}

function statusEmoji(status?: string): string {
  if (!status) return "⬜";
  const normalized = status.toLowerCase();
  if (normalized === "satisfied") return "✅";
  if (normalized === "violated") return "❌";
  if (normalized === "in-progress") return "🟡";
  return "⬜";
}

function formatVerification(verification: VerificationArtifact | null): string {
  if (!verification || !verification.requirements || verification.requirements.length === 0) {
    return "- ⬜ No verification checks available.";
  }
  return verification.requirements
    .map((req) => `${statusEmoji(req.status)} ${req.id}: ${req.description}`)
    .join("\n");
}

function upsertMarkerBlock(content: string, start: string, end: string, block: string, insertAnchor: RegExp): string {
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (content.includes(start) && content.includes(end)) {
    return content.replace(new RegExp(`${escape(start)}[\s\S]*?${escape(end)}`), `${start}\n${block}\n${end}\n`);
  }
  const match = content.match(insertAnchor);
  if (!match) {
    return `${content.trim()}\n\n${start}\n${block}\n${end}\n`;
  }
  const index = match.index! + match[0].length;
  const remainder = content.slice(index);
  const normalizedRemainder = remainder.startsWith("\n") ? remainder : `\n${remainder}`;
  return `${content.slice(0, index)}\n\n${start}\n${block}\n${end}${normalizedRemainder}`;
}

async function updateCodingAgentBrief(memo: MemoArtifact | null, verification: VerificationArtifact | null): Promise<void> {
  let content: string;
  try {
    content = await fs.readFile(CODING_AGENT_BRIEF_PATH, "utf8");
  } catch (error) {
    console.warn(`[speckit-inject] Coding agent brief not found at ${CODING_AGENT_BRIEF_PATH}`);
    return;
  }

  const guardrailBlock = formatGuardrails(memo);
  const verificationBlock = formatVerification(verification);
  let updated = upsertMarkerBlock(
    content,
    MEMO_GUARDRAILS_START,
    MEMO_GUARDRAILS_END,
    guardrailBlock,
    /## Guard Rails[^#]*/
  );
  const generatedAt = verification?.generated_at ?? memo?.generated_at;
  const verificationHeader = generatedAt ? `> Generated from latest run on ${generatedAt}` : `> Generated from latest run`;
  const verificationSection = `${verificationHeader}\n${verificationBlock}`;
  updated = upsertMarkerBlock(updated, VERIFICATION_START, VERIFICATION_END, verificationSection, /## Pre-flight checks[^#]*/);

  await fs.writeFile(CODING_AGENT_BRIEF_PATH, updated.endsWith("\n") ? updated : `${updated}\n`, "utf8");
}

async function main(): Promise<void> {
  const [memo, verification] = await Promise.all([loadMemo(), loadVerification()]);
  await updateCodingAgentBrief(memo, verification);
  console.log("[speckit-inject] Prompt artifacts refreshed.");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error("[speckit-inject] Failed to inject artifacts:", error);
    process.exitCode = 1;
  });
}
