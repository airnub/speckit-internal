import path from "node:path";
import fs from "fs-extra";
import nunjucks from "nunjucks";
import { parse as parseYaml } from "yaml";
import { execa } from "execa";
import type { HipaaCatalog, HipaaCategory } from "@speckit/adapter-hipaa";
import {
  HIPAA_SECURITY_RULE_FILE,
  loadCatalog as loadHipaaCatalog,
} from "@speckit/adapter-hipaa";
import { loadSpecYaml } from "./spec.js";

const HIPAA_BUNDLE_ID = "compliance/hipaa";
const HIPAA_POLICY_QUERY = "data.hipaa.tech";
const HIPAA_EVIDENCE_FILE = path.join("docs", "internal", "security", "hipaa-technical-safeguards.yaml");
const REQUIRED_TECHNICAL_CONTROLS = [
  { key: "tls", safeguardId: "164.312(e)(1)" },
  { key: "encryption_at_rest", safeguardId: "164.312(a)(2)(iv)" },
  { key: "unique_user_ids", safeguardId: "164.312(a)(2)(i)" },
  { key: "audit_logging", safeguardId: "164.312(c)(1)" },
] as const;

type BundleOutput = { id: string; from: string; to: string };

type ComplianceBundle = {
  dir: string;
  outputs: BundleOutput[];
};

type CompliancePlanResult = {
  outputs: { path: string; changed: boolean }[];
};

type ControlStatus = "pass" | "fail" | "manual";

type ControlResult = {
  key: string;
  requirement_id: string;
  title: string;
  hipaa_citation: string;
  nist_800_53: string[];
  category: "technical";
  status: ControlStatus;
  evidence?: string;
  reason?: string;
};

type VerifySummary = {
  pass: number;
  fail: number;
  manual: number;
};

type OpaResult = {
  deny: string[];
  manual: string[];
};

type ComplianceVerifyResult = {
  controls: ControlResult[];
  summary: VerifySummary;
  opa: OpaResult;
  reportPath: string;
  markdownPath: string;
};

type TechnicalEvidenceEntry = {
  enforced?: boolean;
  evidence?: string;
  notes?: string;
};

type HipaaSpecConfig = {
  rules?: string[];
  scope?: string[];
};

export async function generateHipaaPlan(
  repoRoot: string,
  stdout?: NodeJS.WritableStream
): Promise<CompliancePlanResult> {
  const bundle = await loadHipaaBundle(repoRoot);
  const catalogPath = path.join(repoRoot, "packages", "adapter-hipaa", "data", HIPAA_SECURITY_RULE_FILE);
  const catalog = await loadHipaaCatalog(catalogPath);
  const { data: specData } = await loadSpecYaml(repoRoot);
  const hipaaConfig = extractHipaaConfig(specData);

  const context = buildPlanContext(catalog, hipaaConfig);
  const env = nunjucks.configure(bundle.dir, { autoescape: false, throwOnUndefined: true, noCache: true });

  const outputs: { path: string; changed: boolean }[] = [];

  for (const output of bundle.outputs) {
    const rendered = env.render(output.from, context);
    const targetRel = env.renderString(output.to, context).trim();
    if (!targetRel) {
      throw new Error(`Bundle '${HIPAA_BUNDLE_ID}' produced an empty target path for output '${output.id}'`);
    }
    const targetPath = path.join(repoRoot, targetRel);
    const previous = await readIfExists(targetPath);
    const normalised = normalise(rendered);
    const changed = previous === null || normalise(previous) !== normalised;

    if (changed) {
      await fs.ensureDir(path.dirname(targetPath));
      await fs.writeFile(targetPath, ensureTrailingNewline(normalised), "utf8");
      stdout?.write(`Updated ${targetRel}\n`);
    }

    outputs.push({ path: targetRel, changed });
  }

  return { outputs };
}

