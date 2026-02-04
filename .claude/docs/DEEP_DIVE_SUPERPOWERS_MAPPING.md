# Superpowers Integration Mapping

This document summarizes the Superpowers-derived features integrated into agent-studio and where they live.

## Summary

The following items are integrated using local files only (no external services):

- Slash command stubs for brainstorming, planning, and execution.
- Skill awareness reminder shown alongside the memory reminder (UserPromptSubmit).
- Debugging skill updated to reference find-polluter for test pollution bisection.
- Skill-triggering prompt corpus + smoke test runner.

SessionStart hook injection (skill-awareness-inject) is **not** enabled by default; the runtime reminder is implemented instead.

## Mapping

| Feature | Source (superpowers) | Destination (.claude) | Status |
| --- | --- | --- | --- |
| /brainstorm command | commands/brainstorm.md | .claude/commands/brainstorm.md | Added |
| /write-plan command | commands/write-plan.md | .claude/commands/write-plan.md | Added |
| /execute-plan command | commands/execute-plan.md | .claude/commands/execute-plan.md | Added |
| Skill awareness reminder | hooks/session-start.sh | .claude/hooks/routing/user-prompt-unified.cjs | Implemented (memory reminder box) |
| find-polluter reference | debugging skill docs | .claude/skills/debugging/SKILL.md | Added |
| Skill-triggering prompts | tests/skill-triggering/prompts | .claude/tests/skill-triggering/prompts | Added |
| Skill-triggering runner | tests/skill-triggering/run-*.sh | .claude/tests/skill-triggering/run-skill-triggering-test.cjs | Added |

## Commands

The command files are present under .claude/commands. Whether they are discoverable by the host depends on host command support. If your host loads commands from .claude/commands, they are ready to use.

## Tests

Skill-triggering smoke test:

`ash
pnpm run test:skill-triggering
`

This validates that the manifest exists and all prompt files are present and non-empty.

## Notes

- If your host supports SessionStart hooks, you can add a SessionStart hook later for skill-awareness injection. For now, the memory reminder shows a skill protocol reminder when memory files are present.