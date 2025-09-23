# SpecKit — turn specs into commits

**TUI + optional AI assistant for spec-driven development:** edit specs, preview diffs, and commit. AI and analytics are **disabled by default**.

- **Repo:** `speckit`  ·  **Binary:** `spec`  ·  **Version:** `0.0.1`
- **Packages:** `@speckit/cli`, `@speckit/tui`, `@speckit/agent`, `@speckit/core` (all `0.0.1`)

## Features
- **Repo-aware**: bind to current repo & branch; or switch to any local/GitHub repo + branch.
- **Spec ops**: create from template, edit in `$EDITOR`, validate front-matter, preview Markdown, diff, stage, **commit**.
- **Git remote ops (AI-OFF supported)**: **Fetch/Pull/Push** using your local git credentials.
- **Templates** (built-in):
  - **blank** — empty spec in current repo
  - **next-supabase** — Next.js + Supabase SpecKit template (`airnub/next-supabase-speckit-template`)
  - **speckit-template** — generic, app-agnostic SpecKit template (`airnub/speckit-template`)
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
# or merge into current repo:
spec init --template next-supabase
spec init --template speckit-template

# TUI
pnpm --filter @speckit/tui dev
# N → pick a template (Blank, Next + Supabase, or Generic)
# K → Spectral lint, B → docs/RTM build, A → AI propose (if enabled),
#   S → Settings (toggle AI/analytics, edit provider, keys, models, repo paths)
```

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
