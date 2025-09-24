# Manual QA: GitHub repo mode workspace sync

## Goal
Verify that switching between local and GitHub repository modes refreshes the SpecKit TUI workspace, clones or updates the remote checkout under the configured workspaces root, and that subsequent git actions operate on that workspace.

## Prerequisites
- A valid `~/.config/spec-studio/config.json` (created by running the TUI once).
- Network access to clone/fetch the chosen GitHub repository.
- For private repositories, a PAT stored in settings (`github.pat`) with `repo` scope.
- Know the absolute path of your configured `workspaces.root` directory (defaults to the OS cache dir, e.g. `~/Library/Caches/speckit/workspaces` on macOS).

## Steps

### 1. Baseline in local mode
1. Launch the TUI (`pnpm --filter @speckit/tui dev`).
2. On the header, confirm the `Repo` metadata points at your current checkout and `Repository mode` in Settings is `local`.
3. Press `g` to refresh git status and note the branch/status output for later comparison.

### 2. Configure GitHub mode
1. Press `s` to open Settings.
2. Set `Repository mode` to `github`.
3. Populate `GitHub repo (owner/name)` with the repository to clone (e.g. `airnub/speckit-template`).
4. Confirm the `Repo branch` matches the remote branch you want (default `main`).
5. Optionally adjust `Workspaces root` if you want a custom location.
6. Ensure a PAT is present in `GitHub token (Models)` if the repo is private.
7. Press `Save changes`.
   - Expect the TUI to switch to the Tasks view showing "Settings saved".
   - If authentication fails, the Tasks view should display `Failed to prepare GitHub workspace …` with guidance to set `github.pat`.

### 3. Validate GitHub workspace
1. Observe the header now shows the `Repo` path under `<workspaces.root>/github/<owner>/<repo>/<branch>`.
2. Press `g` again and confirm git status now reflects the remote checkout (e.g. clean branch if freshly cloned).
3. From a separate shell, list the workspace directory and confirm a `.git` folder exists and the branch matches the configured one.
4. Press `f` to run git fetch and ensure no authentication errors occur (uses the PAT when provided).
5. Optionally open a spec file and confirm edits apply inside the workspace clone (e.g. run `ls` from the workspace path and note the changed file timestamp).

### 4. Switch back to local mode
1. Re-open Settings (`s`).
2. Set `Repository mode` back to `local` and clear `GitHub repo` if desired.
3. Save changes.
4. Verify the TUI returns to the original checkout path and `g` shows the local status again.

## Expected results
- Saving GitHub settings clones or fetches the remote repo into the workspace directory.
- Errors during clone/fetch appear in the Tasks view with actionable messaging.
- Git commands (`f`, `l`, `u`, `g`, `d`) operate against the workspace clone while in GitHub mode.
- Switching back to local mode restores the original repo path without residual state.