export async function verifyHipaaCompliance(
  repoRoot: string,
  stdout?: NodeJS.WritableStream
): Promise<ComplianceVerifyResult> {
  const catalogPath = path.join(repoRoot, "packages", "adapter-hipaa", "data", HIPAA_SECURITY_RULE_FILE);
  const catalog = await loadHipaaCatalog(catalogPath);
  const controls = buildTechnicalControlResults(repoRoot, catalog);

  const summary = summariseControls(controls);
  const opa = await evaluateHipaaPolicies(repoRoot, controls);
  const generatedAt = new Date().toISOString();

  const report = {
    framework: "hipaa",
    generated_at: generatedAt,
    controls,
    summary,
    opa,
  };

  const reportDir = path.join(repoRoot, ".speckit");
  await fs.ensureDir(reportDir);

  const reportPath = path.join(reportDir, "compliance-report.json");
  await fs.writeJson(reportPath, report, { spaces: 2 });

  const markdownPath = path.join(reportDir, "compliance-report.md");
  const markdown = renderComplianceMarkdown(report);
  await fs.writeFile(markdownPath, ensureTrailingNewline(markdown), "utf8");

  stdout?.write(`Wrote ${path.relative(repoRoot, reportPath)}\n`);
  stdout?.write(`Wrote ${path.relative(repoRoot, markdownPath)}\n`);

  return { controls, summary, opa, reportPath, markdownPath };
}

function buildPlanContext(catalog: HipaaCatalog, hipaaConfig: HipaaSpecConfig | null) {
  const safeCatalog: HipaaCatalog = {
    ...catalog,
    meta: { ...catalog.meta, sources: catalog.meta.sources ?? [] },
    categories: catalog.categories.map(category => ({ ...category })),
  };

  const administrative = findCategory(catalog, "administrative");
  const technical = findCategory(catalog, "technical");

  return {
    hipaa: {
      catalog: safeCatalog,
      scope: hipaaConfig?.scope ?? [],
      admin_safeguards: buildAdminRoleRows(administrative),
      admin_controls: administrative ? administrative.safeguards.map(s => `§${s.id}`) : [],
      technical_controls: technical ? technical.safeguards.map(s => `${s.title} (§${s.id})`) : [],
      technical_refs: technical ? technical.safeguards.map(s => `§${s.id}`) : [],
    },
    compliance: hipaaConfig,
  };
}

function buildAdminRoleRows(category: HipaaCategory | null): {
  role: string;
  references: string;
  notes: string;
}[] {
  if (!category) {
    return [];
  }

  return category.safeguards.map(safeguard => {
    const citation = `§${safeguard.id}`;
    const reference = `${citation}; NIST ${safeguard.nist80053.join(", ")}`;
    let role = "Administrative Owner";
    let notes = safeguard.summary;

    switch (safeguard.id) {
      case "164.308(a)(1)(ii)(A)":
        role = "Security & Privacy Officer";
        notes = "Owns recurring risk analysis and tracks mitigation progress.";
        break;
      case "164.308(a)(3)(ii)(B)":
        role = "People Operations / HR";
        notes = "Validates workforce clearances and revokes stale access.";
        break;
      default:
        break;
    }

    return { role, references: reference, notes };
  });
}

function findCategory(catalog: HipaaCatalog, id: string): HipaaCategory | null {
  return catalog.categories.find(category => category.id === id) ?? null;
}

function extractHipaaConfig(data: any): HipaaSpecConfig | null {
  const frameworks: any[] = Array.isArray(data?.compliance?.frameworks)
    ? data.compliance.frameworks
    : [];
  for (const framework of frameworks) {
    if (framework?.id === "hipaa") {
      return {
        rules: Array.isArray(framework.rules) ? framework.rules : undefined,
        scope: Array.isArray(framework.scope) ? framework.scope : undefined,
      };
    }
  }
  return null;
}

function summariseControls(controls: ControlResult[]): VerifySummary {
  return controls.reduce(
    (summary, control) => {
      summary[control.status] += 1;
      return summary;
    },
    { pass: 0, fail: 0, manual: 0 } satisfies VerifySummary
  );
}

