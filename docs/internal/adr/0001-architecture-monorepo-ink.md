# ADR 0001 — Monorepo, TypeScript, and Ink TUI

- **Status:** Accepted
- **Date:** 2025-09-22

## Context
We need a cohesive developer experience across CLI and TUI with shared types/utilities.

## Decision
Adopt a **pnpm monorepo** with packages:
- `@speckit/engine` (types, registry)
- `@speckit/cli` (clipanion)
- `@speckit/tui` (Ink React)
- `@speckit/agent` (provider adapters, lazy imports)

Use **TypeScript (strict)** and **tsup** to build ESM+CJS.

## Consequences
- Shared types; faster iteration.
- Slight workspace complexity; mitigated by pnpm tooling.
