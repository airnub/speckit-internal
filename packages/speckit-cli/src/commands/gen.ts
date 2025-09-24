import { Command, Option } from "clipanion";
import { generateDocs } from "../services/generator.js";

export class GenerateDocsCommand extends Command {
  static paths = [["gen"]];

  write = Option.Boolean("--write", false);

  async execute() {
    try {
      const result = await generateDocs({ write: this.write, stdout: this.context.stdout });
      const changed = result.outputs.filter(o => o.changed);

      if (this.write) {
        if (changed.length === 0) {
          this.context.stdout.write("No changes required.\n");
        }
      } else {
        if (changed.length === 0) {
          this.context.stdout.write("No changes required (dry run).\n");
        } else {
          this.context.stdout.write(`Would update ${changed.length} file(s):\n`);
          for (const item of changed) {
            this.context.stdout.write(`  - ${item.path}\n`);
          }
        }
      }
      return this.write ? 0 : changed.length === 0 ? 0 : 1;
    } catch (error: any) {
      const message = error?.message ?? String(error);
      this.context.stderr.write(`speckit gen failed: ${message}\n`);
      return 1;
    }
  }
}
