# @speckit/adapter-owasp-asvs-v4

This package converts OWASP ASVS v4 YAML exports into the stable `SpecModel`
shape used by Speckit templates. It allows the generation pipeline to treat
ASVS content the same way as native Speckit dialects, making it easy to swap
between dialects without changing templates.

## Status

The adapter focuses on structural mapping:

- **Versioning** – resolves `meta.version`, `metadata.version`, or root
  `version` values to the model `version` field.
- **Requirement IDs** – normalises section and control identifiers (e.g.
  `V1.1.1`) into canonical `SpecModel.requirements[].id` values.
- **Levels** – converts ASVS level flags (`L1`/`L2`/`L3`) to the model `level`
  plus companion tags.
- **References** – carries over ASVS references as `SpecModel` references,
  tagging each requirement with its originating OWASP identifier.

Further normalisation (such as richer metadata mapping) can be layered on in a
future release without touching downstream templates.

## Usage

```ts
import { loadToModel } from "@speckit/adapter-owasp-asvs-v4";

const model = await loadToModel("path/to/spec.yaml");
```

The resulting `SpecModel` is suitable for consumption by the generator and any
Nunjucks bundles that expect the standard model contract.
