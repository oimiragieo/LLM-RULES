# Ralph Loop Skill Workflow

## Overview

Autonomous iteration workflow using Claude Code Stop hooks for persistent task completion.

## Phases

### Phase 1: Capture Requirements

1. Define task in `.claude/ralph/PROMPT.md`
2. Set completion criteria (binary pass/fail)
3. List validation commands
4. Set max iterations

### Phase 2: Configure Loop

1. Verify stop hook registered in `.claude/settings.json`
2. Clear any stale state: `node .claude/skills/ralph-loop/scripts/main.cjs reset`
3. Read guardrails: `.claude/ralph/guardrails.md`

### Phase 3: Execute Loop

1. Start loop: `.claude/ralph/ralph-audit.sh`
2. Stop hook intercepts each exit attempt
3. Checks transcript for completion signal
4. Re-injects PROMPT.md if not complete
5. Tracks iteration count in state file

### Phase 4: Validate Completion

1. Verify completion signal was genuine (backed by validation output)
2. Review findings log for any remaining issues
3. Update guardrails.md with any new learned lessons
4. Record outcome in memory (learnings.md)

## Entry Points

- `Skill({ skill: 'ralph-loop' })` — Invoke skill
- `/ralph-loop` — Slash command
- `.claude/ralph/ralph-audit.sh` — Direct launcher

## Agents

- `developer` — Code-level task loops
- `qa` — Validation and audit loops
- `master-orchestrator` — Multi-agent coordination loops
