<!-- Agent: developer | Task: #task-8b | Session: 2026-03-17 -->

# Research Requirements — plan-quality-verifier

## Research Date

2026-03-17

## Search Summary

**VoltAgent/awesome-agent-skills search:** Searched for "plan quality", "plan verification", "planning validation" — no matching skill found in the community collection.

**Exa/Web search:** Not performed (Exa MCP not available in this worktree context). Proceeding with design based on established planning quality principles and the framework's existing patterns.

## Design Constraints (from framework analysis)

1. **Heuristic scoring, not LLM-based**: The verifier must be deterministic and fast. It uses keyword/structure analysis on the plan markdown rather than LLM evaluation. This ensures reproducibility and avoids nested LLM calls during plan gating.

2. **8 dimensions fixed**: The dimension set maps to the framework's plan template requirements (as defined in `.claude/context/plans/` artifacts). Scores are additive, averaged, and scaled to 0-100.

3. **Pass threshold = 60**: Chosen to allow plans that address most but not all dimensions to proceed. A hard 80+ threshold would over-block valid plans that simply lack estimation detail.

## Non-Goals

- NOT a semantic plan evaluator (no LLM scoring)
- NOT a plan formatter or plan generator
- NOT a validator for agent output quality (see `verification-before-completion`)
- NOT a plan diff/comparison tool

## Prior Art

- `verification-before-completion` skill — completion gating, parallel concept
- `plan-generator` skill — generates plans that should pass this verifier
- Pre-completion validation hook (`.claude/hooks/validation/pre-completion-validation.cjs`) — same gate pattern applied to task output
