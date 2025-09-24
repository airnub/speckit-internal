Work here: `docs/internal/**`
Distribution (read-only): `.speckit/catalog/**`

# Agent Guidance & Orchestration Plan (v0.0.2)
>
> **Generation pipeline:** `.speckit/spec.yaml` → `speckit gen --write`

This internal plan complements the canonical documents and keeps agents oriented around the latest repo authority.

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

## CI Gates
- Typecheck, build all packages.
- Headless Ink smoke tests for key handlers.
- No network tests by default.
