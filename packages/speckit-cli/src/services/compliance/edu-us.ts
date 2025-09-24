import path from "node:path";
import fs from "fs-extra";
import type { Requirement } from "@speckit/core";
import { loadSpecModel } from "../spec.js";

export type ComplianceReference = { label: string; url?: string };
export type ComplianceArtifact = { path: string; description?: string };
export type ComplianceSeverity = "required" | "advisory";

type ObligationGating = {
  anyTags?: string[];
  description?: string;
};

type ObligationDefinition = {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  references: ComplianceReference[];
  expectedArtifacts?: ComplianceArtifact[];
  severity: ComplianceSeverity;
  opaPolicies?: string[];
  gating?: ObligationGating;
};

type BundleDefinition = {
  id: string;
  title: string;
  authority: string;
  type: "federal" | "state";
  overlays?: string[];
  obligations: ObligationDefinition[];
};

type PlanMatch = {
  id: string;
  title: string;
  tags: string[];
};

type PlanStatus = "covered" | "missing" | "not-applicable";

type PlanEntry = {
  id: string;
  title: string;
  bundleId: string;
  bundleTitle: string;
  authority: string;
  summary: string;
  tags: string[];
  references: ComplianceReference[];
  expectedArtifacts: ComplianceArtifact[];
  severity: ComplianceSeverity;
  status: PlanStatus;
  matches: PlanMatch[];
  opaPolicies: string[];
  notApplicableReason?: string;
};

type PlanSource = {
  id: string;
  title: string;
  authority: string;
  type: "federal" | "state";
};

type PlanSummary = {
  total: number;
  covered: number;
  missing: number;
  notApplicable: number;
};

export type EduUsPlan = {
  framework: "edu-us";
  generatedAt: string;
  overlaysApplied: string[];
  summary: PlanSummary;
  obligations: PlanEntry[];
  sources: PlanSource[];
  opaPolicies: { id: string; path: string; description: string }[];
};

type ReportStatus = "pass" | "missing" | "not-applicable";

type ReportEntry = {
  id: string;
  title: string;
  bundleId: string;
  bundleTitle: string;
  authority: string;
  severity: ComplianceSeverity;
  status: ReportStatus;
  details: string[];
  expectedArtifacts: ComplianceArtifact[];
  missingArtifacts: ComplianceArtifact[];
  matches: PlanMatch[];
  opaPolicies: string[];
  notApplicableReason?: string;
};

export type EduUsReport = {
  framework: "edu-us";
  generatedAt: string;
  overlaysApplied: string[];
  summary: {
    evaluated: number;
    pass: number;
    missing: number;
    notApplicable: number;
  };
  obligations: ReportEntry[];
  alerts: {
    obligationId: string;
    title: string;
    bundleTitle: string;
    policies: string[];
  }[];
};

type GenerateOptions = {
  repoRoot: string;
  overlays: string[];
};

const OPA_POLICIES = [
  {
    id: "coppa",
    path: "policy/opa/edu-us/coppa.rego",
    description: "COPPA consent, notice, and retention gating for child-directed features.",
  },
  {
    id: "cipa",
    path: "policy/opa/edu-us/cipa.rego",
    description: "CIPA filtering and monitoring expectations when claiming E-Rate discounts.",
  },
  {
    id: "ny-2d",
    path: "policy/opa/edu-us/ny-2d.rego",
    description: "New York Education Law 2-d parental rights and policy publication guardrails.",
  },
] as const;

