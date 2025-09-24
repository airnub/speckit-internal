# speckit doctor quick start

Run the diagnostic helper when the CLI or TUI feels off. It checks template wiring, spec manifests, and lockfile drift before you dive into deeper debugging.

## Run the doctor

```bash
speckit doctor
```

Expected output (truncated) looks like this:

```
✔ Catalog lockfile      .speckit/catalog.lock
✔ Templates discovered  blank, speckit-template, next-supabase
✔ Spec manifest         docs/specs/spec.yaml
All checks passed — ready to scaffold.
```

Depending on your environment, you may also see warnings when optional integrations (AI providers, analytics collectors) are disabled. Warnings do **not** block initialization.

## Troubleshooting

- **".speckit/catalog.lock is missing"** — regenerate from the source repo (commit the file) or copy it from a known-good branch. Until the lock exists, template metadata stays undefined.
- **"Bundle 'X' not found"** — run `speckit gen --write` to rebuild `.speckit/catalog/**`, then rerun the doctor. The lock references bundles by ID and version; missing bundles usually mean generated assets were deleted locally.
- **Command not found** — the CLI binary is `speckit`. When developing locally, run through pnpm: `pnpm --filter @speckit/cli dev -- speckit doctor`.

When the doctor is clean but a command still fails, capture the logs in `~/.config/spec-studio/logs/` and attach them to your support request.
