<!-- Agent: architect | Task: #114 | Session: 2026-02-07 -->

# Workflows System Architecture Audit

**Pipeline:** #13 - Workflows System Deep Dive
**Date:** 2026-02-07
**Agent:** architect (Opus 4.6)
**Scope:** `.claude/workflows/` -- all files, consumers, wiring, registry alignment

---

## Executive Summary

| Metric                               | Value                          |
| ------------------------------------ | ------------------------------ |
| **Health Score**                     | **54/100**                     |
| **Total Files on Disk**              | 54 (including README)          |
| **Registered in Registry**           | 36                             |
| **UNREGISTERED**                     | 17 (31.5% of non-README files) |
| **DEAD (no consumers)**              | 11                             |
| **PHANTOM (referenced but missing)** | 2                              |
| **STALE (outdated content)**         | 3                              |
| **REDUNDANT (overlapping)**          | 4                              |
| **AUTO-STUB (template-generated)**   | 3                              |
| **Security Score (Task #115)**       | 62/100 (CONDITIONAL PASS)      |

**Key Findings:**

1. Nearly one-third of workflow files (17/54) are not registered in `workflow-registry.json`, including `enterprise-workflow.md` (the second most important workflow after `router-decision.md`).
2. Eleven root-level YAML stub files (5-19 lines each) have zero consumers outside the merkle-tree index. They appear to be BMAD-framework scaffolding that was never wired into the system.
3. `feature-development-workflow.md` is duplicated in both `core/` (837 lines, 3 refs) and `enterprise/` (577 lines, 50 refs). The core version is the less-consumed duplicate.
4. Three auto-generated skill workflows (62 lines each: chrome-browser, progressive-disclosure, template-renderer) are stub templates with no workflow-specific content beyond boilerplate.
5. Two phantom references exist: `enterprise/party-mode-workflow.md` (referenced by party-orchestrator) and `workspace-conventions.md` as workflow (listed in WORKFLOW_AGENT_MAP but exists only as `.claude/rules/workspace-conventions.md`).

---

## Inventory Table

### Core Workflows (8 files, 7486 lines)

| Path                                   | Lines | Purpose                                                                              | Consumers                                    | Status                                   |
| -------------------------------------- | ----- | ------------------------------------------------------------------------------------ | -------------------------------------------- | ---------------------------------------- |
| `core/router-decision.md`              | 1260  | Master routing logic, decision matrices, complexity classification                   | 30+ files (CLAUDE.md, agents, hooks, skills) | **HEALTHY**                              |
| `core/enterprise-workflow.md`          | 988   | Multi-phase execution (Triage->Design->Implement->Review->Deploy->Document->Reflect) | 10+ files (CLAUDE.md, router, agents)        | **UNREGISTERED**                         |
| `core/evolution-workflow.md`           | 1085  | EVOLVE process for artifact creation                                                 | 15+ files                                    | **HEALTHY**                              |
| `core/reflection-workflow.md`          | 864   | Quality reflection and learning capture                                              | 10+ files                                    | **HEALTHY**                              |
| `core/feature-development-workflow.md` | 837   | Feature development lifecycle                                                        | 3 files (security report, archive, merkle)   | **REDUNDANT** (duplicate of enterprise/) |
| `core/skill-lifecycle.md`              | 1030  | Artifact lifecycle management                                                        | 5+ files                                     | **HEALTHY** (deprecated in registry)     |
| `core/post-creation-validation.md`     | 330   | Artifact integration validation                                                      | 5+ files                                     | **HEALTHY**                              |
| `core/external-integration.md`         | 1092  | Safe integration of external systems                                                 | 8+ files                                     | **HEALTHY**                              |

### Enterprise Workflows (5 files, 1748 lines)

| Path                                              | Lines | Purpose                                      | Consumers                                  | Status                                                                        |
| ------------------------------------------------- | ----- | -------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------- |
| `enterprise/feature-development-workflow.md`      | 577   | End-to-end feature development orchestration | 50+ files (all domain agents, core agents) | **HEALTHY** (canonical)                                                       |
| `enterprise/c4-architecture-workflow.md`          | 486   | C4 model documentation                       | 8+ files (c4 agents, architect)            | **HEALTHY**                                                                   |
| `enterprise/swarm-coordination-skill-workflow.md` | 674   | Multi-agent swarm patterns                   | 6+ files                                   | **HEALTHY**                                                                   |
| `enterprise/code-review.yaml`                     | 5     | Skeleton: analyze, critique, approve         | 3 files (skills only)                      | **DEAD** (stub, superseded by code-review-workflow.md)                        |
| `enterprise/full-stack.yaml`                      | 6     | Skeleton: plan, architect, implement, test   | 2 files (skills, registry)                 | **DEAD** (stub, superseded by enterprise-track.yaml / enterprise-workflow.md) |

### Operations Workflows (3 files, 791 lines)

| Path                               | Lines | Purpose                              | Consumers                                    | Status                               |
| ---------------------------------- | ----- | ------------------------------------ | -------------------------------------------- | ------------------------------------ |
| `operations/incident-response.md`  | 219   | Production incident handling         | 5+ files (devops, incident-responder agents) | **HEALTHY**                          |
| `operations/hook-consolidation.md` | 535   | Hook management and consolidation    | 3+ files                                     | **STALE** (deprecated in registry)   |
| `operations/qa-bounded-loop.md`    | 37    | QA validation with bounded fix loops | 3 files (qa agent, registry)                 | **HEALTHY** (minimal but functional) |

### Creator Workflows (6 files, 2247 lines)

| Path                                      | Lines | Purpose                    | Consumers                                 | Status                     |
| ----------------------------------------- | ----- | -------------------------- | ----------------------------------------- | -------------------------- |
| `creators/agent-creator-workflow.yaml`    | 249   | Agent creation pipeline    | workflow-cli.cjs, registry                | **HEALTHY**                |
| `creators/hook-creator-workflow.yaml`     | 429   | Hook creation pipeline     | workflow-cli.cjs, registry                | **HEALTHY**                |
| `creators/skill-creator-workflow.yaml`    | 419   | Skill creation pipeline    | workflow-cli.cjs, mcp-converter, registry | **HEALTHY**                |
| `creators/template-creator-workflow.yaml` | 377   | Template creation pipeline | workflow-cli.cjs, registry                | **HEALTHY**                |
| `creators/workflow-creator-workflow.yaml` | 405   | Workflow creation pipeline | workflow-cli.cjs, registry                | **HEALTHY**                |
| `creators/schema-creator-workflow.yaml`   | 368   | Schema creation pipeline   | workflow-cli.cjs, registry                | **HEALTHY** (draft status) |

### Updater Workflows (6 files, 2242 lines)

| Path                                      | Lines | Purpose                  | Consumers                  | Status      |
| ----------------------------------------- | ----- | ------------------------ | -------------------------- | ----------- |
| `updaters/agent-updater-workflow.yaml`    | 360   | Agent update pipeline    | workflow-cli.cjs, registry | **HEALTHY** |
| `updaters/hook-updater-workflow.yaml`     | 387   | Hook update pipeline     | workflow-cli.cjs, registry | **HEALTHY** |
| `updaters/skill-updater-workflow.yaml`    | 387   | Skill update pipeline    | workflow-cli.cjs, registry | **HEALTHY** |
| `updaters/template-updater-workflow.yaml` | 353   | Template update pipeline | workflow-cli.cjs, registry | **HEALTHY** |
| `updaters/workflow-updater-workflow.yaml` | 380   | Workflow update pipeline | workflow-cli.cjs, registry | **HEALTHY** |
| `updaters/schema-updater-workflow.yaml`   | 375   | Schema update pipeline   | workflow-cli.cjs, registry | **HEALTHY** |

### Root-Level Skill Workflows (13 files, 6099 lines)

| Path                                       | Lines | Purpose                          | Consumers                                               | Status           |
| ------------------------------------------ | ----- | -------------------------------- | ------------------------------------------------------- | ---------------- |
| `architecture-review-skill-workflow.md`    | 592   | Architecture review process      | 6+ files (architect, code-reviewer, security-architect) | **HEALTHY**      |
| `security-architect-skill-workflow.md`     | 565   | Security audit workflow          | 6+ files                                                | **HEALTHY**      |
| `database-architect-skill-workflow.md`     | 850   | Database design workflow         | 4+ files                                                | **HEALTHY**      |
| `consensus-voting-skill-workflow.md`       | 548   | Multi-agent consensus            | 4+ files                                                | **HEALTHY**      |
| `context-compressor-skill-workflow.md`     | 711   | Context compression              | 5+ files                                                | **HEALTHY**      |
| `conductor-setup-workflow.md`              | 301   | CDD setup and validation         | 3+ files                                                | **HEALTHY**      |
| `domain-development-workflow.md`           | 359   | TDD for all 22 domain agents     | 22+ agent files                                         | **UNREGISTERED** |
| `code-review-workflow.md`                  | 574   | Two-pass code review             | 4+ files                                                | **UNREGISTERED** |
| `product-management-workflow.md`           | 583   | INVEST sprint management         | 2+ files                                                | **UNREGISTERED** |
| `documentation-workflow.md`                | 830   | Diataxis documentation framework | 2+ files                                                | **UNREGISTERED** |
| `chrome-browser-skill-workflow.md`         | 62    | Auto-generated stub              | 2 files (skill, registry)                               | **AUTO-STUB**    |
| `progressive-disclosure-skill-workflow.md` | 62    | Auto-generated stub              | 2 files (skill, registry)                               | **AUTO-STUB**    |
| `template-renderer-skill-workflow.md`      | 62    | Auto-generated stub              | 2 files (skill, registry)                               | **AUTO-STUB**    |

### Root-Level YAML Stubs (11 files, 176 lines)

| Path                            | Lines | Purpose                          | Consumers            | Status   |
| ------------------------------- | ----- | -------------------------------- | -------------------- | -------- |
| `ai-system-flow.yaml`           | 16    | AI development workflow skeleton | 0 (merkle-tree only) | **DEAD** |
| `bmad-greenfield-standard.yaml` | 19    | BMAD greenfield scaffold         | 0                    | **DEAD** |
| `brownfield-fullstack.yaml`     | 19    | Brownfield fullstack scaffold    | 0                    | **DEAD** |
| `code-quality-flow.yaml`        | 13    | Code quality scaffold            | 0                    | **DEAD** |
| `enterprise-track.yaml`         | 19    | Enterprise development scaffold  | 0                    | **DEAD** |
| `greenfield-fullstack.yaml`     | 19    | Greenfield fullstack scaffold    | 0                    | **DEAD** |
| `incident-flow.yaml`            | 16    | Incident response scaffold       | 0                    | **DEAD** |
| `mobile-flow.yaml`              | 16    | Mobile development scaffold      | 0                    | **DEAD** |
| `performance-flow.yaml`         | 13    | Performance workflow scaffold    | 0                    | **DEAD** |
| `quick-flow.yaml`               | 10    | Quick fix scaffold               | 0                    | **DEAD** |
| `ui-perfection-loop.yaml`       | 16    | UI perfection scaffold           | 0                    | **DEAD** |

### Rapid Workflows (1 file, 5 lines)

| Path             | Lines | Purpose            | Consumers         | Status   |
| ---------------- | ----- | ------------------ | ----------------- | -------- |
| `rapid/fix.yaml` | 5     | Quick fix skeleton | 1 (registry only) | **DEAD** |

### README (1 file)

| Path        | Lines | Purpose                 | Consumers | Status                                                                       |
| ----------- | ----- | ----------------------- | --------- | ---------------------------------------------------------------------------- |
| `README.md` | 150   | Directory documentation | N/A       | **STALE** (missing 4 new workflows from Task #44, missing creators/updaters) |

---

## Gap Analysis

### DEAD Workflows (12 files, 181 lines total)

Files with zero functional consumers (merkle-tree / registry-only references do not count):

| File                            | Lines | Reason Dead                                      | Recommendation             |
| ------------------------------- | ----- | ------------------------------------------------ | -------------------------- |
| `ai-system-flow.yaml`           | 16    | Never wired; no agent, hook, or skill references | DELETE                     |
| `bmad-greenfield-standard.yaml` | 19    | BMAD scaffolding, never consumed                 | DELETE                     |
| `brownfield-fullstack.yaml`     | 19    | Never consumed                                   | DELETE                     |
| `code-quality-flow.yaml`        | 13    | Never consumed                                   | DELETE                     |
| `enterprise-track.yaml`         | 19    | Superseded by enterprise-workflow.md             | DELETE                     |
| `greenfield-fullstack.yaml`     | 19    | Never consumed                                   | DELETE                     |
| `incident-flow.yaml`            | 16    | Superseded by operations/incident-response.md    | DELETE                     |
| `mobile-flow.yaml`              | 16    | Never consumed                                   | DELETE                     |
| `performance-flow.yaml`         | 13    | Never consumed                                   | DELETE                     |
| `quick-flow.yaml`               | 10    | Never consumed                                   | DELETE                     |
| `ui-perfection-loop.yaml`       | 16    | Never consumed                                   | DELETE                     |
| `rapid/fix.yaml`                | 5     | 3-step stub, registry-only                       | DELETE (remove rapid/ dir) |

**Origin:** These appear to be initial BMAD-framework scaffolding from project setup that was never integrated. The enterprise workflow system (`enterprise-workflow.md` + `router-decision.md`) completely supersedes them with a mature phase-based execution model.

### PHANTOM Workflows (2 references)

| Referenced From                                       | Referenced Path                                   | Actual Location                                              | Issue                                                |
| ----------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------- |
| `agents/orchestrators/party-orchestrator.md` line 421 | `enterprise/party-mode-workflow.md`               | Does not exist                                               | Reference to non-existent file                       |
| `docs/@WORKFLOW_AGENT_MAP.md` Section 1 matrix row    | `workspace-conventions.md` as enterprise workflow | `.claude/rules/workspace-conventions.md` (not in workflows/) | Wrong category; file exists but not in workflows dir |

### STALE Workflows (3 files)

| File                               | Issue                                                                                                                                                                        | Recommendation                                 |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `operations/hook-consolidation.md` | Deprecated in registry; references patterns from pre-consolidation era                                                                                                       | UPDATE or ARCHIVE                              |
| `README.md`                        | Missing: 4 workflows from Task #44 (domain-development, code-review, product-management, documentation), missing creators/updaters/rapid subdirectories in directory listing | UPDATE                                         |
| `core/skill-lifecycle.md`          | Deprecated in registry but still 1030 lines and referenced by 5+ files                                                                                                       | REVIEW (may need undeprecation or replacement) |

### REDUNDANT Workflows (4 files)

| File A                                                     | File B                                                                    | Issue                                              | Recommendation                               |
| ---------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------- |
| `core/feature-development-workflow.md` (837 lines, 3 refs) | `enterprise/feature-development-workflow.md` (577 lines, 50 refs)         | Duplicate topic; core version has fewer consumers  | DELETE core version, keep enterprise version |
| `enterprise/code-review.yaml` (5 lines)                    | `code-review-workflow.md` (574 lines)                                     | YAML stub superseded by comprehensive .md workflow | DELETE YAML stub                             |
| `enterprise/full-stack.yaml` (6 lines)                     | `enterprise-track.yaml` (19 lines) + `enterprise-workflow.md` (988 lines) | Multiple overlapping fullstack flow definitions    | DELETE both YAML stubs                       |
| `incident-flow.yaml` (16 lines)                            | `operations/incident-response.md` (219 lines)                             | YAML stub superseded by operations workflow        | DELETE YAML stub                             |

### AUTO-STUB Workflows (3 files, 186 lines total)

These were auto-generated by the skill-creator and contain only boilerplate (no workflow-specific logic):

| File                                       | Lines | Issue                                                       |
| ------------------------------------------ | ----- | ----------------------------------------------------------- |
| `chrome-browser-skill-workflow.md`         | 62    | Generic invocation template, no browser-specific workflow   |
| `progressive-disclosure-skill-workflow.md` | 62    | Generic invocation template, no ECLAIR-specific workflow    |
| `template-renderer-skill-workflow.md`      | 62    | Generic invocation template, no rendering-specific workflow |

**Recommendation:** Either flesh out with real workflow content or DELETE and remove from registry. Their current form provides zero workflow guidance beyond "invoke the skill."

---

## Registry Alignment Analysis

### Files on Disk NOT in Registry (17 files)

| File                                   | Why Missing                                       | Impact                                 | Action                       |
| -------------------------------------- | ------------------------------------------------- | -------------------------------------- | ---------------------------- |
| `core/enterprise-workflow.md`          | **CRITICAL GAP** - second most important workflow | Registry is incomplete for core system | **REGISTER (P0)**            |
| `core/feature-development-workflow.md` | Duplicate of enterprise/ version                  | Low (few consumers)                    | DELETE (resolves redundancy) |
| `domain-development-workflow.md`       | Created in Task #44 but not registered            | 22+ domain agents depend on it         | **REGISTER (P1)**            |
| `code-review-workflow.md`              | Created in Task #44 but not registered            | code-reviewer agent depends on it      | **REGISTER (P1)**            |
| `product-management-workflow.md`       | Created in Task #44 but not registered            | pm agent depends on it                 | **REGISTER (P1)**            |
| `documentation-workflow.md`            | Created in Task #44 but not registered            | technical-writer depends on it         | **REGISTER (P1)**            |
| `ai-system-flow.yaml`                  | Dead; never consumed                              | None                                   | DELETE                       |
| `bmad-greenfield-standard.yaml`        | Dead; never consumed                              | None                                   | DELETE                       |
| `brownfield-fullstack.yaml`            | Dead; never consumed                              | None                                   | DELETE                       |
| `code-quality-flow.yaml`               | Dead; never consumed                              | None                                   | DELETE                       |
| `enterprise-track.yaml`                | Dead; superseded                                  | None                                   | DELETE                       |
| `greenfield-fullstack.yaml`            | Dead; never consumed                              | None                                   | DELETE                       |
| `incident-flow.yaml`                   | Dead; superseded                                  | None                                   | DELETE                       |
| `mobile-flow.yaml`                     | Dead; never consumed                              | None                                   | DELETE                       |
| `performance-flow.yaml`                | Dead; never consumed                              | None                                   | DELETE                       |
| `quick-flow.yaml`                      | Dead; never consumed                              | None                                   | DELETE                       |
| `ui-perfection-loop.yaml`              | Dead; never consumed                              | None                                   | DELETE                       |

### Registry Entries with Status Issues

| Registry Key                             | Path                                    | Registry Status | Issue                                                           |
| ---------------------------------------- | --------------------------------------- | --------------- | --------------------------------------------------------------- |
| `artifact-lifecycle-management-workflow` | `core/skill-lifecycle.md`               | deprecated      | Still referenced by 5+ files; undeprecate or create replacement |
| `hook-consolidation-workflow`            | `operations/hook-consolidation.md`      | deprecated      | Stale content; archive or update                                |
| `schema-creator-workflow`                | `creators/schema-creator-workflow.yaml` | draft           | Has been active since Task #44 era; promote to active           |

---

## Disposition Matrix

| Finding                                      | File(s)                                                            | Disposition                                    | Priority |
| -------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------- | -------- |
| enterprise-workflow.md missing from registry | `core/enterprise-workflow.md`                                      | **REGISTER**                                   | **P0**   |
| 4 Task #44 workflows unregistered            | domain-development, code-review, product-management, documentation | **REGISTER**                                   | **P1**   |
| 11 dead root YAML stubs                      | ai-system-flow, bmad-greenfield, brownfield-fullstack, etc.        | **DELETE**                                     | **P1**   |
| feature-development-workflow.md duplicate    | `core/feature-development-workflow.md`                             | **DELETE** (keep enterprise/)                  | **P1**   |
| enterprise/code-review.yaml superseded       | `enterprise/code-review.yaml`                                      | **DELETE**                                     | **P2**   |
| enterprise/full-stack.yaml superseded        | `enterprise/full-stack.yaml`                                       | **DELETE**                                     | **P2**   |
| rapid/fix.yaml dead                          | `rapid/fix.yaml` (+ remove rapid/ dir)                             | **DELETE**                                     | **P2**   |
| party-mode-workflow.md phantom ref           | Reference in party-orchestrator.md:421                             | **FIX REF** (remove or create)                 | **P2**   |
| workspace-conventions.md phantom             | Listed as workflow in WORKFLOW_AGENT_MAP                           | **FIX DOC** (reclassify as rule, not workflow) | **P2**   |
| 3 auto-stub workflows                        | chrome-browser, progressive-disclosure, template-renderer          | **FLESH OUT or DELETE**                        | **P3**   |
| README.md stale                              | Missing Task #44 workflows and subdirs                             | **UPDATE**                                     | **P3**   |
| skill-lifecycle.md deprecated but referenced | `core/skill-lifecycle.md`                                          | **UNDEPRECATE or REPLACE**                     | **P3**   |
| hook-consolidation.md deprecated             | `operations/hook-consolidation.md`                                 | **ARCHIVE**                                    | **P3**   |
| schema-creator-workflow draft status         | `creators/schema-creator-workflow.yaml`                            | **PROMOTE to active**                          | **P3**   |

---

## Architecture Assessment

### Structural Health

The workflows system has a clear and logical directory structure:

```
workflows/
  core/         -- 8 files, system-level execution patterns (HEALTHY)
  enterprise/   -- 5 files, multi-team coordination (2 DEAD stubs)
  operations/   -- 3 files, production support (1 STALE)
  creators/     -- 6 files, artifact creation pipelines (HEALTHY)
  updaters/     -- 6 files, artifact update pipelines (HEALTHY)
  rapid/        -- 1 file (DEAD)
  *.md          -- 13 skill-specific workflows (3 AUTO-STUB)
  *.yaml        -- 11 DEAD BMAD stubs
  README.md     -- STALE
```

**Strengths:**

- Core workflows (`router-decision.md`, `enterprise-workflow.md`, `evolution-workflow.md`) are well-designed, heavily referenced, and form a coherent execution model
- Creator/updater YAML pipelines are complete (6 each for all artifact types) and wired through `workflow-cli.cjs`
- Skill-specific workflows at root level provide good domain coverage
- `@WORKFLOW_AGENT_MAP.md` provides excellent cross-referencing (though with 2 phantom entries)

**Weaknesses:**

- Registry drift: 17 files unregistered, including the critical `enterprise-workflow.md`
- Dead weight: 12+ dead files (all YAML stubs) contribute clutter
- No automated registry-file sync (no hook or CI check ensures registry matches disk)
- Feature-development-workflow duplication creates ambiguity for agents reading CLAUDE.md
- CLAUDE.md Section 8.6 reference to `feature-development-workflow.md` is ambiguous (does not specify core/ or enterprise/ path)

### Integration with Enterprise Orchestration

The enterprise orchestration system (`enterprise-workflow.md` + `post-completion-chain.cjs` + `quality-gates.cjs` + `workflow-state-manager.cjs`) is well-integrated:

- `post-completion-chain.cjs` (hook) drives phase advancement using `workflow-state.json`
- `quality-gates.cjs` (lib) evaluates gates between phases
- `phase-advance-reader.cjs` (lib) maps phases to agent types
- `complexity-classifier.cjs` (lib) determines phase skipping

However, the enterprise orchestration system does NOT read YAML workflow files directly. The YAML stubs at root level were apparently intended for a different execution engine that was never built or was superseded by the `.md`-based workflow system.

### Workflow Engine vs. Markdown Workflows

Two workflow paradigms coexist:

1. **Markdown workflows** (.md): Consumed by agents as instructions, referenced in agent files and docs, form the actual execution guidance. These are the production system.
2. **YAML workflows** (.yaml): Consumed by `workflow-cli.cjs` and `workflow-engine.cjs` for programmatic execution. The creator/updater YAMLs are active; the root-level stubs are dead.

This dual paradigm is architecturally reasonable but the dead YAML stubs create confusion about which paradigm is active.

---

## Recommendations

### P0 (Critical -- do immediately)

1. **Register `enterprise-workflow.md` in `workflow-registry.json`.** This is the second most important workflow in the system and its absence from the registry means automated tooling cannot discover it.

### P1 (High -- do this week)

2. **Register the 4 Task #44 workflows** (domain-development, code-review, product-management, documentation) in `workflow-registry.json`.
3. **Delete 11 dead root-level YAML stubs** (ai-system-flow, bmad-greenfield, brownfield-fullstack, code-quality-flow, enterprise-track, greenfield-fullstack, incident-flow, mobile-flow, performance-flow, quick-flow, ui-perfection-loop) and the `rapid/` directory.
4. **Delete `core/feature-development-workflow.md`** (redundant; enterprise/ version has 50+ consumers vs 3).
5. **Disambiguate CLAUDE.md Section 8.6** -- change `feature-development-workflow.md` to `enterprise/feature-development-workflow.md` for clarity.

### P2 (Medium -- do this sprint)

6. **Delete `enterprise/code-review.yaml` and `enterprise/full-stack.yaml`** (superseded by .md workflows).
7. **Fix phantom reference** in `party-orchestrator.md` line 421 (remove reference to non-existent `enterprise/party-mode-workflow.md` or create the file).
8. **Fix `@WORKFLOW_AGENT_MAP.md`** -- reclassify `workspace-conventions.md` from "Enterprise Workflow" to "Rule" (it lives in `.claude/rules/`, not `.claude/workflows/`).
9. **Add CI check or hook** to verify workflow-registry.json stays in sync with files on disk (prevent future drift).

### P3 (Low -- backlog)

10. **Flesh out or delete 3 auto-stub workflows** (chrome-browser, progressive-disclosure, template-renderer). They currently provide zero workflow guidance.
11. **Update `README.md`** to include Task #44 workflows and creators/updaters/rapid subdirectories.
12. **Review `core/skill-lifecycle.md` deprecation** -- either undeprecate (5+ consumers still active) or create a replacement and migrate consumers.
13. **Archive `operations/hook-consolidation.md`** (deprecated in registry, stale content).
14. **Promote `schema-creator-workflow.yaml`** from draft to active status in registry.

---

## Metrics Summary

| Category                   | Count  | Lines      | Health                              |
| -------------------------- | ------ | ---------- | ----------------------------------- |
| Core workflows             | 8      | 7,486      | GOOD (1 unregistered, 1 redundant)  |
| Enterprise workflows       | 5      | 1,748      | FAIR (2 dead stubs)                 |
| Operations workflows       | 3      | 791        | FAIR (1 stale/deprecated)           |
| Creator workflows          | 6      | 2,247      | GOOD                                |
| Updater workflows          | 6      | 2,242      | GOOD                                |
| Root-level skill workflows | 13     | 6,099      | FAIR (3 auto-stubs, 4 unregistered) |
| Root-level YAML stubs      | 11     | 176        | DEAD (all 11 unused)                |
| Rapid workflows            | 1      | 5          | DEAD                                |
| README                     | 1      | 150        | STALE                               |
| **TOTAL**                  | **54** | **20,944** | **54/100**                          |

**If dead files are removed:** 41 files, 20,582 lines, health score would rise to ~72/100.
**If registry is fixed and stale items updated:** health score would rise to ~85/100.

---

## Cross-Reference with Security Audit (Task #115)

The security audit (`.claude/context/reports/security/workflows-security-review-2026-02-07.md`) identified:

- **Security Score:** 62/100 (CONDITIONAL PASS)
- **5 HIGH findings:** Prompt injection (I-WF-001), state integrity (I-WF-002), env var bypass (I-WF-003), complexity downgrade (I-WF-004), self-reported quality gates (I-WF-005)
- **5 MEDIUM findings:** Including broken audit trail and string-based agent detection

The architecture audit confirms these findings align with the structural issues:

- Dead YAML stubs add surface area without value (potential confusion vector)
- Registry drift means automated security scanning would miss `enterprise-workflow.md`
- The dual .md/.yaml paradigm creates cognitive overhead for agents interpreting which workflows are authoritative

---

## Appendix: File-by-File Wiring Summary

### Consumer Reference Counts (Active Workflows Only)

| Workflow                                   | Agent Refs | Doc Refs | Hook/Lib Refs | Total |
| ------------------------------------------ | ---------- | -------- | ------------- | ----- |
| router-decision.md                         | 5+         | 10+      | 15+           | 30+   |
| enterprise/feature-development-workflow.md | 30+        | 5+       | 5+            | 50+   |
| evolution-workflow.md                      | 5+         | 5+       | 5+            | 15+   |
| reflection-workflow.md                     | 5+         | 3+       | 2+            | 10+   |
| enterprise-workflow.md                     | 3+         | 3+       | 4+            | 10+   |
| external-integration.md                    | 4+         | 2+       | 2+            | 8+    |
| domain-development-workflow.md             | 22+        | 1+       | 0             | 23+   |
| c4-architecture-workflow.md                | 5+         | 2+       | 1+            | 8+    |
| swarm-coordination-skill-workflow.md       | 4+         | 2+       | 0             | 6+    |
| architecture-review-skill-workflow.md      | 3+         | 2+       | 1+            | 6+    |
| security-architect-skill-workflow.md       | 3+         | 2+       | 1+            | 6+    |
| code-review-workflow.md                    | 2+         | 1+       | 0             | 4+    |

---

_End of audit report._