const FEDERAL_BUNDLES: BundleDefinition[] = [
  {
    id: "ferpa",
    title: "FERPA Student Privacy",
    authority: "U.S. Department of Education — Student Privacy Policy Office",
    type: "federal",
    obligations: [
      {
        id: "ferpa-disclosure-controls",
        title: "Control disclosures of education records",
        summary:
          "Maintain written policies for authorized disclosures, logging, and staff training aligned with FERPA.",
        tags: ["ferpa:disclosure-controls"],
        references: [
          { label: "34 CFR §99.31 — FERPA Exceptions" },
          { label: "FERPA Guidance", url: "https://studentprivacy.ed.gov/ferpa" },
        ],
        expectedArtifacts: [
          {
            path: "docs/compliance/edu-us/ferpa/disclosure-logging.md",
            description: "Disclosure authorization and logging procedure",
          },
        ],
        severity: "required",
      },
      {
        id: "ferpa-directory-information",
        title: "Publish directory information boundaries",
        summary:
          "Define and communicate directory information fields plus opt-out processes for families.",
        tags: ["ferpa:directory-info"],
        references: [
          { label: "34 CFR §99.37 — Directory information" },
          { label: "FERPA Guidance", url: "https://studentprivacy.ed.gov/ferpa" },
        ],
        expectedArtifacts: [
          {
            path: "docs/compliance/edu-us/ferpa/directory-information-policy.md",
            description: "Directory information policy",
          },
        ],
        severity: "required",
      },
      {
        id: "ferpa-access-rights",
        title: "Document access and amendment rights",
        summary:
          "Describe how parents and eligible students request, review, and amend education records within statutory timelines.",
        tags: ["ferpa:access-rights"],
        references: [
          { label: "34 CFR §§99.10–99.22 — Access and amendment" },
          { label: "FERPA Guidance", url: "https://studentprivacy.ed.gov/ferpa" },
        ],
        expectedArtifacts: [
          {
            path: "docs/compliance/edu-us/ferpa/access-request-procedure.md",
            description: "Record access and amendment process",
          },
        ],
        severity: "required",
      },
    ],
  },
  {
    id: "coppa",
    title: "COPPA Child Privacy",
    authority: "Federal Trade Commission",
    type: "federal",
    obligations: [
      {
        id: "coppa-parental-consent",
        title: "Capture verifiable parental consent",
        summary:
          "Ensure a verifiable parental consent workflow exists before activating child accounts under age 13.",
        tags: ["coppa:parental-consent"],
        references: [
          { label: "16 CFR §312.5 — Verifiable parental consent" },
          {
            label: "FTC COPPA Rule",
            url: "https://www.ftc.gov/legal-library/browse/rules/childrens-online-privacy-protection-rule-coppa",
          },
        ],
        expectedArtifacts: [
          {
            path: "docs/compliance/edu-us/coppa/parental-consent-procedure.md",
            description: "COPPA parental consent procedure",
          },
        ],
        severity: "required",
        opaPolicies: [OPA_POLICIES[0].path],
        gating: {
          anyTags: ["coppa:under-13", "coppa:child-directed"],
          description: "Not applicable: spec has no child-directed COPPA tags (coppa:under-13 or coppa:child-directed).",
        },
      },
      {
        id: "coppa-direct-notice",
        title: "Deliver direct notice to parents",
        summary:
          "Provide parents with direct notice describing data collection, operators, and contact channels before using child data.",
        tags: ["coppa:direct-notice"],
        references: [
          { label: "16 CFR §312.4 — Direct notice" },
          {
            label: "FTC COPPA FAQs",
            url: "https://www.ftc.gov/business-guidance/privacy-security/childrens-privacy",
          },
        ],
        expectedArtifacts: [
          {
            path: "docs/compliance/edu-us/coppa/direct-notice-template.md",
            description: "Direct notice template",
          },
        ],
        severity: "required",
        opaPolicies: [OPA_POLICIES[0].path],
        gating: {
          anyTags: ["coppa:under-13", "coppa:child-directed"],
          description: "Not applicable: spec has no child-directed COPPA tags (coppa:under-13 or coppa:child-directed).",
        },
      },
      {
        id: "coppa-retention-limits",
        title: "Define child data retention limits",
        summary:
          "State how long child personal information is retained and ensure purge workflows cover all systems.",
        tags: ["coppa:data-retention"],
        references: [
          { label: "16 CFR §312.10 — Data retention and deletion" },
          {
            label: "FTC COPPA Rule",
            url: "https://www.ftc.gov/legal-library/browse/rules/childrens-online-privacy-protection-rule-coppa",
          },
        ],
        expectedArtifacts: [
          {
            path: "docs/compliance/edu-us/coppa/data-retention-schedule.md",
            description: "Child data retention schedule",
          },
        ],
        severity: "required",
        opaPolicies: [OPA_POLICIES[0].path],
        gating: {
          anyTags: ["coppa:under-13", "coppa:child-directed"],
          description: "Not applicable: spec has no child-directed COPPA tags (coppa:under-13 or coppa:child-directed).",
        },
      },
    ],
  },
  {
    id: "cipa",
    title: "CIPA Filtering & Monitoring",
    authority: "Federal Communications Commission",
    type: "federal",
    obligations: [
      {
        id: "cipa-filtering-monitoring",
        title: "Publish filtering and monitoring policy",
        summary:
          "Document the technology protection measures and monitoring practices required for E-Rate discounts.",
        tags: ["cipa:filtering"],
        references: [
          { label: "47 U.S.C. §254(h) — CIPA" },
          {
            label: "FCC CIPA Guidance",
            url: "https://www.fcc.gov/consumers/guides/childrens-internet-protection-act",
          },
        ],
        expectedArtifacts: [
          {
            path: "docs/compliance/edu-us/cipa/filtering-monitoring-policy.md",
            description: "Filtering and monitoring policy",
          },
        ],
        severity: "required",
        opaPolicies: [OPA_POLICIES[1].path],
        gating: {
          anyTags: ["cipa:e-rate"],
          description: "Not applicable: spec does not declare CIPA E-Rate obligations (missing cipa:e-rate tag).",
        },
      },
    ],
  },
  {
    id: "ppra",
    title: "PPRA Survey Controls",
    authority: "U.S. Department of Education — Student Privacy Policy Office",
    type: "federal",
    obligations: [
      {
        id: "ppra-sensitive-surveys",
        title: "Review sensitive surveys",
        summary:
          "Catalog sensitive surveys and capture approvals before administering them to students.",
        tags: ["ppra:sensitive-surveys"],
        references: [
          { label: "20 U.S.C. §1232h — PPRA" },
          {
            label: "PPRA Guidance",
            url: "https://studentprivacy.ed.gov/resources/protection-pupil-rights-amendment-ppra",
          },
        ],
        expectedArtifacts: [
          {
            path: "docs/compliance/edu-us/ppra/sensitive-survey-approvals.md",
            description: "Sensitive survey approval log",
          },
        ],
        severity: "required",
      },
      {
        id: "ppra-parental-rights",
        title: "Publish parental review and opt-out process",
        summary:
          "Explain how parents review instructional materials and opt out of PPRA-covered activities.",
        tags: ["ppra:parent-rights"],
        references: [
          { label: "20 U.S.C. §1232h — PPRA" },
          {
            label: "PPRA Guidance",
            url: "https://studentprivacy.ed.gov/resources/protection-pupil-rights-amendment-ppra",
          },
        ],
        expectedArtifacts: [
          {
            path: "docs/compliance/edu-us/ppra/parental-notification-opt-out.md",
            description: "PPRA parental notice and opt-out form",
          },
        ],
        severity: "required",
      },
    ],
  },
];

