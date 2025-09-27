import type { RunEvent } from "../types.js";

function ensureArray<T>(input: T | T[] | undefined | null): T[] {
  if (!input) return [];
  return Array.isArray(input) ? input : [input];
}

function toTimestamp(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value * (value < 1_000_000_000_000 ? 1000 : 1)).toISOString();
  }
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return new Date(numeric * (numeric < 1_000_000_000_000 ? 1000 : 1)).toISOString();
    }
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return new Date().toISOString();
}

function coerceText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => coerceText(item)).filter(Boolean).join("\n");
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.text === "string") {
      return record.text;
    }
    if (Array.isArray(record.content)) {
      return record.content.map((item) => coerceText(item)).filter(Boolean).join("\n");
    }
    if (typeof record.value === "string") {
      return record.value;
    }
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function createEvent(index: number, data: Partial<RunEvent>): RunEvent {
  return {
    id: data.id ?? `provider-${index + 1}`,
    timestamp: data.timestamp ?? new Date().toISOString(),
    kind: data.kind ?? "log",
    subtype: data.subtype,
    role: data.role,
    input: data.input,
    output: data.output,
    error: data.error,
    files_changed: data.files_changed,
    meta: data.meta,
  };
}

export interface OpenAiChatLog {
  id?: string;
  created?: number | string;
  model?: string;
  messages?: Array<{ role?: string; content?: unknown; created_at?: string | number }>;
  request?: { messages?: Array<{ role?: string; content?: unknown; created_at?: string | number }> };
  response?: { choices?: Array<{ message?: { role?: string; content?: unknown }; finish_reason?: string | null }> };
}

export function openAiChatCompletionsToEvents(log: OpenAiChatLog | OpenAiChatLog[]): RunEvent[] {
  const records = ensureArray(log);
  const events: RunEvent[] = [];
  let counter = 0;

  for (const record of records) {
    const baseMeta: Record<string, unknown> = {};
    if (record.model) {
      baseMeta.model = record.model;
    }
    const messages = ensureArray(record.request?.messages ?? record.messages);
    for (const message of messages) {
      const content = coerceText(message?.content);
      events.push(
        createEvent(counter++, {
          id: message?.created_at ? `openai-msg-${message.created_at}` : undefined,
          timestamp: message?.created_at ? toTimestamp(message.created_at) : toTimestamp(record.created),
          kind: "log",
          subtype: typeof message?.role === "string" ? message.role : "message",
          role: typeof message?.role === "string" ? message.role : undefined,
          input: message?.role === "user" ? content : undefined,
          output: message?.role === "assistant" ? content : undefined,
          meta: { provider: "openai", ...baseMeta },
        })
      );
    }

    const choices = ensureArray(record.response?.choices);
    for (const choice of choices) {
      const content = coerceText(choice?.message?.content);
      events.push(
        createEvent(counter++, {
          timestamp: toTimestamp(record.created),
          kind: "run",
          subtype: "assistant",
          role: choice?.message?.role ?? "assistant",
          output: content,
          meta: { provider: "openai", finish_reason: choice?.finish_reason ?? undefined, ...baseMeta },
        })
      );
    }
  }

  return events;
}

export interface AnthropicMessageLog {
  id?: string;
  model?: string;
  role?: string;
  content?: unknown;
  created_at?: string | number;
  usage?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export function anthropicMessagesToEvents(log: AnthropicMessageLog | AnthropicMessageLog[]): RunEvent[] {
  const messages = ensureArray(log);
  return messages.map((message, index) =>
    createEvent(index, {
      id: message.id,
      timestamp: toTimestamp(message.created_at),
      kind: message.role === "user" ? "plan" : "run",
      subtype: message.role ?? undefined,
      role: message.role ?? undefined,
      input: message.role === "user" ? coerceText(message.content) : undefined,
      output: message.role !== "user" ? coerceText(message.content) : undefined,
      meta: { provider: "anthropic", model: message.model, usage: message.usage, metadata: message.metadata },
    })
  );
}

export interface VercelAiLogEntry {
  type?: string;
  role?: string;
  content?: unknown;
  timestamp?: string | number;
  data?: Record<string, unknown>;
}

export function vercelAiMessagesToEvents(log: VercelAiLogEntry | VercelAiLogEntry[]): RunEvent[] {
  const entries = ensureArray(log);
  return entries.map((entry, index) =>
    createEvent(index, {
      timestamp: toTimestamp(entry.timestamp),
      kind: entry.type === "tool" ? "tool" : "log",
      subtype: entry.type ?? undefined,
      role: entry.role ?? undefined,
      output: coerceText(entry.content ?? entry.data?.content),
      meta: { provider: "vercel-ai", data: entry.data },
    })
  );
}

export interface LangChainRunLog {
  id?: string;
  name?: string;
  type?: string;
  start_time?: string | number;
  end_time?: string | number;
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  tags?: string[];
}

export function langChainRunsToEvents(log: LangChainRunLog | LangChainRunLog[]): RunEvent[] {
  const runs = ensureArray(log);
  return runs.map((run, index) =>
    createEvent(index, {
      id: run.id,
      timestamp: toTimestamp(run.start_time ?? run.end_time),
      kind: run.type === "tool" ? "tool" : run.type === "chain" ? "run" : "log",
      subtype: run.name ?? run.type,
      input: run.inputs ?? undefined,
      output: run.outputs ?? undefined,
      meta: { provider: "langchain", tags: run.tags },
    })
  );
}

export interface McpEventLog {
  type?: string;
  message?: string | { content?: unknown };
  error?: unknown;
  created_at?: string | number;
  metadata?: Record<string, unknown>;
}

export function mcpEventsToRunEvents(log: McpEventLog | McpEventLog[]): RunEvent[] {
  const records = ensureArray(log);
  return records.map((record, index) => {
    const kind = record.type === "tool" ? "tool" : record.type === "error" ? "error" : "log";
    const output = coerceText((record.message as any)?.content ?? record.message);
    return createEvent(index, {
      timestamp: toTimestamp(record.created_at),
      kind,
      output,
      error: kind === "error" ? record.error ?? output : undefined,
      meta: { provider: "mcp", metadata: record.metadata },
    });
  });
}
