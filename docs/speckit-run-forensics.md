# SpecKit Agent Run Forensics — Integration Loop

The run forensics and self-healing loop connects raw agent logs → normalized run artifacts → memo/verification injection so every iteration teaches the next one.

## Pipeline overview

1. **Collect logs.** Record each agent execution (planner, executor, tools) and save them as text, JSON, or NDJSON.
2. **Analyze.** Run `pnpm speckit:analyze -- --raw-log <glob>` to normalize the logs into `.speckit/Run.json`, extract prompt requirements into `.speckit/requirements.jsonl`, and score run metrics. The normalized `Run.json` includes a `schema` version (currently `1`) so downstream tooling can validate compatibility.
3. **Update artifacts.** The analyzer emits versioned `.speckit/memo.json`, `.speckit/verification.yaml`, `.speckit/metrics.json`, and `.speckit/summary.md`, then refreshes the RTM between `<!-- speckit:rtm:* -->` markers.
4. **Replay & review.** Run `pnpm speckit:replay -- --run .speckit/Run.json` (or `--log <glob>`) to browse normalized events, hints, metrics, and failure labels from the run timeline.
5. **Inject guardrails.** Run `pnpm speckit:inject` to merge the memo guardrails + verification checklist into `docs/internal/agents/coding-agent-brief.md` so the next run inherits lessons learned.
6. **Gate in CI.** The `speckit-analyze-run` workflow fetches the `agent-run-logs` artifact on each PR, runs the analyzer, commits refreshed artifacts, and posts the summary. `speckit-pr-gate` blocks merges when metrics fall below thresholds or forbidden failure labels appear.

## Metrics & thresholds

| Metric | Description | Threshold |
| --- | --- | --- |
| `ReqCoverage` | Portion of prompt requirements with evidence | ≥ 0.75 |
| `ToolPrecision@1` | Successful tool calls divided by attempts | ≥ 0.65 |
| `BacktrackRatio` | Tool errors per attempt | ≤ 0.35 |
| `EditLocality` | Concentration of edits to a focused surface | Informational |
| `ReflectionDensity` | Frequency of reflective reasoning events | Informational |
| `TTFPSeconds` | Time to first edit in seconds | Informational |

Forbidden labels enforced in CI: `process.read-before-write-fail`, `env.git-state-drift`.

## Tuning & extension

- Adjust thresholds in `speckit.config.yaml` to tighten or relax gating.
- Extend `.speckit/failure-rules.yaml` with additional signatures, remediation hints, or severities.
- Use `.speckit/summary.md` as the canonical PR comment body; downstream tooling can convert the JSON metrics into promptfoo or Phoenix traces.
- Append memo entries to a history log (e.g., `.speckit/memo-history.jsonl`) if you want to chart progress across runs.

## Local verification checklist

1. Run `pnpm speckit:analyze -- --raw-log sample-logs/*.log` and confirm `.speckit/memo.json` includes `version` and `generated_from.run_id`.
2. Ensure `RTM.md` shows the managed table between `<!-- speckit:rtm:start -->` and `<!-- speckit:rtm:end -->`.
3. Inspect `.speckit/verification.yaml` and rehearse each generated command/grep so the next run can replay the satisfied checks and tackle pending ones.
4. Run `pnpm speckit:inject` and verify the coding agent brief now contains the latest memo guardrails + verification checklist.
5. Commit refreshed artifacts before opening a PR so CI gates only enforce deltas from the latest run.