const STATE_BUNDLES: BundleDefinition[] = [
  {
    id: "ca-sopipa",
    title: "California SOPIPA",
    authority: "California Legislature",
    type: "state",
    overlays: ["ca-sopipa"],
    obligations: [
      {
        id: "ca-sopipa-no-ads",
        title: "Block targeted advertising",
        summary:
          "Ensure student information is never used for targeted advertising or creating marketing audiences.",
        tags: ["ca:sopipa:ads"],
        references: [
          { label: "Cal. Bus. & Prof. Code §22584" },
          {
            label: "California DOJ EdTech Guidance",
            url: "https://oag.ca.gov/edtech",
          },
        ],
        expectedArtifacts: [
          {
            path: "docs/compliance/edu-us/state/ca-sopipa/advertising-ban.md",
            description: "Advertising prohibition statement",
          },
        ],
        severity: "required",
      },
      {
        id: "ca-sopipa-profiling",
        title: "Prevent unauthorized profiling",
        summary:
          "Limit analytics and profiling to K-12 school purposes and document technical safeguards.",
        tags: ["ca:sopipa:profiling"],
        references: [
          { label: "Cal. Bus. & Prof. Code §22584" },
          {
            label: "California DOJ EdTech Guidance",
            url: "https://oag.ca.gov/edtech",
          },
        ],
        expectedArtifacts: [
          {
            path: "docs/compliance/edu-us/state/ca-sopipa/profiling-restrictions.md",
            description: "Profiling restriction controls",
          },
        ],
        severity: "required",
      },
      {
        id: "ca-sopipa-no-sale",
        title: "Ban selling student information",
        summary:
          "Record contractual and technical controls that prohibit selling or renting student data.",
        tags: ["ca:sopipa:sale"],
        references: [
          { label: "Cal. Bus. & Prof. Code §22584" },
          {
            label: "California DOJ EdTech Guidance",
            url: "https://oag.ca.gov/edtech",
          },
        ],
        expectedArtifacts: [
          {
            path: "docs/compliance/edu-us/state/ca-sopipa/data-sale-prohibition.md",
            description: "Student data sale prohibition",
          },
        ],
        severity: "required",
      },
      {
        id: "ca-sopipa-deletion",
        title: "Support district deletion requests",
        summary:
          "Demonstrate deletion workflows that remove student data upon district request across systems.",
        tags: ["ca:sopipa:deletion"],
        references: [
          { label: "Cal. Bus. & Prof. Code §22584" },
          {
            label: "California DOJ EdTech Guidance",
            url: "https://oag.ca.gov/edtech",
          },
        ],
        expectedArtifacts: [
          {
            path: "docs/compliance/edu-us/state/ca-sopipa/deletion-requests.md",
            description: "Deletion request playbook",
          },
        ],
        severity: "required",
      },
    ],
  },
  {
    id: "ny-2d",
    title: "New York Education Law 2-d",
    authority: "New York State Education Department",
    type: "state",
    overlays: ["ny-2d"],
    obligations: [
      {
        id: "ny-2d-parent-bill-of-rights",
        title: "Post Parent Bill of Rights",
        summary:
          "Publish and maintain the Parent Bill of Rights for Data Privacy and Security.",
        tags: ["ny:2-d:parent-rights"],
        references: [
          { label: "Education Law §2-d" },
          {
            label: "NYSED Parent Bill of Rights",
            url: "https://www.nysed.gov/data-privacy-security/parents-bill-rights-data-privacy-and-security",
          },
        ],
        expectedArtifacts: [
          {
            path: "docs/compliance/edu-us/state/ny-2d/parent-bill-of-rights.md",
            description: "Published Parent Bill of Rights",
          },
        ],
        severity: "required",
        opaPolicies: [OPA_POLICIES[2].path],
      },
      {
        id: "ny-2d-privacy-policy",
        title: "Publish Data Privacy & Security Policy",
        summary:
          "Provide the district-wide data privacy and security policy aligned to the NIST CSF.",
        tags: ["ny:2-d:privacy-policy"],
        references: [
          { label: "Education Law §2-d" },
          {
            label: "Part 121 Regulations",
            url: "https://www.nysed.gov/common/nysed/files/programs/data-privacy-security/part121-text.pdf",
          },
        ],
        expectedArtifacts: [
          {
            path: "docs/compliance/edu-us/state/ny-2d/data-privacy-security-policy.md",
            description: "Data Privacy and Security Policy",
          },
        ],
        severity: "required",
        opaPolicies: [OPA_POLICIES[2].path],
      },
      {
        id: "ny-2d-dpo",
        title: "Identify Data Protection Officer",
        summary:
          "List the appointed Data Protection Officer and provide contact and training evidence.",
        tags: ["ny:2-d:dpo"],
        references: [
          { label: "Education Law §2-d" },
          { label: "NYSED Guidance", url: "https://www.nysed.gov/data-privacy-security" },
        ],
        expectedArtifacts: [
          {
            path: "docs/compliance/edu-us/state/ny-2d/data-protection-officer.md",
            description: "Data Protection Officer contact and responsibilities",
          },
        ],
        severity: "required",
      },
      {
        id: "ny-2d-contracts",
        title: "Disclose third-party contracts",
        summary:
          "Publish third-party contracts and supplemental information required by Education Law 2-d.",
        tags: ["ny:2-d:contracts"],
        references: [
          { label: "Education Law §2-d" },
          {
            label: "NYSED Contract Requirements",
            url: "https://www.nysed.gov/data-privacy-security/education-law-2-d",
          },
        ],
        expectedArtifacts: [
          {
            path: "docs/compliance/edu-us/state/ny-2d/third-party-contracts.md",
            description: "Third-party contract disclosures",
          },
        ],
        severity: "required",
      },
    ],
  },
];

