import { input, select, confirm } from "@inquirer/prompts";
import { z } from "zod";

const DEFAULTS = { name: "my-app", pm: "pnpm" as const, ts: true, git: true };

const Answers = z.object({
  name: z.string().min(1),
  pm: z.enum(["pnpm","npm","yarn","bun"]),
  ts: z.boolean(),
  git: z.boolean(),
});
export type CreateAnswers = z.infer<typeof Answers>;
type WizardOpts = Partial<CreateAnswers> & { yes?: boolean; stdout?: NodeJS.WriteStream };

export async function runCreateWizard(opts: WizardOpts = {}) {
  const yes = opts.yes ?? false;
  const name = yes ? (opts.name ?? DEFAULTS.name) : (opts.name ?? await input({ message: "Project name", default: DEFAULTS.name }));
  const pm = yes ? (opts.pm ?? DEFAULTS.pm) : (opts.pm ?? await select({
    message: "Package manager", choices: ["pnpm","npm","yarn","bun"].map(v => ({ name: v, value: v })), default: DEFAULTS.pm
  }));
  const ts = yes ? (opts.ts ?? DEFAULTS.ts) : (opts.ts ?? await confirm({ message: "Use TypeScript?", default: DEFAULTS.ts }));
  const git = yes ? (opts.git ?? DEFAULTS.git) : (opts.git ?? await confirm({ message: "Initialize a git repo?", default: DEFAULTS.git }));
  const answers = { name, pm, ts, git } as const;
  opts.stdout?.write(`\nCreating ${answers.name} with ${answers.pm} (${answers.ts ? "TS":"JS"}), git: ${answers.git}\n`);
  return answers;
}
