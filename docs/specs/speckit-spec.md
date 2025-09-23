# SpecKit — SDD TUI (AI Optional, Enterprise-safe)

- CLI templates: `blank`, `next-supabase`, `speckit-template`.
- TUI picker: Blank, Next + Supabase (official), Generic SpecKit template.
- Registries: `airnub/next-supabase-speckit-template`, `airnub/speckit-template`.
- TUI keys: ↑/↓ select · E edit · N new (template) · P preview · D diff · C commit · L pull · F fetch · U push · **K Spectral** · **B Build** · **A AI Propose** (gated by `ai.enabled`) · **S Settings** · G status · ? help · Q quit

## Manual tests

- [ ] Launch the TUI with `EDITOR="code -w" pnpm --filter @speckit/tui dev`, press **E** to edit a spec, confirm VS Code opens the file and closing the editor returns control to the TUI.
