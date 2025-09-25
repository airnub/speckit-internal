import path from "node:path";
import type { Writable } from "node:stream";
import fs from "fs-extra";
import nunjucks from "nunjucks";
import { parse } from "yaml";
import { z } from "zod";
import { loadToModel as loadHipaaCatalog } from "@speckit/adapter-hipaa";
import type { SpecModel } from "@speckit/engine";
import { BundleSchema } from "../catalog.js";
import { loadSpecYaml } from "../spec.js";

const HIPAA_BUNDLE_RELATIVE = path.join(".speckit", "catalog", "specs", "compliance", "hipaa");
const HIPAA_DATA_FILENAME = "security-rule.yaml";
const HIPAA_OBJECTIVE_CONTROLS = new Set([
  "HIPAA-SR-TECH-ACCESS-UNIQUE-ID",
  "HIPAA-SR-TECH-AUDIT-CONTROLS",
  "HIPAA-SR-TECH-INTEGRITY-ENCRYPTION",
  "HIPAA-SR-TECH-TRANSMISSION-SECURITY",
]);

type EvidenceStatus = "pass" | "fail" | "manual";

type EvidenceEntry = {
  status: EvidenceStatus;
  evidence?: string;
};

type EvidenceMap = Record<string, EvidenceEntry>;

type GenerateOptions = {
  repoRoot: string;
  stdout?: Writable;
};

type VerifyOptions = {
  repoRoot: string;
  stdout?: Writable;
};

type HipaaMeta = z.infer<typeof HipaaMetaSchema>;

type ComplianceReport = {
  framework: "hipaa";
  generated_at: string;
  spec: {
    engine_mode: string;
    compliance_enabled: boolean;
    hipaa_requested: boolean;
    frameworks: { id: string; scope?: string[] }[];
  };
  meta: {
    version: string;
    title?: string;
    crosswalks: HipaaMeta["crosswalks"];
  };
  summary: {
    total: number;
    passed: number;
    failed: number;
    manual: number;
    objective_failures: number;
  };
  controls: {
    requirementId: string;
    title: string;
    hipaaCitation: string;
    objective: boolean;
    status: EvidenceStatus;
    evidence?: string;
    mappedNistControls: string[];
  }[];
  opa_policy: {
    path: string;
  };
};

const EvidenceSchema = z
  .object({
    controls: z
      .record(
        z
          .object({
            status: z.string().min(1),
            evidence: z.string().optional(),
          })
          .passthrough()
      )
      .optional(),
  })
  .passthrough();

const HipaaMetaSchema = z
  .object({
    title: z.string().optional(),
    crosswalks: z.object({
      nist_sp_800_66r2: z.object({ title: z.string(), url: z.string() }),
      olir_mapping: z.object({ title: z.string(), url: z.string() }),
    }),
    families: z.array(
      z.object({
        id: z.string(),
        key: z.string(),
        name: z.string(),
        citation: z.string(),
        description: z.string(),
        safeguards: z.array(
          z.object({
            id: z.string(),
            requirement_id: z.string(),
            citation: z.string(),
            title: z.string(),
            description: z.string(),
            nist_800_53r5: z.array(z.string()),
          })
        ),
      })
    ),
  })
  .passthrough();

export async function generateHipaaPlan(options: GenerateOptions) {
  const repoRoot = options.repoRoot;
  const bundleDir = path.join(repoRoot, HIPAA_BUNDLE_RELATIVE);
  const bundle = await loadHipaaBundle(bundleDir);
  const specData = await loadSpecYaml(repoRoot);
  const { model, meta } = await loadHipaaModel(bundleDir);
  const evidence = await loadEvidence(repoRoot);

  const context = {
    spec: specData.data,
    hipaa: {
      model,
      meta,
      statuses: evidence,
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
      const changed = previous === null || normalise(previous) !== normalise(rendered);
      options.stdout.write(`${changed ? "Updated" : "Unchanged"} ${output.to}\n`);
    }
  }
}

export async function verifyHipaaCompliance(options: VerifyOptions) {
  const repoRoot = options.repoRoot;
  const bundleDir = path.join(repoRoot, HIPAA_BUNDLE_RELATIVE);
  const specData = await loadSpecYaml(repoRoot);
  const { model, meta } = await loadHipaaModel(bundleDir);
  const evidence = await loadEvidence(repoRoot);

  const { controls, summary } = evaluateControls(meta, evidence);
  const report: ComplianceReport = {
    framework: "hipaa",
    generated_at: new Date().toISOString(),
    spec: summariseSpec(specData.data),
    meta: {
      version: model.version,
      title: typeof meta.title === "string" ? meta.title : undefined,
      crosswalks: meta.crosswalks,
    },
    summary,
    controls,
    opa_policy: {
      path: path.join("policy", "opa", "hipaa", "technical.rego"),
    },
  };

  const reportPath = path.join(repoRoot, ".speckit", "compliance-report.json");
  const summaryPath = path.join(repoRoot, ".speckit", "compliance-report.md");
  await fs.ensureDir(path.dirname(reportPath));
  await fs.writeJson(reportPath, report, { spaces: 2 });
  await fs.writeFile(summaryPath, renderSummaryMarkdown(report), "utf8");

  if (options.stdout) {
    options.stdout.write(
      `HIPAA compliance summary: ${summary.passed} passed, ${summary.failed} failed, ${summary.manual} manual\n`
    );
    if (summary.objective_failures > 0) {
      options.stdout.write(`Objective control failures: ${summary.objective_failures}\n`);
    }
    options.stdout.write(`Report written to ${path.relative(repoRoot, reportPath)}\n`);
  }

  return {
    reportPath,
    summaryPath,
    failed: summary.objective_failures > 0,
  };
}