function buildTechnicalControlResults(repoRoot: string, catalog: HipaaCatalog): ControlResult[] {
  const evidence = loadTechnicalEvidence(repoRoot);
  const technical = findCategory(catalog, "technical");
  if (!technical) {
    throw new Error("HIPAA catalog is missing the technical safeguards category");
  }

  return REQUIRED_TECHNICAL_CONTROLS.map(entry => {
    const safeguard = technical.safeguards.find(item => item.id === entry.safeguardId);
    if (!safeguard) {
      throw new Error(`HIPAA catalog missing safeguard ${entry.safeguardId}`);
    }
    const citation = `45 CFR §${safeguard.id}`;
    const requirementId = buildRequirementId("technical", safeguard.id);
    const evidenceEntry = evidence[entry.key] ?? {};

    const status: ControlStatus = evidenceEntry.enforced === true
      ? "pass"
      : evidenceEntry.enforced === false
      ? "fail"
      : "manual";

    let reason: string | undefined;
    if (status === "fail") {
      reason = evidenceEntry.notes ?? "Control evidence indicates safeguard is not enforced.";
    } else if (status === "manual") {
      reason = evidenceEntry.notes ?? "Manual review required to confirm safeguard implementation.";
    }

    return {
      key: entry.key,
      requirement_id: requirementId,
      title: safeguard.title,
      hipaa_citation: citation,
      nist_800_53: [...safeguard.nist80053],
      category: "technical",
      status,
      evidence: evidenceEntry.evidence,
      reason,
    };
  });
}

function loadTechnicalEvidence(repoRoot: string): Record<string, TechnicalEvidenceEntry> {
  const filePath = path.join(repoRoot, HIPAA_EVIDENCE_FILE);
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = parseYaml(raw) as any;
  const safeguards = parsed?.technical_safeguards;
  if (!safeguards || typeof safeguards !== "object") {
    return {};
  }
  const evidence: Record<string, TechnicalEvidenceEntry> = {};
  for (const [key, value] of Object.entries(safeguards)) {
    if (value && typeof value === "object") {
      const entry = value as Record<string, unknown>;
      evidence[key] = {
        enforced: typeof entry.enforced === "boolean" ? entry.enforced : undefined,
        evidence: typeof entry.evidence === "string" ? entry.evidence : undefined,
        notes: typeof entry.notes === "string" ? entry.notes : undefined,
      };
    }
  }
  return evidence;
}

async function evaluateHipaaPolicies(repoRoot: string, controls: ControlResult[]): Promise<OpaResult> {
  const opaBinary = await findOpaBinary(repoRoot);
  const policyDir = path.join(repoRoot, "policy", "opa", "hipaa");

  if (!opaBinary || !(await fs.pathExists(opaBinary))) {
    return evaluatePoliciesFallback(controls);
  }
  const inputPayload = {
    controls: controls.map(control => ({
      key: control.key,
      requirement_id: control.requirement_id,
      category: control.category,
      status: control.status,
      reason: control.reason ?? "",
    })),
  };

  try {
    const { stdout } = await execa(opaBinary, [
      "eval",
      "--format=json",
      "--data",
      policyDir,
      "--input",
      "-",
      HIPAA_POLICY_QUERY,
    ], {
      input: JSON.stringify(inputPayload),
      cwd: repoRoot,
    });

    const parsed = JSON.parse(stdout);
    const result = Array.isArray(parsed.result) && parsed.result.length > 0 ? parsed.result[0].expressions?.[0]?.value : null;
    const deny = Array.isArray(result?.deny) ? result.deny.map(String) : [];
    const manual = Array.isArray(result?.manual) ? result.manual.map(String) : [];
    return { deny, manual };
  } catch {
    return evaluatePoliciesFallback(controls);
  }
}

