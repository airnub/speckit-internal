# SpecKit — Agent Run Forensics Framework & Integration Guide

> **Purpose:** Provide a complete, repo‑ready framework to learn from AI coding agent **run logs** (including the prompt), diagnose failure modes, and automatically **refine next‑run specs** in SpecKit. Includes schemas, algorithms, CLI design, CI wiring, and governance.

---

## 0) Executive Summary

- **Problem:** AI coding agents sometimes drift, retry excessively, or misinterpret instructions. Without structured feedback from logs, next runs repeat mistakes.
- **Solution:** Parse each run’s logs into a **trajectory** (plan→search→edit→test→verify). Score coverage vs prompt, tag failure patterns, and then write back:
  - a machine‑readable **Reflection Memo** (lessons + guardrails),
  - a per‑requirement **Verification Checklist** (CoVe),
  - **RTM** updates (coverage, evidence links, blockers).
- **Outcome:** Next SpecKit generation **injects** these artifacts, producing tighter specs and more efficient agent behavior with fewer retries and less drift.

---

## 1) Scope & Assumptions

- We have **run logs** that include: prompt text, tool calls, stdout/stderr, timestamps, file diffs, exit codes, and final status.
- No access to model internals is required.
- Works across languages and build systems; examples below use JS/TS + pnpm.

---

## 2) Canonical Event & Run Schemas

Use these JSON schemas to normalize logs. Store under `.speckit/run-schema/`.

### 2.1 `Run.json` (normalized)

Every normalized run payload is versioned. The analyzer currently writes `schema: 1` and readers must validate or gracefully downgrade when the version changes.
```json
{
  "schema": 1,
  "run_id": "2025-09-26T12:34:56Z-abc123",
  "agent_version": "speckit-agent@0.8.0",
  "prompt": "...full system+user prompt...",
  "context_sources": ["docs/SRS.md", "RTM.md"],
  "events": [
    {
      "t": "2025-09-26T12:35:12.345Z",
      "type": "plan|search|read|edit|run|eval|reflect|replan|finalize",
      "tool": "bash|git|rg|node|pnpm|pytest|jest|editor|browser",
      "input": "command or plan text",
      "output": "trimmed stdout/stderr",
      "error": {"message": "", "exit_code": 0},
      "files_changed": ["src/foo.ts"],
      "tokens": {"prompt": 1523, "completion": 2840},
      "duration_ms": 1320,
      "labels": ["optional-freeform-tags"]
    }
  ],
  "final_status": "success|fail|partial"
}
```

### 2.2 `Requirement.json` (derived from prompt)
```json
{
  "id": "REQ-12",
  "text": "Add pnpm test task and run after edits",
  "constraints": ["use pnpm not npm", "narrow tests to changed packages"],
  "evidence": [
    {"event_index": 12, "type": "run", "desc": "pnpm test -w --filter pkg-a"}
  ],
  "covered": true,
  "violations": ["used npm test"],
  "blockers": []
}
```

---

## 3) Prompt → Requirement Extraction (Log‑Only)

**Goal:** Produce a deterministic list of requirements (imperatives + constraints) that the agent must cover.

**Algorithm (heuristic, works well on SRS/spec blocks or rich prompts):**
1. **Segment** the prompt into paragraphs and bullet items.
2. **Detect imperatives** (`must`, `should`, verbs at sentence start) → candidate requirements.
3. **Attach constraints** (`don’t`, `never`, `only`, environment/tooling) to the nearest requirement.
4. **Normalize**: assign stable IDs (`REQ-###`) and keep a `source_span` index into the prompt.
5. **Emit** `requirements.jsonl` for downstream coverage scoring.

---

## 4) Coverage, Drift & Process Metrics

Compute per run; thresholds are configurable.

- **ReqCoverage** = covered requirements / total.
- **ConstraintViolations** = count + list per requirement.
- **PlanQuality** = did the run include at least one `plan` before the first `edit`?
- **BacktrackRatio** = (`replan` + repeated failing `run`) / total actions.
- **ToolPrecision@1** = correct tool chosen on first attempt (hindsight label) / tool invocations.
- **EditLocality** = % changed lines within files referenced by stack traces, search results, or requirement text.
- **ReflectionDensity** = `reflect` events per 10 actions.
- **TTFP** (time‑to‑first‑passing‑test) if tests exist.

