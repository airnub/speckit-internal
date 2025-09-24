# Orchestration Plan (v0.0.2)

**Why a v0.0.2 filename?** This plan is iterated more frequently and separately from the v0.0.1 baseline spec; you maintain a root `AGENTS.md` manually. This internal plan complements it.

## Documents of Record
- Spec (SRS): `.dev/specs/speckit-spec-v0.0.1.md`
- Agent brief: `.speckit/templates/prompts/coding-agent-brief/.dev/prompts/coding-agent-brief-v0.0.1.md`
- RTM: `.dev/rtm.md`
- ADRs: `.dev/adrs/*`

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
