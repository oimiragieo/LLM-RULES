# Workflows

Multi-agent workflow definitions that choreograph how skills and agents collaborate on complex tasks. Each workflow file (`.md`) describes the phases, participating agents, and data flow for a specific operation.

## Structure

The directory contains 300+ workflow files organized into:

### Subdirectories

| Directory | Purpose |
|-----------|---------|
| `core/` | Core router workflows — `router-decision.md` (the primary routing logic), phase gate definitions |
| `enterprise/` | Enterprise pipeline workflows — multi-phase delivery, approval gates, stakeholder coordination |
| `operations/` | Operational workflows — monitoring, incident response, maintenance |
| `creators/` | Creator workflows — how skill-creator, agent-creator, etc. operate |
| `updaters/` | Updater workflows — how skill-updater, agent-updater, etc. refresh existing artifacts |

### Skill Workflows (Top Level)

The majority of files follow the pattern `{skill-name}-skill-workflow.md`. Each defines:
- Which agent(s) execute the skill
- Input/output contracts
- Phase sequence (research → plan → implement → review → validate)
- Quality gates between phases

### Key Workflows

| File | Purpose |
|------|---------|
| `core/router-decision.md` | **Primary routing logic** — the decision tree the router uses to select agents |
| `code-review-workflow.md` | Two-stage code review process |
| `conductor-setup-workflow.md` | Conductor project validation setup |
| `start-mission.md` | Long-running mission initialization |
| `tdd-skill-workflow.md` | Test-driven development cycle |
| `team-orchestration-skill-workflow.md` | 6-phase multi-agent pipeline |

## How Workflows Execute

1. Router or orchestrator loads the workflow definition
2. Workflow defines phases with agent assignments
3. Each phase spawns the assigned agent via `Task()`
4. Phase gates validate output before advancing
5. Workflow state persists in `.claude/context/workflows/`
