# SpecKit — Problem Statement & Vision (v0.0.1)

**Date:** 2025-09-23  
**Status:** Draft (internal)  
**Audience:** Engineering, DX, Security, Product  
**Related docs:** `.dev/specs/speckit-spec-v0.0.1.md`, `.dev/rtm.md`, `.dev/adrs/*`, `.github/pull_request_template.md`, `.dev/orchestration-plan-v0.0.2.md`

---

## 1) Executive Summary
SpecKit helps teams practice **Spec‑Driven Development (SDD)**—authoring, reviewing, and committing specs close to code—while avoiding **spec drift**. It ships a **CLI** (with friendly ASCII banner) and a **TUI** that is repo‑aware (Repo/Branch/Spec Root always visible), supports **templates**, **diff & commit** loops, **Spectral lint**, and optional **AI-assisted** patch proposals. AI and analytics are **OFF by default** to satisfy enterprise constraints. When enabled, SpecKit supports configurable **providers** (OpenAI and GitHub Models) with model lists you can update over time.

---

## 2) Problem Statement
Modern teams increasingly use **coding agents** and LLMs to assist development. But the inputs to those agents—**structured specs**—are often:
- **Scattered and ad hoc** (Google Docs, wikis, READMEs), making them hard to discover and version.
- **Prone to drift** because the everyday developer loop (edit → run → diff → commit) is not connected to the spec authoring loop.
- **Inconsistent** across repos and teams; no shared linting, traceability, or “create‑react‑app‑style” on‑ramp.
- **Risky in enterprises** if tools silently send code or docs to external services.

**Impact:** Agents perform poorly without solid specs; humans waste time reconciling code and documents; security teams block adoption when tools are not opt‑in and auditable.

**We need a toolchain** that keeps specs first‑class, lives inside the repo, works great **without AI**, and makes AI an explicit, configurable add‑on.

---

## 3) Vision
A developer‑friendly **SDD workstation** that:
- Lives in the terminal (CLI/TUI) and mirrors the git loop (preview → diff → commit).
- Makes **specs as easy to start as `create-react-app`**, via templates and sensible defaults.
- Provides **traceability** (RTM) and **governance** (ADRs, PR templates) to keep teams aligned.
- Treats **AI as optional**: fully functional offline; when enabled, it proposes patches with humans in the loop.

**Key outcomes we drive:**
- **One source of truth at any scale** — teams across regions riff on a common spec canon, so leadership can trust every release references the latest commitments and onboarding has less thrash.
- **Stack-flexible planning** — implementation decisions can change without torpedoing the requirements; migrating from React to Next.js becomes a planning exercise rather than a doc rewrite.
- **Requirements tracked like code** — housing specs in git turns reviews, approvals, and historical comparisons into everyday operations, tightening traceability loops.
- **Full-context AI assistance** — agent proposals draw from the cumulative spec archive, not a single prompt, giving stakeholders confidence that automation respects constraints already signed off.

### Guiding Principles
1. **Spec‑first**: everything starts from a real, versioned spec file.
2. **Human‑in‑the‑loop**: no auto‑apply patches by default; review diffs like code.
3. **Enterprise‑safe**: AI/analytics disabled by default; no network calls unless explicitly enabled.
4. **Composable**: separate packages for CLI, TUI, core schemas, and agent adapters.
5. **Portable**: Node 18+, TypeScript strict, no background daemons.

---

## 4) Product Overview
**Packages** (pnpm workspaces):
- `@speckit/core` — zod schemas, template registry, shared types.
- `@speckit/cli` — `speckit` binary (alias: `spec`); ASCII banner; create wizard; template ops; REPL.
- `@speckit/tui` — Ink app (spec list/preview, diff, commit, Spectral, PostInit, Settings, AI gate).
- `@speckit/agent` — provider adapters (OpenAI now; GitHub Models later) returning `{ summary, rationale, patch }`.

**Repo awareness** (TUI header): Repo path · Branch · Spec Root · **AI ON/OFF** · Provider · Model.

**Templates** (built‑in):
- **blank** — minimal spec.
- **next-supabase** — official template: `airnub/next-supabase-speckit-template`.
- **speckit-template** — generic, app‑agnostic SpecKit template: `airnub/speckit-template`.

**Runners**:
- **K** — Spectral lint for `docs/srs.yaml`.
- **B** — PostInit (detect `docs:gen` + `rtm:build`).

**AI (optional)**:
- **A** — “propose patch” asks agent for `{ summary, rationale, patch }` (no auto‑apply).
- Providers & model lists configurable in `~/.config/spec-studio/config.json`.

---

## 5) Personas & Use Cases
**Personas**
- **Spec Author** (dev/PM/tech lead): writes and evolves specs, needs quick diff/commit, and template bootstraps.
- **Integrator** (infra/lead): cares about linting, post‑init scripts, consistent repo state, and governance.
- **Security Engineer**: requires opt‑in external calls and local‑only workflows by default.

**Key Use Cases**
1. Start a new spec quickly from a template; commit it.
2. Edit a spec, preview changes, review a git diff, and commit.
3. Run Spectral; fix issues; re‑run; commit.
4. (Optional) Ask an agent to propose a patch; review the plan & diff; apply manually.
5. Switch providers/models in Settings; keep AI disabled until approved.

---

