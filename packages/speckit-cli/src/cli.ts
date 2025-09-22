#!/usr/bin/env node
import { Cli, Builtins } from "clipanion";
import { render } from "cfonts";
import boxen from "boxen";
import { CreateCommand } from "./commands/create.js";
import { ReplCommand } from "./commands/repl.js";
import { TemplateListCommand, TemplateUseCommand } from "./commands/template.js";
import { InitFromTemplateCommand } from "./commands/init.js";

render("SpecKit", { font: "block" });
console.log(boxen("SpecKit v0.0.1: `spec template list` · `spec init --template next-supabase` · `spec init --template speckit-template`", { padding: 1, borderStyle: "round" }));

const [, , ...args] = process.argv;
const cli = new Cli({ binaryLabel: "spec", binaryName: "spec", binaryVersion: "0.0.1" });

cli.register(Builtins.HelpCommand);
cli.register(Builtins.VersionCommand);
cli.register(CreateCommand);
cli.register(ReplCommand);
cli.register(TemplateListCommand);
cli.register(TemplateUseCommand);
cli.register(InitFromTemplateCommand);

cli.runExit(args, Cli.defaultContext);
