import { Command, Option } from "clipanion";
import { loadTemplates, templateFromGithubUrl, TemplateEntry } from "@speckit/core";
import { useTemplateIntoDir } from "../services/template.js";

export class TemplateListCommand extends Command {
  static paths = [["template","list"]];
  async execute() {
    const list = await loadTemplates({ repoRoot: process.cwd() });
    this.context.stdout.write("Available templates:\n");
    for (const t of list) {
      this.context.stdout.write(`  - ${t.name} [${t.type}] : ${t.description}\n`);
    }
  }
}

export class TemplateUseCommand extends Command {
  static paths = [["template","use"]];
  name = Option.String({ name: "name" });
  targetDir = Option.String({ name: "targetDir" });
  async execute() {
    const list = await loadTemplates({ repoRoot: process.cwd() });
    let t: TemplateEntry | null | undefined = list.find(x => x.name === this.name);
    if (!t) {
      t = templateFromGithubUrl(this.name);
    }
    if (!t) { this.context.stderr.write(`Template '${this.name}' not found.\n`); return 1; }
    await useTemplateIntoDir(t, this.targetDir, { mergeIntoCwd: false, promptVars: true, runPostInit: true });
    this.context.stdout.write(`\nTemplate '${t.name}' ready at ${this.targetDir}.\n`);
  }
}
