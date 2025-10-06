---
id: adf-ci
title: Running ADF Deployments in Continuous Integration
sidebar_label: CI Playbook
slug: /guides/adf/ci
description: How to compose GitHub Actions and other CI runners that drive Azure Deployment Framework gates through SpecKit.
created: "2025-09-27"
updated: "2025-09-27"
---

# Running ADF Deployments in Continuous Integration

Use this playbook to keep SpecKit + ADF deployments reproducible in CI. It covers GitHub Actions, mapping gate outputs back to SpecKit artifacts, and post-run triage.

## Workflow Architecture

```
Spec change → speckit plan (lint/tests) → adf plan → gates export → adf apply (conditional) → notifications
```

- **SpecKit runners** perform fast validation (`speckit lint`, unit tests) before invoking ADF workflows.
- **ADF plan** jobs run in parallel across environments with a shared Terraform cache.
- **Gate exports** produce SARIF/JSON that SpecKit collects for dashboards and Run Forensics.
- **Apply** phases run only after manual approval or when all gates report `pass`.

## GitHub Actions Template

```yaml
name: adf

on:
  workflow_dispatch:
  pull_request:
    paths:
      - 'docs/**'
      - 'infrastructure/**'
      - '.github/workflows/adf.yml'

jobs:
  setup:
    runs-on: ubuntu-latest
    outputs:
      artifact_version: ${{ steps.bundle.outputs.version }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 9
      - run: pnpm install --frozen-lockfile
      - name: Fetch ADF bundle
        id: bundle
        run: |
          git clone --depth=1 --branch v0.6.0 https://github.com/speckit-dev/adf.git ../adf
          echo "version=v0.6.0" >> "$GITHUB_OUTPUT"
      - run: pnpm speckit run adf-doctor

  plan:
    needs: setup
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
        with:
          name: adf-bundle
      - run: pnpm install --frozen-lockfile
      - run: pnpm speckit run adf-plan
      - run: pnpm speckit run adf-foundations -- --format sarif
      - uses: actions/upload-artifact@v4
        with:
          name: adf-gates
          path: .speckit/runs/latest/

  apply:
    if: github.event_name == 'workflow_dispatch'
    needs: plan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm speckit run adf-apply
```

### Key Integration Points

- `plan` uploads gate artifacts so SpecKit's run coach can display failures without re-running jobs locally.
- `apply` is optional; keep it behind manual dispatch or environment protection rules.
- Use OpenID Connect for Azure credentials to avoid long-lived secrets.

## Mapping CI Output Back to SpecKit

| Artifact | Location | Consumed By |
|----------|----------|-------------|
| `adf-plan.json` | `.speckit/runs/latest/plan.json` | TUI Deployments panel & `speckit run coach`. |
| `foundations.sarif` | `.speckit/runs/latest/gates/foundations.sarif` | Run Forensics + policy trend reports. |
| `operations.log` | `.speckit/runs/latest/logs/operations.log` | `speckit run forensics --gate operations`. |
| `apply.trace.json` | `.speckit/runs/latest/telemetry/apply.trace.json` | CI observability dashboards via OpenTelemetry exporters. |

## Failure Handling

1. Download the `adf-gates` artifact from the failed workflow run.
2. Run `pnpm speckit run forensics --from <artifact.zip>` to replay the diagnostics locally.
3. If the gate failure references an ADF policy, edit the corresponding pack under `policy/packs` and re-run locally before pushing.

## Platform Variants

- **Azure DevOps Pipelines** — Wrap the same commands in YAML stages; publish gate artifacts via the `PublishBuildArtifacts` task.
- **GitLab CI** — Use job artifacts + the `needs` keyword to gate apply jobs on plan success.
- **Self-hosted runners** — Ensure Terraform and Azure CLI caches persist between jobs to avoid throttling.

With the CI workflow in place, SpecKit's dashboards will stay aligned with the authoritative ADF runs across every environment.
