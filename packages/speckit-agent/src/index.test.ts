import { test } from "node:test";
import assert from "node:assert/strict";

import { __setOpenAiModuleLoader, generatePatch, type AgentConfig } from "./index.js";

test("generatePatch parses OpenAI responses output_text", async t => {
  const createMock = t.mock.fn(async (_request: any) => ({
    output_text: JSON.stringify({
      summary: "Plan summary",
      rationale: "Because ",
      patch: "diff\n"
    }),
    output: []
  }));

  __setOpenAiModuleLoader(async () => ({
    OpenAI: class {
      responses = { create: createMock };
      constructor(public options: any) {}
    }
  }));
  t.after(() => __setOpenAiModuleLoader());

  const cfg: AgentConfig = { provider: "openai", openai: { apiKey: "test-key", model: "test-model" } };
  const plan = await generatePatch(cfg, "Add feature", "Context info");

  assert.strictEqual(plan.summary, "Plan summary");
  assert.strictEqual(plan.patch, "diff");
  assert.strictEqual(plan.rationale, "Because");
  assert.strictEqual(createMock.mock.calls.length, 1);

  const request = createMock.mock.calls[0].arguments[0];
  assert.strictEqual(request.model, "test-model");
  assert.strictEqual(request.temperature, 0);
  assert.deepStrictEqual(request.response_format, { type: "json_object" });
  assert.ok(Array.isArray(request.input));
  assert.strictEqual(request.input[0]?.role, "system");
  assert.strictEqual(request.input[1]?.role, "user");
});

test("generatePatch falls back to response output text segments", async t => {
  const createMock = t.mock.fn(async () => ({
    output_text: "",
    output: [
      {
        id: "msg_1",
        type: "message",
        role: "assistant",
        status: "completed",
        content: [
          {
            type: "output_text",
            text: JSON.stringify({ summary: "Alt summary", patch: "patch\n" }),
            annotations: []
          }
        ]
      }
    ]
  }));

  __setOpenAiModuleLoader(async () => ({
    OpenAI: class {
      responses = { create: createMock };
      constructor(public options: any) {}
    }
  }));
  t.after(() => __setOpenAiModuleLoader());

  const cfg: AgentConfig = { provider: "openai", openai: { apiKey: "sk", model: "model" } };
  const plan = await generatePatch(cfg, "Do something");

  assert.strictEqual(plan.summary, "Alt summary");
  assert.strictEqual(plan.patch, "patch");
  assert.strictEqual(plan.rationale, undefined);
});

test("generatePatch surfaces refusal responses", async t => {
  const createMock = t.mock.fn(async () => ({
    output_text: "",
    output: [
      {
        id: "msg_2",
        type: "message",
        role: "assistant",
        status: "incomplete",
        content: [
          {
            type: "refusal",
            refusal: "I cannot help with that request."
          }
        ]
      }
    ]
  }));

  __setOpenAiModuleLoader(async () => ({
    OpenAI: class {
      responses = { create: createMock };
      constructor(public options: any) {}
    }
  }));
  t.after(() => __setOpenAiModuleLoader());

  const cfg: AgentConfig = { provider: "openai", openai: { apiKey: "sk", model: "model" } };
  await assert.rejects(() => generatePatch(cfg, "Do forbidden thing"), error => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /OpenAI request refused/);
    assert.match(error.message, /cannot help/);
    return true;
  });

  assert.strictEqual(createMock.mock.calls.length, 1);
});
