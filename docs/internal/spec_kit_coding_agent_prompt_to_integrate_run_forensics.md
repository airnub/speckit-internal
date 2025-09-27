# Coding Agent Prompt — Integrate **Agent Run Forensics** Framework into **SpecKit**

> **Mission:** Implement the Run Forensics + Self‑Healing loop described in the project’s “SpecKit — Agent Run Forensics Framework & Integration Guide” so that every agent run teaches the next one. You will add analyzers, artifacts, CI gates, and spec/prompt injection so SpecKit continuously improves.

---

## Operating Mode (non‑negotiable)
**You must operate in a Plan → Search → Edit → Test → Verify loop.**
1) **Plan** the full task list before edits.
2) **Search/Read** relevant files before changing anything.
3) **Edit** only within scope; keep changes minimal and well‑justified.
4) **Test** the narrowest commands after each edit; surface diagnostics.
5) **Verify** via the generated Verification Checklist and update the RTM evidence.
6) **Record** an edit log (file, rationale, expected impact, test ran) in the PR description.
7) Follow the **Reflection Memo** if present at `.speckit/memo.json`. Do **not** repeat prior mistakes.

**Guardrails**
- Use `pnpm` (monorepo‑safe) for install/test.
- Do **not** edit generated folders: `.speckit/**`, `dist/**`, `docs/site/build/**`.
- Secrets: never commit tokens/keys; redact if found in logs.
- Node 20+; TypeScript for new scripts; keep code lint‑clean.

---

## Repository Context & Detection
1) Detect repo root and existing SpecKit structure (`RTM.md`, `docs/`, `.github/workflows/`).
2) Detect `packageManager` and `engines` from `package.json`; if absent, add Node `>=20` and `pnpm` scripts.
3) Confirm presence of the framework guide document; if absent, create `docs/speckit-run-forensics.md` summarizing design.

---

## Deliverables (create/modify exactly these)
**New folders/files**
```
.speckit/
  failure-rules.yaml                 # signatures → labels
  memo.json                          # generated per run (create empty {} if none yet)
  verification.yaml                  # generated per run (create minimal default)
  metrics.json                       # generated per run
  run-schema/
    run.schema.json
    requirement.schema.json
scripts/
  speckit-analyze-run.ts             # parser + scorer + artifact writer
  speckit-update-rtm.ts              # update RTM block between markers
  speckit-inject-artifacts.ts        # inject memo + verification into prompts/spec
.github/workflows/
  speckit-analyze-run.yml            # analyzes logs, updates artifacts + PR comment
  speckit-pr-gate.yml                # enforces thresholds/forbidden labels
```

**Modified files**
```
README.md                            # quick start for the new loop
RTM.md                               # add managed block markers
package.json                         # add scripts + devDeps
speckit.config.yaml                  # new config (repo root)
```

---

## Implementation Tasks
### T1 — Schemas & Rules
- Add `run.schema.json` and `requirement.schema.json` to `.speckit/run-schema/` matching the event/run/requirement structures in the framework guide.
- Add `.speckit/failure-rules.yaml` with baseline signatures:
  - `env.tooling-missing`, `env.dependency-missing`, `logic.api-mismatch`, `test.harness-broken`, `env.git-state-drift`, `process.read-before-write-fail`.

### T2 — Analyzer (`scripts/speckit-analyze-run.ts`)
- **Input:** raw logs (glob), autodetect JSON/NDJSON/text; extract the embedded prompt.
- **Normalize:** emit `Run.json` (events with timestamps, tools, inputs, outputs, errors, files_changed) and include `schema: 1` so downstream readers can detect breaking changes.
- **Extract Requirements:** parse prompt for imperatives + constraints → `requirements.jsonl` with stable IDs.
- **Score:** compute metrics (ReqCoverage, BacktrackRatio, ToolPrecision@1, EditLocality, ReflectionDensity, TTFP).
- **Label Failures:** apply regex rules → labels per episode.
- **Artifacts:**
  - Write `.speckit/memo.json` (lessons, guardrails, checklist, generated_from.run_id).
  - Write `.speckit/verification.yaml` (per‑requirement checks, at least stubs if unknown).
  - Write `.speckit/metrics.json` and `.speckit/summary.md` (short PR‑comment report).
