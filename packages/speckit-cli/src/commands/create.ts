import { Command, Option } from "clipanion";
import { runCreateWizard } from "../services/wizard.js";

export class CreateCommand extends Command {
  static paths = [["create"]];
  name = Option.String("--name");
  pm = Option.String("--pm");
  ts = Option.Boolean("--ts", true);
  git = Option.Boolean("--git", true);
  yes = Option.Boolean("-y,--yes", false);

  async execute() {
    const answers = await runCreateWizard({
      name: this.name,
      pm: this.pm as any,
      ts: this.ts,
      git: this.git,
      yes: this.yes,
      stdout: this.context.stdout,
    });
    this.context.stdout.write(`\nScaffold summary → ${JSON.stringify(answers, null, 2)}\n`);
  }
}