async function loadHipaaBundle(bundleDir: string) {
  const bundlePath = path.join(bundleDir, "bundle.yaml");
  const raw = await fs.readFile(bundlePath, "utf8");
  const parsed = BundleSchema.parse(parse(raw));
  return { ...parsed, dir: bundleDir };
}

async function loadHipaaModel(bundleDir: string): Promise<{ model: SpecModel; meta: HipaaMeta }> {
  const specPath = path.join(bundleDir, HIPAA_DATA_FILENAME);
  const model = await loadHipaaCatalog(specPath);
  const meta = HipaaMetaSchema.parse(model.meta ?? {});
  return { model, meta };
}

async function loadEvidence(repoRoot: string): Promise<EvidenceMap> {
  const filePath = path.join(repoRoot, "docs", "internal", "compliance", "hipaa", "technical-safeguards.yaml");
  if (!(await fs.pathExists(filePath))) {
    return {};
  }
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = EvidenceSchema.parse(parse(raw));
  const map: EvidenceMap = {};
  const controls = parsed.controls ?? {};
  for (const [requirementId, entry] of Object.entries(controls)) {
    const status = normaliseStatus(entry.status);
    map[requirementId] = {
      status,
      evidence: typeof entry.evidence === "string" ? entry.evidence.trim() || undefined : undefined,
    };
  }
  return map;
}

function evaluateControls(meta: HipaaMeta, evidence: EvidenceMap) {
  const controls: ComplianceReport["controls"] = [];
  let passed = 0;
  let failed = 0;
  let manual = 0;
  let objectiveFailures = 0;

  for (const family of meta.families) {
    for (const safeguard of family.safeguards) {
      const requirementId = safeguard.requirement_id;
      const objective = HIPAA_OBJECTIVE_CONTROLS.has(requirementId);
      const entry = evidence[requirementId];
      const status = entry ? entry.status : objective ? "fail" : "manual";
      if (status === "pass") {
        passed += 1;
      } else if (status === "fail" || (status === "manual" && objective)) {
        failed += 1;
        if (objective) {
          objectiveFailures += 1;
        }
      } else {
        manual += 1;
      }
      controls.push({
        requirementId,
        title: safeguard.title,
        hipaaCitation: `${family.citation} ${safeguard.citation}`.trim(),
        objective,
        status: objective && status !== "pass" ? "fail" : status,
        evidence: entry?.evidence,
        mappedNistControls: safeguard.nist_800_53r5,
      });
    }
  }

  const total = controls.length;
  return {
    controls: controls.map(control => ({
      ...control,
      status: control.status,
    })),
    summary: {
      total,
      passed,
      failed,
      manual,
      objective_failures: objectiveFailures,
    },
  };
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
        .filter(entry => entry.id)
    : [];
  const hipaaRequested = frameworks.some(entry => entry.id === "hipaa");
  return {
    engine_mode: engineMode,
    compliance_enabled: complianceEnabled,
    hipaa_requested: hipaaRequested,
    frameworks,
  };
}

function renderSummaryMarkdown(report: ComplianceReport): string {
  const lines: string[] = [];
  lines.push("# HIPAA Compliance Summary");
  lines.push("");
  lines.push(`Generated: ${report.generated_at}`);
  lines.push("");
  lines.push(
    `Crosswalks: [NIST SP 800-66 Rev.2](${report.meta.crosswalks.nist_sp_800_66r2.url}), [OLIR Mapping](${report.meta.crosswalks.olir_mapping.url})`
  );
  lines.push("");
  lines.push(`Objective control failures: ${report.summary.objective_failures}`);
  lines.push("");
  lines.push("| Requirement | Status | Objective | Evidence |");
  lines.push("| --- | --- | --- | --- |");
  for (const control of report.controls) {
    const statusLabel = control.status.toUpperCase();
    const objective = control.objective ? "Yes" : "No";
    const evidence = control.evidence ? control.evidence : "";
    lines.push(`| ${control.requirementId} | ${statusLabel} | ${objective} | ${evidence} |`);
  }
  lines.push("");
  lines.push(`OPA policy: ${report.opa_policy.path}`);
  return lines.join("\n") + "\n";
}

function normalise(value: string): string {
  return value.replace(/\r\n/g, "\n");
}

function normaliseStatus(value: unknown): EvidenceStatus {
  if (typeof value !== "string") {
    return "manual";
  }
  const normalised = value.trim().toLowerCase();
  if (normalised === "pass" || normalised === "passed" || normalised === "true") {
    return "pass";
  }
  if (normalised === "fail" || normalised === "failed" || normalised === "false") {
    return "fail";
  }
  if (normalised === "manual") {
    return "manual";
  }
  return "manual";
}
