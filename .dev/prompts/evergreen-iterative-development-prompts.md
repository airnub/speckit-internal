# Evergreen Iterative Development Prompt Bank

These prompts are designed to accelerate day-to-day SpecKit development while avoiding merge conflicts. Each prompt explicitly instructs the assistant to pull in the latest authority documents so the guidance automatically stays current as versions change.

## Evergreen document-loading directive
Include the following directive verbatim at the top of any prompt so it always anchors to the newest internal guidance:

> Read the root `AGENTS.md` to discover the current coding agent brief. Load that brief and, through it, the latest spec and orchestration plan so every instruction you follow is up to date.

You can prepend this directive once and then append one of the prompt bodies below, or bake it directly into the full text.

## Prompt catalog

### 1. Parallel-friendly task breakdown
Use this when prioritizing or queuing fresh work in a shared code area.

```
Read the root `AGENTS.md` to discover the current coding agent brief. Load that brief and, through it, the latest spec and orchestration plan so every instruction you follow is up to date. After surveying the current repository state (recent commits, TODOs, and `git status`), propose up to five outstanding development tasks that can proceed in parallel with minimal overlap in touched files. For each task, list the primary packages or files involved, explain why the work stream is low-risk for merge conflicts, and call out any sequencing or shared dependency constraints.
```

### 2. Focused change-surface outline
Use this before implementing a feature or fix to keep the diff tightly scoped.

```
Read the root `AGENTS.md` to discover the current coding agent brief. Load that brief and, through it, the latest spec and orchestration plan so every instruction you follow is up to date. Given the change you are about to implement (describe it in one sentence), map the smallest viable change surface. List every file or module that likely needs edits, the rationale for each touchpoint, and any extension points or abstractions that let you avoid collateral changes. Highlight hotspots that other active tasks might also need so the team can stagger them.
```

### 3. Spec and orchestration drift scanner
Use this to keep documentation aligned with the live plan without stepping on other edits.

```
Read the root `AGENTS.md` to discover the current coding agent brief. Load that brief and, through it, the latest spec and orchestration plan so every instruction you follow is up to date. Review the areas of the codebase relevant to your upcoming work and compare them against the spec and orchestration plan. Note any mismatches or stale instructions, propose whether to update the documents or the implementation, and group the resulting tasks by primary file owner so parallel updates stay isolated.
```

### 4. High-churn touchpoint early warning
Use this after pulling the latest changes to decide where to tread carefully.

```
Read the root `AGENTS.md` to discover the current coding agent brief. Load that brief and, through it, the latest spec and orchestration plan so every instruction you follow is up to date. Inspect recent history (e.g., `git log --stat -n 30`) to identify files or packages experiencing heavy churn. Summarize the hotspots, explain the themes driving the edits, and recommend mitigation strategies—such as deferring work, coordinating with the responsible teammate, or carving out a wrapper—so new tasks stay out of conflict-prone areas.
```

### 5. Targeted regression safety net
Use this to define the minimum-but-sufficient validation run before merging.

```
Read the root `AGENTS.md` to discover the current coding agent brief. Load that brief and, through it, the latest spec and orchestration plan so every instruction you follow is up to date. Based on the code you plan to touch, assemble a prioritized checklist of automated tests and manual spot checks that will cover the affected behavior while keeping iteration tight. Group tests by scope (unit, integration, CLI smoke, TUI) and call out any expensive suites that can be deferred to CI, so local runs stay fast without sacrificing coverage.
```
