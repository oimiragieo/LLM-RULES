# Enterprise Workflows

**Source:** CLAUDE.md Section 8.6
**Version:** v2.2.1
**Last Updated:** 2026-01-31

---

## PURPOSE

Complete catalog of 18+ enterprise workflows for multi-agent orchestration, security audits, architecture reviews, and operational processes.

---

## CONTENT

| Workflow                | Path                                                                  | Purpose                           |
| ----------------------- | --------------------------------------------------------------------- | --------------------------------- |
| Router Decision         | `.claude/workflows/core/router-decision.md`                           | master routing                    |
| **Enterprise Workflow** | `.claude/workflows/core/enterprise-workflow.md`                       | **multi-phase execution**         |
| **Ecosystem Creation**  | `.claude/workflows/core/ecosystem-creation-workflow.md`               | **artifact creation lifecycle**   |
| External Integration    | `.claude/workflows/core/external-integration.md`                      | safe integration                  |
| Artifact Lifecycle      | `.claude/workflows/core/skill-lifecycle.md`                           | create/update/deprecate           |
| Feature Development     | `.claude/workflows/enterprise/feature-development-workflow.md`        | end-to-end                        |
| Mission Mode            | `.claude/workflows/start-mission.md`                                  | strict pre-flight & constraints   |
| C4 Architecture         | `.claude/workflows/enterprise/c4-architecture-workflow.md`            | C4 docs                           |
| Conductor Setup         | `.claude/workflows/conductor-setup-workflow.md`                       | CDD setup                         |
| Incident Response       | `.claude/workflows/operations/incident-response.md`                   | prod incidents                    |
| Evolution Workflow      | `.claude/workflows/core/evolution-workflow.md`                        | EVOLVE process                    |
| Reflection Workflow     | `.claude/workflows/core/reflection-workflow.md`                       | quality + learnings               |
| Security Audit          | `.claude/workflows/security-architect-skill-workflow.md`              | security audit                    |
| Architecture Review     | `.claude/workflows/architecture-review-skill-workflow.md`             | arch review                       |
| Consensus Voting        | `.claude/workflows/consensus-voting-skill-workflow.md`                | consensus                         |
| Database Design         | `.claude/workflows/database-architect-skill-workflow.md`              | schema workflows                  |
| Context Compression     | `.claude/workflows/context-compressor-skill-workflow.md`              | summarization                     |
| Token Saver Compression | `.claude/workflows/token-saver-context-compression-skill-workflow.md` | search-aware evidence compression |
| Post-Creation Valid.    | `.claude/workflows/core/post-creation-validation.md`                  | artifact integration              |
| **Domain Development**  | `.claude/workflows/domain-development-workflow.md`                    | **TDD for domain agents**         |
| **Code Review**         | `.claude/workflows/code-review-workflow.md`                           | **two-pass review**               |
| **Product Management**  | `.claude/workflows/product-management-workflow.md`                    | **INVEST sprint mgmt**            |
| **Documentation**       | `.claude/workflows/documentation-workflow.md`                         | **Diataxis framework**            |

### Enterprise Orchestration Workflow

Complex tasks use phased execution with automatic advancement:
**Triage -> Design -> Implement -> Review -> Deploy -> Document -> Reflect**

**Key modules:**

- `complexity-classifier.cjs` -- classifies TRIVIAL/LOW/MEDIUM/HIGH/EPIC
- `workflow-state-manager.cjs` -- file-based state at `.claude/context/runtime/workflow-state.json`
- `phase-advance-reader.cjs` -- reads signals + maps phases to agent types
- `.claude/hooks/workflow/post-completion-chain.cjs` -- auto-advances phases on agent completion
- `quality-gates.cjs` -- blocking/non-blocking gates between phases

**Phase skipping by complexity:**

| Complexity | Phases                                    | Agents |
| ---------- | ----------------------------------------- | ------ |
| TRIVIAL    | Implement -> Review                       | 2      |
| LOW        | Design -> Implement -> Review             | 4      |
| MEDIUM     | Design -> Implement -> Review -> Document | 6      |
| HIGH       | All except Dynamic Creation               | 8+     |
| EPIC       | All 8 phases                              | 12+    |

See `enterprise-workflow.md` for full workflow specification.
See `router-decision.md` Step 7.5 for integration details.

---

### Workflow Categories

**Core Workflows** (`.claude/workflows/core/`):

- `router-decision.md` - Master routing logic (source of truth)
- `enterprise-workflow.md` - **Multi-phase execution (Triage → Design → Implement → Review → Deploy → Document → Reflect)**
- `ecosystem-creation-workflow.md` - **Artifact creation lifecycle (Routing → Research → Pre-Check → Creation → Integration → Follow-Up)**
- `evolution-workflow.md` - EVOLVE process (E→V→O→L→V→E)
- `external-integration.md` - Safe integration of external systems
- `skill-lifecycle.md` - Artifact creation, updates, deprecation
- `reflection-workflow.md` - Quality reflection and learning capture
- `post-creation-validation.md` - Artifact integration validation
- `start-mission.md` - Strict mission execution with pre-flight checks and formalized invariant constraints

**Enterprise Workflows** (`.claude/workflows/enterprise/`):

- `feature-development-workflow.md` - End-to-end feature development
- `c4-architecture-workflow.md` - C4 model documentation

**Operations Workflows** (`.claude/workflows/operations/`):

- `incident-response.md` - Production incident handling
- `qa-bounded-loop.md` - QA validation with bounded fix loops

**Root Workflows** (`.claude/workflows/`):

- `domain-development-workflow.md` - TDD workflow for all 22 domain specialist agents
- `code-review-workflow.md` - Two-pass review process
- `product-management-workflow.md` - INVEST criteria and sprint planning
- `documentation-workflow.md` - Diataxis framework for technical writing

---

## RELATED REFERENCES

- **@EVOLUTION_WORKFLOW.md** - EVOLVE process details
- **@SKILL_CATALOG_TABLE.md** - Skills used within workflows
- **@AGENT_ROUTING_TABLE.md** - Agents participating in workflows
- **@WORKFLOW_AGENT_MAP.md** - Workflow-agent mapping matrix

---

## BACK TO MAIN

See **CLAUDE.md** Section 8.6 for inline summary.
