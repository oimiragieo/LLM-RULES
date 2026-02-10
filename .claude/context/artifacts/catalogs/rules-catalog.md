<!-- Agent: technical-writer | Task: #14 | Session: 2026-02-09 -->

# Rules Catalog

**Last Updated:** 2026-02-09
**Total Rules:** 86
**Location:** `.claude/rules/`

This catalog documents all rules files in the agent-studio framework with their domains, related skills, and descriptions.

---

## Overview

Rules are quick-reference files (<100 lines) that provide actionable guidelines for agents. Each rule file maps to a corresponding skill (SKILL.md) which contains comprehensive documentation.

**Pattern:** Rules file (quick reference) + SKILL.md (full documentation)

---

## Quick Reference by Domain

| Domain         | Count | Key Rules                                                                                   |
| -------------- | ----- | ------------------------------------------------------------------------------------------- |
| Core Framework | 11    | agents, artifact-integration, code-standards, git-workflow, hooks, memory-protocol, testing |
| Development    | 11    | tdd, debugging, verification-before-completion, code-analyzer, code-quality-expert          |
| Security       | 10    | security, security-architect, auth-security-expert, static-analysis, variant-analysis       |
| Search         | 4     | ripgrep, code-semantic-search, code-structural-search, research-synthesis                   |
| Languages      | 9     | typescript, python, react, nodejs, go, java, php, web3, gamedev                             |
| Infrastructure | 8     | container, docker-compose, terraform, k8s, sentry-monitoring                                |
| Mobile         | 5     | ios, android, expo, tauri, mobile-first-design                                              |
| Planning       | 7     | plan-generator, complexity-assessment, prd-generator, spec-gathering, spec-init             |
| Creator Tools  | 7     | skill-creator, agent-creator, hook-creator, workflow-creator, schema-creator, template      |
| Data           | 3     | database, data-expert, text-to-sql                                                          |
| Context/Memory | 3     | context-driven-development, session-handoff, insight-extraction                             |
| Validation     | 3     | checklist-generator, response-rater, thinking-tools                                         |
| Other          | 5     | frontend, graphql, api-development, artifact-integrator, project-onboarding                 |

---

## Core Framework Rules (11 rules)

Essential framework operation rules.

### agents.md

**Domain:** Agent Routing
**Related Skill:** N/A (framework documentation)
**Description:** Agent routing guidelines, specialist-first law, intent classification, common misrouting patterns.

**Key Rules:**

- Developer is LAST RESORT (specialist-first law)
- Intent classification via semantic matching
- Router self-check gates (complexity, security, tool, creator)

---

### artifact-integration.md

**Domain:** Artifact Lifecycle
**Related Skill:** `artifact-integrator`
**Description:** Artifact integration verification, must-have integrations, AI-driven dependency graphs.

**Key Rules:**

- All artifacts need catalog/registry entries
- At least one consumer (agent/workflow/command)
- Use artifact-integrator skill for analysis

---

### code-standards.md

**Domain:** Code Quality
**Related Skill:** `code-quality-expert`
**Description:** Code organization, style, patterns, error handling, AI-generated code review.

**Key Rules:**

- Small cohesive files
- Immutability preferred
- Hybrid search commands (semantic, structural, file)
- Lint and format MANDATORY before commit

---

### git-workflow.md

**Domain:** Version Control
**Related Skill:** `git-expert`
**Description:** Commit guidelines, conventional commits, AI commit attribution, frequent commits as save points.

**Key Rules:**

- Conventional commits (feat/fix/refactor/docs/chore/test/perf)
- AI co-authorship attribution (MANDATORY)
- Commit every logical unit (not just at "done")
- Pre-commit: lint, format, test must pass

---

### hooks.md

**Domain:** Hook System
**Related Skill:** `hook-creator`
**Description:** Hook protocol, chain-of-responsibility, performance budget, hook organization.

**Key Rules:**

- Hooks never break tool pipeline
- Use stderr for logging, stdout for structured output
- Performance budget: <100ms target
- Hooks use stdin/stdout JSON protocol

---

### memory-protocol.md

