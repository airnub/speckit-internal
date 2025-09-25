import { Option } from "clipanion";
import { SpeckitCommand } from "./base.js";
import { FRAMEWORKS } from "../config/frameworkRegistry.js";
import { isExperimentalEnabled } from "../config/featureFlags.js";

export class FrameworksListCommand extends SpeckitCommand {
  static paths = [["frameworks", "list"]];

  json = Option.Boolean("--json", false);

  async execute() {
    const flags = this.resolveFeatureFlags();
    const bundle = this.buildEntitlementsBundle(flags);
    const experimentalOn = isExperimentalEnabled(flags);
    const entries = await Promise.all(
      Object.values(FRAMEWORKS).map(async meta => {
        const decision = await bundle.entitlements.isAllowed(`framework.${meta.id}`, bundle.context);
        return {
          id: meta.id,
          title: meta.title,
          status: meta.availability.status,
          requires: meta.availability.requires ?? {},
          tags: [...meta.tags],
          bundles: [...meta.bundles],
          allowed: decision.allowed,
          reason: decision.reason,
        };
      })
    );

    const jsonOutput = this.json === true;

    if (jsonOutput) {
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
      const statusBadge = entry.status === "ga" ? "[GA]" : "[Experimental]";
      const planBadge = entry.requires?.minPlan ? ` [${entry.requires.minPlan.toUpperCase()}]` : "";
      const availability = entry.allowed
        ? "available"
        : entry.reason ?? "locked — enable with --experimental or SPECKIT_EXPERIMENTAL=1";
      this.context.stdout.write(
        `- ${entry.id.padEnd(8)} ${statusBadge}${planBadge} ${entry.title} — ${availability}\n`
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
