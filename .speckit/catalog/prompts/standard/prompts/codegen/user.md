## Task
{{ task_description }}

## Context
- Spec bundle: {{ spec_bundle | default("nextjs-supabase") }}
- Target version: {{ target_version | default("1.0.0") }}
- Related docs: docs/internal/agents/coding-agent-brief.md, docs/internal/rtm.md

## Requirements
- Preserve existing tests; add new ones when behavior changes.
- Update documentation when user-facing behavior shifts.
- Note any follow-ups or risks discovered during implementation.