**Domain:** Memory Management
**Related Skill:** N/A (framework protocol)
**Description:** Hierarchical memory tiers (HOT/WARM/COLD), memory budget, subsystem integration.

**Key Rules:**

- Read learnings.md before every task
- Write learnings/issues/decisions after completing
- HOT tier: <20KB per file, monthly rotation
- Use memory API, not direct file access

---

### performance.md

**Domain:** Performance
**Related Skill:** N/A (framework optimization)
**Description:** Hot path optimization, token budget, context management, semantic caching, RAG over long context.

**Key Rules:**

- Context window reality: reliable under 32K tokens
- Use compression at 80K tokens
- Semantic caching for similar prompts
- RAG for >100K token document corpus

---

### security.md

**Domain:** Security
**Related Skill:** `security-architect`
**Description:** OWASP Agentic AI Top 10, prompt injection defense, memory poisoning, tool use safety.

**Key Rules:**

- ASI01: Agent Goal Hijacking
- ASI02: Tool Misuse
- ASI06: Memory & Context Poisoning
- Principle of least privilege for tools

---

### task-tracking.md

**Domain:** Task Management
**Related Skill:** `task-management-protocol`
**Description:** Task synchronization, agent-to-agent coordination, conductor pattern, task metadata schema.

**Key Rules:**

- TaskUpdate(in_progress) → Work → TaskUpdate(completed) → TaskList()
- Use metadata for structure, description for prose
- Task metadata complements memory files

---

### testing.md

**Domain:** Testing
**Related Skill:** `tdd`
**Description:** TDD, test organization, code quality gates (BLOCKING), regression tests, TDG, property-based testing.

**Key Rules:**

- TDD: Red-Green-Refactor cycle
- Lint + format BLOCKING before completion
- Test at integration boundaries, not internal state
- Mutation testing for test quality

---

### workspace-conventions.md

**Domain:** File Placement
**Related Skill:** N/A (framework conventions)
**Description:** File placement rules, naming conventions, provenance headers, forbidden locations.

**Key Rules:**

- Reports: `.claude/context/reports/{domain}/`
- Research reports: `.claude/context/artifacts/research-reports/`
- Plans: `.claude/context/plans/`
- Naming: lowercase kebab-case + ISO date suffix
- Provenance headers MANDATORY

---

## Development Rules (11 rules)

Core development workflow rules.

| Rule Name                           | Skill                            | Purpose                                 |
| ----------------------------------- | -------------------------------- | --------------------------------------- |
| `tdd.md`                            | `tdd`                            | Test-Driven Development with Iron Laws  |
| `debugging.md`                      | `debugging`                      | Systematic 4-phase debugging            |
| `verification-before-completion.md` | `verification-before-completion` | Pre-completion gate function            |
| `code-analyzer.md`                  | `code-analyzer`                  | Static code analysis and metrics        |
| `code-quality-expert.md`            | `code-quality-expert`            | Clean code principles                   |
| `best-practices-guidelines.md`      | `best-practices-guidelines`      | Cross-cutting best practices            |
| `dry-principle.md`                  | `dry-principle`                  | Don't Repeat Yourself enforcement       |
| `ripgrep.md`                        | `ripgrep`                        | Enhanced code search                    |
| `code-semantic-search.md`           | `code-semantic-search`           | Semantic code search                    |
| `code-structural-search.md`         | `code-structural-search`         | AST-based pattern matching              |
| `code-style-validator.md`           | `code-style-validator`           | Programmatic AST-based style validation |

---

## Security Rules (10 rules)

Security analysis and validation rules.

| Rule Name                 | Skill                  | Purpose                              |
| ------------------------- | ---------------------- | ------------------------------------ |
| `security.md`             | N/A                    | OWASP Top 10, Agentic AI Top 10      |
| `security-architect.md`   | `security-architect`   | OWASP, STRIDE, threat modeling       |
| `auth-security-expert.md` | `auth-security-expert` | OAuth 2.1, JWT, encryption           |
| `static-analysis.md`      | `static-analysis`      | Static code analysis for security    |
| `variant-analysis.md`     | `variant-analysis`     | Variant analysis for vulnerabilities |
| `differential-review.md`  | `differential-review`  | Differential code review             |
| `semgrep-rule-creator.md` | `semgrep-rule-creator` | Semgrep rule creation                |
| `insecure-defaults.md`    | `insecure-defaults`    | Insecure defaults detection          |

