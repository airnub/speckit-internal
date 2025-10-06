---
id: adf-v0-6-0
title: Azure Deployment Framework (ADF) v0.6.0 — Integration Overview
sidebar_label: ADF v0.6.0
slug: /integrations/adf/v0-6-0
description: Mirrored release highlights for ADF v0.6.0 with links back to the canonical repository.
created: "2025-09-27"
updated: "2025-09-27"
---

# Azure Deployment Framework (ADF) v0.6.0 — Integration Overview

> This page mirrors the ADF v0.6.0 release summary so Speckit teams can review the highlights without leaving the workspace. See the [canonical repository release notes](https://github.com/speckit-dev/adf/releases/tag/v0.6.0) for the source of truth.

## Release Highlights

- **Environment contract bundles** — ADF now packages baseline infrastructure templates and policy packs in versioned bundles to simplify bootstrapping new environments.
- **Gate-aware pipelines** — Built-in orchestrators emit machine-readable gate results (YAML + SARIF) so SpecKit runners can surface actionable failures in the TUI.
- **Incremental deployments** — The orchestrator detects drift between releases and generates targeted plans, reducing apply time on large environments.
- **Diagnostics streaming** — Structured events stream to stdout/stderr with correlation IDs, allowing SpecKit's run coach to annotate long-running jobs.

## Compatibility Matrix

| Component | Minimum Version | Notes |
|-----------|-----------------|-------|
| SpecKit CLI | v0.8.0 | Required for the new `speckit integrate adf` scaffold command. |
| SpecKit Policy Runtime | v0.5.0 | Needed to evaluate the bundled `foundations` and `security` packs. |
| Azure CLI | 2.61.0 | Ensure the `azure-dev` extension is updated before running `adf up`. |
| Terraform | 1.7.x | Used for infrastructure modules included in the environment bundles. |

## Upgrade Checklist

1. Pull the latest ADF templates:
   ```bash
   git pull https://github.com/speckit-dev/adf.git main
   pnpm install
   ```
2. Update local environment variables with the new secrets schema introduced in `env.defaults.yaml`.
3. Run `adf doctor` to validate provider credentials and required Azure subscriptions.
4. Migrate existing pipelines to consume `adf gate export --format sarif` so SpecKit's forensics view can ingest failures.
5. Regenerate policy baselines with `adf policy build foundations security` to pick up the tightened defaults.

## Breaking or Notable Changes

- Deprecated `adf deploy --preview` in favor of `adf plan` for clearer separation between planning and apply stages.
- The workspace bootstrapper now writes artifacts under `.adf/` instead of `.azure/`. Update ignore files if you previously whitelisted the old directory.
- Gate definitions moved from `gates.yaml` to `gates/*.yaml`, allowing per-gate versioning.

## Resources

- 📦 Canonical repository: [speckit-dev/adf](https://github.com/speckit-dev/adf)
- 📰 Release announcement: [v0.6.0 blog post](https://github.com/speckit-dev/adf/discussions/72)
- 🧪 Example pipelines: [`examples/github-actions`](https://github.com/speckit-dev/adf/tree/main/examples/github-actions)
- 📚 API reference: [`docs/reference`](https://github.com/speckit-dev/adf/tree/main/docs/reference)

For open issues or clarifications, always defer to the canonical repository—this page intentionally stays lightweight to mirror its release summary in SpecKit.
