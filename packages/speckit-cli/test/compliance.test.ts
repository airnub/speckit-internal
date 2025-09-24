import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import fs from "fs-extra";
import {
  generateEduUsPlan,
  verifyEduUsPlan,
  renderEduUsPlanMarkdown,
  renderEduUsReportMarkdown,
} from "../src/services/compliance/edu-us.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const SCHEMA_PATH = path.join(REPO_ROOT, ".speckit", "schema", "spec.schema.json");

const SPEC_YAML = `dialect:
  id: speckit.v1
  version: 1.0.0
spec:
  meta:
    id: demo
    title: Demo Compliance Spec
    version: "1.0.0"
  requirements:
    - id: FERPA-DISCLOSURE
      title: Disclosure logging
      tags: ["ferpa:disclosure-controls"]
    - id: FERPA-DIRECTORY
      title: Directory information policy
      tags: ["ferpa:directory-info"]
    - id: FERPA-ACCESS
      title: Access and amendment rights
      tags: ["ferpa:access-rights"]
    - id: COPPA-SCOPE
      title: Child-directed service
      tags: ["coppa:under-13"]
    - id: COPPA-CONSENT
      title: Parental consent process
      tags: ["coppa:parental-consent"]
    - id: COPPA-NOTICE
      title: Direct notice template
      tags: ["coppa:direct-notice"]
    - id: COPPA-RETENTION
      title: Retention schedule
      tags: ["coppa:data-retention"]
    - id: CIPA-POLICY
      title: Filtering policy
      tags: ["cipa:e-rate", "cipa:filtering"]
    - id: PPRA-SURVEYS
      title: Sensitive survey approvals
      tags: ["ppra:sensitive-surveys"]
    - id: PPRA-PARENT
      title: Parental opt-out
      tags: ["ppra:parent-rights"]
    - id: CA-ADS
      title: SOPIPA advertising ban
      tags: ["ca:sopipa:ads"]
    - id: CA-PROFILE
      title: SOPIPA profiling controls
      tags: ["ca:sopipa:profiling"]
    - id: CA-SALE
      title: SOPIPA data sale prohibition
      tags: ["ca:sopipa:sale"]
    - id: CA-DELETION
      title: SOPIPA deletion workflows
      tags: ["ca:sopipa:deletion"]
    - id: NY-PBOR
      title: NY Parent Bill of Rights
      tags: ["ny:2-d:parent-rights"]
    - id: NY-POLICY
      title: NY privacy policy
      tags: ["ny:2-d:privacy-policy"]
    - id: NY-DPO
      title: NY Data Protection Officer
      tags: ["ny:2-d:dpo"]
    - id: NY-CONTRACTS
      title: NY contract disclosures
      tags: ["ny:2-d:contracts"]
`;

const ARTIFACT_PATHS = [
  "docs/compliance/edu-us/ferpa/disclosure-logging.md",
  "docs/compliance/edu-us/ferpa/directory-information-policy.md",
  "docs/compliance/edu-us/ferpa/access-request-procedure.md",
  "docs/compliance/edu-us/coppa/parental-consent-procedure.md",
  "docs/compliance/edu-us/coppa/direct-notice-template.md",
  "docs/compliance/edu-us/coppa/data-retention-schedule.md",
  "docs/compliance/edu-us/cipa/filtering-monitoring-policy.md",
  "docs/compliance/edu-us/ppra/sensitive-survey-approvals.md",
  "docs/compliance/edu-us/ppra/parental-notification-opt-out.md",
  "docs/compliance/edu-us/state/ca-sopipa/advertising-ban.md",
  "docs/compliance/edu-us/state/ca-sopipa/profiling-restrictions.md",
  "docs/compliance/edu-us/state/ca-sopipa/data-sale-prohibition.md",
  "docs/compliance/edu-us/state/ca-sopipa/deletion-requests.md",
  "docs/compliance/edu-us/state/ny-2d/parent-bill-of-rights.md",
  "docs/compliance/edu-us/state/ny-2d/data-privacy-security-policy.md",
  "docs/compliance/edu-us/state/ny-2d/data-protection-officer.md",
  "docs/compliance/edu-us/state/ny-2d/third-party-contracts.md",
];

test("generateEduUsPlan maps tags and overlays", async () => {
  const repoRoot = await setupRepo();
  try {
    const plan = await generateEduUsPlan({ repoRoot, overlays: ["ca-sopipa", "ny-2d"] });
    assert.equal(plan.framework, "edu-us");
    assert.equal(plan.summary.total, 17);
    assert.equal(plan.summary.covered, 17);
    const ferpa = plan.obligations.find(item => item.id === "ferpa-directory-information");
    assert.ok(ferpa);
    assert.equal(ferpa?.status, "covered");
    assert.ok(ferpa?.matches.some(match => match.id === "FERPA-DIRECTORY"));
    const markdown = renderEduUsPlanMarkdown(plan);
    assert.ok(markdown.includes("Education (US) Compliance Plan"));
  } finally {
    await fs.remove(repoRoot);
  }
});

test("verifyEduUsPlan reports passes when evidence exists", async () => {
  const repoRoot = await setupRepo();
  try {
    for (const relPath of ARTIFACT_PATHS) {
      const target = path.join(repoRoot, relPath);
      await fs.outputFile(target, "# artifact\n", "utf8");
    }
    const plan = await generateEduUsPlan({ repoRoot, overlays: ["ca-sopipa", "ny-2d"] });
    const report = await verifyEduUsPlan(plan, { repoRoot });
    assert.equal(report.summary.missing, 0);
    assert.equal(report.summary.pass, plan.summary.covered);
    assert.equal(report.alerts.length, 0);
    const markdown = renderEduUsReportMarkdown(report);
    assert.ok(markdown.includes("Compliance Report"));
  } finally {
    await fs.remove(repoRoot);
  }
});

async function setupRepo(): Promise<string> {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "speckit-edu-us-"));
  const specDir = path.join(tmpRoot, ".speckit");
  await fs.ensureDir(path.join(specDir, "schema"));
  await fs.copyFile(SCHEMA_PATH, path.join(specDir, "schema", "spec.schema.json"));
  await fs.writeFile(path.join(specDir, "spec.yaml"), SPEC_YAML, "utf8");
  return tmpRoot;
}
