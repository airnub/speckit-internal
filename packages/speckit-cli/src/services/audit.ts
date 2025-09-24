import path from "node:path";
import fs from "fs-extra";
import matter from "gray-matter";
import { globby } from "globby";
import {
  readManifest,
} from "./manifest.js";
import { getSpeckitVersion } from "./version.js";
import { hashSpecYaml, loadSpecYaml } from "./spec.js";
import { loadCatalogLock, loadBundle } from "./catalog.js";
import { createHash } from "node:crypto";

type AuditRow = {
  path: string;
  tool: string;
  bundle: string;
  spec: string;
  generatedAt: string;
  status: "OK" | "MISMATCH" | "MISSING";
};

export type AuditResult = {
  ok: boolean;
};

export async function auditGeneratedDocs(repoRoot: string, stdout: NodeJS.WritableStream, stderr: NodeJS.WritableStream): Promise<AuditResult> {
  const manifest = await readManifest(repoRoot);
  const speckitInfo = await getSpeckitVersion(repoRoot);
  const specDigest = await hashSpecYaml(repoRoot);
  const { data: specData } = await loadSpecYaml(repoRoot);
  const specVersion = specData?.spec?.meta?.version;
  const catalogEntries = await loadCatalogLock(repoRoot);
  const catalogById = new Map<string, { sha: string; version: string }>();
  for (const entry of catalogEntries) {
    const bundle = await loadBundle(repoRoot, entry);
    catalogById.set(entry.id, { sha: entry.sha, version: bundle.version });
  }

  const issues: string[] = [];
  if (!speckitInfo.commit || speckitInfo.commit === "unknown") {
    issues.push("Speckit git commit could not be determined");
  }
  if (manifest.speckit.version !== speckitInfo.version) {
    issues.push(
      `Manifest speckit.version (${manifest.speckit.version}) does not match current version (${speckitInfo.version})`
    );
  }
  if (manifest.speckit.commit !== speckitInfo.commit) {
    issues.push(
      `Manifest speckit.commit (${manifest.speckit.commit}) does not match current commit (${speckitInfo.commit})`
    );
  }
  const manifestByPath = new Map<
    string,
    {
      spec: { version: string; digest: string };
      template: { id: string; version: string; sha: string };
      at: string;
      digest: string;
      synced_with: { version: string; commit: string } | null;
    }
  >();
  for (const run of manifest.runs) {
    if (!run.synced_with) {
      issues.push(`Manifest run at ${run.at} missing synced_with metadata`);
    }
    for (const output of run.outputs) {
      manifestByPath.set(output.path, {
        spec: run.spec,
        template: run.template,
        at: run.at,
        digest: output.digest,
        synced_with: run.synced_with ?? null,
      });
    }
  }

  const files = await globby(["docs/specs/**/*", "!docs/specs/templates/**"], { cwd: repoRoot, dot: false, onlyFiles: true });

  const rows: AuditRow[] = [];
  const seenPaths = new Set<string>();

  for (const relPath of files) {
    seenPaths.add(relPath);
    const absPath = path.join(repoRoot, relPath);
    const raw = await fs.readFile(absPath, "utf8");
    const parsed = matter(raw);
    const prov = parsed.data?.speckit_provenance as any;

    if (!prov || typeof prov !== "object") {
      rows.push({
        path: relPath,
        tool: "--",
        bundle: "--",
        spec: "--",
        generatedAt: "--",
        status: "MISSING",
      });
      issues.push(`${relPath}: missing speckit_provenance front-matter`);
      continue;
    }

    const manifestEntry = manifestByPath.get(relPath);
    let status: AuditRow["status"] = "OK";

    const expectedToolVersion = manifestEntry?.synced_with?.version ?? manifest.speckit.version;
    const expectedToolCommit = manifestEntry?.synced_with?.commit ?? manifest.speckit.commit;
    const toolMatches = prov.tool_version === expectedToolVersion && prov.tool_commit === expectedToolCommit;
    if (!toolMatches) {
      status = "MISMATCH";
      issues.push(`${relPath}: tool version/commit mismatch`);
    }

    const currentToolMatches =
      prov.tool_version === speckitInfo.version && prov.tool_commit === speckitInfo.commit;
    if (!currentToolMatches) {
      status = "MISMATCH";
      issues.push(
        `${relPath}: provenance records ${prov.tool_version}@${prov.tool_commit}, expected ${speckitInfo.version}@${speckitInfo.commit}`
      );
    }

    if (!manifestEntry) {
      status = "MISMATCH";
      issues.push(`${relPath}: no manifest entry`);
    } else {
      if (manifestEntry.digest !== hashString(raw)) {
        status = "MISMATCH";
        issues.push(`${relPath}: content digest mismatch`);
      }

      if (manifestEntry.template.id !== prov.template?.id || manifestEntry.template.sha !== prov.template?.sha || manifestEntry.template.version !== prov.template?.version) {
        status = "MISMATCH";
        issues.push(`${relPath}: template metadata mismatch`);
      }

      if (manifestEntry.at !== prov.generated_at) {
        status = "MISMATCH";
        issues.push(`${relPath}: generated_at mismatch`);
      }

      if (manifestEntry.spec.version !== prov.spec?.version || manifestEntry.spec.digest !== prov.spec?.digest) {
        status = "MISMATCH";
        issues.push(`${relPath}: spec metadata mismatch`);
      }

      if (!manifestEntry.synced_with) {
        status = "MISMATCH";
        issues.push(`${relPath}: manifest synced_with missing`);
      } else if (
        manifestEntry.synced_with.version !== prov.tool_version ||
        manifestEntry.synced_with.commit !== prov.tool_commit
      ) {
        status = "MISMATCH";
        issues.push(`${relPath}: manifest synced_with does not match provenance`);
      } else if (
        manifestEntry.synced_with.version !== speckitInfo.version ||
        manifestEntry.synced_with.commit !== speckitInfo.commit
      ) {
        status = "MISMATCH";
        issues.push(`${relPath}: manifest synced_with ${manifestEntry.synced_with.version}@${manifestEntry.synced_with.commit} does not match current tool ${speckitInfo.version}@${speckitInfo.commit}`);
      }
    }

    if (specVersion && prov.spec?.version !== specVersion) {
      status = "MISMATCH";
      issues.push(`${relPath}: spec version does not match current spec`);
    }

    if (prov.spec?.digest !== specDigest) {
      status = "MISMATCH";
      issues.push(`${relPath}: spec digest does not match current spec`);
    }

    const catalog = catalogById.get(prov.template?.id ?? "");
    if (catalog) {
      if (catalog.sha !== prov.template?.sha || catalog.version !== prov.template?.version) {
        status = "MISMATCH";
        issues.push(`${relPath}: template sha/version drifted from catalog`);
      }
    }

    rows.push({
      path: relPath,
      tool: `${prov.tool_version ?? "?"}@${prov.tool_commit ?? "?"}`,
      bundle: prov.template ? `${prov.template.id ?? "?"}@${prov.template.sha ?? "?"}` : "--",
      spec: prov.spec?.digest ?? "--",
      generatedAt: prov.generated_at ?? "--",
      status,
    });
  }

  for (const [pathKey] of manifestByPath) {
    if (!seenPaths.has(pathKey)) {
      rows.push({
        path: pathKey,
        tool: "--",
        bundle: "--",
        spec: "--",
        generatedAt: "--",
        status: "MISSING",
      });
      issues.push(`${pathKey}: referenced in manifest but file missing`);
    }
  }

  printTable(rows, stdout);

  for (const issue of issues) {
    stderr.write(`- ${issue}\n`);
  }

  const ok = issues.length === 0 && rows.every(row => row.status === "OK");
  return { ok };
}

function printTable(rows: AuditRow[], stdout: NodeJS.WritableStream) {
  const headers = ["doc path", "tool@commit", "bundle@sha", "spec.digest", "generated_at", "status"];
  const table = [headers, ...rows.map(row => [row.path, row.tool, row.bundle, row.spec, row.generatedAt, row.status])];
  const widths = headers.map((_, col) => Math.max(...table.map(r => r[col].length)) + 2);

  for (const row of table) {
    const formatted = row
      .map((cell, idx) => cell.padEnd(widths[idx]))
      .join("");
    stdout.write(`${formatted}\n`);
  }
}

function hashString(content: string): string {
  const digest = createHash("sha256").update(content, "utf8").digest("hex");
  return `sha256:${digest}`;
}