const ALL_BUNDLES = [...FEDERAL_BUNDLES, ...STATE_BUNDLES];

export async function generateEduUsPlan(options: GenerateOptions): Promise<EduUsPlan> {
  const overlays = new Set(options.overlays.map(value => value.trim().toLowerCase()).filter(Boolean));
  const { model } = await loadSpecModel(options.repoRoot);
  const requirements = Array.isArray(model.requirements) ? model.requirements : [];
  const tagIndex = buildTagIndex(requirements);
  const globalTags = collectAllTags(requirements);

  const planEntries: PlanEntry[] = [];
  const includedBundles: BundleDefinition[] = [];

  for (const bundle of ALL_BUNDLES) {
    if (bundle.type === "state") {
      const requiredOverlay = bundle.overlays ?? [];
      const hasOverlay = requiredOverlay.some(id => overlays.has(id));
      if (!hasOverlay) {
        continue;
      }
    }
    includedBundles.push(bundle);

    for (const obligation of bundle.obligations) {
      const matches = matchRequirements(obligation.tags, tagIndex);
      const gating = evaluateGating(obligation.gating, globalTags);

      const status: PlanStatus = gating.applies
        ? matches.length > 0
          ? "covered"
          : "missing"
        : "not-applicable";

      planEntries.push({
        id: obligation.id,
        title: obligation.title,
        bundleId: bundle.id,
        bundleTitle: bundle.title,
        authority: bundle.authority,
        summary: obligation.summary,
        tags: [...obligation.tags],
        references: [...obligation.references],
        expectedArtifacts: [...(obligation.expectedArtifacts ?? [])],
        severity: obligation.severity,
        status,
        matches,
        opaPolicies: [...(obligation.opaPolicies ?? [])],
        notApplicableReason: gating.reason,
      });
    }
  }

  const summary = buildPlanSummary(planEntries);
  const overlaysApplied = Array.from(overlays).sort();
  const sources: PlanSource[] = includedBundles.map(bundle => ({
    id: bundle.id,
    title: bundle.title,
    authority: bundle.authority,
    type: bundle.type,
  }));

  return {
    framework: "edu-us",
    generatedAt: new Date().toISOString(),
    overlaysApplied,
    summary,
    obligations: planEntries,
    sources,
    opaPolicies: OPA_POLICIES.map(policy => ({ ...policy })),
  };
}

