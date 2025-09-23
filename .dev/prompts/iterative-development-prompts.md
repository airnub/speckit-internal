---
id: iterative-development-prompts-v0-0-1
title: SpecKit — Iterative Development Prompt Catalog (v0.0.1)
sidebar_label: Iterative Prompt Catalog v0.0.1
slug: /dev/prompts/iterative-development-prompts
description: Rationale-backed evergreen prompts for iterative SpecKit development workflows.
created: "2025-09-22"
updated: "2025-09-22"
---

# Iterative Development Prompt Catalog (v0.0.1)

This catalog captures the evergreen prompts SpecKit engineers reuse to plan and coordinate change safely. Pair each prompt with the document-loading directive below so assistants always ingest the freshest authority docs before reasoning about the repo.

## Evergreen document-loading directive

Include this directive verbatim at the top of any prompt to anchor it to the latest internal guidance:

> Read the root `AGENTS.md` to discover the current coding agent brief. Load that brief and, through it, the latest spec and orchestration plan so every instruction you follow is up to date.

## Prompt catalog

### 1. Parallel-friendly task breakdown

**Rationale.** Curates a short list of independent tasks so multiple engineers can work simultaneously without colliding in the same files.

```
Read the root `AGENTS.md` to discover the current coding agent brief. Load that brief and, through it, the latest spec and orchestration plan so every instruction you follow is up to date. After surveying the current repository state (recent commits, TODOs, and `git status`), propose up to five outstanding development tasks that can proceed in parallel with minimal overlap in touched files. For each task, list the primary packages or files involved, explain why the work stream is low-risk for merge conflicts, and call out any sequencing or shared dependency constraints.
```

### 2. Focused change-surface outline

**Rationale.** Shrinks the intended diff by enumerating only the files and seams that must change before coding begins.

```
Read the root `AGENTS.md` to discover the current coding agent brief. Load that brief and, through it, the latest spec and orchestration plan so every instruction you follow is up to date. Given the change you are about to implement (describe it in one sentence), map the smallest viable change surface. List every file or module that likely needs edits, the rationale for each touchpoint, and any extension points or abstractions that let you avoid collateral changes. Highlight hotspots that other active tasks might also need so the team can stagger them.
```

### 3. Spec and orchestration drift scanner

**Rationale.** Flags mismatches between the codebase and the guiding documents before they create conflicting edits.

```
Read the root `AGENTS.md` to discover the current coding agent brief. Load that brief and, through it, the latest spec and orchestration plan so every instruction you follow is up to date. Review the areas of the codebase relevant to your upcoming work and compare them against the spec and orchestration plan. Note any mismatches or stale instructions, propose whether to update the documents or the implementation, and group the resulting tasks by primary file owner so parallel updates stay isolated.
```

### 4. High-churn touchpoint early warning

**Rationale.** Reveals hotspots seeing frequent edits so teams can coordinate or defer risky changes.

```
Read the root `AGENTS.md` to discover the current coding agent brief. Load that brief and, through it, the latest spec and orchestration plan so every instruction you follow is up to date. Inspect recent history (e.g., `git log --stat -n 30`) to identify files or packages experiencing heavy churn. Summarize the hotspots, explain the themes driving the edits, and recommend mitigation strategies—such as deferring work, coordinating with the responsible teammate, or carving out a wrapper—so new tasks stay out of conflict-prone areas.
```

### 5. Targeted regression safety net

**Rationale.** Establishes the minimal validation run that still covers the surfaces touched by the current work.

```
Read the root `AGENTS.md` to discover the current coding agent brief. Load that brief and, through it, the latest spec and orchestration plan so every instruction you follow is up to date. Based on the code you plan to touch, assemble a prioritized checklist of automated tests and manual spot checks that will cover the affected behavior while keeping iteration tight. Group tests by scope (unit, integration, CLI smoke, TUI) and call out any expensive suites that can be deferred to CI, so local runs stay fast without sacrificing coverage.
```
