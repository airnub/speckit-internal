import { Command, Option } from "clipanion";
import { generateAll } from "../services/generate.js";

export class GenerateCommand extends Command {
  static paths = [["gen"]];

  write = Option.Boolean("--write", false);

  async execute() {
    try {
      await generateAll({
        repoRoot: process.cwd(),
        write: this.write,
        stdout: this.context.stdout,
        stderr: this.context.stderr
      });
    } catch (error: any) {
      this.context.stderr.write(`Generation failed: ${error?.message || error}\n`);
      return 1;
    }
    return 0;
  }
}
