# Config Library

## phase-config.cjs

- **Config:** `.claude/config/phase-models.json`
- **Schema:** `.claude/schemas/phase-models.schema.json`
- **Purpose:** Map phases (spec/planning/coding/qa) to model shorthand and thinking level.
- **Exports:** `getPhaseModel`, `getPhaseThinking`, `getPhaseThinkingBudget`

## Other config modules

- `context-mode-loader.cjs`
- `resolve-runtime-context.cjs`

See `.claude/docs/AGENT_CONFIG_AND_QA_REFERENCE.md` for the full reference.
