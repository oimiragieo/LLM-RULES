---
name: instinct-learning
description: Records atomic learned behaviors with confidence scores. Project-scoped instincts are isolated per project and auto-promote to global scope at confidence threshold 0.8. Stores instincts in .claude/context/memory/instincts.jsonl
version: 1.0.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Edit, Bash, Grep, Glob]
agents: [developer, qa, architect, planner, reflection-agent]
category: Memory
tags: [memory, learning, instinct, confidence, project-scoped, auto-promote]
best_practices:
  - Record instincts immediately after observing a reliable pattern
  - Keep instinct text atomic — one behavior per record
  - Set confidence honestly; overconfidence poisons the global pool
  - Review promoted instincts for cross-project validity before relying on them
error_handling: strict
---

# Instinct Learning

## Overview

Instinct Learning records atomic learned behaviors as structured instinct records. Each instinct has a confidence score (0.3–0.9), a project scope, and a promotion pathway to global scope when confidence reaches 0.8.

This prevents knowledge from evaporating between sessions and stops cross-project contamination by isolating low-confidence instincts in the project that generated them.

## When to Use

Invoke when:

- An agent observes a reliable pattern that should influence future behavior
- A debugging session surfaces a non-obvious fix that will recur
- A workflow succeeds repeatedly and should be encoded as a default
- An error pattern is identified that should be avoided project-wide

```javascript
Skill({ skill: 'instinct-learning' });
```

## Iron Law

```
NO INSTINCT WITHOUT AN OBSERVED BASIS.
Every instinct record MUST include `source_context` describing the observation
that generated it. Invented instincts are worse than no instincts.
```

## Confidence Scale

| Score | Meaning                             | Promotion Eligible |
| ----- | ----------------------------------- | ------------------ |
| 0.3   | Seen once, uncertain                | No                 |
| 0.4   | Seen twice, possibly coincidental   | No                 |
| 0.5   | Consistent in this project          | No                 |
| 0.6   | Reliable in this project            | No                 |
| 0.7   | Highly reliable, limited cross-test | No                 |
| 0.8   | **Auto-promotes to global scope**   | YES                |
| 0.9   | Canonical — applies across projects | YES (immediate)    |

## Instinct Record Schema

Each record in `.claude/context/memory/instincts.jsonl` follows this structure:

```json
{
  "id": "inst-<uuid-short>",
  "timestamp": "2026-03-23T10:00:00Z",
  "scope": "project",
  "project": "agent-studio",
  "text": "Atomic description of the learned behavior",
  "confidence": 0.6,
  "source_context": "Brief description of the observation that generated this instinct",
  "tags": ["tag1", "tag2"],
  "promoted_at": null,
  "promoted_confidence": null
}
```

When `scope` is `global`, `project` is `null` and `promoted_at` is set to the ISO timestamp of promotion.

## Workflow

### Step 1: Determine Scope and Text

Identify the atomic behavior to record:

- **text**: One sentence, imperative mood. "Always use shell: false when spawning child processes."
- **scope**: Start as `project`. Auto-promotes when confidence ≥ 0.8.
- **confidence**: 0.3–0.9. Be honest. See scale above.
- **tags**: 2–4 lowercase kebab-case tags for discoverability.
- **source_context**: Why you believe this. One to two sentences.

### Step 2: Check for Duplicates

**Command:**

```bash
grep -i "<keyword from instinct text>" C:/dev/projects/agent-studio/.claude/context/memory/instincts.jsonl 2>/dev/null | head -5
```

**Expected output:** Existing records matching the pattern, or empty output if new.

**Verify:** If a duplicate exists, update its confidence instead of creating a new record (see Step 4).

### Step 3: Write the Instinct

**Command:**

```bash
node C:/dev/projects/agent-studio/.claude/skills/instinct-learning/scripts/main.cjs \
  --action record \
  --text "{{instinct_text}}" \
  --confidence {{confidence_score}} \
  --tags "{{comma_separated_tags}}" \
  --source "{{source_context}}"
```

**Expected output:** `{"ok":true,"id":"inst-<id>","scope":"project","promoted":false}`

**Verify:** Exit code 0 and JSON with `ok: true`.

### Step 4: Update Existing Instinct Confidence

If the same pattern is observed again, increase confidence:

**Command:**

```bash
node C:/dev/projects/agent-studio/.claude/skills/instinct-learning/scripts/main.cjs \
  --action update \
  --id "{{instinct_id}}" \
  --confidence {{new_confidence_score}}
```

**Expected output:** `{"ok":true,"id":"{{instinct_id}}","confidence":{{new_score}},"promoted":{{true_or_false}}}`

**Verify:** If `promoted: true` is returned, the instinct is now in global scope.

### Step 5: Verify Auto-Promotion

When confidence reaches 0.8, auto-promotion fires automatically during the update step. Verify with:

**Command:**

```bash
node C:/dev/projects/agent-studio/.claude/skills/instinct-learning/scripts/main.cjs \
  --action list \
  --scope global \
  --limit 10
```

**Expected output:** JSON array of globally-promoted instincts, newest first.

**Verify:** The newly promoted instinct appears with `scope: "global"` and `promoted_at` set.

### Step 6: Query Instincts Before Work

Before starting a task, load relevant instincts to guide behavior:

**Command:**

```bash
node C:/dev/projects/agent-studio/.claude/skills/instinct-learning/scripts/main.cjs \
  --action query \
  --tags "{{relevant_tags}}" \
  --min-confidence 0.6
```

**Expected output:** JSON array of relevant instincts ordered by confidence descending.

**Verify:** Exit code 0 and array (may be empty if no matches).

## Anti-Patterns

- Never record instincts with confidence 0.9 on the first observation — earn it
- Never invent `source_context` — if you cannot remember the basis, set confidence to 0.3
- Never use multi-sentence instinct text — atomic means one behavior only
- Never promote manually by editing the JSON — use the `update` action and let auto-promotion fire
- Never query only global instincts — project-scoped instincts at 0.6+ are highly relevant

## Enforcement Hooks

Input validated against `schemas/input.schema.json` before execution.
Output contract defined in `schemas/output.schema.json`.

Pre-execution hook (`hooks/pre-execute.cjs`) validates:

- `confidence` is in range [0.3, 0.9]
- `text` is non-empty and under 200 characters
- `action` is a known enum value

Post-execution hook (`hooks/post-execute.cjs`) emits observability event to `.claude/context/runtime/tool-events.jsonl`.

## Assigned Agents

- `developer` — records patterns found during implementation
- `qa` — records patterns from testing and validation
- `architect` — records structural patterns
- `planner` — records planning heuristics
- `reflection-agent` — records patterns surfaced during reflection

## Memory Protocol

**Before starting:** Read `.claude/context/memory/learnings.md` and check `.claude/context/memory/instincts.jsonl` for relevant existing instincts.

**After completing:** Append summary to `.claude/context/memory/learnings.md`:

```
**instinct-learning** — [date] Recorded/updated N instincts. Promoted M to global scope.
```

> ASSUME INTERRUPTION: Your context may reset. If it's not in memory, it didn't happen.

## Related Skills

- `memory-search` — semantic search over global agent memory
- `context-compressor` — compress context before long tasks
- `session-handoff` — persist instincts across session boundaries