export async function verifyEduUsPlan(plan: EduUsPlan, options: { repoRoot: string }): Promise<EduUsReport> {
  const repoRoot = options.repoRoot;
  const reportEntries: ReportEntry[] = [];

  for (const obligation of plan.obligations) {
    if (obligation.status === "not-applicable") {
      const detail = obligation.notApplicableReason ?? "Not applicable";
      reportEntries.push({
        id: obligation.id,
        title: obligation.title,
        bundleId: obligation.bundleId,
        bundleTitle: obligation.bundleTitle,
        authority: obligation.authority,
        severity: obligation.severity,
        status: "not-applicable",
        details: [detail],
        expectedArtifacts: obligation.expectedArtifacts,
        missingArtifacts: [],
        matches: obligation.matches,
        opaPolicies: obligation.opaPolicies,
        notApplicableReason: obligation.notApplicableReason,
      });
      continue;
    }

    const artifactResults = await Promise.all(
      obligation.expectedArtifacts.map(async artifact => {
        const exists = await fs.pathExists(path.join(repoRoot, artifact.path));
        return { artifact, exists };
      })
    );

    const missingArtifacts = artifactResults.filter(result => !result.exists).map(result => result.artifact);
    const allArtifactsPresent = missingArtifacts.length === 0;
    const hasSpecCoverage = obligation.matches.length > 0;
    const status: ReportStatus = allArtifactsPresent && hasSpecCoverage ? "pass" : "missing";

    const details: string[] = [];
    if (hasSpecCoverage) {
      const specCoverage = obligation.matches
        .map(match => "`" + match.id + "`")
        .join(", ");
      details.push("Spec coverage: " + specCoverage);
    } else {
      details.push("Spec coverage missing — add requirements tagged with " + obligation.tags.join(", "));
    }

    if (obligation.expectedArtifacts.length > 0) {
      if (allArtifactsPresent) {
        details.push("Required artifacts present.");
      } else {
        const missingList = missingArtifacts.map(artifact => "`" + artifact.path + "`").join(", ");
        details.push("Missing artifacts: " + missingList);
      }
    }

    reportEntries.push({
      id: obligation.id,
      title: obligation.title,
      bundleId: obligation.bundleId,
      bundleTitle: obligation.bundleTitle,
      authority: obligation.authority,
      severity: obligation.severity,
      status,
      details,
      expectedArtifacts: obligation.expectedArtifacts,
      missingArtifacts,
      matches: obligation.matches,
      opaPolicies: obligation.opaPolicies,
    });
  }

  const summary = buildReportSummary(reportEntries);
  const alerts = reportEntries
    .filter(entry => entry.status === "missing" && entry.opaPolicies.length > 0)
    .map(entry => ({
      obligationId: entry.id,
      title: entry.title,
      bundleTitle: entry.bundleTitle,
      policies: entry.opaPolicies,
    }));

  return {
    framework: plan.framework,
    generatedAt: new Date().toISOString(),
    overlaysApplied: [...plan.overlaysApplied],
    summary,
    obligations: reportEntries,
    alerts,
  };
}