Emit to `.speckit/metrics.json`.

---

## 5) Failure Taxonomy (Log Signatures → Labels)

Use deterministic regex + heuristics. Store in `.speckit/failure-rules.yaml`.

```yaml
signatures:
  - label: env.tooling-missing
    patterns: ["Command not found", "jest: not found", "pnpm: command not found"]
  - label: env.dependency-missing
    patterns: ["ModuleNotFoundError", "Cannot find module "]
  - label: logic.api-mismatch
    patterns: ["TypeError", "AttributeError", "undefined is not a function"]
  - label: test.harness-broken
    patterns: ["Cannot find module .* from .*test", "vitest not configured"]
  - label: env.git-state-drift
    patterns: ["fatal: not a git repository", "detached HEAD"]
  - label: process.read-before-write-fail
    requires:
      before: ["search", "read"]
      forbidden_sequence: ["edit -> run(fail)"]
```

---

## 6) Reflection Memo (Machine‑Readable)

Generated after analysis; consumed on the **next run**. Save as `.speckit/memo.json`.

```json
{
  "version": 1,
  "lessons": [
    {"if": "workspace=pnpm", "then": "use pnpm not npm for install/test"},
    {"if": "jest not found", "then": "install deps, then run pnpm test -w"},
    {"if": "TypeError at file X", "then": "grep symbol, read source before edit"}
  ],
  "guardrails": [
    "ALWAYS search the repo (ripgrep) before editing",
    "AFTER every edit: run the narrowest test",
    "NEVER modify files outside scope without justification"
  ],
  "checklist": [
    "Plan → Search → Edit → Test → Verify",
    "Record diffs & rationale per edit",
    "Confirm requirement coverage before finalize"
  ],
  "generated_from": {"run_id": "2025-09-26...", "speckit": "0.9.0"}
}
```

---

## 7) Verification Checklist (Chain‑of‑Verification, per Requirement)

Save as `.speckit/verification.yaml`. The agent must **plan** and **execute** these checks before finalize.

```yaml
version: 1
checks:
  - id: REQ-12
    name: "Run pnpm tests on changed packages"
    steps:
      - type: command
        run: "pnpm test -w --filter {changed_packages}"
      - type: grep
        file: "packages/*/src/**/*.ts"
        contains: ["new API usage"]
      - type: summary
        expect: "All tests passed for changed packages"
  - id: REQ-15
    name: "No edits to generated dirs"
    steps:
      - type: forbid-glob
        globs: ["**/.speckit/**", "**/dist/**"]
```

---

## 8) RTM Integration (Evidence & Coverage)

**Goal:** Keep RTM as the single source of truth for requirement coverage.

- Add a managed block in `RTM.md`:

```md
<!-- speckit:rtm:start -->
| Req | Covered | Violations | Evidence |
|-----|---------|-----------|----------|
| REQ-12 | ✅ | 0 | run#18: `pnpm test -w --filter pkg-a` |
| REQ-15 | ❌ | 1 | edit#22 touched `dist/` |
<!-- speckit:rtm:end -->
```

- The analyzer **replaces** rows between markers each run.

> **Changelog vs RTM:** RTM captures **requirement coverage & evidence** for a run; your CHANGELOG remains human‑oriented release notes.

---

## 9) Workflow: Analyzer Pipeline

1) **Ingest & Normalize:** parse raw logs → `Run.json`.
2) **Extract Requirements:** from prompt → `requirements.jsonl`.
3) **Align & Score:** coverage, metrics, failure labels → `.speckit/metrics.json`.
4) **Artifacts:** write versioned `memo.json`, `verification.yaml`, update `RTM.md` block.
5) **Publish:** attach artifacts to PR comment & persist in repo/CI artifact.

---

## 10) Guardrailed Prompt Block (Prepend Each Run)

Paste this block into the agent’s **system prompt** on every run.

```
Operate in a Plan→Search→Edit→Test→Verify loop.
1) Enumerate sub-tasks that exactly cover the requirements below.
2) BEFORE any edit: search the repo for relevant symbols and read the files you will touch.
3) AFTER each edit: run the narrowest possible test to validate the change.
4) Maintain an edit log: {file, rationale, expected impact, test to run}.
5) If a command fails, write a diagnostic, update the plan, then retry.
6) Before finishing, run the Verification Checklist for each requirement.
7) Follow the Reflection Memo below; do not repeat previous mistakes.
```

