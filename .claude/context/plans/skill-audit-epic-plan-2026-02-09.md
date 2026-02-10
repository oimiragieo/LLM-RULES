<!-- Agent: planner | Task: #epic-skill-audit | Session: 2026-02-09 -->

# EPIC Plan: Framework Skill Audit & Enhancement

## Executive Summary

Systematic audit of all 93 active skills in the Claude Code Enterprise Framework. For each skill, verify that all companion artifact types (rule, command, schema, agent assignment) exist, identify gaps, then research and create missing artifacts using proper creator skills. This plan also covers the reverse audit: ensuring all rules, schemas, commands, agents, workflows, templates, tools, and hooks are accounted for.

**Scope**: 93 skills x 4 artifact types = 372 artifact checks minimum
**Estimated effort**: 18-24 waves of 5 skills each, ~45 hours total
**Priority**: Skills with most missing artifacts processed first

---

## Inventory Summary (2026-02-09)

| Artifact Type                         | Total On-Disk | Notes                                                  |
| ------------------------------------- | ------------- | ------------------------------------------------------ |
| Skills (SKILL.md)                     | 93            | Active directories under `.claude/skills/`             |
| Rules (.claude/rules/\*.md)           | 95            | 93 skill-matched + 7 generic (security, testing, etc.) |
| Commands (.claude/commands/\*.md)     | 93            | Thin-delegation slash commands                         |
| Schemas (skill-\*-output.schema.json) | 78            | Output validation schemas                              |
| Agent assignments                     | 59 agents     | Skills listed in agent-registry.json                   |

---

## Artifact Coverage Matrix

### Legend

- Y = Exists on disk
- **N** = Missing (GAP)
- n/a = Not applicable for this skill type

### Priority 1: Skills Missing Schemas (15 skills)

These skills have SKILL.md + rule + command but NO output schema.

| #   | Skill Name                   | SKILL.md | Rule | Command  | Schema | Agent Assigned    | Gaps                  |
| --- | ---------------------------- | -------- | ---- | -------- | ------ | ----------------- | --------------------- |
| 1   | `research-synthesis`         | Y        | Y    | --       | **N**  | all creators      | schema, command       |
| 2   | `context-compressor`         | Y        | --   | compress | **N**  | all agents        | schema, rule          |
| 3   | `context-driven-development` | Y        | Y    | Y        | Y      | all agents        | --                    |
| 4   | `task-management-protocol`   | Y        | --   | --       | **N**  | all agents        | schema, rule, command |
| 5   | `on-call-handoff-patterns`   | Y        | --   | --       | **N**  | devops            | schema, rule, command |
| 6   | `database-architect`         | Y        | --   | --       | **N**  | architect         | schema, rule, command |
| 7   | `debugging`                  | Y        | Y    | Y        | Y      | developer         | --                    |
| 8   | `accessibility`              | Y        | --   | --       | **N**  | frontend-expert   | schema, rule, command |
| 9   | `doc-generator`              | Y        | Y    | Y        | **N**  | technical-writer  | schema                |
| 10  | `writing-skills`             | Y        | Y    | Y        | **N**  | technical-writer  | schema                |
| 11  | `readme`                     | Y        | Y    | Y        | **N**  | technical-writer  | schema                |
| 12  | `summarize-changes`          | Y        | Y    | Y        | **N**  | developer         | schema                |
| 13  | `git-expert`                 | Y        | Y    | Y        | **N**  | developer, devops | schema                |
| 14  | `scientific-skills`          | Y        | Y    | Y        | **N**  | researcher        | schema                |
| 15  | `ai-ml-expert`               | Y        | Y    | Y        | **N**  | ai-ml-pro         | schema                |

### Priority 2: Skills Missing Multiple Artifacts (5 skills, 3+ gaps)

