import { Option } from "clipanion";
import { generateDocs } from "../services/generator.js";
import { parseGenerationMode } from "../services/generationMode.js";
import { assertModeAllowed } from "../config/featureFlags.js";
import {
  ensureFrameworksAllowed,
  parseFrameworkArgs,
  partitionFrameworkIds,
  resolveFrameworkSelection,
} from "../services/frameworks.js";
import { SpeckitCommand } from "./base.js";

export class GenerateDocsCommand extends SpeckitCommand {
  static paths = [["gen"]];

  write = Option.Boolean("--write", false);
  mode = Option.String("--mode");
  framework = Option.Array("--framework");
  frameworks = Option.Array("--frameworks");

  async execute() {
    try {
      const parsedMode = this.mode ? parseGenerationMode(this.mode) : undefined;
      if (this.mode && !parsedMode) {
        this.context.stderr.write(
          "speckit gen failed: --mode must be one of: classic, secure\n"
        );
        return 1;
      }

      const frameworkArgs = parseFrameworkArgs({
        frameworks: this.framework,
        frameworksCsv: this.frameworks,
      });
      const selection = resolveFrameworkSelection({
        explicitFrameworks: frameworkArgs,
        preset: parsedMode ?? null,
      });

      const flags = this.resolveFeatureFlags();
      const { provider, context } = this.resolveEntitlements(flags);
      if (parsedMode === "secure") {
        try {
          await assertModeAllowed(parsedMode, provider, context);
        } catch (error: any) {
          const message = error?.message ?? String(error);
          this.context.stderr.write(`speckit gen failed: ${message}\n`);
          return 1;
        }
      }

      const { valid, unknown } = partitionFrameworkIds(selection.frameworks);
      if (unknown.length > 0) {
        this.context.stderr.write(
          `speckit gen failed: Unknown framework(s): ${unknown.join(", ")}. Run 'speckit frameworks list' for options.\n`
        );
        return 1;
      }
      try {
        await ensureFrameworksAllowed(valid, provider, context);
      } catch (error: any) {
        const message = error?.message ?? String(error);
        this.context.stderr.write(`speckit gen failed: ${message}\n`);
        return 1;
      }

      if (parsedMode === "secure") {
        this.context.stdout.write(
          "--mode secure is a preset alias. Prefer --frameworks iso27001,soc2,gdpr for explicit control.\n"
        );
      }

      const presetLabel =
        selection.source === "explicit"
          ? parsedMode ?? "classic"
          : selection.preset;

      const result = await generateDocs({
        write: this.write,
        stdout: this.context.stdout,
        preset: presetLabel,
        frameworks: selection.frameworks,
        flags,
        entitlements: provider,
        evaluationContext: context,
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