---

## 11) Governance, Privacy, and Security

- **Prompt redaction:** redact secrets/tokens in stored prompts.
- **PII:** avoid persisting user‑auth data from logs.
- **Config‑as‑code:** store thresholds and rules in `.speckit/*.yaml` under version control.
- **Auditability:** keep `Run.json` and `metrics.json` as CI artifacts; link PR → run evidence.

---

## 12) Evaluation Plan (Before/After)

Track:
- Δ ReqCoverage, Δ BacktrackRatio, Δ ToolPrecision@1, Δ EditLocality.
- Failure label distribution over time.
- Mean time‑to‑green (first passing CI) per PR.

---

# Part B — Wiring This Into SpecKit (Implementation Guide)

## B1) Repository Layout Additions

```
.speckit/
  failure-rules.yaml
  memo.json                 # generated per run
  verification.yaml         # generated per run
  metrics.json              # generated per run (versioned)
  run-schema/
    run.schema.json
    requirement.schema.json
scripts/
  speckit-analyze-run.(ts|py)
  speckit-update-rtm.(ts|py)
  speckit-inject-artifacts.(ts|py)
.github/workflows/
  speckit-analyze-run.yml
  speckit-pr-gate.yml
```

## B2) CLI Commands (SpecKit)

Add two subcommands (could be Node/TS or Python):

### `speckit analyze-run`
**Input:** raw log path(s) or CI artifact name.
**Output:** normalized `Run.json`, `requirements.jsonl`, `.speckit/*` artifacts, RTM block update.

**Flags:**
```
--raw-log <path>
--prompt-from-log         # default true
--threshold-coverage 0.7
--threshold-tool-precision 0.6
--write-rtm RTM.md
--out .speckit
```

### `speckit generate`
Reads `.speckit/memo.json` + `.speckit/verification.yaml` and injects them into the next spec/prompt templates (system and planner prompts). Controlled by `speckit.config.yaml`.

## B3) Config File: `speckit.config.yaml`

```yaml
version: 1
thresholds:
  coverage: 0.75
  tool_precision: 0.65
  backtrack_ratio_max: 0.35
artifacts:
  rtm_path: "RTM.md"
  out_dir: ".speckit"
parser:
  log_format: "auto|json|ndjson|text"
  grep_command: "rg"
verify:
  enforce_in_ci: true
  block_on_violation: ["process.read-before-write-fail", "env.git-state-drift"]
```

## B4) GitHub Actions

### B4.1 `speckit-analyze-run.yml`
Analyzes the latest agent run (artifact or logs), updates RTM, and posts a PR comment.

```yaml
name: SpecKit — Analyze Agent Run
on:
  workflow_dispatch:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20" }
      - run: pnpm i -g pnpm
      - run: pnpm install --frozen-lockfile

      - name: Fetch agent logs artifact
        uses: actions/download-artifact@v4
        with:
          name: agent-run-logs
          path: ./agent-logs
        continue-on-error: true

      - name: Analyze run
        run: |
          node scripts/speckit-analyze-run.js \
            --raw-log "agent-logs/**/*.log" \
            --write-rtm RTM.md --out .speckit

      - name: Commit RTM + artifacts (if changed)
        uses: stefanzweifel/git-auto-commit-action@v5
        with:
          commit_message: "chore(speckit): update RTM & .speckit artifacts"
          file_pattern: |
            RTM.md
            .speckit/**

      - name: PR Comment — Run Forensics
        uses: marocchino/sticky-pull-request-comment@v2
        with:
          recreate: true
          path: .speckit/summary.md
```

### B4.2 `speckit-pr-gate.yml`
Blocks merge on threshold failures and forbidden labels.

```yaml
name: SpecKit — PR Gate
on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Read metrics
        id: metrics
        run: |
          cat .speckit/metrics.json || echo '{"version":1,"ReqCoverage":0}' > .speckit/metrics.json
          echo "METRICS=$(cat .speckit/metrics.json | tr -d '\n')" >> $GITHUB_OUTPUT

      - name: Enforce thresholds
        run: |
          node -e '
            const m = JSON.parse(process.env.METRICS);
            const cov = m.ReqCoverage ?? 0; const tp = m.ToolPrecision1 ?? 0;
            if (cov < 0.75 || tp < 0.65) { console.error("Gate failed", {cov,tp}); process.exit(1); }
          '
        env:
          METRICS: ${{ steps.metrics.outputs.METRICS }}
```

