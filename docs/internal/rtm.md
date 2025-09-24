# Requirements Traceability Matrix (RTM) — SpecKit v0.0.1

| Req ID | Requirement (Spec §)                                   | Design / Code Area                       | Test / Verification                                  |
|-------:|---------------------------------------------------------|------------------------------------------|------------------------------------------------------|
| FR-1   | List specs under `docs/specs` (§3)                      | TUI `App.tsx` file discovery              | Ink headless: list not empty when file present       |
| FR-2   | Preview & Edit (E) (§3)                                | TUI `App.tsx` editor integration          | Open temp file; edit; preview refreshes              |
| FR-3   | Diff (D) (§3)                                          | Git helper `gitDiff`                      | Inject change; expect unified diff output            |
| FR-4   | Commit (C) (§3)                                        | Git helpers `gitCommitAll`                | Stage-all; commit; assert non-empty git log entry    |
| FR-5   | Template picker (N) (§4)                               | Template service + TUI picker             | Blank creates file; GitHub clones into target dir    |
| FR-6   | Vars + PostInit (§4.2–4.3)                             | `applyVars`, post-init executor           | Placeholders replaced; scripts run if present        |
| FR-7   | Spectral (K) (§5)                                      | Runner integration                        | `npx spectral` output captured or hint displayed     |
| FR-8   | PostInit (B) (§5)                                      | Runner integration                        | Detect & run `docs:gen` then `rtm:build`             |
| FR-9   | Git ops F/L/U (§6)                                     | Git helpers                               | Fetch/Pull/Push with clear logs                      |
| FR-10  | Settings (S) provider/model (§7)                       | Settings UI & config I/O                  | Toggle provider; select model; config updated        |
| FR-11  | AI Propose (A) gated (§8)                              | TUI gate + `@speckit/agent` call          | OFF: message only; ON: stub plan displayed           |
| NFR-1  | Height fallback                                         | TUI layout                                | Run in non-TTY; no crash; minimum height respected   |
| NFR-2  | No provider import when AI OFF                          | Agent + TUI gate                          | Static analysis; runtime toggle                      |
