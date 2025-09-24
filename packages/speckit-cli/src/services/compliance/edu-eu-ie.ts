import path from "node:path";
import type { Writable } from "node:stream";
import fs from "fs-extra";
import nunjucks from "nunjucks";
import { parse } from "yaml";
import { z } from "zod";
import { BundleSchema } from "../catalog.js";
import { loadSpecYaml } from "../spec.js";

const EDU_EU_IE_BUNDLE_RELATIVE = path.join(".speckit", "catalog", "specs", "compliance", "edu-eu-ie");
const EDU_EU_IE_EVIDENCE_FILENAME = "edu-eu-ie-controls.yaml";

const EvidenceSchema = z
  .object({
    project: z
      .object({
        role: z.string().optional(),
        member_state: z.string().optional(),
        age_of_digital_consent: z.union([z.number(), z.string()]).optional(),
        data_subjects: z.array(z.string()).optional(),
        lawful_bases: z.array(z.string()).optional(),
        dpia_reference: z.string().optional(),
        age_gating_flow: z.string().optional(),
        parental_consent_flow: z.string().optional(),
        behavioral_ads_disabled: z.boolean().optional(),
        retention_limit: z.string().optional(),
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

type EvidenceStatus = "pass" | "fail" | "manual";

type EvidenceEntry = { status: EvidenceStatus; evidence?: string };

type EvidenceMap = Record<string, EvidenceEntry>;

type ProjectEvidence = z.infer<typeof EvidenceSchema>["project"];

type FrameworkConfig = {
  member_state: string;
  age_of_digital_consent: number;
};

type GenerateOptions = { repoRoot: string; stdout?: Writable };

type VerifyOptions = { repoRoot: string; stdout?: Writable };

type PolicyCheck = {
  id: string;
  title: string;
  passed: boolean;
  details: string;
  policy: string;
};

type ComplianceReport = {
  framework: "edu-eu-ie";
  generated_at: string;
  spec: ReturnType<typeof summariseSpec>;
  config: FrameworkConfig;
  summary: {
    total: number;
    passed: number;
    failed: number;
    manual: number;
  };
  requirements: {
    requirementId: string;
    status: EvidenceStatus;
    evidence?: string;
  }[];
  policy_checks: PolicyCheck[];
  opa_policies: string[];
};

export async function generateEduEuIePlan(options: GenerateOptions) {
  const repoRoot = options.repoRoot;
  const bundleDir = path.join(repoRoot, EDU_EU_IE_BUNDLE_RELATIVE);
  const bundle = await loadEduEuIeBundle(bundleDir);
  const specData = await loadSpecYaml(repoRoot);
  const config = extractFrameworkConfig(specData.data);

  const context = {
    spec: specData.data,
    edu_eu_ie: {
      config,
    },
  };

  const env = nunjucks.configure(bundle.dir, {
    autoescape: false,
    throwOnUndefined: true,
    noCache: true,
  });

  for (const output of bundle.outputs) {
    const rendered = env.render(output.from, context);
    const targetPath = path.join(repoRoot, output.to);
    await fs.ensureDir(path.dirname(targetPath));
    const previous = (await fs.pathExists(targetPath)) ? await fs.readFile(targetPath, "utf8") : null;
    await fs.writeFile(targetPath, rendered, "utf8");
    if (options.stdout) {
      const changed = previous === null || normaliseText(previous) !== normaliseText(rendered);
      options.stdout.write(`${changed ? "Updated" : "Unchanged"} ${output.to}\n`);
    }
  }
}

export async function verifyEduEuIeCompliance(options: VerifyOptions) {
  const repoRoot = options.repoRoot;
  const bundleDir = path.join(repoRoot, EDU_EU_IE_BUNDLE_RELATIVE);
  await loadEduEuIeBundle(bundleDir); // Ensure bundle exists
  const specData = await loadSpecYaml(repoRoot);
  const config = extractFrameworkConfig(specData.data);
  const evidence = await loadEvidence(repoRoot);

  const evaluation = evaluateControls(evidence);
  const policyChecks = evaluatePolicyChecks(evidence.project, config);

  const report: ComplianceReport = {
    framework: "edu-eu-ie",
    generated_at: new Date().toISOString(),
    spec: summariseSpec(specData.data),
    config,
    summary: evaluation.summary,
    requirements: evaluation.requirements,
    policy_checks: policyChecks,
    opa_policies: [path.join("policy", "opa", "edu-eu", "children.rego")],
  };

  const reportPath = path.join(repoRoot, ".speckit", "compliance-report.json");
  const summaryPath = path.join(repoRoot, ".speckit", "compliance-report.md");
  await fs.ensureDir(path.dirname(reportPath));
  await fs.writeJson(reportPath, report, { spaces: 2 });
  await fs.writeFile(summaryPath, renderSummaryMarkdown(report), "utf8");

  const failure = report.summary.failed > 0 || report.policy_checks.some(check => !check.passed);

  if (options.stdout) {
    options.stdout.write(
      `Education (EU/IE) summary: ${report.summary.passed} passed, ${report.summary.failed} failed, ${report.summary.manual} manual\n`,
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

type EvaluationResult = {
  requirements: ComplianceReport["requirements"];
  summary: ComplianceReport["summary"];
};

function evaluateControls(evidence: { map: EvidenceMap }): EvaluationResult {
  const requirements: ComplianceReport["requirements"] = [];
  let passed = 0;
  let failed = 0;
  let manual = 0;

  for (const [requirementId, entry] of Object.entries(evidence.map)) {
    const status = normaliseStatus(entry.status);
    if (status === "pass") passed += 1;
    else if (status === "fail") failed += 1;
    else manual += 1;
    requirements.push({ requirementId, status, evidence: entry.evidence });
  }

  return {
    requirements,
    summary: {
      total: requirements.length,
      passed,
      failed,
      manual,
    },
  };
}

function evaluatePolicyChecks(project: ProjectEvidence, config: FrameworkConfig): PolicyCheck[] {
  const checks: PolicyCheck[] = [];
  const policyPath = path.join("policy", "opa", "edu-eu", "children.rego");
  const role = typeof project.role === "string" ? project.role.trim().toLowerCase() : "";
  const dataSubjects = Array.isArray(project.data_subjects)
    ? project.data_subjects.map(value => value.trim().toLowerCase())
    : [];
  const lawfulBases = Array.isArray(project.lawful_bases)
    ? project.lawful_bases.map(value => value.trim().toLowerCase())
    : [];

  const isController = role === "controller" || role === "joint-controller";
  const targetsChildren = dataSubjects.includes("children");

  if (isController && targetsChildren) {
    const dpiaPresent = hasText(project.dpia_reference);
    checks.push({
      id: "policy/edu-eu-dpia",
      title: "DPIA recorded for child data",
      passed: dpiaPresent,
      details: dpiaPresent
        ? "DPIA reference captured."
        : "Add a DPIA reference for child data processing.",
      policy: policyPath,
    });

    const ageGate = hasText(project.age_gating_flow);
    checks.push({
      id: "policy/edu-eu-age-gating",
      title: "Age assurance documented",
      passed: ageGate,
      details: ageGate
        ? "Age gating or verification flow documented."
        : "Describe how underage users are identified or restricted.",
      policy: policyPath,
    });

    if (lawfulBases.includes("consent")) {
      const parentalFlow = hasText(project.parental_consent_flow);
      checks.push({
        id: "policy/edu-eu-parental-consent",
        title: "Parental consent flow available",
        passed: parentalFlow,
        details: parentalFlow
          ? "Parental/guardian consent documentation present."
          : "Document the parental consent capture workflow when relying on consent.",
        policy: policyPath,
      });
    }

    const adsDisabled = project.behavioral_ads_disabled === true;
    checks.push({
      id: "policy/edu-eu-behavioral-ads",
      title: "Behavioural ads disabled",
      passed: adsDisabled,
      details: adsDisabled
        ? "Behavioural advertising disabled for child audiences."
        : "Disable behavioural advertising and related tracking for child users.",
      policy: policyPath,
    });

    const retentionDocumented = hasText(project.retention_limit);
    checks.push({
      id: "policy/edu-eu-retention",
      title: "Retention limit documented",
      passed: retentionDocumented,
      details: retentionDocumented
        ? "Retention limits recorded."
        : "Record retention periods for child data.",
      policy: policyPath,
    });

    const projectAge = normaliseAge(project.age_of_digital_consent, config.age_of_digital_consent);
    const ageMatches = projectAge === config.age_of_digital_consent;
    checks.push({
      id: "policy/edu-eu-age-of-consent",
      title: "Age of digital consent aligned",
      passed: ageMatches,
      details: ageMatches
        ? `Evidence aligns with configured age ${config.age_of_digital_consent}.`
        : `Update evidence to match the configured age of digital consent (${config.age_of_digital_consent}).`,
      policy: policyPath,
    });
  }

  return checks;
}

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function normaliseAge(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value.trim(), 10);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

async function loadEduEuIeBundle(bundleDir: string) {
  const bundlePath = path.join(bundleDir, "bundle.yaml");
  const raw = await fs.readFile(bundlePath, "utf8");
  const parsed = BundleSchema.parse(parse(raw));
  return { ...parsed, dir: bundleDir };
}

async function loadEvidence(repoRoot: string): Promise<{ project: ProjectEvidence; map: EvidenceMap }> {
  const filePath = path.join(
    repoRoot,
    "docs",
    "internal",
    "compliance",
    "edu-eu-ie",
    EDU_EU_IE_EVIDENCE_FILENAME,
  );
  if (!(await fs.pathExists(filePath))) {
    return { project: {}, map: {} };
  }
  const raw = await fs.readFile(filePath, "utf8");
  if (!raw.trim()) {
    return { project: {}, map: {} };
  }
  const parsed = EvidenceSchema.parse(parse(raw));
  const map: EvidenceMap = {};
  for (const [key, value] of Object.entries(parsed.controls ?? {})) {
    map[key] = {
      status: normaliseStatus(value.status),
      evidence: typeof value.evidence === "string" ? value.evidence : undefined,
    };
  }
  return { project: parsed.project, map };
}

function normaliseStatus(value: unknown): EvidenceStatus {
  if (typeof value !== "string") return "manual";
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
  const requested = frameworks.some((entry: { id: string }) => entry.id === "edu-eu-ie");
  return {
    engine_mode: engineMode,
    compliance_enabled: complianceEnabled,
    edu_eu_ie_requested: requested,
    frameworks,
  };
}

function renderSummaryMarkdown(report: ComplianceReport): string {
  const lines: string[] = [];
  lines.push("# Education (EU/IE) Compliance Summary");
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
  if (report.requirements.length > 0) {
    lines.push("## Requirements");
    lines.push("| Requirement | Status | Evidence |");
    lines.push("| --- | --- | --- |");
    for (const requirement of report.requirements) {
      const evidence = requirement.evidence ? requirement.evidence : "";
      lines.push(`| ${requirement.requirementId} | ${requirement.status.toUpperCase()} | ${evidence} |`);
    }
    lines.push("");
  }
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

function extractFrameworkConfig(specData: any): FrameworkConfig {
  const frameworks = Array.isArray(specData?.compliance?.frameworks)
    ? specData.compliance.frameworks
    : [];
  const entry = frameworks.find((item: any) => typeof item?.id === "string" && item.id === "edu-eu-ie");
  const rawConfig = entry?.config ?? {};
  const memberState = typeof rawConfig?.member_state === "string" && rawConfig.member_state.trim().length > 0
    ? rawConfig.member_state.trim().toLowerCase()
    : "ie";
  const ageRaw = rawConfig?.age_of_digital_consent;
  const age = normaliseAge(ageRaw, 16);
  return {
    member_state: memberState,
    age_of_digital_consent: age,
  };
}
