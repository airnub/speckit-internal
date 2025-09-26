# SpecKit — specs → secure, auditable releases

[![Status: Active development](https://img.shields.io/badge/status-active--development-yellow)](#stability--support)
[![Stability: Pre-release](https://img.shields.io/badge/stability-pre--release-orange)](#stability--support)
[![SemVer: 0.x](https://img.shields.io/badge/semver-0.x-lightgrey)](#versioning)

**End the “vibe‑coding” loop. Turn specs into auditable, production‑ready, secure releases—lock decisions, prevent regressions, and keep agents on‑track with templates, policy gates, and traceability.**

**Spec‑Driven Development (SDD) with SpecKit** turns a single specification into actionable outputs—generated docs and a Requirements Traceability Matrix (RTM)—and enforces drift/policy gates for safe, auditable commits. Use built‑in, repo‑local, or remote GitHub templates; the **CLI & TUI** help you lint (Spectral), preview diffs, build docs/RTM, and propose patches (**AI optional; analytics off by default**).

[![CI: speckit-verify](https://github.com/airnub/speckit/actions/workflows/speckit-verify.yml/badge.svg?branch=main)](https://github.com/airnub/speckit/actions/workflows/speckit-verify.yml)
[![CI: CodeQL](https://github.com/airnub/speckit/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/airnub/speckit/actions/workflows/codeql.yml)
[![CI: SBOM](https://github.com/airnub/speckit/actions/workflows/sbom.yml/badge.svg?branch=main)](https://github.com/airnub/speckit/actions/workflows/sbom.yml)
[![CI: Catalog Protect](https://github.com/airnub/speckit/actions/workflows/catalog-protect.yml/badge.svg?branch=main)](https://github.com/airnub/speckit/actions/workflows/catalog-protect.yml)
[![CI: Mode Policy Gate](https://github.com/airnub/speckit/actions/workflows/opa-guard.yml/badge.svg?branch=main)](https://github.com/airnub/speckit/actions/workflows/opa-guard.yml)
[![CI: Framework Guard](https://github.com/airnub/speckit/actions/workflows/experimental-and-graduation-guard.yml/badge.svg?branch=main)](https://github.com/airnub/speckit/actions/workflows/experimental-and-graduation-guard.yml)
[![Powered by Speckit](https://img.shields.io/badge/powered%20by-speckit-blueviolet)](https://github.com/airnub/speckit)

* **Repo:** `speckit`  ·  **Binary:** `speckit` (alias: `spec`)  ·  **Version:** `0.1.0`
* **Packages:** `@speckit/cli`, `@speckit/tui`, `@speckit/agent`, `@speckit/engine` (all `0.1.0`)

---

## Quick start

```bash
# Enable Corepack for pnpm (Node 18+ bundles it)
corepack enable pnpm
pnpm install

# CLI (use `speckit`; legacy alias: `spec` works)
pnpm --filter @speckit/cli dev
speckit template list

# Initialize from a template
speckit init --template speckit-template                 # classic (no frameworks)
# or a secure preset
speckit init --mode secure --template next-supabase      # preset expands to curated frameworks

# Build docs & RTM in a spec repo
speckit gen --write   # refresh docs/specs/**
```

> Opinionated Next.js+Supabase template: https://github.com/airnub/speckit-template-next-supabase

### Run coach & thin CI loop

1. **Preflight** with the doctor to verify Node/pnpm/test presence:

   ```bash
   pnpm speckit:doctor
   ```

2. **Tail a run log with the live coach** (use `--stdin` if piping output):

   ```bash
   pnpm speckit:coach -- --log runs/sample.ndjson --watch
   ```

   The Ink TUI renders repo + log source, live metrics (ReqCoverage, BacktrackRatio, ToolPrecision@1, EditLocality), and hints derived from failure labels.

3. **Finish the run** (Ctrl+C). SpecKit writes `.speckit/memo.json`, `.speckit/verification.yaml`, `.speckit/metrics.json`, `.speckit/summary.md`, updates `RTM.md`, and refreshes `docs/internal/agents/coding-agent-brief.md` via `pnpm speckit:inject`.

4. **Open or sync a PR.** CI uploads sanitized logs (`speckit-upload-logs`), analyzes them (`speckit-analyze-run`), commits refreshed artifacts/RTM, posts `.speckit/summary.md` as a sticky comment, and only gates on critical labels (e.g., `process.read-before-write-fail`, `env.git-state-drift`).

---

## Key capabilities

- **Repo‑aware workflows**: bind to the current repo/branch, or switch to any local/GitHub repo.
- **Spec operations**: create from template, edit in `$EDITOR`, lint (Spectral), preview Markdown, diff, stage, **commit**.
- **Remote git ops**: **Fetch/Pull/Push** using your local credentials (AI OFF supported).
- **Template sources**: built‑ins, **repo‑local** (`.speckit/templates/**`), or **remote GitHub** URLs.
- **Post‑init hooks & prompts**: template manifests run `postInit` (e.g., `pnpm install`, `pnpm docs:gen`) and prompt from `template.vars.json`.
- **Policy gates**: drift guard (`speckit‑verify`), catalog protect, mode/OPA guard, framework graduation guard.
- **AI loop (optional)**: propose patches when `ai.enabled=true`. **Analytics OFF** by default.

---

## Dialects & adapters (1‑minute overview)

Repos declare an input **dialect** in `.speckit/spec.yaml` (`dialect.id` + `dialect.version`). The CLI maps it into a normalized **SpecModel** via an adapter (e.g., `speckit.v1`, `owasp.asvs.v4`). Generated Markdown + `generation-manifest.json` record dialect and provenance. Adapters **normalize** structure without mutating your templates.

> Deep dive → `docs/dialects-and-adapters.md` (to be added)

---

## Stability & Support

This is a **public, pre‑release (0.x)** project under **active development**. Expect **breaking changes** between minor versions while we iterate.

- **Why public?** Community benefit and optional use of **free AI models** for local experiments.
- **AI is optional.** **OFF by default**; bring your own keys if you enable it.
- **Analytics OFF by default.** No telemetry unless you opt in.
- **Pin for reproducibility.** Prefer tags/SHAs (e.g., `v0.3.0`) over `main` for stable builds.

If you hit regressions, please open an issue with repro steps and your pinned ref.

---

## Versioning

We use **SemVer 0.x** during pre‑release. Any minor (`0.MINOR.PATCH`) **may** include breaking changes. Use Conventional Commits, tagging breaking changes with `!` (e.g., `feat!: …`). Mark GitHub releases as **Pre‑release** and include migration notes.

---

## Data & AI usage

- **AI OFF by default.** Configure provider/model in `~/.config/spec-studio/config.json` if you enable it.
- **No PII.** Treat prompts/specs like source code and avoid sending sensitive data to third parties.
- **Free tiers vary.** Availability or rate limits for free models can change at any time.

---

## Links

- **Template (Next.js + Supabase):** https://github.com/airnub/speckit-template-next-supabase
- **Mode Assurance & Anti‑Regression Charter:** `docs/internal/charters/mode-assurance.md`
- **Drift/Policy CI Workflows:** `.github/workflows/**`

> More focused docs coming soon:
> - `docs/getting-started.md` — install, init, and first spec flow
> - `docs/templates.md` — manifests, vars, postInit, repo‑local vs GitHub
> - `docs/compliance-packs.md` — secure mode, HIPAA, education overlays
> - `docs/dialects-and-adapters.md` — how adapters work, migration to ASVS

---

## Contributing

Before opening a PR:

- Run `speckit gen --write` in spec repos and ensure **no diffs** in `docs/specs/**`.
- For catalog updates, use the **`catalog:allowed`** label.
- For mode/dialect/policy edits, use the **`mode-change`** label.

See the charter: `docs/internal/charters/mode-assurance.md`.

