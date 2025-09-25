import { Option } from "clipanion";
import { loadTemplates, templateFromGithubUrl, TemplateEntry } from "@speckit/core";
import { useTemplateIntoDir } from "../services/template.js";
import { assertModeAllowed } from "../config/featureFlags.js";
import { SpeckitCommand } from "./base.js";

export class InitFromTemplateCommand extends SpeckitCommand {
  static paths = [["init"]];
  tpl = Option.String("--template");
  mode = Option.String("--mode");
  async execute() {
    if (!this.tpl) { this.context.stderr.write("--template is required\n"); return 1; }
    const normalizedMode = (this.mode ?? "classic").toLowerCase();
    if (normalizedMode !== "classic" && normalizedMode !== "secure") {
      this.context.stderr.write(`Unknown mode '${this.mode}'. Use 'classic' or 'secure'.\n`);
      return 1;
    }
    const flags = this.resolveFeatureFlags();
    try {
      assertModeAllowed(normalizedMode as "classic" | "secure", flags);
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
    if (normalizedMode === "secure") {
      this.context.stdout.write("Using Secure mode (standards enforced).\n");
    } else {
      this.context.stdout.write("Using Classic mode (set --mode secure to enable standards).\n");
    }
    const cwd = process.cwd();
    await useTemplateIntoDir(t, cwd, { mergeIntoCwd: true, promptVars: true, runPostInit: true });
    this.context.stdout.write(`\nInitialized template '${t.name}' into ${cwd}.\n`);
  }
}
