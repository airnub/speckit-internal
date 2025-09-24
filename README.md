# SpecKit — turn specs into commits

**TUI + optional AI assistant for spec-driven development:** edit specs, preview diffs, and commit. AI and analytics are **disabled by default**.

- **Repo:** `speckit`  ·  **Binary:** `speckit` (alias: `spec`)  ·  **Version:** `0.1.0`
- **Packages:** `@speckit/cli`, `@speckit/tui`, `@speckit/agent`, `@speckit/core` (all `0.1.0`)

## Features
- **Repo-aware**: bind to current repo & branch; or switch to any local/GitHub repo + branch.
- **Spec ops**: create from template, edit in `$EDITOR`, validate front-matter, preview Markdown, diff, stage, **commit**.
- **Git remote ops (AI-OFF supported)**: **Fetch/Pull/Push** using your local git credentials.
- **Templates**:
  - **Built-in** — `blank`, `next-supabase`, `speckit-template`
  - **Repo-local** — any directories under `.speckit/templates/**` are merged into the catalog (CLI + TUI)
- **Spectral & PostInit (TUI)**: **K** lint SRS; **B** build docs/RTM (auto-detects `docs:gen`, `rtm:build`).
- **AI loop (optional)**: **A** to propose a patch (only active when `ai.enabled=true`).
- **Settings (S)**: edit every option in `~/.config/spec-studio/config.json` (AI/analytics toggles, provider/model, API keys & tokens, model lists, repo paths, workspaces).
- **Enterprise-safe**: **AI OFF** and **Analytics OFF** by default.

## Speckit Catalog & Internal Docs

- **Working docs** live under `docs/internal/**`. Agents and contributors edit these Markdown files directly when updating the plan, RTM, ADRs, or internal briefs.
- **Published bundles** live under `.speckit/catalog/**` (specs + prompts). Treat this directory as read-only; regenerate bundles with the Speckit CLI and open catalog PRs only when the `catalog:allowed` label is applied.
- **Single source of truth** is `.speckit/spec.yaml`. Run `speckit gen --write` to refresh generated docs in `docs/specs/`, then commit the results.
- **Verification** is enforced by the `speckit-verify` workflow, which fails the build if generated docs drift from the spec.

## Dialect & Adapters

SpecKit now routes every generation through a normalized **SpecModel**. The repository declares its input dialect in `.speckit/spec.yaml` (`dialect.id` + `dialect.version`), and the CLI picks the matching adapter at runtime. Today the catalog ships with two adapters:

- `@speckit/adapter-speckit-v1` — maps the classic SpecKit YAML into the normalized SpecModel.
- `@speckit/adapter-owasp-asvs-v4` — scaffolds OWASP ASVS v4 sections into the same shape so we can swap in that standard later without rewriting templates.

Generated Markdown and the append-only `generation-manifest.json` record the dialect alongside tool and template provenance. To migrate a repo to ASVS, point `.speckit/spec.yaml` at the `owasp.asvs.v4` dialect (and provide an ASVS-formatted input file), then run `speckit gen --write`. The adapters keep templates untouched while enforcing compatibility through bundle constraints.

### Why it matters

This rationale lives in the repository README so generated specs stay focused while the full context stays easy to find.

- **One source of truth at any scale** — distributed squads rely on the same living specification bundle, so onboarding, reviews, and compliance checks stay aligned no matter how many repos you operate. Product and platform changes point back to that single narrative instead of scattered docs.
- **Stack-flexible planning** — when architecture or framework choices shift—say, React today and Next.js tomorrow—you refine the implementation plan while the core requirements remain steady. Specs describe intent, so they survive tool migrations and keep engineers unblocked.
- **Requirements tracked like code** — every requirement lives alongside the source in git, complete with history, diffs, and review workflows. Traceability stops being a spreadsheet exercise because updates ride through normal pull requests.
- **Full-context AI assistance** — the agent can reference the entire specification, recent diffs, and surrounding artifacts rather than a single prompt. That richer context produces proposals that respect constraints your team already agreed to.

## Quick start
```bash
# Install pnpm via Corepack (Node 18+ ships with it)
corepack enable pnpm
pnpm install

# CLI (use `speckit`; legacy alias: `spec` works interchangeably)
pnpm --filter @speckit/cli dev
speckit template list
# Classic mode (no external frameworks)
speckit init --template speckit-template
speckit template use speckit-template ./my-generic-spec

# Secure mode (standards enforced)
speckit init --mode secure --template next-supabase
speckit template use next-supabase ./my-next-app
# or pull directly from any GitHub repo (optionally add #branch or ?ref=branch)
speckit template use https://github.com/acme/awesome-spec-kit ./awesome-spec
# merge a GitHub template into the current repo:
speckit init --template https://github.com/acme/awesome-spec-kit#feature/onboarding
# or merge into current repo using your chosen mode
speckit init --mode secure --template next-supabase
speckit init --template speckit-template

# TUI
pnpm --filter @speckit/tui dev
# N → pick a template (blank, built-ins, or repo-local)
# K → Spectral lint, B → docs/RTM build, A → AI propose (if enabled),
#   S → Settings (toggle AI/analytics, edit provider, keys, models, repo paths)
```

### Choosing a mode

- **Classic** (default, no external frameworks): run `speckit init --template <name>` or omit `--mode` entirely. The CLI prints "Using Classic mode (set --mode secure to enable standards.)" to confirm you are staying in the lightweight path.
- **Secure** (standards enforced): pass `--mode secure` to `speckit init` when you want hardened scaffolds. The TUI header now shows `Mode: Classic | Secure` with the active option highlighted so you always know which posture is loaded.

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

## Roadmap

### Near term
- Expand template coverage (more frontend/backend stacks) and polish the TUI flows for diffing, staging, and committing specs.
- Add support for repo-local templates under `.speckit/templates` so teams can version custom scaffolds that load seamlessly in the CLI/TUI pickers.
- Harden the Spectral/PostInit runners with additional integration tests and richer error surfacing, keeping AI and analytics optional by default.
- Add a draft-spec workflow so requirement edits happen in a draft workspace first, can be reviewed or committed as drafts, and then promoted into a new published version when ready.
- Expand the CLI/TUI beyond today's spec-generation flows by planning `/plan` to drive tech-stack selection and `/tasks` to break work into actionable steps.

### Mid term
- Add **Model Context Protocol (MCP) / Agent-to-Agent (A2A)** support so SpecKit can both consume and expose spec context programmatically. This will let external agents request templates, trigger lint/build runs, and hand back proposed patches without going through the interactive CLI/TUI.

### Long term
- Ship **Speckit TUS as a SaaS platform**: a multi-tenant Next.js + Supabase web app that generates specs, manages template catalogs, and mirrors all SpecKit CLI/TUI functionality (spec editing, diffing, AI proposals, repo orchestration) through secure web workflows and webhooks. The goal is a managed experience where teams collaborate on specs, sync to their repos, and invoke SpecKit automation from the browser or via Supabase Edge Functions.

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
