# Speckit “Mode Assurance & Anti-Regression” Charter

**Purpose.** Guarantee Speckit always offers:
- **Classic preset** — lightweight Spec-Driven Development (generate → edit → diff → commit), AI optional, **no external security frameworks required**.
- **Secure preset** — security-requirement–driven development powered by standards (e.g., ASVS/OSCAL) and crosswalks.

These are invariant product guarantees that must not change silently.

---

## 1) Protect the default preset & routing
- **Policy:** The default preset is **Classic**. Changing the default requires an explicit PR labeled `preset-change`.
- **Governance:** Protect the preset source of truth (`packages/speckit-presets/src/index.ts`) with:
  - GitHub **Push Rulesets** restricting that path (PR + required checks only).
  - Branch protection requiring reviews.  
  _Refs:_ GitHub Rulesets (push rules, restrict file paths).

## 2) CODEOWNERS + required review on guarded paths
- **Policy:** Changes to `.speckit/catalog/**`, `.speckit/catalog.lock`, and the preset config path require Code Owner review.
- **Governance:** `.github/CODEOWNERS` + branch protection “Require review from Code Owners.”  
  _Refs:_ CODEOWNERS docs.

- **Policy:** PRs that change the default preset or remove Classic templates must carry the `preset-change` label.
- **Governance:** CI runs **OPA/Conftest** policies that fail unlabeled changes.  
  _Refs:_ OPA in CI/CD; Conftest.

## 4) Snapshot tests pin user-visible output (both modes)
- **Policy:** Classic/Secure outputs may only change intentionally.
- **Governance:** Snapshot tests for tiny “golden” specs in each mode; CI fails on unexpected diffs.  
  _Refs:_ Snapshot testing (Vitest/Jest).

## 5) Semantic Versioning gate
- **Policy:** Changing default mode or Classic output format is a **MAJOR** release.
- **Governance:** Conventional Commits + release CI that blocks non-major bumps when guarded files change.  
  _Refs:_ Conventional Commits (pairs with SemVer).

## 6) Provenance must include **mode & frameworks**
- **Policy:** Every generated doc and each ledger run entry includes:
  ```yaml
  speckit_provenance:
    mode: classic|secure
    frameworks: [] # or [{ id, status }]
    tool_version: <SemVer>
    tool_commit: <shortSHA>
    template: { id, version, sha }
    spec: { version, digest }
    generated_at: <ISO8601>


Governance: speckit audit verifies presence and consistency.

7) Catalog remains distribution-only

Policy: .speckit/catalog/** is read-only by default; edits require catalog:allowed label and Code Owner review.

Governance: Label-gated workflow + CODEOWNERS + ruleset path protection.

8) UX makes “Classic” obvious

Policy: Classic appears first in Quick Start; CLI/TUI show the active mode and how to switch.

Governance: README/TUI copy reviewed for this cue on each release.

References (implementation primitives)

GitHub Rulesets (Push rules / restrict file paths):
https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets

https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets

https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository

CODEOWNERS (require review from Code Owners):
https://docs.github.com/articles/about-code-owners

OPA / Conftest (policy-as-code in CI):
https://openpolicyagent.org/docs/cicd

https://github.com/open-policy-agent/conftest

Conventional Commits (pairs with SemVer):
https://www.conventionalcommits.org/en/v1.0.0/

Snapshot testing (Vitest example):
https://vitest.dev/guide/snapshot
