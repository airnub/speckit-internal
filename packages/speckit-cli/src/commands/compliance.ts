import path from "node:path";
import fs from "fs-extra";
import { Command, Option } from "clipanion";
import {
  generateEduUsPlan,
  verifyEduUsPlan,
  renderEduUsPlanMarkdown,
  renderEduUsReportMarkdown,
} from "../services/compliance/index.js";

const SUPPORTED_FRAMEWORKS = new Set(["edu-us"]);

type OutputFormat = "markdown" | "json";
type FailMode = "missing" | "none";

export class CompliancePlanCommand extends Command {
  static paths = [["compliance", "plan"]];

  framework = Option.String("--framework", { required: true, description: "Compliance framework id" });
  overlays = Option.Array("--overlays", { description: "Comma separated overlays", delimiter: "," });
  format = Option.String("--format", { description: "Output format: markdown|json" });
  output = Option.String("--output", { description: "Write plan to file" });

  async execute(): Promise<number> {
    try {
      const framework = this.framework.trim().toLowerCase();
      if (!SUPPORTED_FRAMEWORKS.has(framework)) {
        this.context.stderr.write(`Unknown compliance framework '${this.framework}'.\n`);
        return 1;
      }
      const overlays = normaliseOverlays(this.overlays);
      const plan = await generateEduUsPlan({ repoRoot: process.cwd(), overlays });
      const format = parseFormat(this.format);
      const content = format === "json"
        ? JSON.stringify(plan, null, 2)
        : renderEduUsPlanMarkdown(plan);
      await emitOutput(content, this.output, this.context.stdout);
      if (this.output) {
        this.context.stdout.write(
          `Plan saved to ${path.relative(process.cwd(), path.resolve(this.output))}\n`
        );
      }
      return 0;
    } catch (error: any) {
      const message = error?.message ?? String(error);
      this.context.stderr.write(`speckit compliance plan failed: ${message}\n`);
      return 1;
    }
  }
}

export class ComplianceVerifyCommand extends Command {
  static paths = [["compliance", "verify"]];

  framework = Option.String("--framework", { required: true, description: "Compliance framework id" });
  overlays = Option.Array("--overlays", { description: "Comma separated overlays", delimiter: "," });
  format = Option.String("--format", { description: "Output format: markdown|json" });
  output = Option.String("--output", { description: "Write report to file" });
  failOn = Option.String("--fail-on", { description: "Failure mode: missing|none" });

  async execute(): Promise<number> {
    try {
      const framework = this.framework.trim().toLowerCase();
      if (!SUPPORTED_FRAMEWORKS.has(framework)) {
        this.context.stderr.write(`Unknown compliance framework '${this.framework}'.\n`);
        return 1;
      }
      const overlays = normaliseOverlays(this.overlays);
      const plan = await generateEduUsPlan({ repoRoot: process.cwd(), overlays });
      const report = await verifyEduUsPlan(plan, { repoRoot: process.cwd() });
      const format = parseFormat(this.format);
      const content = format === "json"
        ? JSON.stringify(report, null, 2)
        : renderEduUsReportMarkdown(report);
      await emitOutput(content, this.output, this.context.stdout);
      if (this.output) {
        this.context.stdout.write(
          `Report saved to ${path.relative(process.cwd(), path.resolve(this.output))}\n`
        );
      }
      const failMode = parseFailMode(this.failOn);
      if (failMode === "missing" && report.summary.missing > 0) {
        return 1;
      }
      return 0;
    } catch (error: any) {
      const message = error?.message ?? String(error);
      this.context.stderr.write(`speckit compliance verify failed: ${message}\n`);
      return 1;
    }
  }
}

function normaliseOverlays(values: string[] | undefined): string[] {
  if (!values || values.length === 0) {
    return [];
  }
  const resolved: string[] = [];
  for (const value of values) {
    const normalized = value.trim().toLowerCase();
    if (!normalized) continue;
    if (!resolved.includes(normalized)) {
      resolved.push(normalized);
    }
  }
  return resolved;
}

function parseFormat(value: string | undefined): OutputFormat {
  if (!value) return "markdown";
  const normalized = value.trim().toLowerCase();
  if (normalized === "markdown" || normalized === "md") {
    return "markdown";
  }
  if (normalized === "json") {
    return "json";
  }
  throw new Error(`Unsupported format '${value}'. Use markdown or json.`);
}

function parseFailMode(value: string | undefined): FailMode {
  if (!value) return "missing";
  const normalized = value.trim().toLowerCase();
  if (normalized === "missing") {
    return "missing";
  }
  if (normalized === "none" || normalized === "never") {
    return "none";
  }
  throw new Error(`Unsupported fail-on value '${value}'. Use missing or none.`);
}

async function emitOutput(content: string, outputPath: string | undefined, stdout: NodeJS.WriteStream): Promise<void> {
  const finalContent = content.endsWith("\n") ? content : content + "\n";
  if (outputPath) {
    const absolute = path.resolve(outputPath);
    await fs.ensureDir(path.dirname(absolute));
    await fs.writeFile(absolute, finalContent, "utf8");
  } else {
    stdout.write(finalContent);
  }
}
