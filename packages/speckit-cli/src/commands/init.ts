import { Command, Option } from "clipanion";
import { loadTemplates, templateFromGithubUrl, TemplateEntry } from "@speckit/core";
import { useTemplateIntoDir } from "../services/template.js";

export class InitFromTemplateCommand extends Command {
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
