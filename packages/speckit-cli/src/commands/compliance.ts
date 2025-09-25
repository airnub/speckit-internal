import { Option } from "clipanion";
import { runCompliancePlan, runComplianceVerify } from "../services/compliance/index.js";
import { FRAMEWORKS, type FrameworkId } from "../config/frameworkRegistry.js";
import { assertModeAllowed } from "../config/featureFlags.js";
import { parseGenerationMode } from "../services/generationMode.js";
import {
  ensureFrameworksAllowed,
  parseFrameworkArgs,
  partitionFrameworkIds,
  resolveFrameworkSelection,
} from "../services/frameworks.js";
import { SpeckitCommand } from "./base.js";

export class CompliancePlanCommand extends SpeckitCommand {
  static paths = [["compliance", "plan"]];

  mode = Option.String("--mode");
  framework = Option.Array("--framework");
  frameworks = Option.Array("--frameworks");
  overlays = Option.String("--overlays", { required: false });

  async execute() {
    const parsedMode = this.mode ? parseGenerationMode(this.mode) : null;
    if (this.mode && !parsedMode) {
      this.context.stderr.write("speckit compliance plan failed: --mode must be classic or secure\n");
      return 1;
    }
    const frameworkArgs = parseFrameworkArgs({
      frameworks: this.framework,
      frameworksCsv: this.frameworks,
    });
    const selection = resolveFrameworkSelection({
      explicitFrameworks: frameworkArgs,
      preset: parsedMode,
    });
    if (selection.frameworks.length === 0) {
      this.context.stderr.write(
        "speckit compliance plan failed: at least one framework is required. Use --framework <id>.\n"
      );
      return 1;
    }
    if (selection.frameworks.length > 1) {
      this.context.stderr.write(
        "speckit compliance plan failed: specify a single framework per run.\n"
      );
      return 1;
    }
    const flags = this.resolveFeatureFlags();
    const { provider, context } = this.resolveEntitlements(flags);
    if (parsedMode === "secure") {
      try {
        await assertModeAllowed("secure", provider, context);
      } catch (error: any) {
        const message = error?.message ?? String(error);
        this.context.stderr.write(`speckit compliance plan failed: ${message}\n`);
        return 1;
      }
    }
    const { valid, unknown } = partitionFrameworkIds(selection.frameworks);
    if (unknown.length > 0) {
      this.context.stderr.write(
        `speckit compliance plan failed: Unknown framework(s): ${unknown.join(", ")}.\n`
      );
      return 1;
    }
    try {
      await ensureFrameworksAllowed(valid, provider, context);
    } catch (error: any) {
      const message = error?.message ?? String(error);
      this.context.stderr.write(`speckit compliance plan failed: ${message}\n`);
      return 1;
    }
    const frameworkId = valid[0] as FrameworkId;
    try {
      await runCompliancePlan({
        framework: frameworkId,
        repoRoot: process.cwd(),
        stdout: this.context.stdout,
        overlays: parseOverlayOption(this.overlays),
      });
      if (parsedMode === "secure") {
        this.context.stdout.write(
          "--mode secure is a preset alias. Prefer --frameworks iso27001,soc2,gdpr for explicit control.\n"
        );
      }
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

  mode = Option.String("--mode");
  framework = Option.Array("--framework");
  frameworks = Option.Array("--frameworks");
  overlays = Option.String("--overlays", { required: false });

  async execute() {
    const parsedMode = this.mode ? parseGenerationMode(this.mode) : null;
    if (this.mode && !parsedMode) {
      this.context.stderr.write("speckit compliance verify failed: --mode must be classic or secure\n");
      return 1;
    }
    const frameworkArgs = parseFrameworkArgs({
      frameworks: this.framework,
      frameworksCsv: this.frameworks,
    });
    const selection = resolveFrameworkSelection({
      explicitFrameworks: frameworkArgs,
      preset: parsedMode,
    });
    if (selection.frameworks.length === 0) {
      this.context.stderr.write(
        "speckit compliance verify failed: at least one framework is required. Use --framework <id>.\n"
      );
      return 1;
    }
    if (selection.frameworks.length > 1) {
      this.context.stderr.write(
        "speckit compliance verify failed: specify a single framework per run.\n"
      );
      return 1;
    }
    const flags = this.resolveFeatureFlags();
    const { provider, context } = this.resolveEntitlements(flags);
    if (parsedMode === "secure") {
      try {
        await assertModeAllowed("secure", provider, context);
      } catch (error: any) {
        const message = error?.message ?? String(error);
        this.context.stderr.write(`speckit compliance verify failed: ${message}\n`);
        return 1;
      }
    }
    const { valid, unknown } = partitionFrameworkIds(selection.frameworks);
    if (unknown.length > 0) {
      this.context.stderr.write(
        `speckit compliance verify failed: Unknown framework(s): ${unknown.join(", ")}.\n`
      );
      return 1;
    }
    try {
      await ensureFrameworksAllowed(valid, provider, context);
    } catch (error: any) {
      const message = error?.message ?? String(error);
      this.context.stderr.write(`speckit compliance verify failed: ${message}\n`);
      return 1;
    }
    const frameworkId = valid[0] as FrameworkId;
    try {
      const result = await runComplianceVerify({
        framework: frameworkId,
        repoRoot: process.cwd(),
        stdout: this.context.stdout,
        overlays: parseOverlayOption(this.overlays),
      });
      if (parsedMode === "secure") {
        this.context.stdout.write(
          "--mode secure is a preset alias. Prefer --frameworks iso27001,soc2,gdpr for explicit control.\n"
        );
      }
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
