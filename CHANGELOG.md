# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Added
- Dialect-aware adapters and normalized `SpecModel` pipeline so templates render from a consistent internal shape.
- Provenance enhancements that stamp dialect, tool version, and git commit into generated Markdown front-matter and the append-only generation ledger.
- Bundle compatibility gates (`requires_speckit` + `requires_dialect`) enforced during generation and audit, with lockfile metadata tracking template sync commits.
- Speckit audit checks for dialect provenance, manifest integrity, and compatibility regressions.

### Changed
- Generation manifest writes now append every run and backfill dialect metadata for historical entries.
- Generated file comments include the dialect identifier alongside tool and template details.