| #   | Skill Name                 | SKILL.md | Rule  | Command | Schema | Agent | Gaps Count |
| --- | -------------------------- | -------- | ----- | ------- | ------ | ----- | ---------- |
| 1   | `task-management-protocol` | Y        | **N** | **N**   | **N**  | Y     | 3          |
| 2   | `on-call-handoff-patterns` | Y        | **N** | **N**   | **N**  | Y     | 3          |
| 3   | `database-architect`       | Y        | **N** | **N**   | **N**  | Y     | 3          |
| 4   | `accessibility`            | Y        | **N** | **N**   | **N**  | Y     | 3          |
| 5   | `research-synthesis`       | Y        | Y     | **N**   | **N**  | Y     | 2          |

### Priority 3: Skills Missing Command Only

| #   | Skill Name                  | Rule | Schema | Command Missing |
| --- | --------------------------- | ---- | ------ | --------------- |
| 1   | `research-synthesis`        | Y    | N      | **N**           |
| 2   | `best-practices-guidelines` | Y    | Y      | **N**           |
| 3   | `artifact-updater`          | --   | --     | **N**           |
| 4   | `command-creator`           | --   | --     | **N**           |
| 5   | `rule-creator`              | --   | --     | **N**           |
| 6   | `tool-creator`              | --   | --     | **N**           |

### Full Coverage Matrix (All 93 Skills)

**Key**: Y=exists, N=missing, ~=partial/generic

