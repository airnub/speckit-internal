import fs from "fs-extra";
import path from "node:path";
import matter from "gray-matter";
import { createHash } from "node:crypto";
import { globby } from "globby";

import { getSpeckitVersion, hashSpecYaml } from "./provenance.js";
import { readManifest } from "./manifest.js";
import { loadCatalogLock, findLockEntry } from "./catalog.js";
import { resolveRepoRoot } from "./workspace.js";

type AuditOptions = {
  repoRoot?: string;
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
};

type AuditRow = {
  path: string;
  tool: string;
  bundle: string;
  specDigest: string;
  generatedAt: string;
  status: "OK" | "MISMATCH" | "MISSING";
  reasons: string[];
};

export async function auditProvenance(options: AuditOptions = {}): Promise<{ hasIssues: boolean }> {
  const repoRoot = await resolveRepoRoot(options.repoRoot || process.cwd());
  const stdout = options.stdout || process.stdout;
  const stderr = options.stderr || process.stderr;

  const toolInfo = await getSpeckitVersion(repoRoot);
  const specDigest = await hashSpecYaml(repoRoot);
  const manifest = await readManifest(repoRoot);
  const lockEntries = await loadCatalogLock(repoRoot);

  const manifestByPath = new Map<string, {
    runIndex: number;
    run: (typeof manifest.runs)[number];
    outputDigest: string;
  }>();

  manifest.runs.forEach((run, index) => {
    run.outputs.forEach(output => {
      const rel = output.path.replace(/\\/g, "/");
      manifestByPath.set(rel, { runIndex: index, run, outputDigest: output.digest });
    });
  });

  const docs = await globby([
    "docs/specs/**/*.md",
    "docs/specs/**/*.mdx",
    "docs/specs/**/*.markdown",
    "!docs/specs/templates/**"
  ], { cwd: repoRoot });

  const seenManifestPaths = new Set<string>();
  const rows: AuditRow[] = [];

  for (const relPath of docs.sort()) {
    const posixPath = relPath.replace(/\\/g, "/");
    const absPath = path.join(repoRoot, relPath);
    const row: AuditRow = {
      path: posixPath,
      tool: "-",
      bundle: "-",
      specDigest: "-",
      generatedAt: "-",
      status: "OK",
      reasons: []
    };

    let text: string;
    try {
      text = await fs.readFile(absPath, "utf8");
    } catch (error: any) {
      row.status = "MISSING";
      row.reasons.push(`Failed to read file: ${error?.message || error}`);
      rows.push(row);
      continue;
    }

    const digestHex = createHash("sha256").update(text).digest("hex");
    const digest = `sha256:${digestHex}`;

    const parsed = matter(text);
    const provenance = parsed.data?.speckit_provenance as any;

    if (!provenance || typeof provenance !== "object") {
      row.status = "MISSING";
      row.reasons.push("speckit_provenance missing");
      rows.push(row);
      continue;
    }

    const manifestEntry = manifestByPath.get(posixPath);
    if (manifestEntry) {
      seenManifestPaths.add(posixPath);
    } else {
      row.status = "MISMATCH";
      row.reasons.push("No manifest entry");
    }

    const toolVersion = String(provenance.tool_version ?? "");
    const toolCommit = String(provenance.tool_commit ?? "");
    const templateId = String(provenance.template?.id ?? "");
    const templateSha = String(provenance.template?.sha ?? "");
    const templateVersion = String(provenance.template?.version ?? "");
    const recordedSpecDigest = String(provenance.spec?.digest ?? "");
    const recordedSpecVersion = String(provenance.spec?.version ?? "");
    const generatedAt = String(provenance.generated_at ?? "");

    row.tool = toolVersion && toolCommit ? `${toolVersion}@${toolCommit}` : toolVersion || toolCommit || "-";
    row.bundle = templateId && templateSha ? `${templateId}@${templateSha}` : templateId || templateSha || "-";
    row.specDigest = recordedSpecDigest || "-";
    row.generatedAt = generatedAt || "-";

    if (provenance.tool !== "speckit") {
      row.status = "MISMATCH";
      row.reasons.push("tool not speckit");
    }

    if (toolVersion !== toolInfo.version) {
      row.status = "MISMATCH";
      row.reasons.push(`tool_version ${toolVersion} != ${toolInfo.version}`);
    }

    if (toolCommit !== toolInfo.commit) {
      row.status = "MISMATCH";
      row.reasons.push(`tool_commit ${toolCommit} != ${toolInfo.commit}`);
    }

    if (recordedSpecDigest !== specDigest) {
      row.status = "MISMATCH";
      row.reasons.push("spec.digest mismatch");
    }

    if (!recordedSpecVersion) {
      row.status = "MISMATCH";
      row.reasons.push("spec.version missing");
    }

    const lockEntry = templateId ? findLockEntry(lockEntries, templateId) : undefined;
    if (!lockEntry) {
      row.status = "MISMATCH";
      row.reasons.push(`No catalog.lock entry for template ${templateId}`);
    } else {
      if (templateSha !== lockEntry.sha) {
        row.status = "MISMATCH";
        row.reasons.push(`template.sha ${templateSha} != ${lockEntry.sha}`);
      }
      if (lockEntry.version && templateVersion !== lockEntry.version) {
        row.status = "MISMATCH";
        row.reasons.push(`template.version ${templateVersion} != ${lockEntry.version}`);
      }
    }

    if (manifestEntry) {
      if (manifestEntry.outputDigest !== digest) {
        row.status = "MISMATCH";
        row.reasons.push("digest mismatch vs manifest");
      }
      if (manifestEntry.run.template.id !== templateId) {
        row.status = "MISMATCH";
        row.reasons.push("manifest template.id mismatch");
      }
      if (manifestEntry.run.template.sha !== templateSha) {
        row.status = "MISMATCH";
        row.reasons.push("manifest template.sha mismatch");
      }
      if (manifestEntry.run.spec.digest !== recordedSpecDigest) {
        row.status = "MISMATCH";
        row.reasons.push("manifest spec.digest mismatch");
      }
      if (manifestEntry.run.spec.version && manifestEntry.run.spec.version !== recordedSpecVersion) {
        row.status = "MISMATCH";
        row.reasons.push("manifest spec.version mismatch");
      }
      if (manifestEntry.run.at && manifestEntry.run.at !== generatedAt) {
        row.status = "MISMATCH";
        row.reasons.push("generated_at mismatch");
      }
    }

    rows.push(row);
  }

  for (const [pathKey, entry] of manifestByPath.entries()) {
    if (!seenManifestPaths.has(pathKey)) {
      rows.push({
        path: pathKey,
        tool: "-",
        bundle: `${entry.run.template.id}@${entry.run.template.sha}`,
        specDigest: entry.run.spec.digest,
        generatedAt: entry.run.at,
        status: "MISSING",
        reasons: ["manifest entry has no file"]
      });
    }
  }

  rows.sort((a, b) => a.path.localeCompare(b.path));

  const table = buildTable(rows);
  stdout.write(`${table}\n`);

  const hasIssues = rows.some(row => row.status !== "OK");
  if (hasIssues) {
    stderr.write(`\n${rows.filter(row => row.status !== "OK").length} issue(s) detected.\n`);
  }

  return { hasIssues };
}

function buildTable(rows: AuditRow[]): string {
  const headers = ["doc path", "tool@commit", "bundle@sha", "spec.digest", "generated_at", "status"];
  const dataRows = rows.map(row => [
    row.path,
    row.tool,
    row.bundle,
    row.specDigest,
    row.generatedAt,
    formatStatus(row)
  ]);

  const allRows = [headers, ...dataRows];
  const widths = headers.map((_, idx) => Math.max(...allRows.map(r => r[idx].length)));

  return allRows
    .map((row, idx) => row.map((cell, cellIdx) => cell.padEnd(widths[cellIdx])).join(" | ") + (idx === 0 ? "\n" + widths.map(w => "-".repeat(w)).join("-+-") : ""))
    .join("\n");
}

function formatStatus(row: AuditRow): string {
  if (!row.reasons.length) return row.status;
  return `${row.status} (${row.reasons.join("; ")})`;
}
