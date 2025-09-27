# Architecture Decision Records (ADR)

Policy-driven releases in SpecKit require traceability for every change to framework availability, generation modes, and catalog gates. When a feature "graduates" (for example, a framework moves from experimental to GA), capture the context in an ADR stored alongside the code in this directory.

## When to write an ADR

Create a new ADR whenever a pull request applies the `graduation:approved` label **and** a policy gate transition occurs (e.g., experimental → GA or GA → experimental).

Each ADR filename must follow the pattern:

```
ADR-<sequence>-<feature>.md
```

- `<sequence>` is a zero-padded incremental identifier (e.g., `001`, `014`).
- `<feature>` is a short, kebab-cased description of the graduating feature (e.g., `framework-registry`, `secure-mode`).

## Required sections

Every ADR must contain, at minimum:

- `## Rationale` — Why the graduation was approved, including stakeholders.
- `## Policy Checks` — Evidence that each required gate passed (classic, catalog, experimental) with links to CI runs and artifacts.
- `## Decision` — A concise statement of the graduation outcome.

Copy `ADR-template.md`, fill in the placeholders, and commit the file in the same pull request as the graduation change.

CI enforces these requirements: if a graduation occurs without an ADR (or the ADR misses the required sections), the policy gate workflow will fail.