| Skill                                | Rule  | Command     | Schema | Notes               |
| ------------------------------------ | ----- | ----------- | ------ | ------------------- |
| `accessibility`                      | **N** | **N**       | **N**  | P1: 3 gaps          |
| `advanced-elicitation`               | Y     | Y           | Y      | Complete            |
| `agent-creator`                      | Y     | Y           | Y      | Complete            |
| `ai-ml-expert`                       | Y     | Y           | **N**  | P1: schema          |
| `android-expert`                     | Y     | Y           | Y      | Complete            |
| `api-development-expert`             | Y     | Y           | Y      | Complete            |
| `architecture-review`                | Y     | Y           | Y      | Complete            |
| `artifact-integrator`                | Y     | Y           | Y      | Complete            |
| `auth-security-expert`               | Y     | Y           | Y      | Complete            |
| `best-practices-guidelines`          | Y     | **N**       | Y      | P3: command         |
| `binary-analysis-patterns`           | Y     | Y           | **N**  | P1: schema          |
| `checklist-generator`                | Y     | Y           | Y      | Complete            |
| `code-analyzer`                      | Y     | Y           | Y      | Complete            |
| `code-quality-expert`                | Y     | Y           | Y      | Complete            |
| `code-semantic-search`               | Y     | Y           | Y      | Complete            |
| `code-structural-search`             | Y     | Y           | Y      | Complete            |
| `code-style-validator`               | Y     | Y           | Y      | Complete            |
| `complexity-assessment`              | Y     | Y           | Y      | Complete            |
| `consensus-voting`                   | Y     | Y           | **N**  | P1: schema          |
| `container-expert`                   | Y     | Y           | Y      | Complete            |
| `context-compressor`                 | **N** | Y(compress) | **N**  | P2: rule, schema    |
| `context-driven-development`         | Y     | Y           | Y      | Complete            |
| `data-expert`                        | Y     | Y           | Y      | Complete            |
| `database-architect`                 | **N** | **N**       | **N**  | P1: 3 gaps          |
| `database-expert`                    | Y     | Y           | Y      | Complete            |
| `debugging`                          | Y     | Y           | Y      | Complete            |
| `diagram-generator`                  | Y     | Y           | Y      | Complete            |
| `differential-review`                | Y     | Y           | Y      | Complete            |
| `doc-generator`                      | Y     | Y           | **N**  | P1: schema          |
| `docker-compose`                     | Y     | Y           | Y      | Complete            |
| `dry-principle`                      | Y     | **N**       | Y      | P3: command         |
| `expo-framework-rule`                | Y     | Y           | Y      | Complete            |
| `frontend-expert`                    | Y     | Y           | Y      | Complete            |
| `gamedev-expert`                     | Y     | Y           | Y      | Complete            |
| `git-expert`                         | Y     | Y           | **N**  | P1: schema          |
| `go-expert`                          | Y     | Y           | Y      | Complete            |
| `graphql-expert`                     | Y     | Y           | Y      | Complete            |
| `hook-creator`                       | Y     | Y           | Y      | Complete            |
| `incident-runbook-templates`         | Y     | Y           | Y      | Complete            |
| `insecure-defaults`                  | Y     | Y           | Y      | Complete            |
| `insight-extraction`                 | Y     | Y           | Y      | Complete            |
| `interactive-requirements-gathering` | Y     | Y           | Y      | Complete            |
| `ios-expert`                         | Y     | Y           | Y      | Complete            |
| `java-expert`                        | Y     | Y           | Y      | Complete            |
| `k8s-manifest-generator`             | Y     | Y           | Y      | Complete            |
| `memory-forensics`                   | Y     | Y           | **N**  | P1: schema          |
| `mobile-first-design-rules`          | Y     | Y           | Y      | Complete            |
| `nextjs-expert`                      | Y     | Y           | Y      | Complete            |
| `nodejs-expert`                      | Y     | Y           | Y      | Complete            |
| `on-call-handoff-patterns`           | **N** | **N**       | **N**  | P1: 3 gaps          |
| `php-expert`                         | Y     | Y           | Y      | Complete            |
| `plan-generator`                     | Y     | Y           | Y      | Complete            |
| `planning-with-files`                | Y     | Y           | Y      | Complete            |
| `postmortem-writing`                 | Y     | Y           | Y      | Complete            |
| `prd-generator`                      | Y     | Y           | Y      | Complete            |
| `project-onboarding`                 | Y     | Y           | Y      | Complete            |
| `protocol-reverse-engineering`       | Y     | Y           | **N**  | P1: schema          |
| `python-backend-expert`              | Y     | Y           | Y      | Complete            |
| `react-expert`                       | Y     | Y           | Y      | Complete            |
| `readme`                             | Y     | Y           | **N**  | P1: schema          |
| `research-synthesis`                 | Y     | **N**       | **N**  | P2: command, schema |
| `response-rater`                     | Y     | Y           | Y      | Complete            |
| `ripgrep`                            | Y     | **N**       | Y      | P3: command(rg)     |
| `schema-creator`                     | Y     | Y           | Y      | Complete            |
| `scientific-skills`                  | Y     | Y           | **N**  | P1: schema          |
| `security-architect`                 | Y     | Y           | Y      | Complete            |
| `semgrep-rule-creator`               | Y     | Y           | Y      | Complete            |
| `sentry-monitoring`                  | Y     | Y           | Y      | Complete            |
| `sequential-thinking`                | Y     | Y           | Y      | Complete            |
| `session-handoff`                    | Y     | Y           | Y      | Complete            |
| `skill-creator`                      | Y     | Y           | Y      | Complete            |
| `sparc-methodology`                  | Y     | Y           | Y      | Complete            |
| `spec-gathering`                     | Y     | Y           | Y      | Complete            |
| `spec-init`                          | Y     | Y           | Y      | Complete            |
| `static-analysis`                    | Y     | Y           | Y      | Complete            |
| `summarize-changes`                  | Y     | Y           | **N**  | P1: schema          |
| `svelte-expert`                      | Y     | Y           | Y      | Complete            |
| `swarm-coordination`                 | Y     | Y           | **N**  | P1: schema          |
| `task-management-protocol`           | **N** | **N**       | **N**  | P1: 3 gaps          |
| `tauri-native-api-integration`       | Y     | Y           | Y      | Complete            |
| `tdd`                                | Y     | Y           | Y      | Complete            |
| `template-creator`                   | Y     | Y           | Y      | Complete            |
| `terraform-infra`                    | Y     | Y           | Y      | Complete            |
| `test-generator`                     | Y     | Y           | Y      | Complete            |
| `text-to-sql`                        | Y     | Y           | Y      | Complete            |
| `thinking-tools`                     | Y     | Y           | Y      | Complete            |
| `track-management`                   | Y     | Y           | Y      | Complete            |
| `typescript-expert`                  | Y     | Y           | Y      | Complete            |
| `variant-analysis`                   | Y     | Y           | Y      | Complete            |
| `verification-before-completion`     | Y     | Y           | Y      | Complete            |
| `web3-expert`                        | Y     | Y           | Y      | Complete            |
| `workflow-creator`                   | Y     | Y           | Y      | Complete            |
| `workflow-patterns`                  | Y     | Y           | Y      | Complete            |
| `writing-skills`                     | Y     | Y           | **N**  | P1: schema          |

