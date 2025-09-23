# SpecKit — turn specs into commits

**TUI + optional AI assistant for spec-driven development:** edit specs, preview diffs, and commit. AI and analytics are **disabled by default**.

- **Repo:** `speckit`  ·  **Binary:** `spec`  ·  **Version:** `0.0.1`
- **Packages:** `@speckit/cli`, `@speckit/tui`, `@speckit/agent`, `@speckit/core` (all `0.0.1`)

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

## Quick start
```bash
# Install pnpm via Corepack (Node 18+ ships with it)
corepack enable pnpm
pnpm install

# CLI
pnpm --filter @speckit/cli dev
spec template list
spec template use next-supabase ./my-next-app
spec template use speckit-template ./my-generic-spec
# clone any GitHub repo or git URL (append #branch to pin a ref)
spec template use airnub/next-supabase-speckit-template ./from-catalog
spec template use https://github.com/airnub/next-supabase-speckit-template.git ./from-url
spec init --template airnub/next-supabase-speckit-template
# or merge into current repo:
spec init --template next-supabase
spec init --template speckit-template

# TUI
pnpm --filter @speckit/tui dev
# N → pick a template (blank, built-ins, or repo-local)
# K → Spectral lint, B → docs/RTM build, A → AI propose (if enabled),
#   S → Settings (toggle AI/analytics, edit provider, keys, models, repo paths)
```

## Repo-local templates

SpecKit automatically merges the built-in catalog with any directories that live under `.speckit/templates/**` in your current repo. Each directory becomes a selectable template (its name defaults to the relative path, e.g. `.speckit/templates/app/next` → `app/next`). Make sure the directory contains a manifest or at least one file; empty folders are ignored. The CLI (`spec template list`, `spec template use`, `spec init --template …`) and the TUI picker (`N`) both surface these entries alongside the defaults. If a local template resolves to the same name as one of the built-ins, SpecKit adds a `-local` suffix so the official remote entry (for example `next-supabase`) always remains in the catalog.

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

Values collected via `spec template use …` or `spec init --template …` are interpolated immediately. The TUI copies the template directory as-is, so placeholders remain available for manual edits or a follow-up CLI run if you want the prompts.

### Post-init commands

Declare an array of shell commands in `postInit` (within the manifest) to run after files are copied and variables applied. Commands execute in order inside the target repo, letting you prime dependencies (`pnpm install`), generate docs (`pnpm docs:gen`), or run any other bootstrap tasks. Leave `postInit` undefined to skip this step.

## Roadmap

### Near term
- Expand template coverage (more frontend/backend stacks) and polish the TUI flows for diffing, staging, and committing specs.
- Harden the Spectral/PostInit runners with additional integration tests and richer error surfacing, keeping AI and analytics optional by default.
- Add a draft-spec workflow so requirement edits happen in a draft workspace first, can be reviewed or committed as drafts, and then promoted into a new published version when ready.

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
