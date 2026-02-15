---
name: skill-updater
description: Research-backed skill refresh workflow for updating existing skills with TDD checkpoints, memory-aware integration, and EVOLVE/reflection trigger handling.
version: 1.0.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Edit, Glob, Grep, Bash, Skill, MemoryRecord, WebSearch, WebFetch]
args: '--skill <name-or-path> [--trigger reflection|evolve|manual] [--mode plan|execute]'
error_handling: graceful
streaming: supported
---

# Skill Updater

## Overview

Use this skill to refresh an existing skill safely: research current best practices, compare against current implementation, generate a TDD patch backlog, apply updates, and verify ecosystem integration.

## When to Use

- Reflection flags stale or low-performing skill guidance
- EVOLVE determines capability exists but skill quality is outdated
- User asks to audit/refresh an existing skill
- Regression trends point to weak skill instructions, missing schemas, or stale command/hook wiring

## The Iron Law

Never update a skill blindly. Every refresh must be evidence-backed, TDD-gated, and integration-validated.

## Workflow

### Step 0: Target Resolution + Update Path Decision

1. Resolve target skill path (`.claude/skills/<name>/SKILL.md` or explicit path).
2. If target does not exist, stop refresh and invoke:

```javascript
Skill({ skill: 'skill-creator', args: '<new-skill-name>' });
```

3. If target exists, continue with refresh workflow.

### Step 1: Framework + Memory Grounding (MANDATORY)

Invoke framework and memory context before making recommendations:

```javascript
Skill({ skill: 'framework-context' });
```

Read memory context for historical failures and decisions:

- `.claude/context/memory/learnings.md`
- `.claude/context/memory/issues.md`
- `.claude/context/memory/decisions.md`
- `.claude/context/runtime/evolution-requests.jsonl` (if present)

### Step 2: Research Protocol (Exa/arXiv + Codebase)

1. Invoke:

```javascript
Skill({ skill: 'research-synthesis' });
```

2. Gather at least:
- 3 Exa/web queries
- 1 arXiv/canonical paper source when topic is methodology-heavy (TDD, agent evaluation, memory/RAG, orchestration)
- 1 internal codebase parity check (`pnpm search:code`, `ripgrep`, semantic/structural search)

3. Optional benchmark assimilation when parity against external repos is needed:

```javascript
Skill({ skill: 'assimilate' });
```

### Step 3: Gap Analysis

Compare current skill against enterprise bundle expectations:

- `SKILL.md` clarity + trigger rules
- `scripts/main.cjs` deterministic output contract
- `hooks/pre-execute.cjs` and `hooks/post-execute.cjs`
- `schemas/input.schema.json` and `schemas/output.schema.json`
- `commands/<skill>.md` and top-level `.claude/commands/` delegator
- `templates/implementation-template.md`
- `rules/<skill>.md`
- workflow doc in `.claude/workflows/*skill-workflow.md`
- agent assignments, CLAUDE references, skill catalog coverage

### Step 4: TDD Refresh Backlog

Create RED/GREEN/REFACTOR/VERIFY plan for the target skill:

1. RED: failing tests for stale or missing behavior
2. GREEN: minimal implementation updates
3. REFACTOR: tighten wording, reduce ambiguity, unify contracts
4. VERIFY:
   - `node .claude/tools/cli/validate-integration.cjs <target-SKILL.md>`
   - `node .claude/tools/cli/generate-skill-index.cjs`
   - `node .claude/tools/cli/generate-agent-registry.cjs` (if agent skill arrays changed)
   - targeted tests + lint for touched files

### Step 5: Integration + Evolution Recording

1. Update references:
- `.claude/CLAUDE.md`
- `.claude/context/artifacts/catalogs/skill-catalog.md`
- relevant agent prompts/frontmatter

2. Record refresh outcome in:
- `.claude/context/memory/learnings.md`
- `.claude/context/evolution-state.json` (if EVOLVE-triggered)

3. If new capability gap remains after refresh, invoke:

```javascript
Skill({ skill: 'recommend-evolution' });
```

## Trigger Rules (Reflection + EVOLVE)

- **Reflection trigger:** repeated low rubric scores tied to one skill, stale references, failing update hooks/tests
- **EVOLVE trigger:** request maps to existing skill but requires material refresh instead of net-new skill
- **Manual trigger:** user requests audit/refresh directly

## Token Saver Invocation Rule

Invoke `Skill({ skill: 'token-saver-context-compression' })` only when evidence corpus is too large for direct comparison and you need grounded compression before drafting updates.

## Search + Memory Integration

- Prefer `pnpm search:code "<query>"` for codebase evidence.
- Use `ripgrep`/semantic/structural skills for targeted checks.
- Persist final refresh learnings via `MemoryRecord` or memory file updates so `sync-memory-index` keeps retrieval current.

## Command Surface

- `/skill-updater`
- `/skill-refresh`

## Memory Protocol (MANDATORY)

Before work:

```bash
cat .claude/context/memory/learnings.md
```

After work:

- Refresh pattern -> `.claude/context/memory/learnings.md`
- Update risk/tradeoff -> `.claude/context/memory/decisions.md`
- Unresolved blocker -> `.claude/context/memory/issues.md`
