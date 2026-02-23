---
name: sequential-thinking
description: Sequential thinking and structured problem solving. Break down complex problems into steps with revision and branching capabilities. Use for multi-step analysis, planning, and hypothesis verification.
version: 1.1.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Bash]
best_practices:
  - Start with initial estimate of needed steps
  - Revise and branch as needed
  - Generate and verify hypotheses
error_handling: graceful
streaming: supported
verified: true
lastVerifiedAt: 2026-02-22T00:00:00.000Z
---

# Sequential Thinking Skill

## Installation

**Optional standalone executor**: The skill can run `.claude/tools/optimization/sequential-thinking/executor.py`. Requirements:

- **Python 3.10+**: [python.org](https://www.python.org/downloads/) or `winget install Python.Python.3.12` (Windows), `brew install python@3.12` (macOS).
- **MCP Python package**: `pip install mcp`
- If the executor is not present or MCP is not installed, the skill still provides in-context guidance and exits successfully.

**Full functionality:** The Python script `.claude/tools/optimization/sequential-thinking/executor.py` must exist for standalone executor runs. Run `node .claude/tools/cli/doctor.mjs` to verify; doctor warns if the executor is missing.

## Cheat Sheet & Best Practices

**Frameworks:** Polya: (1) Understand the problem (2) Devise a plan (3) Carry out the plan (4) Look back. IDEAL: Identify → Define context → Explore strategies → Act on best → Look back and learn.

**Process:** Be systematic: preview outcomes, sustain effort, examine from multiple angles, pace and self-monitor. Use diagrams, tables, patterns; break into subgoals; work backwards when useful.

**Hacks:** Number thoughts (thoughtNumber, totalThoughts); allow revision and branching. Start with an initial step count and refine. Use the MCP sequential-thinking tool for multi-step analysis and hypothesis verification when the full scope is unclear.

## Certifications & Training

**No cert.** Problem-solving frameworks: Polya (Understand → Plan → Execute → Look back), IDEAL (Identify → Define → Explore → Act → Look back). **Skill data:** Systematic steps; preview outcomes; sustain effort; revise and branch; use diagrams/tables/patterns.

## Hooks & Workflows

**Suggested hooks:** Optional: pre-plan or pre-complex-task hook to suggest sequential-thinking for multi-step tasks. Use with **planner** (primary) for planning and **master-orchestrator** when decomposing work.

**Workflows:** Use with **planner** (primary). Flow: complex task → load sequential-thinking → emit thoughts (MCP or executor) → revise → act. See `core/router-decision` for when router assigns planner.

## Overview

This skill provides structured problem-solving through a flexible thinking process that can adapt and evolve. Each thought can build on, question, or revise previous insights.

**Context Savings**: ~97% reduction

- **MCP Mode**: ~15,000 tokens always loaded
- **Skill Mode**: ~500 tokens metadata + on-demand loading

## When to Use

- Breaking down complex problems into steps
- Planning and design with room for revision
- Analysis that might need course correction
- Problems where the full scope isn't clear initially
- Multi-step solutions requiring maintained context
- Filtering irrelevant information
- Hypothesis generation and verification

## Quick Reference

Use the MCP sequential thinking tool directly:

```javascript
// Via MCP tool
mcp__sequential -
  thinking__sequentialthinking({
    thought: 'First, let me analyze the problem...',
    thoughtNumber: 1,
    totalThoughts: 5,
    nextThoughtNeeded: true,
  });
```

## Tool: sequentialthinking

A detailed tool for dynamic and reflective problem-solving through thoughts.

### Parameters

| Parameter           | Type    | Description                                |
| ------------------- | ------- | ------------------------------------------ |
| `thought`           | string  | Your current thinking step                 |
| `thoughtNumber`     | integer | Current thought number (1, 2, 3...)        |
| `totalThoughts`     | integer | Estimated total thoughts needed            |
| `nextThoughtNeeded` | boolean | Whether another thought step is needed     |
| `isRevision`        | boolean | If this thought revises previous thinking  |
| `revisesThought`    | integer | Which thought number is being reconsidered |
| `branchFromThought` | integer | Branching point thought number             |
| `branchId`          | string  | Identifier for current branch              |
| `needsMoreThoughts` | boolean | If more thoughts needed at the "end"       |

### Key Features

- Adjust `totalThoughts` up or down as you progress
- Question or revise previous thoughts
- Add more thoughts even after reaching what seemed like the end
- Express uncertainty and explore alternatives
- Branch or backtrack (non-linear thinking)
- Generate and verify solution hypotheses

### Process

1. Start with initial estimate of needed thoughts
2. Feel free to question/revise previous thoughts
3. Add more thoughts if needed, even at the "end"
4. Mark thoughts that revise or branch
5. Generate solution hypothesis when appropriate
6. Verify hypothesis based on Chain of Thought
7. Repeat until satisfied
8. Set `nextThoughtNeeded: false` only when truly done

## Tool Execution

The sequential thinking tool is available via MCP. Use it directly in your responses:

```javascript
// Execute a thinking step
mcp__sequential -
  thinking__sequentialthinking({
    thought: 'Your analysis here...',
    thoughtNumber: 1,
    totalThoughts: 5,
    nextThoughtNeeded: true,
  });
```

## Configuration

MCP server configuration stored in `config.json`:

- **Command**: `npx -y @modelcontextprotocol/server-sequential-thinking`

## Related

- Original MCP server: `@modelcontextprotocol/server-sequential-thinking`
- MCP Converter Skill: `.claude/skills/mcp-converter/`

## Iron Laws

1. **NEVER** set `nextThoughtNeeded: false` before the solution hypothesis has been verified
2. **ALWAYS** adjust `totalThoughts` dynamically as problem complexity becomes clear
3. **NEVER** commit to the first approach without exploring at least one alternative via branching
4. **ALWAYS** mark corrections explicitly with `isRevision: true` and `revisesThought: N`
5. **NEVER** stop at the estimated thought count if the hypothesis remains unverified

## Anti-Patterns

| Anti-Pattern           | Why It Fails                                                              | Correct Approach                                                                 |
| ---------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Fixed thought count    | Thinking stops at an arbitrary estimate regardless of solution confidence | Set `needsMoreThoughts: true` and increase `totalThoughts` when complexity grows |
| No branching           | Commits to the first approach without considering alternatives            | Use `branchFromThought` to explore multiple solution paths before choosing       |
| Skipping revisions     | Incorrect assumptions propagate uncorrected through downstream thoughts   | Mark all corrections with `isRevision: true` and `revisesThought: N`             |
| Premature termination  | Unverified hypothesis leads to incorrect or incomplete solutions          | Verify the hypothesis explicitly before setting `nextThoughtNeeded: false`       |
| No uncertainty markers | Overconfident conclusions mislead execution agents                        | Mark tentative thoughts explicitly; distinguish confident vs uncertain reasoning |

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New pattern -> `.claude/context/memory/learnings.md`
- Issue found -> `.claude/context/memory/issues.md`
- Decision made -> `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