- **RTM update:** call `scripts/speckit-update-rtm.ts` to refresh the managed table.

### T3 — RTM updater (`scripts/speckit-update-rtm.ts`)
- Replace rows **only** within markers:
  ```md
  <!-- speckit:rtm:start -->
  | Req | Covered | Violations | Evidence |
  |-----|---------|-----------|----------|
  <!-- speckit:rtm:end -->
  ```
- For each requirement, write coverage ✅/❌, violations count, and the most meaningful evidence event.

### T4 — Spec/Prompt injector (`scripts/speckit-inject-artifacts.ts`)
- On generation time, merge `.speckit/memo.json` into the system prompt’s **Guardrails** section.
- Attach `.speckit/verification.yaml` to planner context; ensure planner enumerates and executor runs checks.
- Output updated prompt/spec assets under the repo’s expected template locations (do **not** modify `.speckit/**`).

### T5 — Config & package scripts
- Create `speckit.config.yaml` with:
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
    log_format: "auto"
    grep_command: "rg"
  verify:
    enforce_in_ci: true
    block_on_violation: ["process.read-before-write-fail", "env.git-state-drift"]
  ```
- Amend `package.json`:
  - `"speckit:analyze": "tsx scripts/speckit-analyze-run.ts"`
  - `"speckit:inject": "tsx scripts/speckit-inject-artifacts.ts"`
  - `"speckit:update-rtm": "tsx scripts/speckit-update-rtm.ts"`
  - add devDeps: `tsx`, `zod` (or `ajv`), `yaml`, `globby`, `strip-ansi`.

### T6 — GitHub Actions
**`speckit-analyze-run.yml`**
- On PR open/sync: download agent log artifact (if present), run analyzer, commit RTM/artifacts, and post sticky PR comment with `.speckit/summary.md`.

**`speckit-pr-gate.yml`**
- Fail the job if metrics violate thresholds or forbidden labels present.

### T7 — Docs & DX
- Update `README.md` with a **Quick Start**:
  1) Run your agent; attach logs as artifact named `agent-run-logs`.
  2) On PR, the workflow posts a summary and gates merge.
  3) Run locally: `pnpm speckit:analyze -- --raw-log runs/*.log`.
- Add `docs/speckit-run-forensics.md` summarizing the loop and how to tune thresholds.

---

## Definition of Done (DoD)
- ✅ Analyzer produces `.speckit/memo.json`, `.speckit/verification.yaml`, `.speckit/metrics.json`, updates RTM block, and a human‑readable `.speckit/summary.md`.
- ✅ CI posts the summary comment and enforces thresholds.
- ✅ `speckit:inject` merges memo + verification into next prompts/specs without touching generated dirs.
- ✅ `README.md` and docs reflect new commands and workflows.
- ✅ All new code passes type‑check and lints; Node 20+; `pnpm` scripts green on CI.

---

## Verification (Chain‑of‑Verification)
- Run the following locally (or in CI) and attach outputs to PR:
  1) `pnpm speckit:analyze -- --raw-log sample-logs/*.log`
  2) Show RTM diff includes the managed table.
  3) Show `.speckit/memo.json` non‑empty with `generated_from.run_id`.
  4) Show `.speckit/verification.yaml` with at least one REQ check.
  5) Re‑run generation; confirm prompts include Guardrails + Verification.

---

## PR Requirements
- Title: `feat(speckit): integrate agent run forensics + self-healing`
- Body must include:
  - Short plan & edit log table.
  - Metrics snapshot (ReqCoverage, BacktrackRatio, ToolPrecision@1, EditLocality).
  - Links to CI artifacts (raw logs if public; otherwise, indicate path).

---

## Nice‑to‑Have (optional)
- Export metrics to `promptfoo` or Phoenix for trace UI.
- Add `.speckit/memo-history.jsonl` to track lesson evolution.
- Add `speckit doctor` subcommand to validate config and schemas.

---

## Start Now — Planner Checklist
- [ ] Confirm pnpm + Node 20; add scripts.
- [ ] Add schemas, rules, analyzer, injector, updater.
- [ ] Wire workflows; run on a dummy log to produce artifacts.
- [ ] Update RTM and docs; open PR with evidence.

> Deliver the PR when all DoD items are satisfied and CI is green.

