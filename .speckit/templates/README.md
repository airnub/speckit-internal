# SpecKit Template Catalog

This directory holds repo-local templates that SpecKit automatically loads into the CLI and TUI catalog. Organize bundles by top-level capability so future additions stay predictable:

- `specs/` – Specification bundles such as base SRS scaffolds or spec extensions.
- `prompts/` – Prompt libraries that feed internal or external agent workflows.
- Additional families (for example `docs/`, `ops/`, or `workflows/`) can live beside these as the catalog grows.

Each bundle lives in its own folder. Nest the files exactly how they should appear when the template is applied. For example, the base spec scaffold keeps `docs/specs/templates/base.md` relative to the template root so it drops into the same location in a generated repo. Prompt bundles mirror the `.dev/prompts/` tree so documentation and automation read the same copy.

## Manifests

Place a `template.json` file at the root of every bundle to describe it:

```jsonc
{
  "name": "Base spec bundle",
  "description": "Baseline SpecKit spec scaffold with metadata frontmatter and summary stub.",
  "specRoot": "docs/specs"
}
```

`name` and `description` surface inside `speckit template list`, while `specRoot` guides downstream tooling that wants to locate the spec tree. Bundles without a dedicated spec root can omit the field.

## Naming guidance

Use lowercase kebab-case for folder names so GitHub template imports and CLI lookups remain consistent:

- `specs/base`, `specs/enterprise-handoff`, `prompts/coding-agent-brief`
- Avoid spaces, uppercase letters, or date suffixes in directory names. Track versions inside the content when necessary.

When a bundle grows beyond a single document, create subdirectories that mirror the final repo layout. Keep helper files (for example `template.vars.json` or README explainers) next to `template.json` at the bundle root.
