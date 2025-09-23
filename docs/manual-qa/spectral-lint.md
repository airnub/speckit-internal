# Manual QA: Spectral lint safeguards

These scenarios verify the friendly guidance added around the Spectral lint task in the TUI.

## Missing `docs/srs.yaml`
1. Launch the TUI with `pnpm --filter @speckit/tui dev` from a repo that **does not** contain `docs/srs.yaml`.
2. Press `K` to trigger the Spectral lint task.
3. Confirm the task title reads `Spectral Lint ✗` and the output explains that the SRS file is missing along with the lookup path and suggestion to create or locate it.

## Spectral CLI unavailable
1. In a repo that contains `docs/srs.yaml`, temporarily move `node_modules/.bin/spectral` out of the `PATH` (e.g. run `PATH="/usr/bin" pnpm --filter @speckit/tui dev`).
2. Launch the TUI and press `K` to run the lint task.
3. Verify the task title becomes `Spectral Lint ✗` and the output includes the installation hint (`pnpm add -D @stoplight/spectral-cli`).

When Spectral is available and the SRS file exists, the task title should end with `✓` and surface the CLI output (or note that no issues were reported).
