# SpecKit Artifact Schemas & Compatibility

The `.speckit/` directory is the contract between the analyzer, CI, and any
custom tooling layered on top of SpecKit. This note documents the JSON Schemas
for the analyzer artifacts, how we version them, and how CI enforces
compatibility.

## Directory layout

- `schemas/metrics.v1.schema.json` — canonical schema for `.speckit/metrics.json`.
- `schemas/summary.v1.schema.json` — schema for the machine-readable run
  summary (`.speckit/summary.json`).
- `schemas/sanitizer-report.v1.schema.json` — schema for
  `.speckit/sanitizer-report.json` produced by the redaction gate.

Each schema file declares `draft/2020-12` to match the analyzer’s TypeScript
modeling.

## Versioning policy

- Schemas are **append-only**. Breaking changes require a new file (e.g.,
  `metrics.v2.schema.json`) and a coordinated change to the analyzer.
- Backwards-compatible additions (new optional fields, relaxed enums) can ship in
  the existing schema, but prefer a new version if consumers must opt in.
- The analyzer artifacts carry their own `version` fields; bump them when
  revving a schema so downstream tooling can react.

## CI validation

Use the helper to check local changes:

```bash
pnpm speckit:validate-artifacts
```

The `speckit-analyze-run` workflow runs a **Validate artifacts** step after the
analyzer finishes. Any schema violation fails the job so incompatible writes are
caught before merge.

## Artifact reference

### `.speckit/metrics.json` (v1)

Flat metrics with experiment metadata:

| Field | Type | Notes |
| --- | --- | --- |
| `version` | `1` | Bump on breaking changes |
| `ReqCoverage`, `ToolPrecisionAt1`, `BacktrackRatio`, `EditLocality`, `ReflectionDensity` | number | Normalized to `[0,1]` |
| `TTFPSeconds` | number \| null | Seconds to first edit |
| `labels` | string[] | Unique failure labels |
| `sanitizer_hits` | number | Total redaction hits carried forward |
| `experiments` | object[] | `{ key, variant, bucket, description?, variant_description?, metadata? }` |

### `.speckit/summary.json` (v1)

Machine-readable summary that feeds PR comments and dashboards:

| Field | Type | Notes |
| --- | --- | --- |
| `version` | `1` | Schema lock |
| `generated_at` | RFC3339 string | Emission timestamp |
| `run` | object | `{ id, sources[], events_analyzed }` |
| `experiments` | object[] | Mirrors metrics experiments |
| `metrics` | object[] | `{ label, value, threshold?, status? }` |
| `labels` | string[] | Sorted failure labels |
| `requirements` | object[] | `{ id, status, description }` |
| `highlights` | object | Optional `{ lessons[], guardrails[] }` |

### `.speckit/sanitizer-report.json` (v1)

Redaction summary from the log sanitizer:

| Field | Type | Notes |
| --- | --- | --- |
| `hits` | number | Required total matches |
| `version` | number | Optional source version |
| `generated_at` | RFC3339 string | Optional emission timestamp |
| `entries` | object[] | Optional `{ rule_id, pattern?, hits, samples[] }` |
| `entries[].samples[]` | object[] | `{ file, line, match }` snippets |

`hits` must be non-negative; nested counts surface per-rule summaries for
analytics.

## Making changes safely

1. Introduce new schema files for breaking changes and update the analyzer to
   emit the matching `version`.
2. Update this document and the compatibility policy with migration guidance.
3. Run `pnpm speckit:validate-artifacts` before committing to ensure the new
   artifacts conform locally.
4. Verify CI’s **Validate artifacts** step succeeds in pull requests.

This guardrail keeps SpecKit’s machine-readable artifacts stable for downstream
integrations.
