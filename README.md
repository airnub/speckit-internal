# SpecKit — turn specs into commits

**Spec-Driven Development (SDD) with SpecKit** turns a single specification into actionable outputs—generated docs and a Requirements Traceability Matrix (RTM)—and enforces drift/policy gates for safe, auditable commits. Use built-in, repo-local, or remote GitHub templates; the **CLI & TUI** help you lint (Spectral), preview diffs, build docs/RTM, and propose patches (**AI optional; analytics off by default**).

[![CI: speckit-verify](https://github.com/airnub/speckit/actions/workflows/speckit-verify.yml/badge.svg?branch=main)](https://github.com/airnub/speckit/actions/workflows/speckit-verify.yml)
[![CI: CodeQL](https://github.com/airnub/speckit/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/airnub/speckit/actions/workflows/codeql.yml)
[![CI: SBOM](https://github.com/airnub/speckit/actions/workflows/sbom.yml/badge.svg?branch=main)](https://github.com/airnub/speckit/actions/workflows/sbom.yml)
[![CI: Catalog Protect](https://github.com/airnub/speckit/actions/workflows/catalog-protect.yml/badge.svg?branch=main)](https://github.com/airnub/speckit/actions/workflows/catalog-protect.yml)
[![CI: Mode Policy Gate](https://github.com/airnub/speckit/actions/workflows/opa-guard.yml/badge.svg?branch=main)](https://github.com/airnub/speckit/actions/workflows/opa-guard.yml)
[![CI: Framework Guard](https://github.com/airnub/speckit/actions/workflows/experimental-and-graduation-guard.yml/badge.svg?branch=main)](https://github.com/airnub/speckit/actions/workflows/experimental-and-graduation-guard.yml)
[![Powered by Speckit](https://img.shields.io/badge/powered%20by-speckit-blueviolet)](https://github.com/airnub/speckit)

* **Repo:** `speckit`  ·  **Binary:** `speckit` (alias: `spec`)  ·  **Version:** `0.1.0`
* **Packages:** `@speckit/cli`, `@speckit/tui`, `@speckit/agent`, `@speckit/engine` (all `0.1.0`)

## Features


* **Repo-aware**: bind to current repo & branch; or switch to any local/GitHub repo + branch.
* **Spec ops**: create from template, edit in `$EDITOR`, validate front-matter, preview Markdown, diff, stage, **commit**.
* **Git remote ops (AI-OFF supported)**: **Fetch/Pull/Push** using your local git credentials.
* **Templates**:

  * **Built-in** — `blank` (`classic`), `speckit-template` (`classic`), `next-supabase` (`secure`)
  * **Repo-local** — any directories under `.speckit/templates/**` are merged into the catalog (CLI + TUI)
  * **Remote GitHub** — pull from any accessible repo (use `#branch` or `?ref=` as needed)
* **Spectral & PostInit (TUI)**: **K** lint SRS; **B** build docs/RTM (auto-detects `docs:gen`, `rtm:build`).
* **AI loop (optional)**: **A** to propose a patch (only active when `ai.enabled=true`).
* **Settings (S)**: edit every option in `~/.config/spec-studio/config.json` (AI/analytics toggles, provider/model, API keys & tokens, model lists, repo paths, workspaces).
* **Enterprise-safe**: **AI OFF** and **Analytics OFF** by default.

See an opinionated template here: https://github.com/airnub/speckit-template-next-supabase

## Speckit Catalog & Internal Docs

* **Working docs** live under `docs/internal/**`. Agents and contributors edit these Markdown files directly when updating the plan, RTM, ADRs, or internal briefs.
* **Published bundles** live under `.speckit/catalog/**` (specs + prompts). Treat this directory as read-only; regenerate bundles with the Speckit CLI and open catalog PRs only when the `catalog:allowed` label is applied.
* **Single source of truth** is `.speckit/spec.yaml`. Run `speckit gen --write` to refresh generated docs in `docs/specs/`, then commit the results.
* **Verification** is enforced by the `speckit-verify` workflow, which fails the build if generated docs drift from the spec.

## Preset Policy Gate

PRs that change the preset bundle (`packages/speckit-presets/src/index.ts`) or remove files inside the classic templates (`blank`, `next-supabase`, `speckit-template`) must carry the `preset-change` label. The policy guard fails any pull request that tweaks the curated frameworks without the label applied, and it blocks attempts to add frameworks to the classic preset.

## Dialect & Adapters

SpecKit now routes every generation through a normalized **SpecModel**. The repository declares its input dialect in `.speckit/spec.yaml` (`dialect.id` + `dialect.version`), and the CLI picks the matching adapter at runtime. Today the catalog ships with two adapters:

* `@speckit/adapter-speckit-v1` — maps the classic SpecKit YAML into the normalized SpecModel.
* `@speckit/adapter-owasp-asvs-v4` — scaffolds OWASP ASVS v4 sections into the same shape so we can swap in that standard later without rewriting templates.

Generated Markdown and the append-only `generation-manifest.json` record the dialect alongside tool and template provenance. To migrate a repo to ASVS, point `.speckit/spec.yaml` at the `owasp.asvs.v4` dialect (and provide an ASVS-formatted input file), then run `speckit gen --write`. The adapters keep templates untouched while enforcing compatibility through bundle constraints.

> **Preservation:** Templates are copied **as-is** with variable interpolation; adapters normalize dialects without mutating template content. Architecture decisions and platform-specific details stay intact in generated outputs.

### Why it matters

This rationale lives in the repository README so generated specs stay focused while the full context stays easy to find.

* **One source of truth at any scale** — distributed squads rely on the same living specification bundle, so onboarding, reviews, and compliance checks stay aligned no matter how many repos you operate. Product and platform changes point back to that single narrative instead of scattered docs.
* **Stack-flexible planning** — when architecture or framework choices shift—say, React today and Next.js tomorrow—you refine the implementation plan while the core requirements remain steady. Specs describe intent, so they survive tool migrations and keep engineers unblocked.
* **Requirements tracked like code** — every requirement lives alongside the source in git, complete with history, diffs, and review workflows. Traceability stops being a spreadsheet exercise because updates ride through normal pull requests.
* **Full-context AI assistance** — the agent can reference the entire specification, recent diffs, and surrounding artifacts rather than a single prompt. That richer context produces proposals that respect constraints your team already agreed to.

## Quick start

```bash
# Enable Corepack for pnpm (Node 18+ bundles it)
corepack enable pnpm
pnpm install

# CLI (use `speckit`; legacy alias: `spec` works interchangeably)
pnpm --filter @speckit/cli dev
speckit template list

# Classic preset (default, no frameworks)
speckit init --template speckit-template                   # classic
speckit template use speckit-template ./my-generic-spec    # classic

# Secure preset (alias expands to curated frameworks)
speckit init --mode secure --template next-supabase        # secure preset
speckit template use next-supabase ./my-next-app           # secure preset

# Explicit frameworks (preferred for granular control)
speckit init --frameworks iso27001,soc2,gdpr --template next-supabase
speckit template use speckit-template ./app --framework iso27001 --framework soc2

# Or pull directly from any GitHub repo (optionally add #branch or ?ref=branch)
speckit template use https://github.com/acme/awesome-spec-kit ./awesome-spec
# Merge a GitHub template into the current repo (preset optional)
speckit init --template https://github.com/acme/awesome-spec-kit#feature/onboarding
speckit init --mode secure --template https://github.com/acme/awesome-spec-kit#feature/onboarding

# TUI
pnpm --filter @speckit/tui dev
# N → pick a template (blank, built-ins, or repo-local)
# K → Spectral lint, B → docs/RTM build, A → AI propose (if enabled),
#   S → Settings (toggle AI/analytics, edit provider, keys, models, repo paths)
```

## Presets & Frameworks

Speckit treats **presets** as shortcuts for framework bundles. Classic remains the default and keeps frameworks empty. Secure now
expands to a curated list (`iso27001`, `soc2`, `gdpr`). You can always override the preset by passing explicit frameworks:

* `--frameworks iso27001,soc2,gdpr` for a CSV.
* `--framework iso27001 --framework soc2` for repeated flags.

When you pass explicit frameworks they win over any preset. The CLI still accepts `--mode secure` for backward compatibility but
prints a hint reminding you to prefer `--frameworks …` for precise control.

> ### Modes & experimental gate
>
> ```bash
> # Classic is default
> speckit init --mode classic
>
> # Try Secure (experimental)
> speckit init --experimental --mode secure
> speckit frameworks list
> ```

Classic keeps things lightweight with no external framework dependencies. Secure enables hardened scaffolds and standards enforcement; `--mode secure` now prints the equivalent `--frameworks iso27001,soc2,gdpr` hint so you can tweak the bundle explicitly when needed.

### Framework statuses (GA vs Experimental)

Compliance frameworks now flow through a central registry so each standard can graduate independently. Run `speckit frameworks list` to see the current status badges (GA or Experimental) and which ones require the experimental gate. GA frameworks work without `--experimental`; experimental ones stay locked until you opt in with `--experimental`, `SPECKIT_EXPERIMENTAL=1`, or a project/user config toggle.

### Secure mode: HIPAA compliance pack

Secure initiatives can now opt into a curated HIPAA Security Rule workflow without affecting the classic path. To enable it:

1. Switch `.speckit/spec.yaml` to secure mode (`engine.mode: secure`) and set `compliance.enabled: true`.
2. Keep the bundled HIPAA framework entry (`id: hipaa`) or add it to `compliance.frameworks` with any custom scope values.
3. Capture technical safeguard evidence in `docs/internal/compliance/hipaa/technical-safeguards.yaml`.

Then run the compliance helpers:

```bash
speckit compliance plan --experimental --framework hipaa    # generates the HIPAA checklist, privacy role guide, and breach plan
speckit compliance verify --experimental --framework hipaa  # evaluates safeguards, runs the OPA policy, and writes .speckit/compliance-report.*
```

The HIPAA catalog uses NIST SP 800-66 Rev.2 guidance and the OLIR HIPAA ↔︎ NIST SP 800-53 Rev.5 mapping. Objective technical safeguards (TLS enforcement, encryption at rest, unique user IDs, audit logging) must report `pass` or the verify step fails; all other safeguards surface as manual evidence for reviewers.

### Secure mode: Education (US)

K–12 initiatives can opt into a FERPA/COPPA/CIPA/PPRA workflow with optional state overlays for California SOPIPA and New York Education Law 2-d. Generate the bundle, capture evidence, and run policy checks:

```bash
speckit compliance plan --experimental --framework edu-us --overlays ca-sopipa,ny-2d
speckit compliance verify --experimental --framework edu-us
```

* `plan` writes `docs/internal/compliance/edu-us/**`, including the FERPA, COPPA, CIPA, PPRA checklists and any overlays you request.
* `verify` evaluates `docs/internal/compliance/edu-us/edu-us-controls.yaml`, enforces the COPPA/CIPA/NY 2-d guardrails, and produces `.speckit/compliance-report.(json|md)`.

The generated README links to primary guidance from the U.S. Department of Education, FTC, FCC, and state regulators. Policy-as-code checks fail when under-13 processing lacks consent/retention documentation, E-Rate claims lack filtering or monitoring artefacts, or New York overlays miss the required public postings.

### Secure mode: Education (EU/IE)

Opt into an EU/Ireland bundle when processing student data for Irish schools or EU programmes that follow the Data Protection Commission’s guidance.

```bash
speckit compliance plan --experimental --framework edu-eu-ie
speckit compliance verify --experimental --framework edu-eu-ie
```

* `plan` writes GDPR and DPC fundamentals docs to `docs/internal/compliance/edu-eu-ie/**` and seeds an evidence tracker that reflects your configured age of digital consent.
* `verify` enforces age-of-digital-consent alignment, DPIA coverage, parental consent flows (when consent is the lawful basis), behavioural advertising bans, and retention limits. Results land in `.speckit/compliance-report.(json|md)`.

Age defaults to 16 for Ireland. To support another EU/EEA Member State, edit `.speckit/spec.yaml` and set `compliance.frameworks[].config` for `edu-eu-ie`, then re-run the plan command to refresh docs with the new age.

### Verify & troubleshoot

```bash
speckit doctor
speckit verify
```

## Repo-local templates

SpecKit automatically merges the built-in catalog with any directories that live under `.speckit/templates/**` in your current repo. Each directory becomes a selectable template (its name defaults to the relative path, e.g. `.speckit/templates/app/next` → `app/next`). Make sure the directory contains a manifest or at least one file; empty folders are ignored. The CLI (`speckit template list`, `speckit template use`, `speckit init --template …`; alias: swap `speckit` for `spec`) and the TUI picker (`N`) both surface these entries alongside the defaults. When you need something outside the catalog, pass a GitHub URL directly to `speckit template use …` or `speckit init --template …` (add `#branch` or `?ref=` if you need a branch other than the default—alias: `spec`).

Note: In this repo, published bundles live under `.speckit/catalog/**`. Consumer repos may also use `.speckit/templates/**`; Speckit merges those into the picker at runtime.

### Optional manifest (`template.json`)

Add a JSON manifest at the root of the template directory to override metadata or declare post-init hooks:

```jsonc
// .speckit/templates/app/next/template.json
{
  "name": "app/next",          // defaults to the relative directory name
  "description": "Next.js + Supabase starter wired for SpecKit",
  "specRoot": "docs/specs",    // optional override for downstream tooling
  "varsFile": "template.vars.json", // defaults to template.vars.json when present
  "postInit": [
    "pnpm install",
    "pnpm docs:gen"
  ]
}
```

The loader also recognizes `template.config.json` and `template.meta.json` if you prefer either filename.

### Variable prompts (`template.vars.json`)

Place a `template.vars.json` file next to the manifest to define string substitutions. The CLI prompts for each key and replaces `{{TOKEN}}` occurrences throughout the copied files:

```json
{
  "PROJECT_NAME": {
    "prompt": "Project name",
    "default": "Acme"
  },
  "SUPABASE_URL": {
    "prompt": "Supabase URL"
  }
}
```

Values collected via `speckit template use …` or `speckit init --template …` are interpolated immediately. The TUI copies the template directory as-is, so placeholders remain available for manual edits or a follow-up CLI run if you want the prompts.

### Post-init commands

Declare an array of shell commands in `postInit` (within the manifest) to run after files are copied and variables applied. Commands execute in order inside the target repo, letting you prime dependencies (`pnpm install`), generate docs (`pnpm docs:gen`), or run any other bootstrap tasks. Leave `postInit` undefined to skip this step.

### Manual QA: Ad-hoc GitHub template prompts

1. Remove any previous sandbox directory (for example `rm -rf /tmp/spec-template-test`).
2. Run `pnpm --filter @speckit/cli dev -- speckit template use https://github.com/airnub/next-supabase-speckit-template /tmp/spec-template-test` (alias: replace `speckit` with `spec` if needed).
3. Confirm the CLI prompts for `REPO_NAME`, `APP_TITLE`, and the other keys defined in the template's `template.vars.json` file.
4. Inspect files such as `/tmp/spec-template-test/docs/specs/templates/base.md` to verify placeholders like `{{REPO_NAME}}` were replaced with the entered values.

## Governance & contributing

* [Mode Assurance & Anti-Regression Charter](docs/internal/charters/mode-assurance.md)

## Roadmap

### Near term

* Expand template coverage (more frontend/backend stacks) and polish the TUI flows for diffing, staging, and committing specs.
* Add support for repo-local templates under `.speckit/templates` so teams can version custom scaffolds that load seamlessly in the CLI/TUI pickers.
* Harden the Spectral/PostInit runners with additional integration tests and richer error surfacing, keeping AI and analytics optional by default.
* Add a draft-spec workflow so requirement edits happen in a draft workspace first, can be reviewed or committed as drafts, and then promoted into a new published version when ready.
* Expand the CLI/TUI beyond today's spec-generation flows by planning `/plan` to drive tech-stack selection and `/tasks` to break work into actionable steps.

### Mid term

* Add **Model Context Protocol (MCP) / Agent-to-Agent (A2A)** support so SpecKit can both consume and expose spec context programmatically. This will let external agents request templates, trigger lint/build runs, and hand back proposed patches without going through the interactive CLI/TUI.

### Long term

* Ship **Speckit TUS as a SaaS platform**: a multi-tenant Next.js + Supabase web app that generates specs, manages template catalogs, and mirrors all SpecKit CLI/TUI functionality (spec editing, diffing, AI proposals, repo orchestration) through secure web workflows and webhooks. The goal is a managed experience where teams collaborate on specs, sync to their repos, and invoke SpecKit automation from the browser or via Supabase Edge Functions.

### Update model lists

Edit `~/.config/spec-studio/config.json`:

```jsonc
{
  "ai": { "enabled": true },
  "provider": "openai",
  "openai": {
    "apiKey": "sk-...",
    "model": "gpt-5-2025-08-07",
    "models": [
      "gpt-5-2025-08-07",
      "gpt-5-mini-2025-08-07",
      "gpt-5-nano-2025-08-07",
      "gpt-5-codex",
      "gpt-4.1-2025-04-14",
      "codex-mini-latest"
    ]
  },
  "github": {
    "pat": "",
    "model": "openai/gpt-5",
    "models": [
      "openai/gpt-5",
      "openai/gpt-5-mini",
      "openai/gpt-5-nano",
      "openai/gpt-5-chat",
      "openai/gpt-4.1",
      "openai/gpt-4.1-nano",
      "openai/gpt-4.1-mini"
    ]
  }
}
```
