---
id: coding-agent-brief-v0-0-1
title: SpecKit — Coding Agent Brief (v0.0.1)
sidebar_label: Agent Brief v0.0.1
slug: /internal/agents/coding-agent-brief
description: Canonical internal prompt for agents implementing SpecKit v0.0.1.
created: "2025-09-22"
updated: "2025-09-22"
---

# Coding Agent Brief (v0.0.1)

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
