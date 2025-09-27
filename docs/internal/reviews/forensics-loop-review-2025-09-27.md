---
id: forensics-loop-review-2025-09-27
title: SpecKit — Forensics Loop Review (2025-09-27)
sidebar_label: Forensics Loop Review (2025-09-27)
slug: /internal/forensics-loop-review-2025-09-27
description: Main-branch checkpoint for the SpecKit run-forensics loop plus prioritized enhancements and verification guidance.
created: "2025-09-27"
updated: "2025-09-27"
---

# Forensics Loop Review — Main Branch Snapshot (2025-09-27)

This note captures the latest audit of the **run forensics loop** on `main`, confirms the expected control files, and outlines the highest-value follow-up work. It is intended for maintainers shepherding SpecKit's inner-loop coaching and analysis subsystems.

## A. Status Check — What Is on `main`

The following artifacts are present and aligned with the thin-mode CI workflow:

- `speckit.config.yaml` defines thresholds, CI enforcement, artifact destinations, and forbidden labels for the analyzer gate.
- `tsconfig.json` (and `tsconfig.base.json`) exist at the repo root to coordinate TypeScript builds across packages.
- `README.md` documents the inner-loop coach workflow, including the thin CI loop entry points.
- `.github/workflows/` includes upload, analyze, and gate workflows alongside other repo automations.
- `.speckit/` retains analyzer outputs (metrics, memo, verification, catalog) from recent runs.

## B. Verification Suggestions (Self-Tests for CI)

To increase confidence in the run-forensics gate and analyzer, schedule the following targeted checks:

1. **Gate warn/fail behavior** — Create a matrix job that writes sample `.speckit/metrics.json` with poor coverage. When `verify.enforce_in_ci=false`, the job should succeed; flipping the flag to `true` should fail the workflow.
2. **Single-path analyzer** — Inspect the `speckit-analyze-run` workflow logs to ensure only one `speckit:analyze` invocation runs and it reads from the extracted artifact directory (`runs_from_artifact/**`).
3. **Sanitizer accounting** — Confirm the sanitizer increments a `sanitizer_hits` metric in `.speckit/metrics.json` and that the PR gate fails on any positive value.

## C. Enhancement Backlog — Analysis & Learning Loop

Prioritize the following improvements to deepen the analyzer's insight and durability:

1. **Cross-run memory (memo v2)** — Maintain an append-only `.speckit/memo-history.jsonl`, incorporate TTL + de-duplication, and bubble recurring lessons into prompt guardrails.
2. **Experiment buckets (A/B prompts)** — Add `speckit.experiments.yaml` to randomly assign runs to prompt variants, then compare `TTFP` and `BacktrackRatio` metrics.
3. **Static symbol-map assist** — Build a symbol index mapping exported identifiers to files to improve edit locality guidance.
4. **Failure clustering & trend dashboards** — Aggregate `labels` over time, compute moving averages, and publish charts (e.g., `docs/agent-trends.md`).
5. **Verification plan generators** — For each requirement, synthesize targeted tests or greps, promoting stable checks into `verification.yaml`.
6. **Run replay** — Expose `speckit replay --log runs/<file>` to review timelines without re-executing agents.
7. **OpenTelemetry export** — Export normalized events as optional OTEL traces for observability platforms.
8. **Rules plug-in API** — Allow repo-local or NPM-sourced `failure-rules` plug-ins.
9. **Secrets redaction v2** — Expand sanitizer patterns and add CI coverage under `policy/redaction-tests/`.

## D. TUI and CLI Experience Enhancements

1. **Timeline & heatmap views** — Add TUI tabs (Timeline, Metrics, Hints, Diffs) plus a churn heatmap.
2. **Non-TTY reporter** — Provide a console fallback mirroring hint output for CI logs.
3. **Coach quick-actions** — Introduce shortcuts for inserting verification steps, opening files, or regenerating reflection memos.
4. **Doctor deep-checks** — Detect pnpm workspaces, test runner discovery, and `forbid-globs` compliance.
5. **`speckit triage`** — Generate markdown triage reports with owner mapping and optional GitHub issue creation.
6. **`speckit daemon` (optional)** — Offer a JSON-RPC/WebSocket server for streaming analysis events.

## E. Future UI Readiness — Importable Analyzer

Stabilize the contract for embeddable analyzer packages:

- `@speckit/analyzer` (pure ESM, browser-safe) exposes `analyze` and `analyzeStream` that accept `LogSource` inputs, emit metrics/memos/verification data, and support event callbacks.
- `@speckit/react-analyzer` exports a `useRunAnalysis` hook yielding live state, metrics, hints, and timelines.
- Node-specific concerns (fs/glob, `child_process`) must sit behind adapters for browser usage.
- Standardize artifact outputs (`.speckit/memo.json`, `.speckit/verification.yaml`, `.speckit/metrics.json`, `RTM.md` managed block) with explicit version fields.
- Version the normalized event schema (e.g., `Run.json` with `schema: 1`) to ease UI integrations.

## F. Nice-to-Have Backlog (Post-Core Enhancements)

- Property-based verification scaffolds (e.g., fast-check) for high-risk functions.
- Metamorphic testing templates for data pipelines.
- Prompt context de-duplication to keep contexts lean.
- Additional repo language adapters (Python/Poetry, Java/Gradle) for tooling hints.

## G. Acceptance Checklist

Production readiness hinges on the following seven checks:

- [ ] Single analyzer invocation using only the extracted artifact directory.
- [ ] Gate consumption of flat metrics with warn-by-default thresholds unless `verify.enforce_in_ci=true`.
- [ ] Hard failure on forbidden labels and any `sanitizer_hits > 0`.
- [ ] Analyzer emits flat metrics including `labels[]`, `EditLocality`, and `sanitizer_hits`.
- [ ] `speckit.config.yaml` remains present with configurable thresholds and block lists.
- [ ] TUI provides a non-TTY fallback reporter.
- [ ] `@speckit/analyzer` entry point (or stabilization plan) exists for embeddable UIs.

Maintain this checklist alongside run-forensics planning so each iteration can be audited quickly.
