# ADR 0003: Feature Graduation Badge & Policy

- **Status:** Accepted
- **Date:** 2024-10-25
- **Context:** SpecKit needs a consistent signal for when experimental capabilities become part of the supported surface area.
- **Decision:** Introduce a `feature-graduated` badge and publish the graduation policy in `policy/feature-graduation.md`. Graduation requires schema validation, RTM coverage, adoption signals, and a documented support plan. `.speckit/summary.json` provides the canonical artifact references.
- **Consequences:** PRs that graduate features must update the README with the badge, link to the ADR, and attach the relevant summary/CI evidence. CI enforces schema validation so regressions surface quickly.
