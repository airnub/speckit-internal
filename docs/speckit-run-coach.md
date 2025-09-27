# SpecKit Run Coach

The Run Coach gives instant feedback while you execute an inner-loop spec or agent run. Tail a log (JSON, NDJSON, or plain text) and watch the timeline, metrics, hints, diffs, and a live file heatmap update in real time.

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ speckit — runs/sample.ndjson                                              00:42             │
│ Step: edit                                                                                 │
│  Timeline  Metrics  Hints  Diffs                                                           │
│ Timeline                                                                                   │
│ ➤ 00:41 edit — src/logger.ts — Normalize trace IDs before logging                          │
│   00:37 plan — plan.system — Prioritize observability fixes                                │
│   00:31 run — pnpm test --filter log-suite                                                 │
│                                                                                            │
│ File heatmap                                                                               │
│ ████████ src/logger.ts (3)                                                                 │
│ ██       README.md (1)                                                                     │
│                                                                                            │
│ Labels                                                                                     │
│ • env.tooling-missing                                                                      │
│                                                                                            │
│ Artifacts written:                                                                         │
│ .speckit/memo.json                                                                         │
│ .speckit/verification.yaml                                                                 │
│ .speckit/metrics.json                                                                      │
│ .speckit/summary.md                                                                        │
│                                                                                            │
│ ←/→ tabs • ↑/↓ scroll • v verification • o open file • m regen memo • Ctrl+C exit         │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

Switch to the **Metrics** tab to see the familiar table of key health indicators alongside
quick actions:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ speckit — runs/sample.ndjson                               00:42             │
│ Step: edit                                                                    │
│                                                                              │
│ Metrics                                                                       │
│ ReqCoverage        66%                                                        │
│ BacktrackRatio     17%                                                        │
│ ToolPrecision@1    83%                                                        │
│ EditLocality       92%                                                        │
│ ReflectionDensity  21%                                                        │
│                                                                              │
│ Hints                                                                         │
│ • Run `rg <symbol>` before editing unfamiliar files.                          │
│ • Switch to `pnpm test -w` for workspaces.                                    │
│                                                                              │
│ Labels                                                                        │
│ • env.tooling-missing                                                         │
│                                                                              │
│ Artifacts written:                                                            │
│ .speckit/memo.json                                                            │
│ .speckit/verification.yaml                                                    │
│ .speckit/metrics.json                                                         │
│ .speckit/summary.md                                                           │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Usage

```bash
pnpm speckit:doctor                                     # Verify Node, pnpm, tests
pnpm speckit:coach -- --log runs/sample.ndjson --watch   # Live coach + metrics
pnpm speckit:inject                                      # Refresh prompt guardrails
```

- `--log` accepts glob patterns (JSON, NDJSON, or text logs). Use `--stdin` to pipe logs.
- `--watch` keeps tailing the file; press <kbd>Ctrl</kbd>+<kbd>C</kbd> when the run ends.
- When you exit, SpecKit writes `.speckit/memo.json`, `.speckit/verification.yaml`, `.speckit/metrics.json`, `.speckit/summary.md`, refreshes `RTM.md`, and injects guardrails into `docs/internal/agents/coding-agent-brief.md`.

### Navigation & quick actions

- Use <kbd>←</kbd>/<kbd>→</kbd> to switch between Timeline, Metrics, Hints, and Diffs tabs. <kbd>↑</kbd>/<kbd>↓</kbd> scroll within the active panel.
- Press <kbd>v</kbd> to regenerate the verification checklist, <kbd>m</kbd> to refresh the memo, and <kbd>o</kbd> to spotlight the hottest file from the heatmap.
- The non-TTY fallback mirrors the same data by printing the latest timeline slice, diff summaries, and file-touch histogram so headless CI logs still capture the signal.

## Metrics glossary

| Metric | Meaning |
|--------|---------|
| **ReqCoverage** | Fraction of prompt requirements satisfied or in progress. |
| **BacktrackRatio** | Tool or action invocations that failed. Lower is better. |
| **ToolPrecision@1** | Successful tool calls divided by total tool calls. |
| **EditLocality** | How focused edits are (1.0 = single area of the repo). |
| **ReflectionDensity** | Share of reasoning events that include reflection. |
| **TTFP** | Time-to-first-patch in seconds (when edits begin). |

## Experiment buckets

- Configure deterministic experiments in `speckit.experiments.yaml` (schema version `1`). Each entry defines a `key`, optional `description`, and weighted `variants` with custom metadata (e.g., `{ memo_tone: focused }`).
- The CLI seeds assignments using the resolved `run_id`, so a replay of the same log sticks to the same variant and bucket. Buckets default to `0–999`; change `bucket_count` per experiment to fan out further.
- `scripts/config/experiments.ts` loads the manifest, selects a variant via SHA-256 hashing, and threads the assignment through analyzer metadata.
- Active variants appear in `.speckit/memo.json`, `.speckit/summary.md`, and `.speckit/metrics.json` for downstream dashboards and PR comments. Disable an experiment by flipping `enabled: false`.

## Self-healing artifacts

Each coached run yields:

- `.speckit/memo.json` — versioned lessons, guardrails, and checklist items keyed to the run ID.
- `.speckit/verification.yaml` — CoVe verification stubs per requirement.
- `.speckit/metrics.json` — versioned metric snapshot and failure labels.
- `.speckit/summary.md` — summary used for PR comments.
- `RTM.md` — updated Run Traceability Matrix between managed markers.

`pnpm speckit:inject` merges memo guardrails and verification checks back into the next prompt so the agent self-corrects on the following iteration.

## Thin CI safety net

Push a PR with `runs/` logs and CI will:

1. **Upload sanitized logs** (`speckit-upload-logs.yml`).
2. **Analyze & summarize** (`speckit-analyze-run.yml`) — updates artifacts/RTM and posts `.speckit/summary.md` as a sticky comment.
3. **Gate only on critical issues** (`speckit-pr-gate.yml`) — fails for `process.read-before-write-fail`, `env.git-state-drift`, or detected secrets; warns on thresholds for now.

Check the PR template boxes: logs uploaded, summary comment present, RTM updated, no critical labels.