export function renderEduUsPlanMarkdown(plan: EduUsPlan): string {
  const lines: string[] = [];
  lines.push("# Education (US) Compliance Plan");
  lines.push("");
  lines.push("Generated: " + plan.generatedAt);
  lines.push(
    "Overlays: " + (plan.overlaysApplied.length ? plan.overlaysApplied.join(", ") : "none")
  );
  lines.push("");
  lines.push(
    "Summary: " +
      plan.summary.covered +
      " covered · " +
      plan.summary.missing +
      " missing · " +
      plan.summary.notApplicable +
      " not applicable"
  );
  lines.push("");
  lines.push("| Obligation | Bundle | Status | Matches |");
  lines.push("| --- | --- | --- | --- |");
  for (const entry of plan.obligations) {
    const matches = entry.matches.length
      ? entry.matches.map(match => "`" + match.id + "`").join(", ")
      : entry.status === "not-applicable"
        ? "—"
        : "_none_";
    lines.push(
      "| " +
        entry.title +
        " | " +
        entry.bundleTitle +
        " | " +
        formatPlanStatus(entry.status) +
        " | " +
        matches +
        " |"
    );
  }
  lines.push("");
  if (plan.sources.length) {
    lines.push("## Sources");
    for (const source of plan.sources) {
      lines.push("- " + source.title + " (" + source.type + ") — " + source.authority);
    }
    lines.push("");
  }
  if (plan.opaPolicies.length) {
    lines.push("## OPA Policies");
    for (const policy of plan.opaPolicies) {
      lines.push("- " + policy.id + ": " + policy.path + " — " + policy.description);
    }
  }
  return lines.join("\n");
}

export function renderEduUsReportMarkdown(report: EduUsReport): string {
  const lines: string[] = [];
  lines.push("# Education (US) Compliance Report");
  lines.push("");
  lines.push("Generated: " + report.generatedAt);
  lines.push(
    "Overlays: " + (report.overlaysApplied.length ? report.overlaysApplied.join(", ") : "none")
  );
  lines.push("");
  lines.push(
    "Summary: " +
      report.summary.pass +
      " pass · " +
      report.summary.missing +
      " missing · " +
      report.summary.notApplicable +
      " not applicable"
  );
  lines.push("");
  if (report.alerts.length) {
    lines.push("## Policy Alerts");
    for (const alert of report.alerts) {
      lines.push(
        "- " + alert.title + " (" + alert.bundleTitle + ") → policies: " + alert.policies.join(", ")
      );
    }
    lines.push("");
  }
  lines.push("## Obligation Results");
  for (const entry of report.obligations) {
    lines.push("- " + formatReportStatus(entry.status) + " " + entry.title + " (" + entry.bundleTitle + ")");
    for (const detail of entry.details) {
      lines.push("  - " + detail);
    }
    if (entry.expectedArtifacts.length) {
      const list = entry.expectedArtifacts.map(artifact => "`" + artifact.path + "`").join(", ");
      lines.push("  - Expected artifacts: " + list);
    }
    if (entry.missingArtifacts.length) {
      const missingList = entry.missingArtifacts.map(artifact => "`" + artifact.path + "`").join(", ");
      lines.push("  - Missing: " + missingList);
    }
  }
  return lines.join("\n");
}

