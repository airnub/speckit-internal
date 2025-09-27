import { promises as fs } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { z } from "zod";
import type { RunEvent } from "./normalize.js";

export interface FailureRule {
  id: string;
  label: string;
  description?: string;
  patterns: string[];
  remediation?: string;
  hint?: string;
}

const FailureRulesSchema = z.object({
  rules: z
    .array(
      z.object({
        id: z.string(),
        label: z.string().optional(),
        description: z.string().optional(),
        patterns: z.array(z.string()),
        remediation: z.string().optional(),
        hint: z.string().optional(),
      })
    )
    .default([]),
});

export async function loadFailureRules(rootDir: string, artifactDir?: string): Promise<FailureRule[]> {
  const baseDir = artifactDir ?? path.join(rootDir, ".speckit");
  const rulesPath = path.join(baseDir, "failure-rules.yaml");
  try {
    const raw = await fs.readFile(rulesPath, "utf8");
    const parsed = FailureRulesSchema.parse(YAML.parse(raw));
    return parsed.rules.map((rule) => ({
      id: rule.id,
      label: rule.label ?? rule.id,
      description: rule.description,
      patterns: rule.patterns,
      remediation: rule.remediation,
      hint: rule.hint,
    }));
  } catch (error) {
    console.warn(`[rules] Unable to load failure rules from ${rulesPath}: ${(error as Error).message}`);
    return [];
  }
}

export function applyFailureLabels(
  rules: FailureRule[],
  text: string,
  events: RunEvent[]
): Set<string> {
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
