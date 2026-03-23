# De-Sloppify — Research Requirements

## Research Date: 2026-03-23

## Search Performed

Searched VoltAgent/awesome-agent-skills for "cleanup dead code unused imports console log" — no direct match found.

Conceptual basis drawn from:

1. ESLint no-unused-vars and no-console rules (established best practices)
2. Two-agent patterns in agent-studio (implementer/reviewer separation)
3. Code cleanup workflows (sonar, jscpd, ESLint, Prettier common patterns)

## Design Constraints (Mapped to Implementation)

1. **Cleanup must not change behavior** → CLI scanner uses deterministic heuristics (word-boundary import check, context-aware console.error detection). No AI or probabilistic logic in the scan path.

2. **Conservative by default** → False negatives (leaving slop) are preferred over false positives (removing live code). The `isCodeLine()` function has an explicit preserve list before the code-indicator list.

3. **Diff verification required** → Workflow mandates snapshot-before + diff-after. The SKILL.md workflow cannot complete without step 6 (git diff review).

## Non-Goals

- NOT a replacement for ESLint/TSC — those catch more cases at compile time
- NOT a TypeScript-aware unused variable scanner (that requires a language server)
- NOT a dead-code elimination tool for tree-shaking (build tooling responsibility)
- Does NOT auto-delete findings — cleanup agent uses `Edit` tool, human review via diff
