import type { Writable } from "node:stream";
import { generateHipaaPlan, verifyHipaaCompliance } from "./hipaa.js";
import { generateEduUsPlan, verifyEduUsCompliance } from "./edu-us.js";

type BaseOptions = { repoRoot?: string; stdout?: Writable };

type PlanOptions = BaseOptions & { framework: string; overlays?: string[] };
type VerifyOptions = BaseOptions & { framework: string; overlays?: string[] };

type VerifyResult = { failed: boolean; reportPath: string; summaryPath: string };

type PlanHandler = (options: { repoRoot: string; stdout?: Writable; overlays?: string[] }) => Promise<void>;
type VerifyHandler = (options: {
  repoRoot: string;
  stdout?: Writable;
  overlays?: string[];
}) => Promise<VerifyResult>;

const PLAN_HANDLERS: Record<string, PlanHandler> = {
  hipaa: generateHipaaPlan,
  "edu-us": generateEduUsPlan,
};

const VERIFY_HANDLERS: Record<string, VerifyHandler> = {
  hipaa: verifyHipaaCompliance,
  "edu-us": verifyEduUsCompliance,
};

export async function runCompliancePlan(options: PlanOptions) {
  const repoRoot = options.repoRoot ?? process.cwd();
  const handler = PLAN_HANDLERS[options.framework];
  if (!handler) {
    throw new Error(`Unsupported compliance framework '${options.framework}'`);
  }
  await handler({ repoRoot, stdout: options.stdout, overlays: options.overlays });
}

export async function runComplianceVerify(options: VerifyOptions): Promise<VerifyResult> {
  const repoRoot = options.repoRoot ?? process.cwd();
  const handler = VERIFY_HANDLERS[options.framework];
  if (!handler) {
    throw new Error(`Unsupported compliance framework '${options.framework}'`);
  }
  return await handler({ repoRoot, stdout: options.stdout, overlays: options.overlays });
}