---

## Search Rules (4 rules)

Code search and discovery rules.

| Rule Name                   | Skill                    | Purpose                                  |
| --------------------------- | ------------------------ | ---------------------------------------- |
| `ripgrep.md`                | `ripgrep`                | PCRE2 regex text search                  |
| `code-semantic-search.md`   | `code-semantic-search`   | Semantic code search (vectors + BM25)    |
| `code-structural-search.md` | `code-structural-search` | AST-based structural search              |
| `research-synthesis.md`     | `research-synthesis`     | Research synthesis for artifact creation |

---

## Language Rules (9 rules)

Language-specific expertise rules.

| Rule Name                  | Skill                   | Purpose                                 |
| -------------------------- | ----------------------- | --------------------------------------- |
| `typescript-expert.md`     | `typescript-expert`     | TypeScript patterns                     |
| `python-backend-expert.md` | `python-backend-expert` | Python backend (Django, FastAPI, Flask) |
| `react-expert.md`          | `react-expert`          | React hooks, state management           |
| `nodejs-expert.md`         | `nodejs-expert`         | Node.js, Express, NestJS                |
| `go-expert.md`             | `go-expert`             | Go APIs, gRPC, concurrency              |
| `java-expert.md`           | `java-expert`           | Java and Spring Boot                    |
| `php-expert.md`            | `php-expert`            | PHP, Laravel, WordPress                 |
| `web3-expert.md`           | `web3-expert`           | Solidity, Ethereum, smart contracts     |
| `gamedev-expert.md`        | `gamedev-expert`        | Game development                        |

---

## Infrastructure Rules (8 rules)

DevOps and infrastructure rules.

| Rule Name                       | Skill                        | Purpose                        |
| ------------------------------- | ---------------------------- | ------------------------------ |
| `container-expert.md`           | `container-expert`           | Docker, Kubernetes, Helm       |
| `docker-compose.md`             | `docker-compose`             | Docker Compose orchestration   |
| `terraform-infra.md`            | `terraform-infra`            | Terraform with safety controls |
| `k8s-manifest-generator.md`     | `k8s-manifest-generator`     | Production-ready K8s manifests |
| `sentry-monitoring.md`          | `sentry-monitoring`          | Error tracking and monitoring  |
| `incident-runbook-templates.md` | `incident-runbook-templates` | Incident response runbooks     |
| `postmortem-writing.md`         | `postmortem-writing`         | Blameless postmortem writing   |

---

## Mobile Rules (5 rules)

Mobile development rules.

| Rule Name                         | Skill                          | Purpose                                  |
| --------------------------------- | ------------------------------ | ---------------------------------------- |
| `ios-expert.md`                   | `ios-expert`                   | SwiftUI, UIKit, Apple frameworks         |
| `android-expert.md`               | `android-expert`               | Jetpack Compose, Kotlin, Material Design |
| `expo-framework-rule.md`          | `expo-framework-rule`          | Expo framework patterns                  |
| `tauri-native-api-integration.md` | `tauri-native-api-integration` | Tauri native APIs                        |
| `mobile-first-design-rules.md`    | `mobile-first-design-rules`    | Mobile-first design patterns             |

---

## Planning Rules (7 rules)

Design and planning rules.

| Rule Name                               | Skill                                | Purpose                                 |
| --------------------------------------- | ------------------------------------ | --------------------------------------- |
| `plan-generator.md`                     | `plan-generator`                     | Implementation plans with dependencies  |
| `complexity-assessment.md`              | `complexity-assessment`              | AI-based task complexity classification |
| `prd-generator.md`                      | `prd-generator`                      | Hypothesis-driven PRDs                  |
| `spec-gathering.md`                     | `spec-gathering`                     | Requirements gathering workflow         |
| `spec-init.md`                          | `spec-init`                          | Unified spec creation process           |
| `interactive-requirements-gathering.md` | `interactive-requirements-gathering` | A/B/C/D/E questionnaire framework       |
| `planning-with-files.md`                | `planning-with-files`                | Manus-style file-based planning         |

