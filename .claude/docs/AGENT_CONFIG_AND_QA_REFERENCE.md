# Agent Config, Phase Config, and QA Modules Reference

## Overview
This document describes the agent-config, phase-config, QA criteria/report, and implementation plan modules added from the Auto-Claude deep-dive integration.

## 1. Agent config (tools + thinking per agent)
- **Config:** `.claude/config/agent-config.json`
- **Schema:** `.claude/schemas/agent-config.schema.json`
- **Library:** `.claude/lib/agents/agent-config.cjs`
- **Purpose:** Per-agent default tools and thinking level. Used by spawn-prompt-assembler when agent-registry has no requiredTools.
- **Exports:** `getAgentConfig`, `getDefaultTools`, `getDefaultThinkingLevel`, `getThinkingBudget`, `getPhaseForAgent`, `listAgentTypes`

## 2. Phase config (model + thinking per phase)
- **Config:** `.claude/config/phase-models.json`
- **Schema:** `.claude/schemas/phase-models.schema.json`
- **Library:** `.claude/lib/config/phase-config.cjs`
- **Purpose:** Maps phases (spec/planning/coding/qa) to model shorthand and thinking levels.
- **Exports:** `getPhaseModel`, `getPhaseThinking`, `getPhaseThinkingBudget`

## 3. QA criteria and report
- **Libraries:** `.claude/lib/qa/criteria.cjs`, `.claude/lib/qa/report.cjs`
- **Plan data:** `.claude/context/plans/<planId>/implementation_plan.json`
- **History:** `.claude/context/plans/<planId>/qa_iteration_history.json`
- **Purpose:** Bounded QA loop helpers (signoff status, shouldRunQa, shouldRunFixes) and iteration history/recurring issue detection.

## 4. Implementation plan and progress
- **Libraries:** `.claude/lib/plan/implementation-plan.cjs`, `.claude/lib/plan/progress.cjs`
- **Schema:** `.claude/schemas/implementation-plan.schema.json`
- **Purpose:** Load/save implementation plans and compute progress (completed count, next subtask, build complete).

## 5. File map (quick reference)
| Path | Description |
| --- | --- |
| `.claude/config/agent-config.json` | Per-agent tools and thinking defaults |
| `.claude/schemas/agent-config.schema.json` | Schema for agent-config |
| `.claude/config/phase-models.json` | Phase → model/thinking mapping |
| `.claude/schemas/phase-models.schema.json` | Schema for phase-models |
| `.claude/schemas/implementation-plan.schema.json` | Schema for implementation plans |
| `.claude/lib/agents/agent-config.cjs` | Agent tool/thinking defaults |
| `.claude/lib/config/phase-config.cjs` | Phase model/thinking helpers |
| `.claude/lib/qa/criteria.cjs` | QA signoff + bounded loop criteria |
| `.claude/lib/qa/report.cjs` | QA iteration history + recurring issues |
| `.claude/lib/plan/implementation-plan.cjs` | Plan load/save utilities |
| `.claude/lib/plan/progress.cjs` | Progress helpers |

## 6. Creator and registry integration
- Agent creation must update `.claude/config/agent-config.json` so spawn tool enrichment has explicit defaults.
- Agent registry generation can seed requiredTools from agent-config when frontmatter/skills do not supply tools.
- Routing behavior (which agent to spawn) is unchanged; only tool enrichment uses agent-config as fallback.
