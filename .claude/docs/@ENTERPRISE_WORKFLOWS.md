# Enterprise Workflows

**Source:** CLAUDE.md Section 8.6
**Version:** v2.2.1
**Last Updated:** 2026-01-31

---

## PURPOSE

Complete catalog of 18+ enterprise workflows for multi-agent orchestration, security audits, architecture reviews, and operational processes.

---

## CONTENT

| Workflow                | Path                                                                | Purpose                   |
| ----------------------- | ------------------------------------------------------------------- | ------------------------- |
| Router Decision         | `.claude/workflows/core/router-decision.md`                         | master routing            |
| **Enterprise Workflow** | `.claude/workflows/core/enterprise-workflow.md`                     | **multi-phase execution** |
| External Integration    | `.claude/workflows/core/external-integration.md`                    | safe integration          |
| Artifact Lifecycle      | `.claude/workflows/core/skill-lifecycle.md`                         | create/update/deprecate   |
| Feature Development     | `.claude/workflows/enterprise/feature-development-workflow.md`      | end-to-end                |
| C4 Architecture         | `.claude/workflows/enterprise/c4-architecture-workflow.md`          | C4 docs                   |
| Conductor Setup         | `.claude/workflows/conductor-setup-workflow.md`                     | CDD setup                 |
| Incident Response       | `.claude/workflows/operations/incident-response.md`                 | prod incidents            |
| Evolution Workflow      | `.claude/workflows/core/evolution-workflow.md`                      | EVOLVE process            |
| Reflection Workflow     | `.claude/workflows/core/reflection-workflow.md`                     | quality + learnings       |
| Security Audit          | `.claude/workflows/security-architect-skill-workflow.md`            | security audit            |
| Architecture Review     | `.claude/workflows/architecture-review-skill-workflow.md`           | arch review               |
| Chrome Browser          | `.claude/workflows/chrome-browser-skill-workflow.md`                | browser automation        |
| Consensus Voting        | `.claude/workflows/consensus-voting-skill-workflow.md`              | consensus                 |
| Swarm Coordination      | `.claude/workflows/enterprise/swarm-coordination-skill-workflow.md` | swarm patterns            |
| Database Design         | `.claude/workflows/database-architect-skill-workflow.md`            | schema workflows          |
| Context Compression     | `.claude/workflows/context-compressor-skill-workflow.md`            | summarization             |
| Post-Creation Valid.    | `.claude/workflows/core/post-creation-validation.md`                | artifact integration      |
| Progressive Disclos.    | `.claude/workflows/progressive-disclosure-skill-workflow.md`        | requirements gathering    |
| **Domain Development**  | `.claude/workflows/domain-development-workflow.md`                  | **TDD for domain agents** |
| **Code Review**         | `.claude/workflows/code-review-workflow.md`                         | **two-pass review**       |
| **Product Management**  | `.claude/workflows/product-management-workflow.md`                  | **INVEST sprint mgmt**    |
| **Documentation**       | `.claude/workflows/documentation-workflow.md`                       | **Diataxis framework**    |

### Workflow Categories

**Core Workflows** (`.claude/workflows/core/`):

- `router-decision.md` - Master routing logic (source of truth)
- `enterprise-workflow.md` - **Multi-phase execution (Triage → Design → Implement → Review → Deploy → Document → Reflect)**
- `evolution-workflow.md` - EVOLVE process (E→V→O→L→V→E)
- `external-integration.md` - Safe integration of external systems
- `skill-lifecycle.md` - Artifact creation, updates, deprecation
- `reflection-workflow.md` - Quality reflection and learning capture
- `post-creation-validation.md` - Artifact integration validation

**Enterprise Workflows** (`.claude/workflows/enterprise/`):

- `feature-development-workflow.md` - End-to-end feature development
- `c4-architecture-workflow.md` - C4 model documentation
- `swarm-coordination-skill-workflow.md` - Multi-agent swarm patterns

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