---

## Creator Tools Rules (7 rules)

Framework artifact creators.

| Rule Name                | Skill                 | Purpose                        |
| ------------------------ | --------------------- | ------------------------------ |
| `skill-creator.md`       | `skill-creator`       | Create and validate skills     |
| `agent-creator.md`       | `agent-creator`       | Create specialized AI agents   |
| `hook-creator.md`        | `hook-creator`        | Create framework hooks         |
| `workflow-creator.md`    | `workflow-creator`    | Create orchestration workflows |
| `schema-creator.md`      | `schema-creator`      | Create JSON Schema validators  |
| `template-creator.md`    | `template-creator`    | Create templates               |
| `artifact-integrator.md` | `artifact-integrator` | Deep integration analysis      |

---

## Data Rules (3 rules)

Data processing and database rules.

| Rule Name            | Skill             | Purpose                                  |
| -------------------- | ----------------- | ---------------------------------------- |
| `database-expert.md` | `database-expert` | Prisma, Supabase, SQL/NoSQL patterns     |
| `data-expert.md`     | `data-expert`     | Data parsing, transformation, validation |
| `text-to-sql.md`     | `text-to-sql`     | Natural language to SQL conversion       |

---

## Context/Memory Rules (3 rules)

Context and memory management rules.

| Rule Name                       | Skill                        | Purpose                      |
| ------------------------------- | ---------------------------- | ---------------------------- |
| `context-driven-development.md` | `context-driven-development` | Context as managed artifacts |
| `session-handoff.md`            | `session-handoff`            | Handoff document creation    |
| `insight-extraction.md`         | `insight-extraction`         | Extract session learnings    |

---

## Validation Rules (3 rules)

Quality validation rules.

| Rule Name                | Skill                 | Purpose                           |
| ------------------------ | --------------------- | --------------------------------- |
| `checklist-generator.md` | `checklist-generator` | IEEE 1028 + contextual checklists |
| `response-rater.md`      | `response-rater`      | Plan and response quality audits  |
| `thinking-tools.md`      | `thinking-tools`      | Self-reflection patterns          |

---

## Other Rules (5 rules)

Miscellaneous specialized rules.

| Rule Name                   | Skill                    | Purpose                              |
| --------------------------- | ------------------------ | ------------------------------------ |
| `frontend-expert.md`        | `frontend-expert`        | UI/UX patterns, responsive design    |
| `graphql-expert.md`         | `graphql-expert`         | GraphQL schema, Apollo Client/Server |
| `api-development-expert.md` | `api-development-expert` | API design patterns                  |
| `artifact-integrator.md`    | `artifact-integrator`    | Artifact integration analysis        |
| `project-onboarding.md`     | `project-onboarding`     | New codebase onboarding              |

---

## Usage Guidelines

### For Agents

**Finding Rules:**

- Search this catalog by domain or purpose
- Rules are quick reference (<100 lines)
- For full documentation, consult corresponding SKILL.md

**Reading Rules:**

- Rules provide actionable guidelines (do/don't)
- Includes related skills, anti-patterns, best practices
- Cross-references to related rules and workflows

### For Developers

**Creating New Rules:**

1. Use `rule-creator` skill (NOT direct writes)
2. Keep under 100 lines (actionable guidelines only)
3. Link to corresponding SKILL.md for full documentation
4. Update this catalog after creation

**Rule Structure:**

```markdown
# {Skill Name} Rules

## Core Rules

- Rule 1
- Rule 2

## When to Use / Best Practices

- Usage patterns
- Examples

## Anti-Patterns

- What not to do

## Related Skills

- Links to complementary skills

## Related References

- Link to SKILL.md
- Related rules/workflows
```

---

## Related Documentation

- **Skill Catalog:** `.claude/context/artifacts/catalogs/skill-catalog.md`
- **Command Catalog:** `.claude/context/artifacts/catalogs/command-catalog.md`
- **Agent Routing:** `.claude/docs/@AGENT_ROUTING_TABLE.md`
- **CLAUDE.md:** `.claude/CLAUDE.md`

---

**End of Catalog**
