---
id: coding-agent-brief-v1-0-0
title: Speckit — Coding Agent Brief (v1.0.0)
sidebar_label: Agent Brief v1.0.0
slug: /dev/specs/coding-agent-brief-v1-0-0
description: Canonical internal prompt for agents implementing Speckit v1.0.0.
created: '2025-09-22'
updated: '2025-09-22'
speckit_provenance:
  tool: speckit
  tool_version: 0.1.0
  tool_commit: 99a028f
  template:
    id: speckit-core
    version: 0.1.0
    sha: 92b3006e2ef148138f3494490a2e6e63349c7a26
  spec:
    version: 1.0.0
    digest: 'sha256:534745e106c774e0834af1a4b9d8fb5437e52ed3e048f0ef5d95667b88284af8'
  generated_at: '2025-09-24T15:12:30.841Z'
---

# Coding Agent Brief (v1.0.0)

**Spec:** `docs/internal/specs/speckit-spec.md`
**Plan:** `docs/internal/orchestration-plan.md`
**RTM:** `docs/internal/rtm.md`

## Guard Rails
- Node 18+, TS strict, tsup builds.
- **AI optional**; do not call providers unless `ai.enabled=true`.
- Produce small, reviewable diffs; no background daemons.

## Deliverables per run
1) Unified diff (patch) only for changed files.
2) Conventional commit message: `feat(tui): ...`, `fix(cli): ...`, etc.
3) Reasoning summary (≤ 6 lines).

## Work Items
- TUI core + header; reliable Enter handling; height fallback.
- Template registry + vars + post-init execution.
- Runners (K/B) with helpful messages.
- Settings (S) to pick provider/model from config lists.
- AI Propose (A) gating + stub plan display.

## Pre-flight checks
- `pnpm -w build` passes.
- No unguarded provider imports.
- Config file created on first run if missing.