function buildTagIndex(requirements: Requirement[]): Map<string, Requirement[]> {
  const index = new Map<string, Requirement[]>();
  for (const requirement of requirements) {
    if (!Array.isArray(requirement.tags)) continue;
    for (const tag of requirement.tags) {
      const normalised = normaliseTag(tag);
      if (!normalised) continue;
      const list = index.get(normalised) ?? [];
      list.push(requirement);
      index.set(normalised, list);
    }
  }
  return index;
}

function collectAllTags(requirements: Requirement[]): Set<string> {
  const tags = new Set<string>();
  for (const requirement of requirements) {
    if (!Array.isArray(requirement.tags)) continue;
    for (const tag of requirement.tags) {
      const normalised = normaliseTag(tag);
      if (normalised) {
        tags.add(normalised);
      }
    }
  }
  return tags;
}

function matchRequirements(tags: string[], tagIndex: Map<string, Requirement[]>): PlanMatch[] {
  const matches = new Map<string, PlanMatch>();
  for (const tag of tags) {
    const normalised = normaliseTag(tag);
    if (!normalised) continue;
    const requirements = tagIndex.get(normalised) ?? [];
    for (const requirement of requirements) {
      if (!matches.has(requirement.id)) {
        matches.set(requirement.id, {
          id: requirement.id,
          title: requirement.title,
          tags: Array.isArray(requirement.tags) ? requirement.tags : [],
        });
      }
    }
  }
  return Array.from(matches.values()).sort((a, b) => a.id.localeCompare(b.id));
}

function evaluateGating(gating: ObligationGating | undefined, globalTags: Set<string>): {
  applies: boolean;
  reason?: string;
} {
  if (!gating) {
    return { applies: true };
  }
  if (gating.anyTags && gating.anyTags.length > 0) {
    const hasTag = gating.anyTags.some(tag => globalTags.has(normaliseTag(tag)));
    if (!hasTag) {
      return { applies: false, reason: gating.description };
    }
  }
  return { applies: true };
}

function normaliseTag(tag: string | undefined): string {
  return typeof tag === "string" ? tag.trim().toLowerCase() : "";
}

function buildPlanSummary(entries: PlanEntry[]): PlanSummary {
  let covered = 0;
  let missing = 0;
  let notApplicable = 0;
  for (const entry of entries) {
    if (entry.status === "covered") covered += 1;
    else if (entry.status === "missing") missing += 1;
    else notApplicable += 1;
  }
  return {
    total: entries.length,
    covered,
    missing,
    notApplicable,
  };
}

function buildReportSummary(entries: ReportEntry[]): {
  evaluated: number;
  pass: number;
  missing: number;
  notApplicable: number;
} {
  let pass = 0;
  let missing = 0;
  let notApplicable = 0;
  for (const entry of entries) {
    if (entry.status === "pass") pass += 1;
    else if (entry.status === "missing") missing += 1;
    else notApplicable += 1;
  }
  return {
    evaluated: entries.length,
    pass,
    missing,
    notApplicable,
  };
}

function formatPlanStatus(status: PlanStatus): string {
  switch (status) {
    case "covered":
      return "✅ covered";
    case "missing":
      return "❌ missing";
    default:
      return "⚪ not applicable";
  }
}

function formatReportStatus(status: ReportStatus): string {
  switch (status) {
    case "pass":
      return "✅";
    case "missing":
      return "❌";
    default:
      return "⚪";
  }
}
