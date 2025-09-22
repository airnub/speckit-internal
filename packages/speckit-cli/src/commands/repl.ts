import { Command } from "clipanion";
import repl from "node:repl";
import { runCreateWizard } from "../services/wizard.js";

export class ReplCommand extends Command {
  static paths = [["repl"]];
  static usage = { description: "Start an interactive shell" };

  async execute() {
    const server = repl.start({ prompt: "spec> " });
    server.context.create = async (opts?: Partial<Parameters<typeof runCreateWizard>[0]>) => {
      const out = await runCreateWizard({ ...(opts ?? {}), stdout: process.stdout });
      return out;
    };
    server.context.help = () => "Available: create(opts), .exit";
  }
}
