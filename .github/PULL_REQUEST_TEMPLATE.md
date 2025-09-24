# Pull Request — SpecKit Internal Development

> Please fill this out. This template references our internal **Spec (SRS)** and **RTM**. It is not auto-generated, so keep IDs and links accurate.

## Title
`[SpecKit] <short summary>`

## What & Why
- **What changed:**  
- **Why:**  

## Scope — Requirements impacted
List all requirement IDs (from `docs/internal/rtm.md`) touched by this PR.

- `FR-__`
- `FR-__`

## Spec references
Point to relevant sections/anchors in `docs/internal/specs/speckit-spec.md`.

- `§<section>` – short note
- `§<section>` – short note

## Agent Context Envelope (optional, structured)
Paste as **valid JSON** if you used an agent; otherwise skip. This helps reviewers map changes to requirements and ADRs.

```json
{
  "req_ids": ["FR-1", "FR-3"],
  "spec_sections": ["§3", "§5"],
  "rtm_rows": ["FR-1", "FR-3"],
  "tests_added": ["packages/speckit-tui/src/ui/App.test.ts#FR-1"],
  "adrs": ["ADR-0001"],
  "notes": ""
}
```

> **Commit trailers** (add to commits that implement a requirement):
>
> ```
> Req-ID: FR-1
> Spec-Section: §3
> ADR-ID: ADR-0001
> ```

## Acceptance Evidence
- **Spec section(s):** `docs/internal/specs/speckit-spec.md#<anchor>`
- **RTM row(s):** `docs/internal/rtm.md` → FR-__
- **Screenshots / recordings:** (attach)
- **Logs / reports:** (e.g., Spectral output, unit/e2e results)

## Checklist
- [ ] `pnpm -w build` passes
- [ ] If `docs/srs.yaml` exists, I ran Spectral: `npx -y spectral lint docs/srs.yaml`
- [ ] If scripts exist, I ran `pnpm run docs:gen` and `pnpm run rtm:build` and committed changes
- [ ] Tests were added/updated and linked to **Req-ID(s)** in comments or filenames
- [ ] No secrets / credentials committed
- [ ] I linked relevant ADRs (or proposed a new one in `docs/internal/adr/`)
- [ ] ⬜ Changing default mode (requires mode-change label & MAJOR bump)

## Breaking changes?
- [ ] No
- [ ] Yes — describe migration/rollout:

## Deployment notes
- Feature flags / env / config changes:
- Rollback plan:

## Additional context
(issues, discussions, ADRs, designs)
