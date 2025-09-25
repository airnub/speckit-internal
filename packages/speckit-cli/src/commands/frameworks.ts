import { Option } from "clipanion";
import { SpeckitCommand } from "./base.js";
import { FRAMEWORKS, isFrameworkAllowed } from "../config/frameworkRegistry.js";
import { isExperimentalEnabled } from "../config/featureFlags.js";

export class FrameworksListCommand extends SpeckitCommand {
  static paths = [["frameworks", "list"]];

  json = Option.Boolean("--json", false);

  async execute() {
    const flags = this.resolveFeatureFlags();
    const experimentalOn = isExperimentalEnabled(flags);
    const entries = Object.values(FRAMEWORKS).map(meta => ({
      id: meta.id,
      title: meta.title,
      status: meta.status,
      tags: [...meta.tags],
      bundles: [...meta.bundles],
      allowed: isFrameworkAllowed(meta.id, flags),
    }));

    if (this.json) {
      this.context.stdout.write(
        `${JSON.stringify({ experimental: flags.experimental, frameworks: entries }, null, 2)}\n`
      );
      return 0;
    }

    this.context.stdout.write("Speckit Framework Registry\n===========================\n\n");
    this.context.stdout.write(
      `Experimental gate: ${experimentalOn ? "ENABLED" : "DISABLED"}\n\n`
    );
    for (const entry of entries) {
      const badge = entry.status === "ga" ? "[GA]" : "[Experimental]";
      const availability = entry.allowed
        ? "available"
        : "locked — enable with --experimental or SPECKIT_EXPERIMENTAL=1";
      this.context.stdout.write(
        `- ${entry.id.padEnd(8)} ${badge} ${entry.title} — ${availability}\n`
      );
      if (entry.tags.length) {
        this.context.stdout.write(`  tags: ${entry.tags.join(", ")}\n`);
      }
      if (entry.bundles.length) {
        this.context.stdout.write(`  bundles: ${entry.bundles.join(", ")}\n`);
      }
      this.context.stdout.write("\n");
    }

    if (!experimentalOn) {
      this.context.stdout.write(
        "Experimental frameworks are locked. Re-run with --experimental, set SPECKIT_EXPERIMENTAL=1, " +
          "or configure settings.experimental.enabled: true.\n"
      );
    }

    return 0;
  }
}
