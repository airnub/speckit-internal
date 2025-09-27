# SpecKit Core Analyzer API

The `@speckit/core` package exposes a stable TypeScript surface for embedding the analyzer in CLIs, TUIs, or UIs. It wraps the streaming analyzer, redaction utilities, and artifact writers so other apps can plug the forensics loop in without shelling out to the CLI.

## Installation

Within the monorepo the package is already wired up. External projects can install it once the workspace is published:

```bash
pnpm add @speckit/core
# or
npm install @speckit/core
```

## `analyzeLogs`

```ts
import { analyzeLogs, summarizeMetrics, type AnalyzeResult } from "@speckit/core";
import { createFileLogSource } from "@speckit/core";

async function main(): Promise<void> {
  const sources = [await createFileLogSource("runs/latest.log")];
  const result: AnalyzeResult = await analyzeLogs(sources, { runId: "demo" });

  console.log(`Run ${result.run.runId} analyzed.`);
  for (const entry of summarizeMetrics(result.metrics)) {
    console.log(`${entry.label}: ${entry.value}`);
  }
}

main().catch((error) => {
  console.error("analysis failed", error);
  process.exitCode = 1;
});
```

`analyzeLogs` accepts any iterable of log sources (`string`, `RawLogSource`, `EventsLogSource`, or `NormalizedLogSource`). Optional parameters include:

- `rules`: custom failure rule definitions.
- `runId`: override the generated run id.
- `metadata`: attach extra run metadata.
- `prompt`: provide the full prompt text when it is missing from logs.
- `onEvent`: async callback invoked for each streaming analyzer event.

The helper re-exports `summarizeMetrics`, `computeMetrics`, and the Node adapters for loading logs from disk.

## `sanitizeLogs`

```ts
import { sanitizeLogs } from "@speckit/core";

const report = await sanitizeLogs("runs/", { dryRun: true });
console.log(`${report.totalHits} secrets would be redacted across ${report.files.length} files.`);
```

`sanitizeLogs` scans directories or glob patterns, applies default secret patterns, and returns:

- `totalHits`: aggregate redaction count.
- `hits`: per-file matches with pattern metadata and sample previews.
- `files`: sanitized files (relative to `cwd`).

Pass `dryRun: true` to audit without writing back. Custom patterns or glob lists can be supplied via `patterns`, `include`, and `maxExamplesPerFile` options. A `redactText` helper is exported for raw strings, and `sanitizerPatterns` exposes the current default regex sources.

## Metrics & artifacts

```ts
import { writeArtifacts } from "@speckit/core";

await writeArtifacts({
  rootDir: process.cwd(),
  run: analysis.run,
  requirements: analysis.requirements,
  metrics: analysis.metrics,
  labels: analysis.labels,
  experiments: [],
});
```

`writeArtifacts` produces the `.speckit/` JSON, Markdown, and YAML outputs used by downstream tooling. It automatically updates the memo history, promotes popular guardrails/lessons, and writes a Markdown summary for human review. The module exports supporting types (`MemoArtifact`, `WrittenArtifacts`, etc.) and the memo history update helpers if you need to customise persistence.

All run-artifact constants (`RUN_ARTIFACT_SCHEMA_VERSION`, `MEMO_ARTIFACT_VERSION`, `METRICS_ARTIFACT_VERSION`) and the label trend utilities are re-exported to keep the CLI/TUI thin.
