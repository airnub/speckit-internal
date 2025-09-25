import { Option } from "clipanion";
import path from "node:path";
import fs from "fs-extra";
import { loadTemplates } from "@speckit/core";
import { loadSpecModel } from "../services/spec.js";
import {
  GENERATION_MODES,
  resolveDefaultGenerationMode,
  templateModes,
} from "../services/mode.js";
import { SpeckitCommand } from "./base.js";
import { FRAMEWORKS, type FrameworkId, type FrameworkStatus, isFrameworkAllowed } from "../config/frameworkRegistry.js";
import { isExperimentalEnabled } from "../config/featureFlags.js";

type FrameworkReportEntry = {
  id: FrameworkId;
  title: string;
  status: FrameworkStatus;
  allowed: boolean;
};

type SelectedFrameworkReportEntry = {
  id: string;
  title: string;
  status: FrameworkStatus;
  allowed: boolean;
};

export class DoctorCommand extends SpeckitCommand {
  static paths = [["doctor"]];

  json = Option.Boolean("--json", false);

  async execute() {
    try {
      const repoRoot = process.cwd();
      const flags = this.resolveFeatureFlags();
      const { data } = await loadSpecModel(repoRoot);
      const defaultMode = resolveDefaultGenerationMode(data);
      const templates = await loadTemplates({ repoRoot });

      const grouped = new Map<string, string[]>();
      for (const mode of GENERATION_MODES) {
        grouped.set(mode, []);
      }
      for (const entry of templates) {
        const modes = templateModes(entry);
        for (const mode of modes) {
          const bucket = grouped.get(mode) ?? [];
          bucket.push(entry.name);
          grouped.set(mode, bucket);
        }
      }
      for (const bucket of grouped.values()) {
        bucket.sort((a, b) => a.localeCompare(b));
      }

      const frameworksReport: FrameworkReportEntry[] = Object.values(FRAMEWORKS).map(meta => ({
        id: meta.id,
        title: meta.title,
        status: meta.status,
        allowed: isFrameworkAllowed(meta.id, flags),
      }));

      const selectedFrameworkIds: string[] = Array.isArray(data?.compliance?.frameworks)
        ? data.compliance.frameworks
            .map((entry: any) => (typeof entry?.id === "string" ? entry.id.trim() : ""))
            .filter((id: string): id is string => Boolean(id))
        : [];

      const selectedFrameworks: SelectedFrameworkReportEntry[] = selectedFrameworkIds.map(id => {
        const meta = FRAMEWORKS[id as FrameworkId];
        if (meta) {
          return {
            id: meta.id,
            title: meta.title,
            status: meta.status,
            allowed: isFrameworkAllowed(meta.id, flags),
          };
        }
        return {
          id,
          title: id,
          status: "experimental",
          allowed: isExperimentalEnabled(flags),
        };
      });

      const hasExperimentalFrameworkSelected = selectedFrameworks.some(entry => entry.status === "experimental");
      const experimentalEnabled = isExperimentalEnabled(flags);
      const secureBlocked =
        defaultMode === "secure" && hasExperimentalFrameworkSelected && !experimentalEnabled;

      const policyResults: { label: string; ok: boolean; detail?: string }[] = [];
      const classicTemplates = grouped.get("classic") ?? [];
      const hasClassicTemplates = classicTemplates.length > 0;
      policyResults.push({
        label: "Classic templates available",
        ok: hasClassicTemplates,
        detail: hasClassicTemplates ? undefined : "No templates registered for classic mode",
      });
      const defaultModeIsClassic = defaultMode === "classic";
      policyResults.push({
        label: "Default mode is classic",
        ok: defaultModeIsClassic,
        detail: defaultModeIsClassic ? undefined : `Found '${defaultMode}'`,
      });
      const catalogGatePath = path.join(repoRoot, ".github", "workflows", "catalog-protect.yml");
      const hasCatalogGate = await fs.pathExists(catalogGatePath);
      policyResults.push({ label: "Catalog gate workflow present", ok: hasCatalogGate });
      if (hasCatalogGate) {
        const content = await fs.readFile(catalogGatePath, "utf8");
        const enforcesLabel = content.includes("catalog:allowed");
        policyResults.push({
          label: "Catalog gate requires 'catalog:allowed' label",
          ok: enforcesLabel,
          detail: enforcesLabel ? undefined : "Add label check to catalog-protect.yml",
        });
      } else {
        policyResults.push({
          label: "Catalog gate requires 'catalog:allowed' label",
          ok: false,
          detail: "Missing .github/workflows/catalog-protect.yml",
        });
      }

      if (hasExperimentalFrameworkSelected) {
        policyResults.push({
          label: "Secure mode allowed with experimental frameworks",
          ok: !secureBlocked,
          detail: secureBlocked
            ? "Experimental gate is disabled. Enable with --experimental or SPECKIT_EXPERIMENTAL=1."
            : "Experimental frameworks available under current flags.",
        });
      }

      const report = {
        default_mode: defaultMode,
        experimental: { ...flags.experimental },
        templatesByMode: Object.fromEntries(
          GENERATION_MODES.map((mode) => [mode, [...(grouped.get(mode) ?? [])]]),
        ),
        frameworks: frameworksReport,
        selected_frameworks: selectedFrameworks,
        policies: policyResults,
      };

      const hasFailures = policyResults.some((result) => !result.ok);

      if (this.json) {
        this.context.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      } else {
        this.context.stdout.write("Speckit Doctor\n===============\n\n");
        this.context.stdout.write(`Default generation mode: ${defaultMode}\n`);
        this.context.stdout.write(
          `Experimental gate: ${experimentalEnabled ? "ENABLED" : "DISABLED"}\n\n`
        );
        this.context.stdout.write("Templates by mode:\n");
        for (const mode of GENERATION_MODES) {
          const templatesForMode = report.templatesByMode[mode] ?? [];
          const list = templatesForMode.length ? templatesForMode.join(", ") : "(none)";
          this.context.stdout.write(`  - ${mode}: ${list}\n`);
        }

        this.context.stdout.write("\nFramework registry:\n");
        for (const entry of frameworksReport) {
          const badge = entry.status === "ga" ? "[GA]" : "[Experimental]";
          const availability = entry.allowed
            ? "available"
            : "locked (enable with --experimental or SPECKIT_EXPERIMENTAL=1)";
          this.context.stdout.write(
            `  - ${entry.id.padEnd(8)} ${badge} ${entry.title} — ${availability}\n`
          );
        }

        if (selectedFrameworks.length > 0) {
          this.context.stdout.write("\nSelected frameworks:\n");
          for (const entry of selectedFrameworks) {
            const badge = entry.status === "ga" ? "[GA]" : "[Experimental]";
            const availability = entry.allowed ? "allowed" : "locked";
            this.context.stdout.write(
              `  - ${entry.id}: ${badge} ${entry.title} — ${availability}\n`
            );
          }
        }

        this.context.stdout.write("\nPolicy checks:\n");
        for (const result of policyResults) {
          const symbol = result.ok ? "✔" : "✖";
          const detail = result.detail ? ` — ${result.detail}` : "";
          this.context.stdout.write(`  ${symbol} ${result.label}${detail}\n`);
        }
      }

      return hasFailures ? 1 : 0;
    } catch (error: any) {
      const message = error?.message ?? String(error);
      this.context.stderr.write(`speckit doctor failed: ${message}\n`);
      return 1;
    }
  }
}
