import { Command } from "clipanion";
import path from "node:path";
import fs from "fs-extra";
import { loadTemplates } from "@speckit/core";
import { loadSpecModel } from "../services/spec.js";
import {
  GENERATION_MODES,
  resolveDefaultGenerationMode,
  templateModes,
} from "../services/mode.js";

export class DoctorCommand extends Command {
  static paths = [["doctor"]];

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

      const policyResults: { label: string; ok: boolean; detail?: string }[] = [];
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

      this.context.stdout.write("Speckit Doctor\n===============\n\n");
      this.context.stdout.write(`Default generation mode: ${defaultMode}\n\n`);
      this.context.stdout.write("Templates by mode:\n");
      for (const mode of GENERATION_MODES) {
        const templatesForMode = grouped.get(mode) ?? [];
        const list = templatesForMode.length ? templatesForMode.join(", ") : "(none)";
        this.context.stdout.write(`  - ${mode}: ${list}\n`);
      }

      this.context.stdout.write("\nPolicy checks:\n");
      let hasFailures = false;
      for (const result of policyResults) {
        const symbol = result.ok ? "✔" : "✖";
        if (!result.ok) {
          hasFailures = true;
        }
        const detail = result.detail ? ` — ${result.detail}` : "";
        this.context.stdout.write(`  ${symbol} ${result.label}${detail}\n`);
      }

      return hasFailures ? 1 : 0;
    } catch (error: any) {
      const message = error?.message ?? String(error);
      this.context.stderr.write(`speckit doctor failed: ${message}\n`);
      return 1;
    }
  }
}