### Coverage Summary

| Artifact Type  | Exists | Missing | Coverage % |
| -------------- | ------ | ------- | ---------- |
| Rules          | 88     | 5       | 94.6%      |
| Commands       | 87     | 6       | 93.5%      |
| Schemas        | 78     | 15      | 83.9%      |
| **Total Gaps** | --     | **26**  | --         |

### Gap Breakdown

**Missing Rules (5):**

1. `accessibility`
2. `context-compressor`
3. `database-architect`
4. `on-call-handoff-patterns`
5. `task-management-protocol`

**Missing Commands (6):**

1. `accessibility`
2. `best-practices-guidelines`
3. `database-architect`
4. `dry-principle`
5. `on-call-handoff-patterns`
6. `research-synthesis`
7. `task-management-protocol`

**Missing Schemas (15):**

1. `accessibility`
2. `ai-ml-expert`
3. `binary-analysis-patterns`
4. `consensus-voting`
5. `context-compressor`
6. `database-architect`
7. `doc-generator`
8. `git-expert`
9. `memory-forensics`
10. `on-call-handoff-patterns`
11. `protocol-reverse-engineering`
12. `readme`
13. `research-synthesis`
14. `scientific-skills`
15. `summarize-changes`
16. `swarm-coordination`
17. `task-management-protocol`
18. `writing-skills`

---

## Execution Plan

### Wave Structure

Each wave processes 3-5 skills. Per skill, the wave agent:

1. **Research** domain best practices (invoke `research-synthesis`)
2. **Audit** existing SKILL.md quality (enhance if needed)
3. **Create missing artifacts** via proper creator skills
4. **Verify** integration via `artifact-integrator`

**Agent model**: sonnet (standard artifact creation), opus (complex research)
**Parallelism**: Max 2 agents per wave (context overflow prevention)

---

### Wave 1: Critical Gaps (3+ missing artifacts per skill)

**Priority**: CRITICAL | **Skills**: 5 | **Est. Time**: 3 hours
**Target Agent**: `developer` (with creator skills)

| Skill                      | Create Rule | Create Command | Create Schema |
| -------------------------- | ----------- | -------------- | ------------- |
| `accessibility`            | Y           | Y              | Y             |
| `database-architect`       | Y           | Y              | Y             |
| `on-call-handoff-patterns` | Y           | Y              | Y             |
| `task-management-protocol` | Y           | Y              | Y             |
| `context-compressor`       | Y           | --             | Y             |

**Tasks**:

- Task 1.1: Research + create 5 rules via `rule-creator`
- Task 1.2: Research + create 5 commands via `command-creator`
- Task 1.3: Research + create 5 schemas via `schema-creator`
- Task 1.4: Verify integration via `artifact-integrator`

**Recommended Skills**: `research-synthesis`, `rule-creator`, `command-creator`, `schema-creator`, `artifact-integrator`
**Target Agent**: `developer` (artifact creation)

---

### Wave 2: Missing Schemas Batch A (5 skills)

**Priority**: HIGH | **Skills**: 5 | **Est. Time**: 2 hours

| Skill               | Create Schema |
| ------------------- | ------------- |
| `doc-generator`     | Y             |
| `writing-skills`    | Y             |
| `readme`            | Y             |
| `summarize-changes` | Y             |
| `git-expert`        | Y             |

**Tasks**:

- Task 2.1: Research output formats for each skill
- Task 2.2: Create 5 schemas via `schema-creator`
- Task 2.3: Verify schemas validate correctly

**Target Agent**: `developer`
**Recommended Skills**: `research-synthesis`, `schema-creator`

