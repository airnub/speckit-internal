#!/usr/bin/env node
import { Cli, Builtins } from "clipanion";
import cfonts from "cfonts";
import boxen from "boxen";
import { CreateCommand } from "./commands/create.js";
import { ReplCommand } from "./commands/repl.js";
import { TemplateListCommand, TemplateUseCommand } from "./commands/template.js";
import { InitFromTemplateCommand } from "./commands/init.js";
import { GenerateDocsCommand } from "./commands/gen.js";
import { AuditCommand } from "./commands/audit.js";

cfonts.say("speckit", { font: "block" });
console.log(
  boxen(
    "speckit v0.0.1 (alias: spec): `speckit template list` · `speckit init --template next-supabase` · `speckit init --template speckit-template`",
    { padding: 1, borderStyle: "round" },
  ),
);

const [, , ...args] = process.argv;
const cli = new Cli({ binaryLabel: "speckit", binaryName: "speckit", binaryVersion: "0.0.1" });

cli.register(Builtins.HelpCommand);
cli.register(Builtins.VersionCommand);
cli.register(CreateCommand);
cli.register(ReplCommand);
cli.register(TemplateListCommand);
cli.register(TemplateUseCommand);
cli.register(InitFromTemplateCommand);
cli.register(GenerateDocsCommand);
cli.register(AuditCommand);

cli.runExit(args, Cli.defaultContext);
