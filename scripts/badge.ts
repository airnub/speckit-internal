import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { makeBadge } from "badge-maker";

interface PolicyEntry {
  label: string;
  ok: boolean;
  detail?: string;
}

interface DoctorReport {
  policies?: PolicyEntry[];
}

type GateKey = "classic" | "catalog" | "experimental";

type GateSummary = {
  key: GateKey;
  ok: boolean;
  requirements: string[];
  failing: string[];
  notes: string[];
};

interface PolicyGateSummary {
  generatedAt: string;
  overall: { ok: boolean };
  gates: Record<GateKey, GateSummary>;
}

interface CliArgs {
  input: string | null;
  output: string | null;
  summary: string | null;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { input: null, output: null, summary: null };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--input" && index + 1 < argv.length) {
      args.input = argv[index + 1];
      index += 1;
    } else if (token === "--output" && index + 1 < argv.length) {
      args.output = argv[index + 1];
      index += 1;
    } else if (token === "--summary" && index + 1 < argv.length) {
      args.summary = argv[index + 1];
      index += 1;
    }
  }
  return args;
}

function coercePath(input: string | null): string | null {
  if (!input) return null;
  const resolved = path.resolve(process.cwd(), input);
  return resolved;
}

function buildGateSummary(policies: PolicyEntry[]): PolicyGateSummary {
  const policyMap = new Map(policies.map((entry) => [entry.label, entry]));

  const gateConfigs: Record<GateKey, { requirements: string[] }> = {
    classic: {
      requirements: ["Classic templates available", "Default mode is classic"],
    },
    catalog: {
      requirements: [
        "Catalog gate workflow present",
        "Catalog gate requires 'catalog:allowed' label",
      ],
    },
    experimental: {
      requirements: ["Secure mode allowed with experimental frameworks"],
    },
  };

  const gates = Object.entries(gateConfigs).reduce((acc, [key, config]) => {
    const gateKey = key as GateKey;
    const failing: string[] = [];
    const notes: string[] = [];

    for (const requirement of config.requirements) {
      const entry = policyMap.get(requirement);
      if (!entry) {
        // Requirement missing from policy output – treat as failure for traceability.
        failing.push(`${requirement} (not reported)`);
        continue;
      }
      if (!entry.ok) {
        const detail = entry.detail ? `${requirement} (${entry.detail})` : requirement;
        failing.push(detail);
      }
    }

    if (gateKey === "experimental") {
      const entry = policyMap.get("Secure mode allowed with experimental frameworks");
      if (!entry) {
        notes.push("Experimental frameworks not selected; skipping gate check.");
      } else if (entry.detail) {
        notes.push(entry.detail);
      }
    }

    const ok = failing.length === 0;

    acc[gateKey] = {
      key: gateKey,
      ok,
      requirements: [...config.requirements],
      failing,
      notes,
    } satisfies GateSummary;

    return acc;
  }, {} as Record<GateKey, GateSummary>);

  const overallOk = Object.values(gates).every((gate) => gate.ok);

  return {
    generatedAt: new Date().toISOString(),
    overall: { ok: overallOk },
    gates,
  } satisfies PolicyGateSummary;
}

function formatMessage(summary: PolicyGateSummary): { message: string; color: string } {
  const segments = Object.values(summary.gates).map((gate) => {
    const symbol = gate.ok ? "✓" : "✗";
    return `${gate.key} ${symbol}`;
  });
  const message = segments.join(" · ");
  const color = summary.overall.ok
    ? "#2E8540"
    : Object.values(summary.gates).some((gate) => gate.ok)
    ? "#E6A700"
    : "#C8102E";
  return { message, color };
}

async function generateBadge(summary: PolicyGateSummary, outputPath: string): Promise<void> {
  const { message, color } = formatMessage(summary);
  const svg = makeBadge({
    label: "policy gates",
    message,
    color,
    labelColor: "#1F2933",
    style: "flat",
  });
  const directory = path.dirname(outputPath);
  await mkdir(directory, { recursive: true });
  await writeFile(outputPath, svg, "utf8");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = coercePath(args.input);
  const outputPath = coercePath(args.output);
  const summaryPath = coercePath(args.summary);

  if (!inputPath) {
    console.error("Missing --input <path> argument.");
    process.exitCode = 1;
    return;
  }
  if (!outputPath) {
    console.error("Missing --output <path> argument.");
    process.exitCode = 1;
    return;
  }

  const raw = await readFile(inputPath, "utf8");
  const report = JSON.parse(raw) as DoctorReport;
  const policies = Array.isArray(report.policies) ? report.policies : [];
  const summary = buildGateSummary(policies);

  if (summaryPath) {
    const directory = path.dirname(summaryPath);
    await mkdir(directory, { recursive: true });
    await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  }

  await generateBadge(summary, outputPath);
}

main().catch((error: unknown) => {
  console.error(`[policy-gates] Failed to generate badge: ${(error as Error).message}`);
  process.exitCode = 1;
});
