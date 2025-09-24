import { Command, Option } from "clipanion";
import path from "node:path";
import fs from "fs-extra";
import { loadTemplates } from "@speckit/core";
import { loadSpecModel } from "../services/spec.js";
import {
  GENERATION_MODES,
  resolveDefaultGenerationMode,
  templateModes,
} from "../services/mode.js";

type DoctorCheck = {
  id: string;
  label: string;
  ok: boolean;
  detail?: string;
};

type DoctorReport = {
  defaultMode: string;
  templatesByMode: Record<string, string[]>;
  policyChecks: DoctorCheck[];
  summary: {
    ok: boolean;
    failures: DoctorCheck[];
  };
};

export class DoctorCommand extends Command {
  static paths = [["doctor"]];

  json = Option.Boolean("--json", false);

  async execute() {
    try {
      const repoRoot = process.cwd();
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

      const policyChecks: DoctorCheck[] = [];
      policyChecks.push({
        id: "defaultModeClassic",
        label: "Default generation mode is classic",
        ok: defaultMode === "classic",
        detail:
          defaultMode === "classic"
            ? undefined
            : `Found default mode '${defaultMode}'.`,
      });

      const classicTemplates = grouped.get("classic") ?? [];
      policyChecks.push({
        id: "classicTemplatesPresent",
        label: "Classic templates present",
        ok: classicTemplates.length > 0,
        detail:
          classicTemplates.length > 0
            ? undefined
            : "No templates configured for classic mode.",
      });

      const catalogGatePath = path.join(repoRoot, ".github", "workflows", "catalog-protect.yml");
      const hasCatalogGate = await fs.pathExists(catalogGatePath);
      policyChecks.push({
        id: "catalogGateWorkflowPresent",
        label: "Catalog gate workflow present",
        ok: hasCatalogGate,
        detail: hasCatalogGate
          ? undefined
          : "Missing .github/workflows/catalog-protect.yml",
      });
      if (hasCatalogGate) {
        const content = await fs.readFile(catalogGatePath, "utf8");
        const enforcesLabel = content.includes("catalog:allowed");
        policyChecks.push({
          id: "catalogGateRequiresLabel",
          label: "Catalog gate requires 'catalog:allowed' label",
          ok: enforcesLabel,
          detail: enforcesLabel ? undefined : "Add label check to catalog-protect.yml",
        });
      } else {
        policyChecks.push({
          id: "catalogGateRequiresLabel",
          label: "Catalog gate requires 'catalog:allowed' label",
          ok: false,
          detail: "Missing .github/workflows/catalog-protect.yml",
        });
      }

      const templatesByMode = Object.fromEntries(
        Array.from(grouped.entries()).map(([mode, entries]) => [mode, entries])
      );

      const failures = policyChecks.filter(check => !check.ok);
      const report: DoctorReport = {
        defaultMode,
        templatesByMode,
        policyChecks,
        summary: {
          ok: failures.length === 0,
          failures,
        },
      };

      if (this.json) {
        this.context.stdout.write(JSON.stringify(report, null, 2));
        this.context.stdout.write("\n");
        return 0;
      }

      this.context.stdout.write("Speckit Doctor\n===============\n\n");
      this.context.stdout.write(`Default generation mode: ${defaultMode}\n\n`);
      this.context.stdout.write("Templates by mode:\n");
      for (const mode of GENERATION_MODES) {
        const templatesForMode = grouped.get(mode) ?? [];
        const list = templatesForMode.length ? templatesForMode.join(", ") : "(none)";
        this.context.stdout.write(`  - ${mode}: ${list}\n`);
      }

      this.context.stdout.write("\nPolicy checks:\n");
      for (const result of policyChecks) {
        const symbol = result.ok ? "✔" : "✖";
        const detail = result.detail ? ` — ${result.detail}` : "";
        this.context.stdout.write(`  ${symbol} ${result.label}${detail}\n`);
      }

      return failures.length === 0 ? 0 : 1;
    } catch (error: any) {
      const message = error?.message ?? String(error);
      this.context.stderr.write(`speckit doctor failed: ${message}\n`);
      return 1;
    }
  }
}
