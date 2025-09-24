import { Command } from "clipanion";
import { auditProvenance } from "../services/audit.js";

export class AuditCommand extends Command {
  static paths = [["audit"]];

  async execute() {
    try {
      const { hasIssues } = await auditProvenance({
        repoRoot: process.cwd(),
        stdout: this.context.stdout,
        stderr: this.context.stderr
      });
      return hasIssues ? 1 : 0;
    } catch (error: any) {
      this.context.stderr.write(`Audit failed: ${error?.message || error}\n`);
      return 1;
    }
  }
}