async function findOpaBinary(repoRoot: string): Promise<string | null> {
  const candidates = [
    process.env.OPA_BIN,
    path.join(repoRoot, "node_modules", ".bin", "opa"),
    path.join(repoRoot, "packages", "speckit-cli", "node_modules", ".bin", "opa"),
  ].filter((candidate): candidate is string => typeof candidate === "string" && candidate.length > 0);

  for (const candidate of candidates) {
    if (await fs.pathExists(candidate)) {
      return candidate;
    }
  }
  return null;
}

function evaluatePoliciesFallback(controls: ControlResult[]): OpaResult {
  const deny: string[] = [];
  const manual: string[] = [];

  for (const required of REQUIRED_TECHNICAL_CONTROLS) {
    const control = controls.find(candidate => candidate.key === required.key);
    if (!control) {
      deny.push(`Missing control evidence for '${required.key}'`);
      continue;
    }
    if (control.status === "fail") {
      deny.push(`${control.requirement_id} failed: ${control.reason ?? "Safeguard not enforced"}`);
      continue;
    }
    if (control.status === "manual") {
      manual.push(`${control.requirement_id} requires manual review`);
    }
  }

  return { deny, manual };
}

function renderComplianceMarkdown(report: {
  generated_at: string;
  controls: ControlResult[];
  summary: VerifySummary;
  opa: OpaResult;
}): string {
  const lines: string[] = [];
  lines.push("# HIPAA Compliance Verification");
  lines.push("");
  lines.push(`Generated: ${report.generated_at}`);
  lines.push(
    `Summary: ✅ ${report.summary.pass} · ❌ ${report.summary.fail} · 📝 ${report.summary.manual}`
  );
  if (report.opa.deny.length) {
    lines.push("");
    lines.push("OPA Deny:");
    for (const item of report.opa.deny) {
      lines.push(`- ${item}`);
    }
  }
  if (report.opa.manual.length) {
    lines.push("");
    lines.push("OPA Manual Review:");
    for (const item of report.opa.manual) {
      lines.push(`- ${item}`);
    }
  }

  lines.push("");
  lines.push("| Control | HIPAA Citation | NIST SP 800-53 Rev. 5 | Status | Evidence |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const control of report.controls) {
    const statusSymbol = control.status === "pass" ? "✅" : control.status === "fail" ? "❌" : "📝";
    const evidence = control.evidence ? control.evidence.replace(/\s+/g, " ").trim() : "Manual evidence required";
    lines.push(
      `| ${control.title} | ${control.hipaa_citation} | ${control.nist_800_53.join(", ")} | ${statusSymbol} | ${evidence} |`
    );
  }

  return lines.join("\n");
}

async function loadHipaaBundle(repoRoot: string): Promise<ComplianceBundle> {
  const bundleDir = path.join(repoRoot, ".speckit", "catalog", "specs", HIPAA_BUNDLE_ID);
  const bundlePath = path.join(bundleDir, "bundle.yaml");
  if (!(await fs.pathExists(bundlePath))) {
    throw new Error(`HIPAA bundle missing at ${path.relative(repoRoot, bundlePath)}`);
  }
  const raw = await fs.readFile(bundlePath, "utf8");
  const data = parseYaml(raw) as any;
  const outputs: BundleOutput[] = Array.isArray(data?.outputs)
    ? data.outputs.map((item: any) => ({
        id: String(item.id),
        from: String(item.from),
        to: String(item.to),
      }))
    : [];
  if (!outputs.length) {
    throw new Error(`HIPAA bundle at ${path.relative(repoRoot, bundlePath)} has no outputs defined`);
  }
  return { dir: bundleDir, outputs };
}

function normalise(value: string): string {
  return value.replace(/\r\n/g, "\n");
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

async function readIfExists(filePath: string): Promise<string | null> {
  if (!(await fs.pathExists(filePath))) {
    return null;
  }
  return await fs.readFile(filePath, "utf8");
}

function buildRequirementId(categoryId: string, safeguardId: string): string {
  return `hipaa.security.${normaliseTagId(categoryId)}.${normaliseTagId(safeguardId)}`;
}

function normaliseTagId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
