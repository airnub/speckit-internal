import { describe, expect, it } from "vitest";

import {
  anthropicMessagesToEvents,
  langChainRunsToEvents,
  mcpEventsToRunEvents,
  openAiChatCompletionsToEvents,
  vercelAiMessagesToEvents,
} from "../src/adapters/providers.js";

describe("provider adapters", () => {
  it("normalizes OpenAI chat completion payloads", () => {
    const events = openAiChatCompletionsToEvents({
      model: "gpt-4o-mini",
      request: {
        messages: [
          { role: "user", content: "Summarize" },
          { role: "assistant", content: "Summary" },
        ],
      },
      response: {
        choices: [{ message: { role: "assistant", content: "Ok" }, finish_reason: "stop" }],
      },
    });
    expect(events.length).toBeGreaterThanOrEqual(3);
    expect(events[0].role).toBe("user");
    expect(events[0].input).toBe("Summarize");
  });

  it("normalizes Anthropic message logs", () => {
    const events = anthropicMessagesToEvents([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there" },
    ]);
    expect(events[0].kind).toBe("plan");
    expect(events[1].kind).toBe("run");
    expect(events[1].output).toBe("Hi there");
  });

  it("normalizes Vercel AI SDK streams", () => {
    const events = vercelAiMessagesToEvents([
      { type: "message", role: "assistant", content: "Done" },
      { type: "tool", role: "tool", content: "result" },
    ]);
    expect(events[0].meta?.provider).toBe("vercel-ai");
    expect(events[1].kind).toBe("tool");
  });

  it("normalizes LangChain run traces", () => {
    const events = langChainRunsToEvents({
      id: "run-1",
      name: "planner",
      type: "chain",
      inputs: { question: "Q" },
      outputs: { answer: "A" },
    });
    expect(events[0].id).toBe("run-1");
    expect(events[0].kind).toBe("run");
  });

  it("normalizes MCP events", () => {
    const events = mcpEventsToRunEvents([
      { type: "message", message: "Working" },
      { type: "error", error: { message: "Failed" } },
    ]);
    expect(events[0].kind).toBe("log");
    expect(events[1].kind).toBe("error");
  });
});
