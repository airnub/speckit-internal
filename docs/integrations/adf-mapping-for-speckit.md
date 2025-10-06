---
id: adf-mapping-for-speckit
title: Mapping SpecKit Features to ADF Artifacts & Gates
sidebar_label: SpecKit ↔︎ ADF Mapping
slug: /integrations/adf/mapping
description: Trace SpecKit workflows to the Azure Deployment Framework artifacts and gate outputs they depend on.
created: "2025-09-27"
updated: "2025-09-27"
---

# Mapping SpecKit Features to ADF Artifacts & Gates

The table below serves as the authoritative crosswalk between SpecKit capabilities and the Azure Deployment Framework (ADF) assets that power them. Use it while enabling new teams so every SpecKit experience is wired to a concrete ADF deliverable.

## Feature-to-Artifact Mapping

| SpecKit Capability | ADF Artifact or Gate | Source Location | Notes |
|--------------------|----------------------|-----------------|-------|
| **Template scaffolding** (`speckit integrate adf`) | `bundles/<env>/templates/*.tf` | [`templates/`](https://github.com/speckit-dev/adf/tree/main/templates) | Each environment bundle exposes Terraform modules aligned with SpecKit's template wizard. |
| **Policy Pack sync** (`speckit policy pull`) | `policy/packs/*.yaml` | [`policy/packs`](https://github.com/speckit-dev/adf/tree/main/policy/packs) | Bundles ship `foundations`, `security`, and optional `cost` packs; SpecKit stores them under `.speckit/policy/adf`. |
| **Gate status in TUI run coach** | `gates/*.yaml` definitions + `adf gate export` output | [`gates/`](https://github.com/speckit-dev/adf/tree/main/gates) | Each gate emits SARIF & JSON; SpecKit ingests them into the forensics view. |
| **CI orchestrator** (`speckit run adf-ci`) | `pipelines/github-actions/adf.yaml` | [`pipelines/github-actions`](https://github.com/speckit-dev/adf/tree/main/pipelines/github-actions) | Provides reusable workflow with matrix jobs for build, deploy, and policy checks. |
| **Environment doctor panel** | `commands/doctor/*.ts` diagnostics | [`commands/doctor`](https://github.com/speckit-dev/adf/tree/main/commands/doctor) | Exposes health checks consumed by the SpecKit TUI Diagnostics panel. |
| **Spec-to-infra traceability** | `docs/mapping/speckit.yaml` | [`docs/mapping`](https://github.com/speckit-dev/adf/tree/main/docs/mapping) | Links requirements to Terraform modules and policy rules for RTM coverage. |

## Gate Lifecycle Alignment

ADF ships with four core gates; the matrix shows how they correspond to SpecKit gating terminology.

| ADF Gate | Trigger Command | SpecKit Runner | Default Severity | When to Override |
|----------|-----------------|----------------|------------------|------------------|
| `foundations` | `adf gate run foundations` | `speckit run adf-foundations` | `blocker` | Lower to `warn` only for sandbox subscriptions with isolated resources. |
| `security` | `adf gate run security` | `speckit run adf-security` | `blocker` | Override when performing controlled pen-test deployments with compensating controls. |
| `operations` | `adf gate run operations` | `speckit run adf-ops` | `critical` | Can be downgraded during planned maintenance windows to unblock hotfix infra. |
| `cost` | `adf gate run cost` | `speckit run adf-cost` | `major` | Adjust to `minor` for early experimentation but restore before GA. |

## Implementation Tips

- **Version pinning** — Reference ADF bundles via git tags (e.g., `speckit integrate adf --ref v0.6.0`) to keep environments reproducible.
- **Custom gates** — Add new gate definitions under `gates/custom/*.yaml` and register them in `speckit.config.yaml` using the `adf.gates` array.
- **Diagnostics forwarding** — Set `speckit.adf.eventStream` to `sarif` so run-forensics can merge ADF findings with native SpecKit analyzers.
- **Secrets management** — Mirror `.env.sample` values into your SpecKit workspace secrets vault to keep CLI and pipeline behavior in sync.

When in doubt, consult the canonical ADF repository; every artifact path listed here resolves back to that source of truth.
