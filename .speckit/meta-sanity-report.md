# Meta Sanity Pass Report

- [x] Workflows `.github/workflows/speckit-analyze-run.yml` and `speckit-upload-logs.yml` already present; sanitizer step now sources shared patterns.
- [x] Core API exposed via `@speckit/core` with `analyzeLogs`, `sanitizeLogs`, and metric helpers.
- [x] Schemas added under `schemas/` for metrics, summary, and requirements artifacts.
- [x] Validator job (`pnpm speckit:validate-artifacts`) wired into `speckit-verify` CI.
- [x] Sanitizer patterns centralized (`packages/speckit-core/patterns/sanitizer-patterns.json`) with broader coverage and unit tests.
- [x] Provider parsers for OpenAI, Anthropic, Vercel AI SDK, LangChain/LangGraph, and MCP logs emit normalized analyzer events.
- [x] PR summary comment now includes artifact links and next-run hints via enriched `.speckit/summary.md` + `.speckit/summary.json`.
- [x] Policy updated with graduation badge and ADR for feature rollout decisions.

## Decisions

1. Established `@speckit/core` as the public entry point for log analysis, sanitization, and metric presentation to keep consumers off of internal scripts.
2. Added schema validation to CI so `.speckit` artifacts fail fast when structure drifts.
3. Documented feature graduation guardrails to align with compliance expectations and surfaced a reusable badge for feature status.
