import { Option } from "clipanion";
import { generateDocs } from "../services/generator.js";
import { parseGenerationMode } from "../services/mode.js";
import { assertModeAllowed } from "../config/featureFlags.js";
import { SpeckitCommand } from "./base.js";

export class GenerateDocsCommand extends SpeckitCommand {
  static paths = [["gen"]];

  write = Option.Boolean("--write", false);
  mode = Option.String("--mode");

  async execute() {
    try {
      const parsedMode = this.mode ? parseGenerationMode(this.mode) : undefined;
      if (this.mode && !parsedMode) {
        this.context.stderr.write(
          "speckit gen failed: --mode must be one of: classic, secure\n"
        );
        return 1;
      }

      const flags = this.resolveFeatureFlags();
      if (parsedMode) {
        try {
          assertModeAllowed(parsedMode, flags);
        } catch (error: any) {
          const message = error?.message ?? String(error);
          this.context.stderr.write(`speckit gen failed: ${message}\n`);
          return 1;
        }
      }

      const result = await generateDocs({
        write: this.write,
        stdout: this.context.stdout,
        mode: parsedMode ?? undefined,
        flags,
      });
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
