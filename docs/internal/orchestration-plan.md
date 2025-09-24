---
id: orchestration-plan-v0-0-2
title: SpecKit — Orchestration Plan (v0.0.2)
sidebar_label: Orchestration Plan v0.0.2
slug: /internal/orchestration-plan
description: Internal orchestration plan aligning agents and humans to the SpecKit v0.0.1 baseline.
created: "2025-09-22"
updated: "2025-09-22"
---

# Orchestration Plan (v0.0.2)

**Why a v0.0.2 filename?** This plan is iterated more frequently and separately from the v0.0.1 baseline spec; you maintain a root `AGENTS.md` manually. This internal plan complements it.

## Documents of Record
- Spec (SRS): `docs/internal/specs/speckit-spec.md`
- Agent brief: `docs/internal/agents/coding-agent-brief.md`
- RTM: `docs/internal/rtm.md`
- ADRs: `docs/internal/adr/*`

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
6. Security control alignment: baseline taxonomy + RTM export paths for OWASP ASVS/SAMM, PCI DSS, ISO 27001, GDPR.

## CI Gates
- Typecheck, build all packages.
- Headless Ink smoke tests for key handlers.
- No network tests by default.
