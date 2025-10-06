---
id: adf-getting-started
title: Getting Started with SpecKit + Azure Deployment Framework
sidebar_label: Getting Started
slug: /guides/adf/getting-started
description: Step-by-step workflow for wiring a SpecKit repo to the Azure Deployment Framework bundles and gates.
created: "2025-09-27"
updated: "2025-09-27"
---

# Getting Started with SpecKit + Azure Deployment Framework

This guide walks through bootstrapping a SpecKit workspace backed by the Azure Deployment Framework (ADF) v0.6.0. Follow it end-to-end for your first deployment; afterwards you can automate the workflow with the CI template.

## 1. Prerequisites

- SpecKit CLI v0.8.0 or newer (`pnpm -r build && pnpm speckit --version`).
- Azure CLI 2.61.0+ with the `azure-dev` extension.
- Terraform 1.7.x installed locally (ADF bundles rely on it for infrastructure modules).
- Access to the canonical ADF repository with `read` permissions.
- An Azure subscription ID and service principal with `Contributor` scope on the target resource groups.

## 2. Clone ADF Bundles

```bash
git clone https://github.com/speckit-dev/adf.git ~/.cache/speckit/adf
cd ~/.cache/speckit/adf
git checkout v0.6.0
```

> Tip: Cache the repository under a shared location so multiple projects can re-use the bundles.

## 3. Initialize the SpecKit Integration

Inside your SpecKit project:

```bash
speckit integrate adf --ref v0.6.0 --dest infrastructure/adf
```

This command copies the selected environment bundle into `infrastructure/adf`, creates `.speckit/policy/adf`, and registers the gates in `speckit.config.yaml`.

## 4. Configure Environment Variables

1. Copy `env.defaults.yaml` from the bundle into `config/env.yaml`.
2. Populate subscription IDs, tenant IDs, and key vault names.
3. Run `speckit secrets set adf.clientSecret` to store the service principal secret in the SpecKit vault.

## 5. Validate the Connection

```bash
pnpm speckit run adf-doctor
```

You should see a summary with `credentials`, `terraform`, and `azure` checks all passing. Any failure will reference the corresponding ADF doctor module for remediation.

## 6. First Deployment

```bash
pnpm speckit run adf-plan
pnpm speckit run adf-apply
```

During the run, open the SpecKit TUI (`pnpm --filter @speckit/tui dev`) and select **ADF › Deployments** to watch streaming diagnostics. On completion, commit the generated `.adf/` state files or add them to `.gitignore` per your compliance policy.

## 7. Enable Gates

Turn on gate enforcement to align with policy expectations:

```bash
pnpm speckit run adf-foundations
pnpm speckit run adf-security
```

Gates export SARIF reports under `.speckit/runs/latest/` which power the Run Forensics view.

## 8. Next Steps

- Automate everything in CI using the [ADF CI guide](./adf-ci.md).
- Customize guardrails by editing the [policy pack definitions](../integrations/adf-mapping-for-speckit.md#feature-to-artifact-mapping).
- Share feedback upstream by filing an issue in [speckit-dev/adf](https://github.com/speckit-dev/adf/issues).

Once you have a green deployment and passing gates, your SpecKit project is fully wired into ADF and ready for collaborative development.
