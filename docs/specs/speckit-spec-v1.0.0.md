---
id: speckit-spec-v1-0-0
title: Speckit Core — Internal Specification (v1.0.0)
sidebar_label: Spec v1.0.0
slug: /dev/specs/speckit-spec-v1-0-0
description: >-
  Detailed internal spec for Speckit monorepo with enterprise-safe defaults and
  optional AI assistance.
created: '2025-09-22'
updated: '2025-09-22'
speckit_provenance:
  tool: speckit
  tool_version: 0.1.0
  tool_commit: 59a61d9
  mode: classic
  frameworks: []
  dialect:
    id: speckit.v1
    version: 1.0.0
  template:
    id: speckit-engine
    version: 0.1.0
    sha: 92b3006e2ef148138f3494490a2e6e63349c7a26
  spec:
    version: 1.0.0
    digest: 'sha256:098e707700ad37cfbc45fdf786d1754af761889fd4a22d55163f5202a2f086ba'
  generated_at: '2025-09-24T20:11:39.912Z'
---

# Speckit Core — Internal Specification (v1.0.0)

This baseline specification defines the minimal, production-quality behavior of Speckit at **v1.0.0**.

## 0) Scope
- CLI + TUI + Core + Agent (stub) in a pnpm workspace.
- Templates: **blank**, **next-supabase**, **speckit-template**.
- Runners: **Spectral** (K), **PostInit** (B).
- AI: optional; **off by default**; settings for provider/model exist.

## 1) Runtime & Constraints
- Node 18+, TypeScript strict, tsup build.
- No background daemons; no telemetry by default.
- Never import/call AI providers unless `ai.enabled = true`.

## 2) Repository & TUI Context
- Repo detected via `git rev-parse --show-toplevel`; fall back to CWD.
- Header shows: **Repo**, **Branch**, **Spec Root**, **AI status**, **Provider**, **Model**.
- Spec root default: `docs/specs` (configurable).

## 3) Spec Documents
- Markdown with front-matter: `title`, `version`; optional `status`, `owners[]`, `created`, `updated`.
- List files under `{repo}/{specRoot}/**/*.md` (exclude `/templates/**`).
- **E** open in `$EDITOR` → on close, refresh preview.
- **D** show unified diff (`git --no-pager diff [file?]`).
- **C** commit (stage-all + message).

## 4) Templates
- **blank**: create `docs/specs/spec_<timestamp>.md` from base.
- **next-supabase** / **speckit-template**: shallow clone; prompt vars from `template.vars.json`; apply `{{KEY}}` ≤ 2MB files; optional post-init scripts:
  - `pnpm run docs:gen`; `pnpm run rtm:build` if present.

## 5) Runners
- **K**: `npx -y spectral lint docs/srs.yaml` → print output or hint if missing.
- **B**: run `docs:gen`, then `rtm:build` when present.

## 6) Git Operations
- **F** fetch, **L** pull `--ff-only`, **U** push.
- Errors shown in task pane; never crash the UI.

## 7) Settings
- **S** opens Settings: toggle provider (`openai`/`github`) and select model from config lists.
- Persist to `~/.config/spec-studio/config.json`.

## 8) AI Propose (stub)
- **A** opens prompt.
- If `ai.enabled=false`: print friendly notice and **do nothing else**.
- If enabled: call agent stub; display `{summary, rationale?, patch}`. No auto-apply.

## 9) Acceptance Criteria
- Header shows all fields; layout includes height fallback.
- Template picker supports enter/return reliably.
- PostInit output uses `args.join(' ')`.
- Full OFF-path works without network calls.
