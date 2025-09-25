import { Option } from "clipanion";
import { SpeckitCommand } from "./base.js";
import { isExperimentalEnabled } from "../config/featureFlags.js";

export class ConfigPrintCommand extends SpeckitCommand {
  static paths = [["config", "print"]];

  json = Option.Boolean("--json", false);

  async execute() {
    const flags = this.resolveFeatureFlags();
    const experimentalOn = isExperimentalEnabled(flags);

    if (this.json) {
      this.context.stdout.write(`${JSON.stringify({ featureFlags: flags }, null, 2)}\n`);
      return 0;
    }

    this.context.stdout.write("Speckit Configuration\n======================\n\n");
    this.context.stdout.write(`Experimental gate: ${experimentalOn ? "ENABLED" : "DISABLED"}\n`);
    this.context.stdout.write("Modes:\n");
    this.context.stdout.write(
      `  - classic: experimental=${String(flags.modes.classic.experimental)}\n`
    );
    this.context.stdout.write(
      `  - secure: experimental=${String(flags.modes.secure.experimental)}\n`
    );
    this.context.stdout.write("\nExperimental feature toggles:\n");
    const featureEntries = Object.entries(flags.experimental.features);
    if (featureEntries.length === 0) {
      this.context.stdout.write("  (none configured)\n");
    } else {
      for (const [key, value] of featureEntries) {
        this.context.stdout.write(`  - ${key}: ${value ? "enabled" : "disabled"}\n`);
      }
    }
    this.context.stdout.write("\nUse --json for a machine-readable view.\n");

    return 0;
  }
}
