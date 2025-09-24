# Agent Operations Guide (v0.0.2)

> **Work area:** edit living briefs, ADRs, and plans under `docs/internal/**`.
> **Distribution:** `.speckit/catalog/**` ships immutable bundles (specs & prompts). Update via the CLI, never by hand.
> **Generation:** `.speckit/spec.yaml` is the source of truth—run `speckit catalog sync` + `speckit gen` to refresh published docs.

## Documents of Record
- Spec (SRS): `docs/internal/specs/speckit-spec-v0.0.1.md`
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
