import { Command, Option } from "clipanion";
import { loadTemplates } from "@speckit/core";
import { useTemplateIntoDir } from "../services/template.js";

export class InitFromTemplateCommand extends Command {
  static paths = [["init"]];
  tpl = Option.String("--template");
  async execute() {
    if (!this.tpl) { this.context.stderr.write("--template is required\n"); return 1; }
    const list = await loadTemplates({ repoRoot: process.cwd() });
    const t = list.find(x => x.name === this.tpl);
    if (!t) { this.context.stderr.write(`Template '${this.tpl}' not found.\n`); return 1; }
    const cwd = process.cwd();
    await useTemplateIntoDir(t, cwd, { mergeIntoCwd: true, promptVars: true, runPostInit: true });
    this.context.stdout.write(`\nInitialized template '${t.name}' into ${cwd}.\n`);
  }
}
