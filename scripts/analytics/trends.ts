import { execSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildLabelTrendSeries,
  rollingAverageSeries,
  sparkline,
  type LabelDailyRecord,
} from "@speckit/analyzer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const DOC_PATH = path.join(ROOT, "docs", "agent-trends.md");
const METRICS_PATH = ".speckit/metrics.json";
const REQUIREMENTS_PATH = ".speckit/requirements.jsonl";
const WINDOW_DAYS = 7;
const TOP_LABEL_LIMIT = 10;
const SPARKLINE_LENGTH = 14;

type GitCommit = {
  hash: string;
  date: string; // YYYY-MM-DD
};

type MetricsSnapshot = {
  labels?: unknown;
};

type RequirementRecord = {
  category?: unknown;
  labels?: unknown;
};

function runGit(command: string): string | null {
  try {
    const output = execSync(`git ${command}`, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return output.trim();
  } catch {
    return null;
  }
}

function parseGitHistory(): GitCommit[] {
  const history = runGit(`log --pretty=format:%H|%ct -- ${METRICS_PATH}`);
  if (!history) return [];
  return history
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [hash, timestamp] = line.split("|");
      if (!hash || !timestamp) return null;
      const seconds = Number(timestamp);
      if (!Number.isFinite(seconds)) return null;
      const date = new Date(seconds * 1000).toISOString().slice(0, 10);
      return { hash, date } satisfies GitCommit;
    })
    .filter((entry): entry is GitCommit => entry !== null);
}

function parseMetrics(content: string | null): string[] {
  if (!content) return [];
  try {
    const parsed = JSON.parse(content) as MetricsSnapshot;
    if (!parsed || typeof parsed !== "object") return [];
    const rawLabels = Array.isArray(parsed.labels) ? parsed.labels : [];
    return rawLabels.filter((label): label is string => typeof label === "string" && label.trim().length > 0);
  } catch {
    return [];
  }
}

function parseRequirementLabels(content: string | null): string[] {
  if (!content) return [];
  const labels: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const record = JSON.parse(trimmed) as RequirementRecord;
      if (Array.isArray(record.labels)) {
        for (const label of record.labels) {
          if (typeof label === "string" && label.trim().length > 0) {
            labels.push(label.trim());
          }
        }
      }
      if (typeof record.category === "string" && record.category.trim().length > 0) {
        labels.push(`category:${record.category.trim()}`);
      }
    } catch {
      continue;
    }
  }
  return labels;
}

function collectLabelRecords(): LabelDailyRecord[] {
  const commits = parseGitHistory();
  if (commits.length === 0) {
    return [];
  }
  const daily = new Map<string, Map<string, number>>();
  for (const commit of commits) {
    const metricsContent = runGit(`show ${commit.hash}:${METRICS_PATH}`);
    const requirementsContent = runGit(`show ${commit.hash}:${REQUIREMENTS_PATH}`);
    const labels = [...parseMetrics(metricsContent), ...parseRequirementLabels(requirementsContent)];
    if (labels.length === 0) continue;
    const map = daily.get(commit.date) ?? new Map<string, number>();
    for (const label of labels) {
      map.set(label, (map.get(label) ?? 0) + 1);
    }
    daily.set(commit.date, map);
  }
  return Array.from(daily.entries())
    .map(([date, labelMap]) => ({
      date,
      labels: Object.fromEntries(labelMap),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function formatNumber(value: number): string {
  return value.toFixed(2);
}

function buildReport(records: LabelDailyRecord[]): string {
  const lines: string[] = [];
  lines.push("# Agent Label Trends");
  lines.push("");
  lines.push(`Generated on ${new Date().toISOString()}.`);
  lines.push("");
  if (records.length === 0) {
    lines.push(
      "No historical label data was found in `.speckit/metrics.json` or `requirements.jsonl`. Upload analyzer artifacts to begin tracking trends."
    );
    return `${lines.join("\n")}\n`;
  }
  const firstDate = records[0]?.date;
  const lastDate = records[records.length - 1]?.date;
  if (firstDate && lastDate) {
    lines.push(`Data range: **${firstDate} → ${lastDate}**.`);
    lines.push("");
  }
  const series = buildLabelTrendSeries(records);
  const entries = Object.entries(series)
    .map(([label, points]) => {
      const totals = points.reduce((sum, point) => sum + point.value, 0);
      const averaged = rollingAverageSeries(points, WINDOW_DAYS);
      const latestAverage = averaged.length > 0 ? averaged[averaged.length - 1]!.value : 0;
      const spark = sparkline(
        averaged.map((point) => point.value),
        { length: SPARKLINE_LENGTH }
      );
      return {
        label,
        total: totals,
        latestAverage,
        spark,
      };
    })
    .filter((entry) => entry.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, TOP_LABEL_LIMIT);

  if (entries.length === 0) {
    lines.push("No labels have been recorded yet.");
    return `${lines.join("\n")}\n`;
  }

  lines.push("| Label | Total Count | 7-day Avg | Sparkline |");
  lines.push("| --- | ---: | ---: | --- |");
  for (const entry of entries) {
    lines.push(`| \`${entry.label}\` | ${entry.total.toLocaleString()} | ${formatNumber(entry.latestAverage)} | ${entry.spark} |`);
  }
  return `${lines.join("\n")}\n`;
}

async function main(): Promise<void> {
  const records = collectLabelRecords();
  const report = buildReport(records);
  await fs.mkdir(path.dirname(DOC_PATH), { recursive: true });
  await fs.writeFile(DOC_PATH, report, "utf8");
}

main().catch((error) => {
  console.error("Failed to generate agent trends report:", error);
  process.exitCode = 1;
});

