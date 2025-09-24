import path from "node:path";
import fs from "fs-extra";
import matter from "gray-matter";
import { globby } from "globby";
import { execa } from "execa";
import { parseManifest, readManifest } from "./manifest.js";
import { getSpeckitVersion, isLikelyCommitSha } from "./version.js";
import { hashSpecYaml, loadSpecModel } from "./spec.js";
import {
  loadCatalogLock,
  loadBundle,
  assertSpecCompatibility,
  assertSpeckitCompatibility,
  assertDialectCompatibility,
} from "./catalog.js";
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
  const { model, dialect } = await loadSpecModel(repoRoot);
  const specVersion = typeof model.version === "string" ? model.version.trim() : "";
  const catalogEntries = await loadCatalogLock(repoRoot);
  const catalogById = new Map<string, { sha: string; version: string }>();
  const issues: string[] = [];
  if (!specVersion) {
    issues.push("SpecModel.version is missing or empty");
  }
  for (const entry of catalogEntries) {
    const bundle = await loadBundle(repoRoot, entry);
    catalogById.set(entry.id, { sha: entry.sha, version: bundle.version });
    try {
      assertSpeckitCompatibility(speckitInfo.version, entry, bundle);
    } catch (error: any) {
      issues.push(
        `Bundle '${bundle.id}' speckit compatibility: ${error?.message ?? String(error)}`
      );
    }
    if (specVersion) {
      try {
        assertSpecCompatibility(specVersion, bundle);
      } catch (error: any) {
        issues.push(
          `Bundle '${bundle.id}' spec compatibility: ${error?.message ?? String(error)}`
        );
      }
    }
    try {
      assertDialectCompatibility(dialect, entry, bundle);
    } catch (error: any) {
      issues.push(
        `Bundle '${bundle.id}' dialect compatibility: ${error?.message ?? String(error)}`
      );
    }
    if (!isLikelyCommitSha(entry.synced_with.commit)) {
      issues.push(
        `Catalog lock entry '${entry.id}' has invalid synced_with.commit '${entry.synced_with.commit}'`
      );
    }
  }

  const currentCommitValid = isLikelyCommitSha(speckitInfo.commit);
  if (!currentCommitValid) {
    issues.push("Speckit git commit could not be determined");
  }
  const manifestCommitValid = isLikelyCommitSha(manifest.speckit.commit);
  if (!manifestCommitValid) {
    issues.push(`Manifest speckit.commit (${manifest.speckit.commit}) is not a valid git commit`);
  }
  if (manifest.speckit.version !== speckitInfo.version) {
    issues.push(
      `Manifest speckit.version (${manifest.speckit.version}) does not match current version (${speckitInfo.version})`
    );
  }

  const baselineRunCount = await loadBaselineRunCount(repoRoot);
  if (baselineRunCount !== null && manifest.runs.length < baselineRunCount) {
    issues.push(
      `generation-manifest runs[] shrank (${manifest.runs.length} < ${baselineRunCount}). The ledger must remain append-only.`
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
      dialect: { id: string; version: string } | null;
    }
  >();
  for (const run of manifest.runs) {
    if (!run.synced_with) {
      issues.push(`Manifest run at ${run.at} missing synced_with metadata`);
    } else if (!isLikelyCommitSha(run.synced_with.commit)) {
      issues.push(
        `Manifest run at ${run.at} has invalid synced_with.commit '${run.synced_with.commit}'`
      );
    }
    let runDialect: { id: string; version: string } | null = null;
    if (run.dialect && typeof run.dialect === "object") {
      const id = typeof run.dialect.id === "string" ? run.dialect.id.trim() : "";
      const version = typeof run.dialect.version === "string" ? run.dialect.version.trim() : "";
      if (id && version) {
        runDialect = { id, version };
      }
    }
    if (!runDialect) {
      issues.push(`Manifest run at ${run.at} missing dialect metadata`);
    } else if (runDialect.id !== dialect.id || runDialect.version !== dialect.version) {
      issues.push(
        `Manifest run at ${run.at} recorded dialect ${runDialect.id}@${runDialect.version} but spec uses ${dialect.id}@${dialect.version}`
      );
    }
    for (const output of run.outputs) {
      manifestByPath.set(output.path, {
        spec: run.spec,
        template: run.template,
        at: run.at,
        digest: output.digest,
        synced_with: run.synced_with ?? null,
        dialect: runDialect,
      });
    }
  }

  const hasCurrentRun = manifest.runs.some(
    run => run.spec?.digest === specDigest && run.spec?.version === specVersion
  );
  if (!hasCurrentRun) {
    issues.push(
      `generation-manifest.json missing run for spec ${specVersion || "unknown"} (${specDigest})`
    );
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

    const provDialectId =
      typeof prov.dialect?.id === "string" ? prov.dialect.id.trim() : "";
    const provDialectVersion =
      typeof prov.dialect?.version === "string" ? prov.dialect.version.trim() : "";
    const provDialect = provDialectId && provDialectVersion
      ? { id: provDialectId, version: provDialectVersion }
      : null;
    if (!provDialect) {
      status = "MISMATCH";
      issues.push(`${relPath}: provenance missing dialect metadata`);
    } else if (provDialect.id !== dialect.id || provDialect.version !== dialect.version) {
      status = "MISMATCH";
      issues.push(
        `${relPath}: dialect mismatch (found ${provDialect.id}@${provDialect.version}, expected ${dialect.id}@${dialect.version})`
      );
    }

    const provToolVersionRaw = typeof prov.tool_version === "string" ? prov.tool_version : "";
    const provToolVersion = provToolVersionRaw.trim();
    const provToolCommitRaw = typeof prov.tool_commit === "string" ? prov.tool_commit : "";
    const provToolCommit = provToolCommitRaw.trim();

    if (!isLikelyCommitSha(provToolCommit)) {
      status = "MISMATCH";
      const display = provToolCommit || provToolCommitRaw || "";
      issues.push(`${relPath}: provenance tool_commit '${display}' is not a valid git commit`);
    }

    const expectedToolVersionRaw = manifestEntry?.synced_with?.version ?? manifest.speckit.version;
    const expectedToolCommitRaw = manifestEntry?.synced_with?.commit ?? manifest.speckit.commit;
    const expectedToolVersion = typeof expectedToolVersionRaw === "string" ? expectedToolVersionRaw.trim() : "";
    const expectedToolCommit = typeof expectedToolCommitRaw === "string" ? expectedToolCommitRaw.trim() : "";

    const toolMatches = provToolVersion === expectedToolVersion && provToolCommit === expectedToolCommit;
    if (!toolMatches) {
      status = "MISMATCH";
      issues.push(
        `${relPath}: tool version/commit mismatch (found ${provToolVersion}@${provToolCommit}, expected ${expectedToolVersion}@${expectedToolCommit})`
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

      if (!manifestEntry.dialect) {
        status = "MISMATCH";
        issues.push(`${relPath}: manifest dialect metadata missing`);
      } else if (
        provDialect &&
        (manifestEntry.dialect.id !== provDialect.id || manifestEntry.dialect.version !== provDialect.version)
      ) {
        status = "MISMATCH";
        issues.push(`${relPath}: manifest dialect metadata mismatch`);
      }

      if (!manifestEntry.synced_with) {
        status = "MISMATCH";
        issues.push(`${relPath}: manifest synced_with missing`);
      } else if (!isLikelyCommitSha(manifestEntry.synced_with.commit)) {
        status = "MISMATCH";
        issues.push(
          `${relPath}: manifest synced_with commit '${manifestEntry.synced_with.commit}' is not a valid git commit`
        );
      } else if (
        manifestEntry.synced_with.version !== provToolVersion ||
        manifestEntry.synced_with.commit !== provToolCommit
      ) {
        status = "MISMATCH";
        issues.push(`${relPath}: manifest synced_with does not match provenance`);
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
      tool: `${provToolVersion || "?"}@${provToolCommit || "?"}`,
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

async function loadBaselineRunCount(repoRoot: string): Promise<number | null> {
  const refs = ["origin/main", "upstream/main", "main"];
  for (const ref of refs) {
    try {
      const { stdout } = await execa("git", ["show", `${ref}:.speckit/generation-manifest.json`], {
        cwd: repoRoot,
      });
      const manifest = parseManifest(stdout);
      return manifest.runs.length;
    } catch (error: any) {
      if (error?.exitCode === 128 || error?.exitCode === 129) {
        continue;
      }
      if (typeof error?.message === "string" && /not a valid object name/.test(error.message)) {
        continue;
      }
      throw error;
    }
  }
  return null;
}
