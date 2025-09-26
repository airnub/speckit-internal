# Getting Started — SpecKit (Spec‑Driven Development)

> **Goal:** In 5–10 minutes, initialize a repo from a template, generate docs + RTM from a single spec, and run the policy gates that keep your team out of the “vibe‑coding” loop.

---

## Prerequisites

- **Node 18+** and **git**
- **pnpm** (via Corepack)

```bash
corepack enable pnpm
node -v && pnpm -v
```

> **AI is optional** and **OFF by default**. Analytics are also **OFF by default**.

---

## 1) Initialize from a template

Pick a template and scaffold a new repo.

### Option A — Classic (no frameworks)
```bash
speckit init --template speckit-template ./my-spec
cd ./my-spec
```

### Option B — Secure preset (curated frameworks)
```bash
speckit init --mode secure --template next-supabase ./my-secure-spec
cd ./my-secure-spec
```

### Option C — Remote GitHub template
```bash
speckit template use https://github.com/airnub/speckit-template-next-supabase ./starter
cd ./starter
```
The CLI copies files, interpolates variables from `template.vars.json`, and runs any `postInit` commands defined in the template manifest (e.g., `pnpm install`, `pnpm docs:gen`).

---

## 2) Declare your dialect (once per repo)

Create or edit **`.speckit/spec.yaml`** to point at your SRS and dialect:

```yaml
# .speckit/spec.yaml
input: srs/app.yaml
dialect:
  id: speckit.v1     # or owasp.asvs.v4
  version: 1
```

Adapters normalize your input into SpecKit’s **SpecModel** without mutating templates.

---

## 3) Generate docs (spec → public docs)

From your repo root:
```bash
speckit gen --write   # refresh docs/specs/** from .speckit/spec.yaml
```
This writes deterministic Markdown (e.g., Product/Feature Spec, Coding Agent Brief, Orchestration Plan) and records provenance in `docs/specs/**` + `generation-manifest.json`.

> Using the Next+Supabase template? It also exposes `pnpm docs:gen` and `pnpm rtm:build` scripts.

---

## 4) Build RTM (traceability)

Many templates ship an RTM builder. In those repos:
```bash
pnpm rtm:build
```
This produces `docs/specs/generated/rtm-latest.md` mapping `REQ-*` IDs to docs, tests, and (optionally) code.

---

## 5) Verify (drift & policy gates)

Use CI or run locally where available:

```bash
speckit verify           # generic checks (if configured)
# or, in template repos
pnpm speckit:verify      # ensures docs/specs/** match .speckit/spec.yaml
```

CI examples you’ll commonly see:
- **speckit‑verify** – fails if generated docs drift from the SRS
- **catalog protect** – label‑gates changes to `.speckit/catalog/**`
- **mode/OPA guard** – gates mode/dialect/policy changes

---

## 6) Explore the TUI (optional)

Run the SpecKit TUI inside this monorepo or when developing locally:
```bash
pnpm --filter @speckit/tui dev
```
**Keys:**
- **N** — pick a template (built‑in, repo‑local, or GitHub)
- **K** — Spectral lint of your SRS
- **B** — build docs/RTM (auto‑detects project scripts)
- **A** — propose a patch (AI must be enabled)
- **S** — edit settings (provider, models, tokens, paths)

---

## 7) (Optional) Enable AI proposals

AI is **OFF** by default. To enable, edit your user config:

```jsonc
// ~/.config/spec-studio/config.json
{
  "ai": { "enabled": true },
  "provider": "openai",
  "openai": { "apiKey": "sk-…", "model": "gpt-5-2025-08-07" }
}
```
**Safety:** Don’t send PII to third‑party providers. Treat prompts/specs like source code.

---

## Template sources (at a glance)

- **Built‑in**: shipped with SpecKit (`speckit-template`, `next-supabase`, `blank`)
- **Repo‑local**: any directories under `.speckit/templates/**` in your current repo
- **Remote GitHub**: `speckit template use https://github.com/org/repo[#[branch]|?ref=branch] ./dest`

`template.json` can declare `postInit` commands; `template.vars.json` defines prompts/placeholders.

---

## Recommended workflow

1. Start from a template (classic or secure).
2. Model your SRS (`srs/app.yaml`) and set the dialect in `.speckit/spec.yaml`.
3. `speckit gen --write` to refresh docs/specs/**.
4. (If available) `pnpm rtm:build` for traceability.
5. Open a PR; CI guards drift, catalog, and policy changes.
6. Iterate with the TUI (lint, build, propose) and commit with confidence.

---

## Troubleshooting

- **Docs didn’t change** → confirm `.speckit/spec.yaml` points to your SRS and that the dialect is valid.
- **CI drift failure** → run `speckit gen --write`, commit regenerated docs.
- **Template prompts missing** → ensure `template.vars.json` exists at the template root.
- **GitHub template URL fails** → append `#branch` or `?ref=` for non‑default branches.
- **AI not working** → set `ai.enabled=true` and provider keys in `~/.config/spec-studio/config.json`.

---

## Next steps

- **Templates & PostInit:** `docs/templates.md` (manifests, vars, repo‑local vs GitHub)
- **Compliance packs:** `docs/compliance-packs.md` (secure mode, HIPAA/EDU bundles)
- **Dialects & adapters:** `docs/dialects-and-adapters.md` (how adapters work, migrate to ASVS)
- **Project README:** top‑level overview and CI badges

> Have feedback? Open an issue with your OS/Node versions, CLI output, and a minimal repro. SpecKit is **public, pre‑release (0.x)** and under active development—pin to tags/SHAs for stability.

