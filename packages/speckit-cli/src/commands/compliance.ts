import { Command, Option } from "clipanion";
import { runCompliancePlan, runComplianceVerify } from "../services/compliance/index.js";

export class CompliancePlanCommand extends Command {
  static paths = [["compliance", "plan"]];

  framework = Option.String("--framework");

  async execute() {
    if (!this.framework) {
      this.context.stderr.write("speckit compliance plan failed: --framework is required\n");
      return 1;
    }
    try {
      await runCompliancePlan({
        framework: this.framework,
        repoRoot: process.cwd(),
        stdout: this.context.stdout,
      });
      return 0;
    } catch (error: any) {
      const message = error?.message ?? String(error);
      this.context.stderr.write(`speckit compliance plan failed: ${message}\n`);
      return 1;
    }
  }
}

export class ComplianceVerifyCommand extends Command {
  static paths = [["compliance", "verify"]];

  framework = Option.String("--framework");

  async execute() {
    if (!this.framework) {
      this.context.stderr.write("speckit compliance verify failed: --framework is required\n");
      return 1;
    }
    try {
      const result = await runComplianceVerify({
        framework: this.framework,
        repoRoot: process.cwd(),
        stdout: this.context.stdout,
      });
      return result.failed ? 1 : 0;
    } catch (error: any) {
      const message = error?.message ?? String(error);
      this.context.stderr.write(`speckit compliance verify failed: ${message}\n`);
      return 1;
    }
  }
}
