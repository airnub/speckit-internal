---
id: iterative-development-prompts-v0-0-2
title: SpecKit — Iterative Development Prompt Catalog (v0.0.2)
sidebar_label: Iterative Prompt Catalog v0.0.2
slug: /dev/prompts/iterative-development-prompts
description: Consolidated evergreen prompts for iterative SpecKit development workflows.
created: "2025-09-22"
updated: "2025-09-23"
---

# Iterative Development Prompt Catalog (v0.0.2)

This consolidated catalog merges the prior iterative development prompt catalog and the evergreen iterative development prompt bank. It retains the full set of prompt bodies, rationales, and usage guidance so teams can access every scenario-specific helper from a single reference point.

This catalog captures the evergreen prompts SpecKit engineers reuse to plan and coordinate change safely. These prompts are designed to accelerate day-to-day SpecKit development while avoiding merge conflicts.

Pair each prompt with the document-loading directive below so assistants always ingest the freshest authority docs before reasoning about the repo.

## Evergreen document-loading directive

Include this directive verbatim at the top of any prompt to anchor it to the latest internal guidance:

> Read the root `AGENTS.md` to discover the current coding agent brief. Load that brief and, through it, the latest spec and orchestration plan so every instruction you follow is up to date.

You can prepend this directive once and then append one of the prompt bodies below, or bake it directly into the full text.

## Prompt catalog

### 1. Parallel-friendly task breakdown

**Rationale.** Curates a short list of independent tasks so multiple engineers can work simultaneously without colliding in the same files.

**When to use.** Use this when prioritizing or queuing fresh work in a shared code area.

```
Read the root `AGENTS.md` to discover the current coding agent brief. Load that brief and, through it, the latest spec and orchestration plan so every instruction you follow is up to date. After surveying the current repository state (recent commits, TODOs, and `git status`), propose up to five outstanding development tasks that can proceed in parallel with minimal overlap in touched files. For each task, list the primary packages or files involved, explain why the work stream is low-risk for merge conflicts, and call out any sequencing or shared dependency constraints.
```

### 2. Focused change-surface outline

**Rationale.** Shrinks the intended diff by enumerating only the files and seams that must change before coding begins.

**When to use.** Use this before implementing a feature or fix to keep the diff tightly scoped.

```
Read the root `AGENTS.md` to discover the current coding agent brief. Load that brief and, through it, the latest spec and orchestration plan so every instruction you follow is up to date. Given the change you are about to implement (describe it in one sentence), map the smallest viable change surface. List every file or module that likely needs edits, the rationale for each touchpoint, and any extension points or abstractions that let you avoid collateral changes. Highlight hotspots that other active tasks might also need so the team can stagger them.
```

### 3. Spec and orchestration drift scanner

**Rationale.** Flags mismatches between the codebase and the guiding documents before they create conflicting edits.

**When to use.** Use this to keep documentation aligned with the live plan without stepping on other edits.

```
Read the root `AGENTS.md` to discover the current coding agent brief. Load that brief and, through it, the latest spec and orchestration plan so every instruction you follow is up to date. Review the areas of the codebase relevant to your upcoming work and compare them against the spec and orchestration plan. Note any mismatches or stale instructions, propose whether to update the documents or the implementation, and group the resulting tasks by primary file owner so parallel updates stay isolated.
```

### 4. High-churn touchpoint early warning

**Rationale.** Reveals hotspots seeing frequent edits so teams can coordinate or defer risky changes.

**When to use.** Use this after pulling the latest changes to decide where to tread carefully.

```
Read the root `AGENTS.md` to discover the current coding agent brief. Load that brief and, through it, the latest spec and orchestration plan so every instruction you follow is up to date. Inspect recent history (e.g., `git log --stat -n 30`) to identify files or packages experiencing heavy churn. Summarize the hotspots, explain the themes driving the edits, and recommend mitigation strategies—such as deferring work, coordinating with the responsible teammate, or carving out a wrapper—so new tasks stay out of conflict-prone areas.
```

### 5. Targeted regression safety net

**Rationale.** Establishes the minimal validation run that still covers the surfaces touched by the current work.

**When to use.** Use this to define the minimum-but-sufficient validation run before merging.

```
Read the root `AGENTS.md` to discover the current coding agent brief. Load that brief and, through it, the latest spec and orchestration plan so every instruction you follow is up to date. Based on the code you plan to touch, assemble a prioritized checklist of automated tests and manual spot checks that will cover the affected behavior while keeping iteration tight. Group tests by scope (unit, integration, CLI smoke, TUI) and call out any expensive suites that can be deferred to CI, so local runs stay fast without sacrificing coverage.
```