---

### Wave 3: Missing Schemas Batch B (5 skills)

**Priority**: HIGH | **Skills**: 5 | **Est. Time**: 2 hours

| Skill                          | Create Schema |
| ------------------------------ | ------------- |
| `ai-ml-expert`                 | Y             |
| `scientific-skills`            | Y             |
| `binary-analysis-patterns`     | Y             |
| `memory-forensics`             | Y             |
| `protocol-reverse-engineering` | Y             |

**Target Agent**: `developer`
**Recommended Skills**: `research-synthesis`, `schema-creator`

---

### Wave 4: Missing Schemas Batch C + Commands (5 skills)

**Priority**: HIGH | **Skills**: 5 | **Est. Time**: 2 hours

| Skill                       | Create Schema | Create Command |
| --------------------------- | ------------- | -------------- |
| `consensus-voting`          | Y             | --             |
| `swarm-coordination`        | Y             | --             |
| `research-synthesis`        | Y             | Y              |
| `best-practices-guidelines` | --            | Y              |
| `dry-principle`             | --            | Y              |

**Target Agent**: `developer`
**Recommended Skills**: `research-synthesis`, `schema-creator`, `command-creator`

---

### Wave 5-8: SKILL.md Quality Enhancement (All 93 skills)

**Priority**: MEDIUM | **Skills**: 93 (batches of 12) | **Est. Time**: 8 hours

For each skill, review SKILL.md for:

- Completeness (all sections: identity, capabilities, instructions, examples, best_practices, memory protocol)
- Enterprise-grade depth (not just stubs)
- Integration points documented
- Agent assignments current

**Process per batch**:

1. Read 12 SKILL.md files
2. Score each 1-10 on completeness
3. Enhance any scoring < 7
4. Update skill catalog if changes made

**Target Agent**: `technical-writer`
**Recommended Skills**: `research-synthesis`, `writing-skills`, `artifact-updater`

---

### Wave 9-12: Rules Quality Enhancement (All 95 rules)

**Priority**: MEDIUM | **Skills**: 95 (batches of 24) | **Est. Time**: 6 hours

For each rule, review for:

- Depth (not just stub references)
- Anti-patterns documented
- Integration points listed
- Related skills/agents cross-referenced

**Target Agent**: `technical-writer`
**Recommended Skills**: `research-synthesis`, `writing-skills`, `artifact-updater`

---

### Wave 13-14: Schema Standardization Audit

**Priority**: MEDIUM | **Schemas**: 78 existing | **Est. Time**: 3 hours

Verify all schemas:

- Follow JSON Schema Draft 2020-12
- Have `$id`, `title`, `description`
- Have `additionalProperties: false`
- Are registered in schema-catalog.md

**Target Agent**: `developer`
**Recommended Skills**: `schema-creator`, `artifact-integrator`

---

### Wave 15: Command Standardization Audit

**Priority**: LOW | **Commands**: 93 | **Est. Time**: 2 hours

Verify all commands:

- Use thin delegation pattern
- Have `disable-model-invocation: true`
- Point to correct skill name
- Are registered in command-catalog.md

**Target Agent**: `developer`
**Recommended Skills**: `artifact-integrator`

---

### Wave 16: Agent Assignment Audit

**Priority**: MEDIUM | **Agents**: 59 | **Est. Time**: 3 hours

For each agent:

- Verify skills array matches agent file frontmatter
- Verify routing keywords in routing-table.cjs
- Verify agent-registry.json is current
- Identify unassigned skills

**Target Agent**: `architect`
**Recommended Skills**: `artifact-integrator`, `architecture-review`

---

### Wave 17: Workflow/Template/Tool/Hook Cross-Audit

**Priority**: LOW | **Est. Time**: 3 hours

Check all skills for applicable:

- Workflows (do any skills need dedicated workflows?)
- Templates (do any skills need templates?)
- Tools (do any skills need CLI tools?)
- Hooks (do any skills need enforcement hooks?)

**Target Agent**: `architect`
**Recommended Skills**: `architecture-review`, `artifact-integrator`