## 6) Why Now (and Why This Approach)
- Coding agents are only as good as the **specs** they consume.
- Teams need **repeatable** spec structures and **on‑rails** flows to avoid drift.
- Enterprise adoption demands **no surprises** (AI/analytics opt‑in) and clear provenance (PR templates, commit trailers, ADRs, RTM).
- The terminal is the fastest feedback loop for devs; an Ink TUI brings clarity without leaving the shell.

---

## 7) Differentiators
- **Spec‑centric loop** (not just scaffolding): preview → diff → commit embedded in the TUI.
- **Enterprise‑safe by default**: no network calls unless explicitly enabled.
- **Template registry** with official examples (Next+Supabase) and a generic baseline.
- **Traceability** baked in: RTM, ADR templates, PR template with Req‑ID trailers.
- **Configurable AI** with provider/model pickers and lazy SDK imports.

---

## 8) High‑Level Architecture
```
packages/
  speckit-core   → zod schemas, template registry, shared types
  speckit-cli    → spec (binary), prompts, REPL
  speckit-tui    → Ink UI: list/preview/diff/commit, runners, settings, AI gate
  speckit-agent  → generatePatch(cfg, requirement, context) → {summary,rationale,patch}
```
**User config:** `~/.config/spec-studio/config.json`
- `ai.enabled`: `false` by default
- `provider`: `openai` | `github`
- `openai.model` (default **gpt-5-2025-08-07**) and `github.model` (default **openai/gpt-5**)
- Editable lists:
  - OpenAI → `[gpt-5-2025-08-07, gpt-5-mini-2025-08-07, gpt-5-nano-2025-08-07, gpt-4.1-2025-04-14, codex-mini-latest]`
  - GitHub → `[openai/gpt-5, openai/gpt-5-mini, openai/gpt-5-nano, openai/gpt-5-chat, openai/gpt-4.1, openai/gpt-4.1-nano, openai/gpt-4.1-mini]`

---

## 9) Governance & Anti‑Drift
- **RTM (`.dev/rtm.md`)** tracks each requirement to design/code/tests/evidence.
- **Changelog (`.dev/changelog-v*.md`)** narrates changes between versions.
- **ADRs (`.dev/adrs/*`)** capture architectural decisions; template provided.
- **PR template** enforces Req‑IDs, spec references, and (optional) Agent Context Envelope.
- **.dev/** directory holds internal docs: spec, agent brief, orchestration plan, RTM, ADRs.

**Commit trailers (suggested):**
```
Req-ID: FR-7
Spec-Section: §5
ADR-ID: ADR-0002
```

---

## 10) Security & Privacy Posture
- **Default OFF:** no AI calls, no analytics.
- **Lazy imports:** provider SDKs loaded only if invoked and enabled.
- **Secrets:** provided via environment or user config; never committed.
- **Git ops:** always available offline; fetch/pull/push use local creds.

---

## 11) Roadmap (abridged)
**v0.0.1 (baseline, internal)**
- TUI core: list/preview/diff/commit; reliable Enter handling; height fallback.
- Template registry (blank, next‑supabase, speckit‑template), var subst, PostInit runner.
- Runners: Spectral (K), PostInit (B).
- Settings (S) for provider/model; config persistence.
- AI Propose (A) gated; stub plan display only.

**v0.0.2 (orchestration iteration)**
- Enhanced orchestration plan; tighten PR template & commit trailer checks.

**v0.1**
- Optional UI toggle for `ai.enabled` in Settings.
- Patch apply workflow with explicit confirmation.
- PR creation path with diff summary and spec links.

**v1.0**
- Plugin system for templates and runners; richer markdown preview; test coverage badges in TUI.

---

## 12) Success Metrics
- **Time to first spec** (minutes from `pnpm i` to first committed spec).
- **RTM coverage** (% of FR rows linked to code/tests).
- **Spec drift incidents** (declining trend across releases).
- **Adoption** (# repos using templates; # PRs referencing Req‑IDs).
- **Enterprise readiness** (deployments with AI OFF vs ON; zero unintentional network calls).

---

## 13) Risks & Mitigations
- **Repo confusion (which branch/repo?)** → Persistent TUI header; settings show active repo/branch/spec root.
- **AI misuse or accidental calls** → AI OFF by default; explicit gating; lazy imports.
- **Template brittleness** → Official templates versioned; allow local overrides; keep a “blank” escape hatch.
- **Env differences (Windows/macOS/Linux)** → Favor portable commands; recommend Git Bash/WSL on Windows.
- **Tooling gaps** → Clear error messages (e.g., spectral missing) with suggested commands.

---

## 14) Open Questions
- Should Settings let users toggle `ai.enabled` directly? (Planned for v0.1)
- Which GitHub Models client to standardize on and how to mock for tests?
- Auto‑bump `updated` in front‑matter on commit? (guarded, opt‑in)
- Template marketplace / registry sync?

---

## 15) Glossary
- **SDD** — Spec‑Driven Development.
- **RTM** — Requirements Traceability Matrix.
- **ADR** — Architecture Decision Record.
- **PostInit** — Post‑template scripts (e.g., `docs:gen`, `rtm:build`).
- **Agent** — AI service that proposes patches (`generatePatch`).

---

## 16) Call to Action
- Adopt SpecKit for new specs using **Blank** or **Next+Supabase** templates.
- Use the **PR template** with Req‑IDs and spec references.
- Contribute ADRs using the provided template; keep RTM rows current.
- Trial AI in controlled environments by enabling it in the user config and selecting a provider/model.