### 6. Cross-cutting dependency alignment

**Rationale.** Keeps shared dependencies synchronized so workspace or package upgrades do not collide across teams.

**When to use.** Use this when harmonizing shared dependencies across workspaces or packages.

```
Read the root `AGENTS.md` to discover the current coding agent brief. Load that brief and, through it, the latest spec and orchestration plan so every instruction you follow is up to date. Inventory the workspaces or packages that share cross-cutting dependencies relevant to your planned change. For each dependency, capture current versions, peer or engine constraints, and key consumers. Highlight mismatches or upgrade blockers, note sequencing or compatibility checks required, and propose an alignment plan that minimizes downtime and parallel-edit conflicts.
```

### 7. Interface change blast radius planner

**Rationale.** Maps the downstream impact of interface shifts before edits begin so coordinated updates stay predictable.

**When to use.** Use this before adjusting a public interface to map every impacted surface.

```
Read the root `AGENTS.md` to discover the current coding agent brief. Load that brief and, through it, the latest spec and orchestration plan so every instruction you follow is up to date. Describe the interface change in one sentence, then enumerate direct consumers across code, tests, tooling, and docs. For each touchpoint, outline the adaptation steps, risk level, fallback strategy, and validation hooks. Identify automation or targeted searches that confirm coverage, and spell out coordination tasks or timelines needed to keep dependent workstreams unblocked.
```

### 8. Conflict-aware refactor sketch

**Rationale.** Stages large refactors to limit merge pressure while coordinating with parallel feature work.

**When to use.** Use this to storyboard a multi-stage refactor while staying ahead of merge pressure.

```
Read the root `AGENTS.md` to discover the current coding agent brief. Load that brief and, through it, the latest spec and orchestration plan so every instruction you follow is up to date. Summarize the refactor objective, then scan recent commits, TODOs, and known feature branches to spot overlapping areas. Draft a staged plan where each step lists the files or modules touched, the rationale for sequencing, and conflict-mitigation tactics such as shims, feature flags, or helper wrappers. Call out required sync points with teammates and the targeted tests or checks that must pass before advancing to the next stage.
```

### 9. Coordinated documentation sync

**Rationale.** Keeps written guidance aligned with implementation changes without fragmenting ownership.

**When to use.** Use this when keeping multiple documents aligned with an evolving implementation.

```
Read the root `AGENTS.md` to discover the current coding agent brief. Load that brief and, through it, the latest spec and orchestration plan so every instruction you follow is up to date. Identify every spec, README, guide, and changelog entry touched by the planned change, noting the source-of-truth section for each. Detail the required updates, dependencies on other edits, review or approval owners, and ideal sequencing. Recommend supporting artifacts—such as announcements or issue updates—that keep stakeholders aware of the coordinated documentation sweep.
```

### 10. Release-cut readiness sweep

**Rationale.** Surfaces final blockers before promoting a release candidate to keep launch timelines realistic.

**When to use.** Use this before declaring a release candidate to expose any final blockers.

```
Read the root `AGENTS.md` to discover the current coding agent brief. Load that brief and, through it, the latest spec and orchestration plan so every instruction you follow is up to date. Compile a release-readiness checklist that covers code freeze status, outstanding migrations, documentation completeness, changelog accuracy, and required test suites (unit, integration, CLI, TUI). For each item, note the current status, responsible owner, next action, and deadline. Flag gating risks, propose mitigation steps, and call out any approvals or sign-offs needed before cutting the release.
```

## Packaging these prompts with `.speckit/templates`

The `.speckit/templates` convention already copies arbitrary files from either local directories or GitHub repositories, which makes it feasible to distribute customized prompt bundles alongside spec templates:

- `discoverLocalTemplates` treats any populated directory beneath `.speckit/templates` as a selectable template, so a template author can ship a prompts bundle (for example, `.speckit/templates/prompts/iterative`) that drops the curated Markdown files directly into `.dev/prompts` when applied locally.【F:packages/speckit-core/src/index.ts†L98-L157】
- `useTemplateIntoDir` clones or copies the template contents wholesale—then optionally runs variable substitution and post-init hooks—meaning external repositories like `nextjs-supabase-speckit-template` can already deliver prompt catalogs together with specs without extra wiring.【F:packages/speckit-cli/src/services/template.ts†L30-L164】
- Because the copier is path-agnostic, teams can version prompt libraries in their own template repos, annotate them with `template.vars.json` for customization, and consume them through the existing CLI/TUI flows just like any other SpecKit template.【F:packages/speckit-cli/src/services/template.ts†L165-L205】

With this pipeline in place, no additional loader changes are required—documented prompts bundled in template repositories will be merged into the target repo wherever the template stores them.
