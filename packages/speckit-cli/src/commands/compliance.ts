import { Option } from "clipanion";
import { runCompliancePlan, runComplianceVerify } from "../services/compliance/index.js";
import { FRAMEWORKS, type FrameworkId } from "../config/frameworkRegistry.js";
import { assertFrameworksAllowed, assertModeAllowed } from "../config/featureFlags.js";
import { SpeckitCommand } from "./base.js";

export class CompliancePlanCommand extends SpeckitCommand {
  static paths = [["compliance", "plan"]];

  framework = Option.String("--framework");
  overlays = Option.String("--overlays", { required: false });

  async execute() {
    if (!this.framework) {
      this.context.stderr.write("speckit compliance plan failed: --framework is required\n");
      return 1;
    }
    const flags = this.resolveFeatureFlags();
    const bundle = this.buildEntitlementsBundle(flags);
    try {
      await assertModeAllowed("secure", bundle.entitlements, bundle.context);
    } catch (error: any) {
      const message = error?.message ?? String(error);
      this.context.stderr.write(`speckit compliance plan failed: ${message}\n`);
      return 1;
    }
    const frameworkId = this.framework as FrameworkId;
    if (!Object.prototype.hasOwnProperty.call(FRAMEWORKS, frameworkId)) {
      this.context.stderr.write(`speckit compliance plan failed: Unknown framework '${this.framework}'\n`);
      return 1;
    }
    try {
      await assertFrameworksAllowed([frameworkId], bundle);
    } catch (error: any) {
      const message = error?.message ?? String(error);
      this.context.stderr.write(`speckit compliance plan failed: ${message}\n`);
      return 1;
    }
    try {
      await runCompliancePlan({
        framework: this.framework,
        repoRoot: process.cwd(),
        stdout: this.context.stdout,
        overlays: parseOverlayOption(this.overlays),
      });
      return 0;
    } catch (error: any) {
      const message = error?.message ?? String(error);
      this.context.stderr.write(`speckit compliance plan failed: ${message}\n`);
      return 1;
    }
  }
}

export class ComplianceVerifyCommand extends SpeckitCommand {
  static paths = [["compliance", "verify"]];

  framework = Option.String("--framework");
  overlays = Option.String("--overlays", { required: false });

  async execute() {
    if (!this.framework) {
      this.context.stderr.write("speckit compliance verify failed: --framework is required\n");
      return 1;
    }
    const flags = this.resolveFeatureFlags();
    const bundle = this.buildEntitlementsBundle(flags);
    try {
      await assertModeAllowed("secure", bundle.entitlements, bundle.context);
    } catch (error: any) {
      const message = error?.message ?? String(error);
      this.context.stderr.write(`speckit compliance verify failed: ${message}\n`);
      return 1;
    }
    const frameworkId = this.framework as FrameworkId;
    if (!Object.prototype.hasOwnProperty.call(FRAMEWORKS, frameworkId)) {
      this.context.stderr.write(`speckit compliance verify failed: Unknown framework '${this.framework}'\n`);
      return 1;
    }
    try {
      await assertFrameworksAllowed([frameworkId], bundle);
    } catch (error: any) {
      const message = error?.message ?? String(error);
      this.context.stderr.write(`speckit compliance verify failed: ${message}\n`);
      return 1;
    }
    try {
      const result = await runComplianceVerify({
        framework: this.framework,
        repoRoot: process.cwd(),
        stdout: this.context.stdout,
        overlays: parseOverlayOption(this.overlays),
      });
      return result.failed ? 1 : 0;
    } catch (error: any) {
      const message = error?.message ?? String(error);
      this.context.stderr.write(`speckit compliance verify failed: ${message}\n`);
      return 1;
    }
  }
}

function parseOverlayOption(value?: string | null): string[] | undefined {
  if (!value) {
    return undefined;
  }
  const entries = value
    .split(",")
    .map(segment => segment.trim())
    .filter(segment => segment.length > 0);
  return entries.length > 0 ? entries : undefined;
}
