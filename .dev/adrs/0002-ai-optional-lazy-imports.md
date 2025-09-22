# ADR 0002 — AI Optional by Default + Lazy Provider Imports

- **Status:** Accepted
- **Date:** 2025-09-22

## Context
Enterprises require zero network calls without explicit opt-in.

## Decision
- `ai.enabled = false` by default.
- TUI must gate all AI actions.
- `@speckit/agent` must **lazy import** provider SDKs only when called.

## Consequences
- Safe-by-default operation.
- Slightly more boilerplate (dynamic imports), but startup remains fast and compliant.
