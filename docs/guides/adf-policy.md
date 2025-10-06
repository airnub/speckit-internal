---
id: adf-policy
title: Managing ADF Policy Packs with SpecKit
sidebar_label: Policy Packs
slug: /guides/adf/policy
description: Authoring, testing, and distributing Azure Deployment Framework policy packs from a SpecKit workspace.
created: "2025-09-27"
updated: "2025-09-27"
---

# Managing ADF Policy Packs with SpecKit

Policy packs translate organizational guardrails into automated gates. This guide explains how to author packs, validate them locally, and distribute updates through SpecKit.

## Anatomy of a Policy Pack

```
policy/
  packs/
    foundations/
      pack.yaml
      rules/
        001-storage-encryption.yaml
        002-network-logs.yaml
    security/
      pack.yaml
      rules/
        ...
```

- **`pack.yaml`** declares metadata, required inputs, and severity defaults.
- **`rules/*.yaml`** implement individual checks using the ADF rule schema (Rego, Azure Policy definitions, or custom scripts).
- **`tests/` (optional)** store fixture inputs and expected outputs for regression testing.

## Creating a New Rule

1. Duplicate an existing rule under the target pack.
2. Update the `id`, `summary`, and `remediation` fields.
3. Implement the logic in `rego` or the supported script type.
4. Add a test case referencing sample infrastructure state.

```bash
pnpm speckit run adf-policy test --pack foundations --rule 003-logging
```

The command executes ADF's policy test harness and emits JSON + human-readable output consumed by SpecKit's Run Coach.

## Publishing Pack Updates

1. Bump the pack version in `pack.yaml`.
2. Run the full suite:
   ```bash
   pnpm speckit run adf-policy test --pack foundations
   pnpm speckit run adf-policy test --pack security
   ```
3. Generate artifacts:
   ```bash
   pnpm speckit run adf-policy build --pack foundations --out dist/policy
   ```
4. Commit the changes and open a PR against the canonical `speckit-dev/adf` repository.

## Consuming Packs in SpecKit Projects

- Declare the pack in `speckit.config.yaml` under `policy.sources` with `type: adf` and the desired `version` tag.
- Run `speckit policy pull` to download the built artifacts into `.speckit/policy/adf`.
- Enable gates with `speckit run adf-foundations -- --format sarif` so results populate dashboards.

## Governance Tips

- **Version discipline** — Always tag packs in git (`v0.6.0`, `v0.6.1`) and reference the tag in consumer projects.
- **Breaking changes** — Document severity increases or new required inputs in the pack changelog and the mirrored [ADF release notes](../integrations/adf-v0.6.0.md).
- **Exception workflow** — Use SpecKit's waiver mechanism (`speckit policy waive`) to track temporary suppressions instead of editing the packs.
- **Telemetry** — Enable optional OpenTelemetry exporters defined in `pack.yaml` to forward aggregated results to your observability platform.

With disciplined pack management, SpecKit projects stay aligned with ADF's guardrails while giving teams clear remediation guidance.
