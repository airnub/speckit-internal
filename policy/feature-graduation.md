# Feature Graduation Policy

SpecKit features move from **experimental** to **graduated** when they meet the following gates:

1. **Validation** – automated schema checks pass (`pnpm speckit:validate-artifacts`) and feature-specific smoke tests run in CI.
2. **Documentation** – RTM and `.speckit/summary.md` call out the capability, including hints for the next agent run.
3. **Adoption Signal** – at least two internal projects have adopted the feature with no open severity-one defects for two sprints.
4. **Support Plan** – a rollback/mitigation path is documented in `docs/internal/specs/speckit-spec.md`.

When a feature graduates, add the `feature-graduated` badge to the README section describing the capability.

![Feature graduated badge](badges/feature-graduated.svg)

For each graduation decision, create or update a decision record (see ADR 0003) and link to the supporting artifacts:

- The `.speckit/summary.json` generated for the run that achieved the exit criteria.
- CI logs demonstrating schema validation success.
- A pull request or doc that records the support plan.
