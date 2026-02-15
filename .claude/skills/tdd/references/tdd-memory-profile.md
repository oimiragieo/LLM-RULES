# TDD Memory Profile

## Purpose

Use a small runtime profile to reduce repeated setup and triage work during TDD loops.

Path: `.claude/context/runtime/tdd-memory-profile.json`

## Allowed Data

1. Preferred local commands:
   - `testCommand`
   - `lintCommand`
   - `formatCommand`
2. Recurrent failure signatures with concise fix summaries.
3. Recurrent anti-pattern reminders.
4. Reusable scenario templates.

## Limits

- Max profile size: 16 KB.
- Max entries per bucket: 20.
- Max string value length: 180 chars.
- Keep data recent and actionable; drop stale entries first.

## Non-Goals

- Do not store raw test logs or full stack traces.
- Do not store sensitive content.
- Do not use memory to skip RED verification or alter Canon TDD sequence.
