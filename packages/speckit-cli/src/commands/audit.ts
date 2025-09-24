import { Command } from "clipanion";
import { auditGeneratedDocs } from "../services/audit.js";

export class AuditCommand extends Command {
  static paths = [["audit"]];

  async execute() {
    try {
      const result = await auditGeneratedDocs(process.cwd(), this.context.stdout, this.context.stderr);
      return result.ok ? 0 : 1;
    } catch (error: any) {
      const message = error?.message ?? String(error);
      this.context.stderr.write(`speckit audit failed: ${message}\n`);
      return 1;
    }
  }
}
