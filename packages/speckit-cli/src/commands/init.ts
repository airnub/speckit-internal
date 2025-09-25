import { Option } from "clipanion";
import { loadTemplates, templateFromGithubUrl, TemplateEntry } from "@speckit/engine";
import { useTemplateIntoDir } from "../services/template.js";
import { assertModeAllowed } from "../config/featureFlags.js";
import { parseGenerationMode } from "../services/generationMode.js";
import {
  ensureFrameworksAllowed,
  parseFrameworkArgs,
  partitionFrameworkIds,
  resolveFrameworkSelection,
} from "../services/frameworks.js";
import { SpeckitCommand } from "./base.js";

export class InitFromTemplateCommand extends SpeckitCommand {
  static paths = [["init"]];
  tpl = Option.String("--template");
  mode = Option.String("--mode");
  framework = Option.Array("--framework");
  frameworks = Option.Array("--frameworks");
  async execute() {
    if (!this.tpl) { this.context.stderr.write("--template is required\n"); return 1; }
    const parsedMode = this.mode ? parseGenerationMode(this.mode) : null;
    if (this.mode && !parsedMode) {
      this.context.stderr.write("Unknown mode. Use 'classic' or 'secure'.\n");
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
    const flags = this.resolveFeatureFlags();
    const { provider, context } = this.resolveEntitlements(flags);
    if (parsedMode === "secure") {
      try {
        await assertModeAllowed("secure", provider, context);
      } catch (error: any) {
        const message = error?.message ?? String(error);
        this.context.stderr.write(`speckit init failed: ${message}\n`);
        return 1;
      }
    }
    const { valid, unknown } = partitionFrameworkIds(selection.frameworks);
    if (unknown.length > 0) {
      this.context.stderr.write(
        `speckit init failed: Unknown framework(s): ${unknown.join(", ")}. Run 'speckit frameworks list' for options.\n`
      );
      return 1;
    }
    try {
      await ensureFrameworksAllowed(valid, provider, context);
    } catch (error: any) {
      const message = error?.message ?? String(error);
      this.context.stderr.write(`speckit init failed: ${message}\n`);
      return 1;
    }
    const list = await loadTemplates({ repoRoot: process.cwd() });
    let t: TemplateEntry | null | undefined = list.find(x => x.name === this.tpl);
    if (!t) {
      t = templateFromGithubUrl(this.tpl);
    }
    if (!t) { this.context.stderr.write(`Template '${this.tpl}' not found.\n`); return 1; }
    if (parsedMode === "secure") {
      this.context.stdout.write(
        "--mode secure is a preset alias. Prefer --frameworks iso27001,soc2,gdpr for explicit control.\n"
      );
    }
    if (selection.frameworks.length > 0) {
      this.context.stdout.write(
        `Using frameworks: ${selection.frameworks.join(", ")}\n`
      );
    } else {
      this.context.stdout.write("Using Classic mode (set --mode secure to enable standards).\n");
    }
    const cwd = process.cwd();
    await useTemplateIntoDir(t, cwd, { mergeIntoCwd: true, promptVars: true, runPostInit: true });
    this.context.stdout.write(`\nInitialized template '${t.name}' into ${cwd}.\n`);
  }
}
