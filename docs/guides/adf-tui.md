---
id: adf-tui
title: Navigating the ADF Panels in the SpecKit TUI
sidebar_label: TUI Panels
slug: /guides/adf/tui
description: Overview of the SpecKit TUI panels that surface Azure Deployment Framework diagnostics, gates, and workflows.
created: "2025-09-27"
updated: "2025-09-27"
---

# Navigating the ADF Panels in the SpecKit TUI

The SpecKit TUI includes dedicated panels for Azure Deployment Framework (ADF) deployments. Use this guide as a quick reference for each view, the shortcuts available, and the data sources powering them.

## Panels Overview

| Panel | Shortcut | Data Source | Purpose |
|-------|----------|-------------|---------|
| **ADF › Deployments** | `Shift+D` | `.speckit/runs/latest/plan.json`, `apply.trace.json` | Stream plan/apply progress with resource-level diff summaries. |
| **ADF › Gates** | `Shift+G` | `.speckit/runs/latest/gates/*.sarif` | Visualize pass/fail status for foundations, security, operations, and cost gates. |
| **ADF › Doctor** | `Shift+O` | `adf doctor` JSON output | Show environment health checks (credentials, CLI versions, subscription reachability). |
| **ADF › Policy Packs** | `Shift+P` | `.speckit/policy/adf/**` | Browse installed packs, versions, and the rules contributing to each gate. |
| **ADF › Run Logs** | `Shift+L` | `.speckit/runs/latest/logs/*.log` | Tail orchestrator logs with search and filter capabilities. |

## Panel Details

### Deployments

- Displays timeline cards for `plan`, `apply`, and `destroy` stages.
- Press `Enter` on a resource change to open the diff viewer.
- `f` filters the list by status (`added`, `changed`, `destroyed`).

### Gates

- Aggregates SARIF results into severity buckets.
- `Enter` drills into the selected gate and opens the Run Forensics modal with remediation guidance.
- Use `w` to file a waiver directly from the failure context when the policy allows exceptions.

### Doctor

- Summarizes CLI versions, Azure subscriptions, Terraform plugins, and identity scopes.
- `r` re-runs `adf doctor` without leaving the TUI.
- Failing checks display the upstream command path (e.g., `commands/doctor/azure.ts`) for quick debugging.

### Policy Packs

- Lists installed packs and highlights the version compared to the canonical repo.
- `d` opens the local pack definition in `$EDITOR`.
- `u` checks for updates by calling `speckit policy pull --dry-run`.

### Run Logs

- Streams orchestrator logs; use `/` to search and `n`/`N` to navigate results.
- `c` copies the highlighted log line to the clipboard (when supported by the terminal).
- Toggle structured view with `s` to display JSON log entries.

## Tips & Shortcuts

- Press `?` inside any ADF panel for contextual help.
- Configure panel defaults in `~/.config/spec-studio/adf.json` (columns, auto-refresh cadence, gating thresholds).
- Enable high-contrast mode with `Shift+H` if log colors clash with your terminal theme.

## Troubleshooting

- If panels show `No recent runs`, ensure CI uploaded `.speckit/runs/latest` artifacts or run `speckit run adf-plan` locally.
- For stale data, press `R` to force-refresh the panel cache.
- When SARIF parsing fails, check for schema changes upstream and update SpecKit via `pnpm -r build`.

These panels bring the canonical ADF experience directly into SpecKit so teams can track infrastructure health without leaving the terminal.
