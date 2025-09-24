import type { Writable } from "node:stream";
import { generateHipaaPlan, verifyHipaaCompliance } from "./hipaa.js";

type BaseOptions = { repoRoot?: string; stdout?: Writable };

type PlanOptions = BaseOptions & { framework: string };
type VerifyOptions = BaseOptions & { framework: string };

type VerifyResult = { failed: boolean; reportPath: string; summaryPath: string };

type PlanHandler = (options: { repoRoot: string; stdout?: Writable }) => Promise<void>;
type VerifyHandler = (options: { repoRoot: string; stdout?: Writable }) => Promise<VerifyResult>;

const PLAN_HANDLERS: Record<string, PlanHandler> = {
  hipaa: generateHipaaPlan,
};

const VERIFY_HANDLERS: Record<string, VerifyHandler> = {
  hipaa: verifyHipaaCompliance,
};

export async function runCompliancePlan(options: PlanOptions) {
  const repoRoot = options.repoRoot ?? process.cwd();
  const handler = PLAN_HANDLERS[options.framework];
  if (!handler) {
    throw new Error(`Unsupported compliance framework '${options.framework}'`);
  }
  await handler({ repoRoot, stdout: options.stdout });
}

export async function runComplianceVerify(options: VerifyOptions): Promise<VerifyResult> {
  const repoRoot = options.repoRoot ?? process.cwd();
  const handler = VERIFY_HANDLERS[options.framework];
  if (!handler) {
    throw new Error(`Unsupported compliance framework '${options.framework}'`);
  }
  return await handler({ repoRoot, stdout: options.stdout });
}
