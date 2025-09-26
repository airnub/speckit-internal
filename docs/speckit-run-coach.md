# SpecKit Run Coach

The Run Coach gives instant feedback while you execute an inner-loop spec or agent run. Tail a log (JSON, NDJSON, or plain text) and watch metrics, hints, and requirement coverage update in real time.

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

## Metrics glossary

| Metric | Meaning |
|--------|---------|
| **ReqCoverage** | Fraction of prompt requirements satisfied or in progress. |
| **BacktrackRatio** | Tool or action invocations that failed. Lower is better. |
| **ToolPrecision@1** | Successful tool calls divided by total tool calls. |
| **EditLocality** | How focused edits are (1.0 = single area of the repo). |
| **ReflectionDensity** | Share of reasoning events that include reflection. |
| **TTFP** | Time-to-first-patch in seconds (when edits begin). |

## Self-healing artifacts

Each coached run yields:

- `.speckit/memo.json` — lessons, guardrails, and checklist items keyed to the run ID.
- `.speckit/verification.yaml` — CoVe verification stubs per requirement.
- `.speckit/metrics.json` — metric snapshot and failure labels.
- `.speckit/summary.md` — summary used for PR comments.
- `RTM.md` — updated Run Traceability Matrix between managed markers.

`pnpm speckit:inject` merges memo guardrails and verification checks back into the next prompt so the agent self-corrects on the following iteration.

## Thin CI safety net

Push a PR with `runs/` logs and CI will:

1. **Upload sanitized logs** (`speckit-upload-logs.yml`).
2. **Analyze & summarize** (`speckit-analyze-run.yml`) — updates artifacts/RTM and posts `.speckit/summary.md` as a sticky comment.
3. **Gate only on critical issues** (`speckit-pr-gate.yml`) — fails for `process.read-before-write-fail`, `env.git-state-drift`, or detected secrets; warns on thresholds for now.

Check the PR template boxes: logs uploaded, summary comment present, RTM updated, no critical labels.
