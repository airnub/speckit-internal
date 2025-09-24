---
id: orchestration-plan-v1-0-0
title: Speckit — Orchestration Plan (v1.0.0)
sidebar_label: Orchestration Plan v1.0.0
slug: /dev/specs/orchestration-plan-v1-0-0
description: >-
  Internal orchestration plan aligning agents and humans to the Speckit 1.0.0
  baseline.
created: '2025-09-22'
updated: '2025-09-22'
speckit_provenance:
  tool: speckit
  tool_version: 0.1.0
  tool_commit: dc36a0c
  template:
    id: speckit-core
    version: 0.1.0
    sha: 92b3006e2ef148138f3494490a2e6e63349c7a26
  spec:
    version: 1.0.0
    digest: 'sha256:534745e106c774e0834af1a4b9d8fb5437e52ed3e048f0ef5d95667b88284af8'
  generated_at: '2025-09-24T14:44:46.496Z'
---

# Orchestration Plan (v1.0.0)

**Why a v1.0.0 filename?** This plan is iterated more frequently and separately from the 1.0.0 baseline spec; you maintain a root `AGENTS.md` manually. This internal plan complements it.

## Documents of Record
- Spec (SRS): `docs/internal/specs/speckit-spec.md`
- Agent brief: `docs/internal/agents/coding-agent-brief.md`
- RTM: `docs/internal/rtm.md`
- ADRs: `docs/internal/adrs/*`

## Roles & Flow
- **Planner (LLM)** → draft changes from requirement.
- **Reviewer (human)** → request adjustments.
- **Executor (LLM)** → produce patch (no auto-apply).
- **Tester (script/human)** → build & quick checks.
- **Committer (human)** → commit & push.

## Gates
- `ai.enabled` must be true to call any provider.
- Lazy import provider SDKs in `@speckit/agent`.
- OFF-path: all git/spec features functional.

## Milestones
1. TUI core (list/preview/diff/commit).
2. Templates (blank + official repos).
3. Runners (K/B).
4. Settings (provider/model lists).
5. AI Propose (gated stub).

## CI Gates
- Typecheck, build all packages.
- Headless Ink smoke tests for key handlers.
- No network tests by default.
