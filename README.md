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
- **AI loop (optional)**: **A** to propose a patch (only active when `cfg.ai.enabled = true`).
- **Enterprise-safe**: **AI OFF** and **Analytics OFF** by default.

## Quick start
```bash
pnpm i

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
# K → Spectral lint, B → docs/RTM build
# A → AI propose patch (only when AI is enabled in config)
```
