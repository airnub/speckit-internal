import { Command, Option } from "clipanion";
import { generateHipaaPlan, verifyHipaaCompliance } from "../services/compliance.js";

const HIPAA_FRAMEWORK = "hipaa";

export class CompliancePlanCommand extends Command {
  static paths = [["compliance", "plan"]];

  framework = Option.String("--framework", { required: true });

  async execute() {
    if (this.framework !== HIPAA_FRAMEWORK) {
      this.context.stderr.write(`Unsupported framework '${this.framework}'. Only 'hipaa' is available.\n`);
      return 1;
    }

    try {
      const result = await generateHipaaPlan(process.cwd(), this.context.stdout);
      const changed = result.outputs.filter(output => output.changed).length;
      const total = result.outputs.length;
      this.context.stdout.write(
        `Generated HIPAA compliance plan (${changed}/${total} files changed).\n`
      );
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

  framework = Option.String("--framework", { required: true });

  async execute() {
    if (this.framework !== HIPAA_FRAMEWORK) {
      this.context.stderr.write(`Unsupported framework '${this.framework}'. Only 'hipaa' is available.\n`);
      return 1;
    }

    try {
      const result = await verifyHipaaCompliance(process.cwd(), this.context.stdout);
      const hasFailures = result.summary.fail > 0 || result.opa.deny.length > 0;
      if (hasFailures) {
        this.context.stderr.write(
          `HIPAA verification failed: ${result.summary.fail} controls failing, ${result.opa.deny.length} OPA denies.\n`
        );
        return 1;
      }
      this.context.stdout.write(
        `HIPAA verification passed with ${result.summary.pass} controls satisfied (${result.summary.manual} manual).\n`
      );
      return 0;
    } catch (error: any) {
      const message = error?.message ?? String(error);
      this.context.stderr.write(`speckit compliance verify failed: ${message}\n`);
      return 1;
    }
  }
}
