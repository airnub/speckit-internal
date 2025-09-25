import path from "node:path";
import type { Writable } from "node:stream";
import fs from "fs-extra";
import nunjucks from "nunjucks";
import { parse } from "yaml";
import { z } from "zod";
import { loadToModel as loadEduUsCatalog } from "@speckit/adapter-edu-us";
import type { Requirement } from "@speckit/engine";
import { BundleSchema } from "../catalog.js";
import { loadSpecYaml } from "../spec.js";

const EDU_US_BUNDLE_RELATIVE = path.join(".speckit", "catalog", "specs", "compliance", "edu-us");
const EDU_US_DATA_FILENAME = "edu-us.yaml";
const EDU_US_EVIDENCE_FILENAME = "edu-us-controls.yaml";

const EvidenceSchema = z
  .object({
    project: z
      .object({
        audience_under_13: z.boolean().optional(),
        verifiable_parental_consent: z.string().optional(),
        data_retention_limit: z.string().optional(),
        e_rate_eligible: z.boolean().optional(),
        filtering_policy_document: z.string().optional(),
        monitoring_policy_document: z.string().optional(),
        integrates_with_ny_districts: z.boolean().optional(),
        ny_data_privacy_policy_url: z.string().optional(),
        ny_parent_bill_of_rights_url: z.string().optional(),
      })
      .default({}),
    controls: z
      .record(
        z
          .object({
            status: z.string().optional(),
            evidence: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

const MetaRequirementSchema = z.object({
  id: z.string(),
  requirement_id: z.string(),
  title: z.string(),
  citation: z.string().optional(),
  description: z.string().optional(),
});

const ReferenceLinkSchema = z.object({
  title: z.string(),
  url: z.string().url(),
});

const EduUsMetaSchema = z
  .object({
    title: z.string().optional(),
    frameworks: z.array(
      z.object({
        id: z.string(),
        key: z.string(),
        name: z.string(),
        authority: z.string().optional(),
        citation: z.string().optional(),
        requirements: z.array(MetaRequirementSchema),
      }),
    ),
    states: z.array(
      z.object({
        id: z.string(),
        key: z.string(),
        name: z.string(),
        authority: z.string().optional(),
        citation: z.string().optional(),
        url: z.string().optional(),
        requirements: z.array(MetaRequirementSchema),
      }),
    ),
    references: z
      .object({
        ferpa: ReferenceLinkSchema,
        coppa: ReferenceLinkSchema,
        cipa: ReferenceLinkSchema,
        ppra: ReferenceLinkSchema,
      })
      .optional(),
  })
  .passthrough();

type EvidenceStatus = "pass" | "fail" | "manual";

type EvidenceEntry = { status: EvidenceStatus; evidence?: string };

type EvidenceMap = Record<string, EvidenceEntry>;

type ProjectEvidence = z.infer<typeof EvidenceSchema>["project"];

type GenerateOptions = { repoRoot: string; stdout?: Writable; overlays?: string[] };

type VerifyOptions = { repoRoot: string; stdout?: Writable; overlays?: string[] };

type PolicyCheck = {
  id: string;
  title: string;
  passed: boolean;
  details: string;
  policy: string;
};

type ComplianceReport = {
  framework: "edu-us";
  generated_at: string;
  spec: ReturnType<typeof summariseSpec>;
  meta: {
    version: string;
    title?: string;
    frameworks: unknown;
    states: unknown;
  };
  summary: {
    total: number;
    passed: number;
    failed: number;
    manual: number;
  };
  requirements: {
    requirementId: string;
    title: string;
    description?: string;
    tags: string[];
    status: EvidenceStatus;
    evidence?: string;
  }[];
  policy_checks: PolicyCheck[];
  opa_policies: string[];
};

export async function generateEduUsPlan(options: GenerateOptions) {
  const repoRoot = options.repoRoot;
  const overlays = new Set(normaliseOverlays(options.overlays));
  const bundleDir = path.join(repoRoot, EDU_US_BUNDLE_RELATIVE);
  const bundle = await loadEduUsBundle(bundleDir);
  const specData = await loadSpecYaml(repoRoot);
  const { model } = await loadEduUsModel(bundleDir);

  const context = {
    spec: specData.data,
    edu: {
      model,
      selected_overlays: Array.from(overlays),
    },
  };

  const env = nunjucks.configure(bundle.dir, {
    autoescape: false,
    throwOnUndefined: true,
    noCache: true,
  });

  for (const output of bundle.outputs) {
    const overlayId = extractOverlayFromOutput(output.id);
    if (overlayId) {
      if (!overlays.has(overlayId)) {
        continue;
      }
    }
    const rendered = env.render(output.from, context);
    const targetPath = path.join(repoRoot, output.to);
    await fs.ensureDir(path.dirname(targetPath));
    const previous = (await fs.pathExists(targetPath)) ? await fs.readFile(targetPath, "utf8") : null;
    await fs.writeFile(targetPath, rendered, "utf8");
    if (options.stdout) {
      const changed = previous === null || normaliseText(previous) !== normaliseText(rendered);
      const label = overlayId ? `${output.to} (overlay:${overlayId})` : output.to;
      options.stdout.write(`${changed ? "Updated" : "Unchanged"} ${label}\n`);
    }
  }
}

export async function verifyEduUsCompliance(options: VerifyOptions) {
  const repoRoot = options.repoRoot;
  const bundleDir = path.join(repoRoot, EDU_US_BUNDLE_RELATIVE);
  const bundle = await loadEduUsBundle(bundleDir);
  const specData = await loadSpecYaml(repoRoot);
  const { model, meta } = await loadEduUsModel(bundleDir);
  const evidence = await loadEvidence(repoRoot);

  const requestedOverlays = new Set(normaliseOverlays(options.overlays));
  const overlays = determineOverlays(model.requirements, evidence.map, evidence.project, requestedOverlays);

  const evaluation = evaluateRequirements(model.requirements, evidence.map, overlays);
  const policyChecks = evaluatePolicyChecks(evidence.project, overlays);

  const report: ComplianceReport = {
    framework: "edu-us",
    generated_at: new Date().toISOString(),
    spec: summariseSpec(specData.data),
    meta: {
      version: model.version,
      title: typeof meta.title === "string" ? meta.title : undefined,
      frameworks: meta.frameworks,
      states: meta.states,
    },
    summary: evaluation.summary,
    requirements: evaluation.requirements,
    policy_checks: policyChecks,
    opa_policies: [
      path.join("policy", "opa", "edu-us", "coppa.rego"),
      path.join("policy", "opa", "edu-us", "cipa.rego"),
      path.join("policy", "opa", "edu-us", "ny-2d.rego"),
    ],
  };

  const reportPath = path.join(repoRoot, ".speckit", "compliance-report.json");
  const summaryPath = path.join(repoRoot, ".speckit", "compliance-report.md");
  await fs.ensureDir(path.dirname(reportPath));
  await fs.writeJson(reportPath, report, { spaces: 2 });
  await fs.writeFile(summaryPath, renderSummaryMarkdown(report), "utf8");

  const failure =
    report.summary.failed > 0 ||
    report.policy_checks.some(check => !check.passed);

  if (options.stdout) {
    options.stdout.write(
      `Education (US) summary: ${report.summary.passed} passed, ${report.summary.failed} failed, ${report.summary.manual} manual\n`,
    );
    if (report.policy_checks.some(check => !check.passed)) {
      options.stdout.write("Policy guardrails failed — see compliance report for details.\n");
    }
    options.stdout.write(`Report written to ${path.relative(repoRoot, reportPath)}\n`);
  }

  return {
    reportPath,
    summaryPath,
    failed: failure,
  };
}

async function loadEduUsBundle(bundleDir: string) {
  const bundlePath = path.join(bundleDir, "bundle.yaml");
  const raw = await fs.readFile(bundlePath, "utf8");
  const parsed = BundleSchema.parse(parse(raw));
  return { ...parsed, dir: bundleDir };
}

async function loadEduUsModel(bundleDir: string) {
  const specPath = path.join(bundleDir, EDU_US_DATA_FILENAME);
  const model = await loadEduUsCatalog(specPath);
  const meta = EduUsMetaSchema.parse(model.meta ?? {});
  return { model, meta };
}

async function loadEvidence(repoRoot: string): Promise<{ project: ProjectEvidence; map: EvidenceMap }> {
  const filePath = path.join(repoRoot, "docs", "internal", "compliance", "edu-us", EDU_US_EVIDENCE_FILENAME);
  if (!(await fs.pathExists(filePath))) {
    return { project: {}, map: {} };
  }
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = EvidenceSchema.parse(parse(raw));
  const controls = parsed.controls ?? {};
  const map: EvidenceMap = {};
  for (const [requirementId, entry] of Object.entries(controls)) {
    map[requirementId] = {
      status: normaliseStatus(entry.status),
      evidence: typeof entry.evidence === "string" ? entry.evidence.trim() || undefined : undefined,
    };
  }
  return { project: parsed.project ?? {}, map };
}

function evaluateRequirements(requirements: Requirement[], evidence: EvidenceMap, overlays: Set<string>) {
  const results: ComplianceReport["requirements"] = [];
  let passed = 0;
  let failed = 0;
  let manual = 0;

  for (const requirement of requirements) {
    const overlayId = extractOverlay(requirement.tags ?? []);
    if (overlayId && !overlays.has(overlayId)) {
      continue;
    }
    const entry = evidence[requirement.id];
    const status = entry ? entry.status : "manual";
    if (status === "pass") {
      passed += 1;
    } else if (status === "fail") {
      failed += 1;
    } else {
      manual += 1;
    }
    const record = {
      requirementId: requirement.id,
      title: requirement.title,
      description: requirement.description,
      tags: Array.isArray(requirement.tags) ? requirement.tags : [],
      status,
      evidence: entry?.evidence,
    };
    results.push(record);
  }

  return {
    requirements: results,
    summary: {
      total: results.length,
      passed,
      failed,
      manual,
    },
  };
}

function evaluatePolicyChecks(project: ProjectEvidence, overlays: Set<string>): PolicyCheck[] {
  const checks: PolicyCheck[] = [];

  const coppaPolicyPath = path.join("policy", "opa", "edu-us", "coppa.rego");
  if (project.audience_under_13) {
    const consentProvided = Boolean(project.verifiable_parental_consent && project.verifiable_parental_consent.trim());
    const retentionDefined = Boolean(project.data_retention_limit && project.data_retention_limit.trim());
    const missing: string[] = [];
    if (!consentProvided) missing.push("verifiable parental consent artifact");
    if (!retentionDefined) missing.push("documented data retention limit");
    const passed = missing.length === 0;
    const details = passed
      ? "Under-13 processing documented with consent and retention limits."
      : `Missing ${missing.join(" and ")}.`;
    checks.push({
      id: "policy/coppa-under-13",
      title: "COPPA under-13 guardrail",
      passed,
      details,
      policy: coppaPolicyPath,
    });
  }

  const cipaPolicyPath = path.join("policy", "opa", "edu-us", "cipa.rego");
  if (project.e_rate_eligible) {
    const filteringDoc = Boolean(project.filtering_policy_document && project.filtering_policy_document.trim());
    const monitoringDoc = Boolean(project.monitoring_policy_document && project.monitoring_policy_document.trim());
    const missing: string[] = [];
    if (!filteringDoc) missing.push("filtering/technology protection measure documentation");
    if (!monitoringDoc) missing.push("monitoring procedure documentation");
    const passed = missing.length === 0;
    const details = passed
      ? "E-Rate eligibility backed by filtering and monitoring documentation."
      : `Missing ${missing.join(" and ")}.`;
    checks.push({
      id: "policy/cipa-e-rate",
      title: "CIPA E-Rate guardrail",
      passed,
      details,
      policy: cipaPolicyPath,
    });
  }

  const nyPolicyPath = path.join("policy", "opa", "edu-us", "ny-2d.rego");
  if (project.integrates_with_ny_districts || overlays.has("ny-2d")) {
    const policyLink = Boolean(project.ny_data_privacy_policy_url && project.ny_data_privacy_policy_url.trim());
    const rightsLink = Boolean(project.ny_parent_bill_of_rights_url && project.ny_parent_bill_of_rights_url.trim());
    const missing: string[] = [];
    if (!policyLink) missing.push("Data Privacy & Security Policy link");
    if (!rightsLink) missing.push("Parent Bill of Rights link");
    const passed = missing.length === 0;
    const details = passed
      ? "NY Education Law 2-d artifacts documented."
      : `Missing ${missing.join(" and ")}.`;
    checks.push({
      id: "policy/ny-2d-artifacts",
      title: "NY Education Law 2-d overlay",
      passed,
      details,
      policy: nyPolicyPath,
    });
  }

  return checks;
}

function determineOverlays(
  requirements: Requirement[],
  evidence: EvidenceMap,
  project: ProjectEvidence,
  requested: Set<string>,
): Set<string> {
  const overlays = new Set(requested);
  if (project.integrates_with_ny_districts) {
    overlays.add("ny-2d");
  }
  for (const requirement of requirements) {
    const overlayId = extractOverlay(requirement.tags ?? []);
    if (!overlayId) continue;
    if (evidence[requirement.id]) {
      overlays.add(overlayId);
    }
  }
  return overlays;
}

function extractOverlay(tags: string[]): string | undefined {
  for (const tag of tags) {
    if (tag.startsWith("overlay:")) {
      return tag.slice("overlay:".length);
    }
  }
  return undefined;
}

function extractOverlayFromOutput(outputId: string): string | undefined {
  if (outputId.startsWith("overlay-")) {
    return outputId.slice("overlay-".length);
  }
  return undefined;
}

function normaliseOverlays(overlays?: string[]): string[] {
  if (!overlays || overlays.length === 0) {
    return [];
  }
  const values = overlays.flatMap(entry => entry.split(","));
  const result = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim().toLowerCase();
    if (trimmed) {
      result.add(trimmed);
    }
  }
  return Array.from(result);
}

function normaliseStatus(value: unknown): EvidenceStatus {
  if (typeof value !== "string") {
    return "manual";
  }
  const normalised = value.trim().toLowerCase();
  if (["pass", "passed", "true", "yes"].includes(normalised)) {
    return "pass";
  }
  if (["fail", "failed", "false", "no"].includes(normalised)) {
    return "fail";
  }
  if (normalised === "manual") {
    return "manual";
  }
  return "manual";
}

function summariseSpec(specData: any) {
  const engineMode = typeof specData?.engine?.mode === "string" ? specData.engine.mode : "classic";
  const complianceEnabled = Boolean(specData?.compliance?.enabled);
  const frameworks = Array.isArray(specData?.compliance?.frameworks)
    ? specData.compliance.frameworks
        .map((entry: any) => ({
          id: typeof entry?.id === "string" ? entry.id : "",
          scope: Array.isArray(entry?.scope) ? entry.scope : undefined,
        }))
        .filter((entry: { id: string }) => entry.id)
    : [];
  const eduRequested = frameworks.some((entry: { id: string }) => entry.id === "edu-us");
  return {
    engine_mode: engineMode,
    compliance_enabled: complianceEnabled,
    edu_us_requested: eduRequested,
    frameworks,
  };
}

function renderSummaryMarkdown(report: ComplianceReport): string {
  const lines: string[] = [];
  lines.push("# Education (US) Compliance Summary");
  lines.push("");
  lines.push(`Generated: ${report.generated_at}`);
  lines.push("");
  lines.push(`Requirements evaluated: ${report.summary.total}`);
  lines.push(`Passed: ${report.summary.passed}`);
  lines.push(`Failed: ${report.summary.failed}`);
  lines.push(`Manual: ${report.summary.manual}`);
  lines.push("");
  if (report.policy_checks.length > 0) {
    lines.push("## Policy checks");
    lines.push("| Check | Status | Details | Policy |");
    lines.push("| --- | --- | --- | --- |");
    for (const check of report.policy_checks) {
      lines.push(
        `| ${check.title} | ${check.passed ? "PASS" : "FAIL"} | ${check.details} | ${check.policy} |`,
      );
    }
    lines.push("");
  }
  lines.push("## Requirements");
  lines.push("| Requirement | Status | Evidence |");
  lines.push("| --- | --- | --- |");
  for (const requirement of report.requirements) {
    const evidence = requirement.evidence ? requirement.evidence : "";
    lines.push(`| ${requirement.requirementId} | ${requirement.status.toUpperCase()} | ${evidence} |`);
  }
  lines.push("");
  lines.push("### OPA policies");
  for (const policy of report.opa_policies) {
    lines.push(`- ${policy}`);
  }
  lines.push("");
  return lines.join("\n");
}

function normaliseText(value: string): string {
  return value.replace(/\r\n/g, "\n");
}
