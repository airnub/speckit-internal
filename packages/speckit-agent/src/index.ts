import type { Response } from "undici";

export type Provider = "openai" | "github";

export type AgentConfig = {
  provider: Provider;
  openai?: { apiKey?: string; model?: string };
  github?: { pat?: string; model?: string; endpoint?: string };
};

export type AiPlan = { summary: string; rationale?: string; patch: string };

const SYSTEM_PROMPT = [
  "You are SpecKit's AI assistant. Your job is to plan a change and produce a git patch.",
  "Always respond with valid JSON that matches the schema { \"summary\": string, \"rationale\": string, \"patch\": string }.",
  "The \"patch\" must be a unified diff that can be applied with `git apply`. If no change is required, return an empty string for patch.",
  "Do not wrap the JSON in Markdown fences or include additional commentary."
].join(" ");

const DEFAULT_OPENAI_MODEL = "gpt-5-2025-08-07";
const DEFAULT_GITHUB_MODEL = "openai/gpt-5";
const DEFAULT_GITHUB_ENDPOINT = "https://models.inference.ai.azure.com";

/**
 * Guarded at the app layer by cfg.ai.enabled; this function performs the actual call.
 * SDKs are lazily imported to keep startup light.
 */
export async function generatePatch(
  cfg: AgentConfig,
  requirement: string,
  context?: string
): Promise<AiPlan> {
  if (!requirement || !requirement.trim()) {
    throw new Error("Requirement text is required for generatePatch().");
  }

  if (cfg.provider === "openai") {
    return callOpenAi(cfg, requirement, context);
  }

  if (cfg.provider === "github") {
    return callGithub(cfg, requirement, context);
  }

  throw new Error(`Unsupported provider '${cfg.provider}'.`);
}

async function callOpenAi(cfg: AgentConfig, requirement: string, context?: string): Promise<AiPlan> {
  const apiKey = cfg.openai?.apiKey || process.env.OPENAI_API_KEY;
  const model = cfg.openai?.model || process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
  if (!apiKey) {
    throw new Error("OpenAI API key missing (set OPENAI_API_KEY or cfg.openai.apiKey).");
  }

  const { OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey });

  const messages = buildMessages(requirement, context);
  const completion = await client.chat.completions.create({
    model,
    messages,
    temperature: 0,
    response_format: { type: "json_object" }
  });

  const choice = completion.choices?.[0];
  const refusal = choice?.message?.refusal;
  if (refusal) {
    throw new Error(`OpenAI request refused: ${typeof refusal === "string" ? refusal : JSON.stringify(refusal)}`);
  }

  const plan = parsePlan(choice?.message?.content);
  plan.summary ||= "AI proposal";
  plan.patch = plan.patch.trim();
  if (plan.rationale) plan.rationale = plan.rationale.trim();
  return plan;
}

async function callGithub(cfg: AgentConfig, requirement: string, context?: string): Promise<AiPlan> {
  const pat = cfg.github?.pat || process.env.GITHUB_TOKEN || process.env.GITHUB_PAT || process.env.GH_TOKEN;
  if (!pat) {
    throw new Error("GitHub Models token missing (set cfg.github.pat or GITHUB_TOKEN/GITHUB_PAT/GH_TOKEN).");
  }

  const endpoint = (cfg.github?.endpoint || process.env.GITHUB_MODELS_ENDPOINT || DEFAULT_GITHUB_ENDPOINT).replace(/\/$/, "");
  const model = cfg.github?.model || process.env.GITHUB_MODEL || DEFAULT_GITHUB_MODEL;

  const { fetch } = await import("undici");
  const messages = buildMessages(requirement, context);
  const url = `${endpoint}/chat/completions`;
  const body = JSON.stringify({
    model,
    messages,
    temperature: 0,
    response_format: { type: "json_object" }
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${pat}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-ms-model": model
    },
    body
  });

  if (!res.ok) {
    const text = await safeRead(res);
    throw new Error(`GitHub Models request failed (${res.status} ${res.statusText}): ${text}`);
  }

  const raw = await res.text();
  let payload: any = {};
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch (error) {
      throw new Error(`GitHub Models response parse error: ${(raw || "").slice(0, 2000)}`);
    }
  }

  const choice = payload?.choices?.[0] ?? payload?.output?.[0];
  const message = choice?.message ?? choice;
  const refusal = message?.refusal;
  if (refusal) {
    throw new Error(`GitHub Models request refused: ${typeof refusal === "string" ? refusal : JSON.stringify(refusal)}`);
  }

  const plan = parsePlan(message?.content ?? message);
  plan.summary ||= "AI proposal";
  plan.patch = plan.patch.trim();
  if (plan.rationale) plan.rationale = plan.rationale.trim();
  return plan;
}

function buildMessages(requirement: string, context?: string) {
  const segments = [`Requirement:\n${requirement.trim()}`];
  if (context && context.trim()) {
    segments.push(`Context:\n${context.trim()}`);
  }
  segments.push(
    "Respond with strict JSON. Keys: summary (string), rationale (string), patch (string unified diff). " +
      "If a change is not needed, use an empty string for patch."
  );
  return [
    { role: "system" as const, content: SYSTEM_PROMPT },
    { role: "user" as const, content: segments.join("\n\n") }
  ];
}

function parsePlan(content: unknown): AiPlan {
  const text = normaliseContent(content);
  if (!text) {
    return { summary: "", patch: "" };
  }

  const data = tryParseJson(text);
  if (data && typeof data === "object") {
    const plan = normalisePlan(data);
    if (plan.summary || plan.patch || plan.rationale) {
      return plan;
    }
  }

  const fallback = text.trim();
  return {
    summary: fallback.split(/\n/)[0]?.slice(0, 200) || "AI response",
    patch: "",
    rationale: fallback || undefined
  };
}

function normaliseContent(content: unknown): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map(part => normaliseContent(part)).join("");
  }
  if (typeof content === "object") {
    if ("text" in content && typeof (content as any).text === "string") return (content as any).text;
    if ((content as any).text && typeof (content as any).text.value === "string") return (content as any).text.value;
    if ("content" in content && typeof (content as any).content === "string") return (content as any).content;
  }
  return String(content ?? "");
}

function tryParseJson(raw: string): any | null {
  const cleaned = stripCodeFence(raw.trim());
  if (!cleaned) return null;

  try {
    return JSON.parse(cleaned);
  } catch {
    // Maybe the model returned nested JSON as a string
  }

  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {
      // ignore
    }
  }
  return null;
}

function normalisePlan(data: Record<string, unknown>): AiPlan {
  const summary = coerceString(data.summary) || coerceString((data as any).title) || "";
  const rationale = coerceString(data.rationale ?? (data as any).reason ?? (data as any).explanation);
  const patchSource = data.patch ?? (data as any).diff ?? "";
  const patch = stripCodeFence(coerceString(patchSource));
  const plan: AiPlan = { summary: summary.trim(), patch: patch.trim() };
  if (rationale && rationale.trim()) plan.rationale = rationale.trim();
  return plan;
}

function coerceString(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(coerceString).filter(Boolean).join("\n");
  if (value && typeof value === "object") {
    if ("text" in value && typeof (value as any).text === "string") return (value as any).text;
    if ((value as any).text && typeof (value as any).text.value === "string") return (value as any).text.value;
  }
  if (value == null) return "";
  return String(value);
}

function stripCodeFence(value: string): string {
  let text = value.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```[a-zA-Z0-9_-]*\n?/, "");
    const idx = text.lastIndexOf("```");
    if (idx !== -1) {
      text = text.slice(0, idx);
    }
  }
  return text.trim();
}

async function safeRead(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