## B5) PR Comment Format: `.speckit/summary.md`

```md
### SpecKit — Run Forensics Summary
- **ReqCoverage:** 0.78
- **BacktrackRatio:** 0.22
- **ToolPrecision@1:** 0.70
- **EditLocality:** 0.86

**Top failures:** env.dependency-missing (2), process.read-before-write-fail (1)

**Actions for next run**
- Injected Reflection Memo (.speckit/memo.json)
- Generated Verification Checklist (.speckit/verification.yaml)
- RTM updated between markers
```

## B6) Parser Skeleton (TypeScript)

```ts
// scripts/speckit-analyze-run.ts
import fs from "node:fs";
import path from "node:path";

function normalize(rawLogs: string[]): Run { /* parse → events */ return {} as any; }
function extractRequirements(prompt: string): Requirement[] { /* heuristic */ return []; }
function score(run: Run, reqs: Requirement[]) { /* metrics */ return { ReqCoverage: 0.8 }; }
function labelFailures(run: Run) { /* regex rules */ return [/* labels */]; }
function writeArtifacts(/* ... */) { /* memo.json, verification.yaml, metrics.json */ }
function updateRTM(/* ... */) { /* replace between markers */ }

(async () => {
  const logs = process.argv.slice(2); // globbed paths
  const raw = logs.flatMap(p => fs.readFileSync(p, "utf8"));
  const run = normalize([raw]);
  const reqs = extractRequirements(run.prompt);
  const metrics = score(run, reqs);
  labelFailures(run);
  writeArtifacts();
  updateRTM();
})();
```

## B7) Spec Injection (at Generation Time)

On `speckit generate`:
- Merge `.speckit/memo.json` into system prompt’s **Guardrails** section.
- Attach `.speckit/verification.yaml` to planner context; require the agent to plan those checks.
- Optionally set **planner** and **executor** agents to different prompts, both consuming the same memo.

## B8) Human‑in‑the‑Loop (Optional)

Add a manual gate when failure labels contain `env.git-state-drift` or when edits target `migrations/` or `schema.sql`. Surface a confirm step in the PR comment.

## B9) Local Developer Workflow

- `pnpm speckit:analyze --raw-log runs/2025-09-26.log`
- Inspect `.speckit/summary.md` and `RTM.md` diff.
- `pnpm speckit:generate` to rebuild prompts/spec with new memo + verification.

## B10) Edge Cases & Tips

- **Sparse logs:** fall back to conservative defaults; inject guardrails only.
- **Multi‑run PRs:** keep one `memo.json` per run; the latest wins but append history to `.speckit/memo-history.jsonl`.
- **Binary artifacts:** always store text‑only normalized `Run.json`; attach raw logs as CI artifacts, not in git.

---

## Appendices

### A) Example Raw Log Snippet → Normalized Events
```
[12:35:00] PLAN: Add test, update package.json
[12:35:05] RUN: npm test → error: command not found
[12:35:11] RUN: pnpm test -w --filter package-a → pass
[12:35:40] EDIT: packages/a/src/x.ts (lines +12 -0)
```
→
```json
{"t":"...","type":"plan","tool":"planner","input":"Add test..."}
{"t":"...","type":"run","tool":"npm","input":"npm test","error":{"message":"cmd not found","exit_code":127}}
{"t":"...","type":"run","tool":"pnpm","input":"pnpm test -w --filter package-a","output":"...ok"}
{"t":"...","type":"edit","tool":"editor","files_changed":["packages/a/src/x.ts"]}
```

### B) Sample `.speckit/memo.json`
(See §6.)

### C) Sample `.speckit/verification.yaml`
(See §7.)

### D) RTM Block Markers
(See §8.)

---

## Ready‑Next Steps

1. Add folders/files from **B1** and commit.
2. Implement `speckit-analyze-run` (start with regex parser, upgrade as needed).
3. Wire the **GitHub Actions** in **B4**.
4. Enable `speckit generate` to inject memo + verification into prompts/spec.
5. Track metrics deltas over 3–5 PRs; tune thresholds in `speckit.config.yaml`.

> This gives SpecKit a closed feedback loop: **every run teaches the next one** to be faster, safer, and closer to the spec.

