export type Provider = "openai" | "github";

export type AgentConfig = {
  provider: Provider;
  openai?: { apiKey?: string; model?: string };
  github?: { pat?: string; model?: string; endpoint?: string };
};

export type AiPlan = { summary: string; rationale?: string; patch: string };

/**
 * Guarded at the app layer by cfg.ai.enabled; this function performs the actual call.
 * SDKs are lazily imported to keep startup light.
 */
export async function generatePatch(
  cfg: AgentConfig,
  requirement: string,
  context?: string
): Promise<AiPlan> {
  if (cfg.provider === "openai") {
    const apiKey = cfg.openai?.apiKey || process.env.OPENAI_API_KEY;
    const model = cfg.openai?.model || process.env.OPENAI_MODEL || "gpt-5-2025-08-07";
    if (!apiKey) throw new Error("OpenAI API key missing (OPENAI_API_KEY or cfg.openai.apiKey).");
    const { OpenAI } = await import("openai");
    const client = new OpenAI({ apiKey });

    // TODO: implement prompt → patch logic; return a unified diff in patch
    return { summary: "stub", patch: "", rationale: `Would call ${model} with requirement/context.` };
  }

  if (cfg.provider === "github") {
    // TODO: lazy import GitHub models client here when you wire it up
    const model = cfg.github?.model || "openai/gpt-5";
    return { summary: "stub", patch: "", rationale: `Would call ${model} (GitHub Models) with requirement/context.` };
  }

  return { summary: "stub", patch: "" };
}