---

### Wave FINAL: Evolution & Reflection Check

**Priority**: MANDATORY | **Est. Time**: 1 hour

**Tasks**:

1. Spawn reflection-agent to analyze completed audit
2. Extract learnings and update memory files
3. Check for evolution opportunities (new agents/skills needed)
4. Update skill-catalog.md with final coverage percentages

**Target Agent**: `reflection-agent`
**Recommended Skills**: `insight-extraction`, `session-handoff`

---

## Risks

| Risk                            | Impact | Mitigation                              | Rollback              |
| ------------------------------- | ------ | --------------------------------------- | --------------------- |
| Context overflow with 93 skills | HIGH   | Max 2 agents parallel, write to files   | Sequential waves      |
| Schema creation quality         | MEDIUM | Use schema-creator with research        | Review + validate     |
| Creator guard blocks writes     | LOW    | Proper creator skill invocation         | CREATOR_GUARD=warn    |
| Stale agent-registry.json       | MEDIUM | Re-run registry generator after changes | git revert            |
| Session timeout mid-wave        | HIGH   | Commit after each wave, session-handoff | Resume from last wave |

## Timeline Summary

| Wave      | Focus                             | Skills | Est. Time | Target Agent     |
| --------- | --------------------------------- | ------ | --------- | ---------------- |
| 1         | Critical gaps (3+ missing)        | 5      | 3h        | developer        |
| 2         | Missing schemas A                 | 5      | 2h        | developer        |
| 3         | Missing schemas B                 | 5      | 2h        | developer        |
| 4         | Missing schemas C + commands      | 5      | 2h        | developer        |
| 5-8       | SKILL.md quality enhancement      | 93     | 8h        | technical-writer |
| 9-12      | Rules quality enhancement         | 95     | 6h        | technical-writer |
| 13-14     | Schema standardization            | 78     | 3h        | developer        |
| 15        | Command standardization           | 93     | 2h        | developer        |
| 16        | Agent assignment audit            | 59     | 3h        | architect        |
| 17        | Workflow/template/tool/hook audit | all    | 3h        | architect        |
| FINAL     | Reflection & evolution            | --     | 1h        | reflection-agent |
| **TOTAL** |                                   |        | **~35h**  |                  |

## Commit Checkpoint Pattern

**Files modified**: 26+ new artifacts + 93 potentially enhanced SKILL.md files = 119+ files

**Checkpoints**:

- After Wave 1: `checkpoint: Wave 1 critical gaps filled (5 skills, 15 artifacts)`
- After Wave 4: `checkpoint: All schema/command gaps filled (26 artifacts)`
- After Wave 8: `checkpoint: SKILL.md quality enhancement complete`
- After Wave 12: `checkpoint: Rules quality enhancement complete`
- After Wave 17: `checkpoint: Full cross-audit complete`

## Success Criteria

1. **Zero missing artifacts**: Every skill has rule + command + schema
2. **100% catalog accuracy**: skill-catalog.md matches on-disk reality
3. **Agent coverage**: Every skill assigned to at least 1 agent
4. **Schema compliance**: All schemas follow Draft 2020-12 + Structure B
5. **Quality bar**: All SKILL.md files score >= 7/10 on completeness

---

## How to Execute This Plan

For each wave, the Router should spawn the designated agent with:

```
You are the {TARGET AGENT}. Your task is Wave {N} of the EPIC Skill Audit.

Read the plan at: .claude/context/plans/skill-audit-epic-plan-2026-02-09.md

Execute Wave {N} tasks:
1. For each skill listed, invoke Skill({ skill: 'research-synthesis' }) first
2. Then invoke the appropriate creator skill for each missing artifact
3. After all artifacts created, invoke Skill({ skill: 'artifact-integrator' })
4. Write a brief wave completion report to .claude/context/reports/
5. Return ONLY: report file path + 5-bullet summary (max 500 chars)

Max 2 skills in parallel. Commit after wave completion.
```

**Model selection**: sonnet for Waves 2-4, 13-15; opus for Wave 1, 5-12, 16-17
