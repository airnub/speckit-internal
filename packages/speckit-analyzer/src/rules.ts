import YAML from "yaml";
import { z } from "zod";

import type { FailureRule, RunEvent } from "./types.js";

const FailureRuleEntrySchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  description: z.string().optional(),
  patterns: z.array(z.string()),
  remediation: z.string().optional(),
  hint: z.string().optional(),
});

export const FailureRulesSchema = z.object({
  rules: z.array(FailureRuleEntrySchema).default([]),
});

export type FailureRulesConfig = z.infer<typeof FailureRulesSchema>;

export function parseFailureRules(content: string): FailureRule[] {
  try {
    const parsed = FailureRulesSchema.parse(YAML.parse(content) ?? {});
    return parsed.rules.map((rule) => ({
      id: rule.id,
      label: rule.label ?? rule.id,
      description: rule.description,
      patterns: rule.patterns,
      remediation: rule.remediation,
      hint: rule.hint,
    }));
  } catch (error) {
    console.warn(`[analyzer:rules] Unable to parse failure rules: ${(error as Error).message}`);
    return [];
  }
}

export function applyFailureLabels(rules: FailureRule[], text: string, events: RunEvent[]): Set<string> {
  const labels = new Set<string>();
  const haystack = `${text}\n${events
    .map((event) => {
      const output = typeof event.output === "string" ? event.output : "";
      const input = typeof event.input === "string" ? event.input : "";
      const error = typeof event.error === "string" ? event.error : "";
      return `${output}\n${input}\n${error}`;
    })
    .join("\n")}`;
  for (const rule of rules) {
    for (const pattern of rule.patterns) {
      const regex = new RegExp(pattern, "i");
      if (regex.test(haystack)) {
        labels.add(rule.label ?? rule.id);
        break;
      }
    }
  }
  return labels;
}

export function labelsToHints(labels: Set<string>, rules: FailureRule[]): string[] {
  const hints: string[] = [];
  for (const label of labels) {
    const rule = rules.find((entry) => entry.label === label || entry.id === label);
    if (!rule) continue;
    if (rule.hint) {
      hints.push(rule.hint);
      continue;
    }
    if (rule.remediation) {
      hints.push(rule.remediation);
    }
  }
  return hints;
}
