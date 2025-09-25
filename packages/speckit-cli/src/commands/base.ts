import { Command, Option } from "clipanion";
import type { FeatureFlags, CliArgs, LocalEntitlementsBundle } from "../config/featureFlags.js";
import { createLocalEntitlementsBundle, getFlags } from "../config/featureFlags.js";

export abstract class SpeckitCommand extends Command {
  experimentalFlag = Option.Boolean("--experimental", false);

  noExperimentalFlag = Option.Boolean("--no-experimental", false);

  protected resolveFeatureFlags(extra?: Partial<CliArgs>): FeatureFlags {
    const cliArgs = this.buildCliArgs(extra);
    return getFlags(cliArgs);
  }

  protected buildEntitlementsBundle(flags: FeatureFlags): LocalEntitlementsBundle {
    return createLocalEntitlementsBundle(flags);
  }

  protected buildCliArgs(extra?: Partial<CliArgs>): CliArgs {
    const args: CliArgs = { cwd: process.cwd() };
    if (this.experimentalFlag) {
      args.experimental = true;
    }
    if (this.noExperimentalFlag) {
      args.noExperimental = true;
    }
    if (extra) {
      return { ...args, ...extra };
    }
    return args;
  }
}
