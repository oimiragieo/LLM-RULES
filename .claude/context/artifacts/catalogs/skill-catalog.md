# Skill Catalog

> **Total Skills: 94** (1 deprecated alias) | Last Updated: 2026-02-08

This catalog indexes all active skills in the Claude Code Enterprise Framework.

**Post-Cleanup Summary:**

- **Active Skills:** 92 (maintained and invoked)
- **Deprecated Aliases:** 1 (`testing-expert` → `tdd`)
- **Scientific Parent:** 1 (`scientific-skills` with 139 sub-skills)
- **Archived:** 214 dead skills → `.claude/skills/_archive/dead/` (see README)

---

## Quick Reference by Category

| Category                                           | Count | Key Skills                                                                                                                                                                                             |
| -------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Core Development](#core-development)              | 11    | tdd, debugging, ripgrep, code-quality-expert, code-analyzer                                                                                                                                            |
| [Planning & Architecture](#planning--architecture) | 8     | plan-generator, architecture-review, complexity-assessment, diagram-generator                                                                                                                          |
| [Security](#security)                              | 6     | security-architect, auth-security-expert, binary-analysis-patterns, memory-forensics                                                                                                                   |
| [DevOps & Infrastructure](#devops--infrastructure) | 6     | docker-compose, terraform-infra, k8s-manifest-generator, sentry-monitoring                                                                                                                             |
| [Languages](#languages)                            | 7     | python-backend-expert, typescript-expert, go-expert, nodejs-expert, java-expert                                                                                                                        |
| [Frameworks](#frameworks)                          | 6     | react-expert, nextjs-expert, svelte-expert, graphql-expert                                                                                                                                             |
| [Mobile](#mobile)                                  | 5     | ios-expert, android-expert, expo-framework-rule, tauri-native-api-integration, mobile-first-design-rules                                                                                               |
| [Data & Database](#data--database)                 | 4     | database-architect, database-expert, data-expert, text-to-sql                                                                                                                                          |
| [Documentation](#documentation)                    | 4     | doc-generator, writing-skills, readme, gamedev-expert                                                                                                                                                  |
| [Git & Version Control](#git--version-control)     | 1     | git-expert                                                                                                                                                                                             |
| [Code Style & Linting](#code-style--linting)       | 2     | code-style-validator, dry-principle                                                                                                                                                                    |
| [Creator Tools](#creator-tools)                    | 12    | research-synthesis, agent-creator, skill-creator, hook-creator, workflow-creator, template-creator, schema-creator, artifact-integrator, artifact-updater, command-creator, rule-creator, tool-creator |
| [Memory & Context](#memory--context)               | 6     | context-compressor, session-handoff, task-management-protocol, context-driven-development, insight-extraction, track-management                                                                        |
| [Validation & Quality](#validation--quality)       | 5     | verification-before-completion, checklist-generator, response-rater, test-generator, accessibility                                                                                                     |
| [Specialized Patterns](#specialized-patterns)      | 9     | thinking-tools, spec-gathering, spec-init, sequential-thinking, consensus-voting, swarm-coordination, interactive-requirements-gathering, planning-with-files, sparc-methodology                       |
| [External Integrations](#external-integrations)    | 1     | project-onboarding                                                                                                                                                                                     |
| [Scientific Research](#scientific-research)        | 1     | scientific-skills (parent with 139 sub-skills)                                                                                                                                                         |
| [Incident Response](#incident-response)            | 3     | incident-runbook-templates, on-call-handoff-patterns, postmortem-writing                                                                                                                               |
| [Search](#search)                                  | 4     | ripgrep, code-semantic-search, code-structural-search, frontend-expert                                                                                                                                 |
| [Other](#other)                                    | 4     | advanced-elicitation, summarize-changes, container-expert, php-expert                                                                                                                                  |

---

## Core Development

Essential development workflow skills.

| Skill                            | Description                                                                           | Primary Agents           |
| -------------------------------- | ------------------------------------------------------------------------------------- | ------------------------ |
| `tdd`                            | Test-Driven Development with Iron Laws. **Includes deprecated alias: testing-expert** | developer, qa            |
| `debugging`                      | Systematic 4-phase debugging with root cause investigation                            | developer                |
| `ripgrep`                        | Enhanced code search with ES module support (.mjs, .cjs, .mts, .cts)                  | developer, code-reviewer |
| `code-quality-expert`            | Clean code principles, style guides, refactoring patterns                             | code-reviewer, developer |
| `code-analyzer`                  | Static code analysis and complexity metrics                                           | code-reviewer, architect |
| `code-semantic-search`           | Semantic code search using Phase 1 vectors + Phase 2 hybrid                           | developer, architect     |
| `code-structural-search`         | AST-based pattern matching with ast-grep                                              | developer, code-reviewer |
| `code-style-validator`           | Programmatic AST-based style validation                                               | code-reviewer            |
| `dry-principle`                  | Don't Repeat Yourself enforcement                                                     | code-reviewer            |
| `verification-before-completion` | Gate function preventing unverified claims                                            | all agents               |
| `best-practices-guidelines`      | Cross-cutting best practices                                                          | all agents               |

**Invocation:**

```javascript
Skill({ skill: 'tdd' });
Skill({ skill: 'testing-expert' }); // Deprecated alias → redirects to tdd
Skill({ skill: 'debugging' });
```

---

## Planning & Architecture

Design and planning skills.

| Skill                   | Description                                                             | Primary Agents     |
| ----------------------- | ----------------------------------------------------------------------- | ------------------ |
| `plan-generator`        | Structured implementation plans with dependencies                       | planner            |
| `architecture-review`   | Architecture validation and design review                               | architect          |
| `complexity-assessment` | AI-based task complexity classification                                 | router, planner    |
| `diagram-generator`     | Mermaid architecture and flow diagrams                                  | architect, planner |
| `planning-with-files`   | Manus-style file-based planning (task_plan.md, findings.md)             | planner            |
| `spec-gathering`        | Requirements gathering workflow                                         | planner            |
| `spec-init`             | Unified spec creation process                                           | planner            |
| `sparc-methodology`     | SPARC (Specification, Pseudocode, Architecture, Refinement, Completion) | architect          |

---

## Security

Security analysis and validation.

| Skill                          | Description                                     | Primary Agents     |
| ------------------------------ | ----------------------------------------------- | ------------------ |
| `security-architect`           | OWASP Top 10, threat modeling, STRIDE analysis  | security-architect |
| `auth-security-expert`         | OAuth 2.1, JWT (RFC 8725), encryption           | security-architect |
| `binary-analysis-patterns`     | Disassembly, decompilation, reverse engineering | security-architect |
| `memory-forensics`             | Memory acquisition and artifact extraction      | security-architect |
| `protocol-reverse-engineering` | Network protocol analysis                       | security-architect |
| `accessibility`                | WCAG 2.1 AA compliance, semantic HTML, ARIA     | frontend-expert    |

---

## DevOps & Infrastructure

Cloud, containers, and infrastructure.

| Skill                        | Description                               | Primary Agents |
| ---------------------------- | ----------------------------------------- | -------------- |
| `docker-compose`             | Docker Compose orchestration              | devops         |
| `terraform-infra`            | Terraform with safety controls            | devops         |
| `k8s-manifest-generator`     | Production-ready Kubernetes manifests     | devops         |
| `sentry-monitoring`          | Error tracking and performance monitoring | devops         |
| `incident-runbook-templates` | Incident response runbooks                | devops         |
| `container-expert`           | Docker, Kubernetes, Helm expertise        | devops         |

---

## Languages

Language-specific expertise.

| Skill                   | Description                          | Primary Agents |
| ----------------------- | ------------------------------------ | -------------- |
| `python-backend-expert` | Django, FastAPI, Flask, SQLAlchemy   | python-pro     |
| `typescript-expert`     | TypeScript patterns and type systems | typescript-pro |
| `go-expert`             | Go APIs, gRPC, concurrency           | go-pro         |
| `nodejs-expert`         | Node.js, Express, NestJS             | nodejs-pro     |
| `java-expert`           | Java and Spring Boot                 | java-pro       |
| `php-expert`            | PHP, Laravel, WordPress              | php-pro        |
| `web3-expert`           | Solidity, Ethereum, smart contracts  | web3-pro       |

---

## Frameworks

Framework-specific expertise.

| Skill                 | Description                                        | Primary Agents |
| --------------------- | -------------------------------------------------- | -------------- |
| `react-expert`        | React hooks, state management, React 19, Shadcn UI | react-pro      |
| `nextjs-expert`       | Next.js App Router, Server Components              | nextjs-pro     |
| `svelte-expert`       | Svelte and SvelteKit                               | svelte-pro     |
| `graphql-expert`      | GraphQL schema, Apollo Client/Server               | graphql-pro    |
| `expo-framework-rule` | Expo Framework guidelines                          | mobile-pro     |
| `frontend-expert`     | UI/UX patterns, responsive design                  | frontend-pro   |

---

## Mobile

Mobile development skills.

| Skill                          | Description                              | Primary Agents |
| ------------------------------ | ---------------------------------------- | -------------- |
| `ios-expert`                   | SwiftUI, UIKit, Apple frameworks         | ios-pro        |
| `android-expert`               | Jetpack Compose, Kotlin, Material Design | android-pro    |
| `expo-framework-rule`          | Expo Framework patterns                  | mobile-pro     |
| `tauri-native-api-integration` | Tauri native APIs                        | mobile-pro     |
| `mobile-first-design-rules`    | Mobile-first design patterns             | frontend-pro   |

---

## Data & Database

Data processing and database skills.

| Skill                | Description                                   | Primary Agents |
| -------------------- | --------------------------------------------- | -------------- |
| `database-architect` | Schema design, query optimization, migrations | architect      |
| `database-expert`    | Prisma, Supabase, SQL/NoSQL patterns          | developer      |
| `data-expert`        | Data parsing, transformation, validation      | developer      |
| `text-to-sql`        | Natural language to SQL conversion            | developer      |
| `ai-ml-expert`       | PyTorch, LangChain, LLM integration           | ai-ml-pro      |

---

## Documentation

Documentation generation skills.

| Skill            | Description                         | Primary Agents   |
| ---------------- | ----------------------------------- | ---------------- |
| `doc-generator`  | API documentation, developer guides | technical-writer |
| `writing-skills` | TDD applied to documentation        | technical-writer |
| `readme`         | README and project documentation    | technical-writer |
| `gamedev-expert` | Game development documentation      | gamedev-pro      |

---

## Git & Version Control

Git operations wrapper.

| Skill        | Description                                       | Primary Agents    |
| ------------ | ------------------------------------------------- | ----------------- |
| `git-expert` | Advanced Git operations, token-efficient commands | developer, devops |

---

## Code Style & Linting

Code style enforcement.

| Skill                  | Description                | Primary Agents |
| ---------------------- | -------------------------- | -------------- |
| `code-style-validator` | AST-based style validation | code-reviewer  |
| `dry-principle`        | DRY principle enforcement  | code-reviewer  |

---

## Creator Tools

Framework artifact creators.

| Skill                 | Description                                                             | Primary Agents                |
| --------------------- | ----------------------------------------------------------------------- | ----------------------------- |
| `research-synthesis`  | Research synthesis for artifact creation (invoke BEFORE other creators) | all creators                  |
| `agent-creator`       | Creates specialized AI agents                                           | router                        |
| `skill-creator`       | Creates and validates skills                                            | router                        |
| `hook-creator`        | Creates framework hooks                                                 | router                        |
| `workflow-creator`    | Creates orchestration workflows                                         | router                        |
| `template-creator`    | Creates templates                                                       | router                        |
| `schema-creator`      | Creates JSON Schema validators                                          | router                        |
| `command-creator`     | Creates thin-delegator slash commands                                   | router                        |
| `rule-creator`        | Creates workspace convention rules                                      | router                        |
| `tool-creator`        | Creates CLI tools and utilities                                         | router                        |
| `artifact-updater`    | Updates existing artifacts (unified updater for all types)              | all creators                  |
| `artifact-integrator` | Deep integration analysis for newly created artifacts                   | architect, planner, developer |

**Creation Pattern:**

```javascript
// ALWAYS invoke research-synthesis first
Skill({ skill: 'research-synthesis', args: 'topic' });
Skill({ skill: 'skill-creator', args: 'skill-name' });

// After creation, check integration
Skill({ skill: 'artifact-integrator' });
```

---

## Memory & Context

Memory and context management.

| Skill                        | Description                     | Primary Agents     |
| ---------------------------- | ------------------------------- | ------------------ |
| `context-compressor`         | Context compression methodology | all agents         |
| `session-handoff`            | Handoff document creation       | all agents         |
| `task-management-protocol`   | Task synchronization protocol   | all agents         |
| `context-driven-development` | Context as managed artifacts    | all agents         |
| `insight-extraction`         | Extract session learnings       | all agents         |
| `track-management`           | Logical work unit management    | planner, developer |

---

## Validation & Quality

Quality validation skills.

| Skill                            | Description                       | Primary Agents    |
| -------------------------------- | --------------------------------- | ----------------- |
| `verification-before-completion` | Pre-completion gate               | all agents        |
| `checklist-generator`            | IEEE 1028 + contextual checklists | qa, code-reviewer |
| `response-rater`                 | Plan and response quality audits  | qa                |
| `test-generator`                 | Test code generation              | developer, qa     |
| `accessibility`                  | WCAG compliance validation        | frontend-expert   |

---

## Specialized Patterns

Advanced patterns and methodologies.

| Skill                                | Description                                   | Primary Agents |
| ------------------------------------ | --------------------------------------------- | -------------- |
| `thinking-tools`                     | Self-reflection patterns (think-about-\*)     | all agents     |
| `spec-gathering`                     | Requirements gathering                        | planner        |
| `spec-init`                          | Unified spec creation                         | planner        |
| `sequential-thinking`                | Structured problem solving                    | all agents     |
| `consensus-voting`                   | Byzantine consensus for multi-agent decisions | orchestrators  |
| `swarm-coordination`                 | Multi-agent swarm patterns                    | orchestrators  |
| `interactive-requirements-gathering` | A/B/C/D/E questionnaire framework             | planner        |
| `planning-with-files`                | Persistent planning files                     | planner        |
| `sparc-methodology`                  | SPARC development methodology                 | architect      |

---

## External Integrations

External tools and systems.

| Skill                | Description             | Primary Agents |
| -------------------- | ----------------------- | -------------- |
| `project-onboarding` | New codebase onboarding | all agents     |

---

## Scientific Research

Comprehensive scientific research toolkit.

### scientific-skills (Parent Skill)

**Description:** Comprehensive scientific research toolkit with 139 specialized sub-skills for biology, chemistry, medicine, data science, and computational research.

**Invocation:**

```javascript
// Parent skill
Skill({ skill: 'scientific-skills' });

// Sub-skills (139 available)
Skill({ skill: 'scientific-skills/rdkit' }); // Chemistry
Skill({ skill: 'scientific-skills/scanpy' }); // Bioinformatics
Skill({ skill: 'scientific-skills/biopython' }); // Biology
Skill({ skill: 'scientific-skills/literature-review' }); // Research
```

**Sub-Skill Categories:**

- **Chemistry (20):** rdkit, openmm, pyscf, ase, pymatgen, etc.
- **Biology (25):** biopython, scanpy, cellprofiler, napari, etc.
- **Medicine (15):** clinical-trials, pharmacology, imaging, etc.
- **Data Science (30):** pandas, numpy, scipy, scikit-learn, etc.
- **Computational (25):** molecular-dynamics, quantum-chemistry, etc.
- **Workflows (24):** literature-review, hypothesis-generation, etc.

**Primary Agents:** researcher, scientific-researcher

**Total:** 1 parent skill + 139 sub-skills = 140 scientific capabilities

---

## Incident Response

Incident management skills.

| Skill                        | Description                  | Primary Agents |
| ---------------------------- | ---------------------------- | -------------- |
| `incident-runbook-templates` | Runbook creation             | devops         |
| `on-call-handoff-patterns`   | On-call handoff procedures   | devops         |
| `postmortem-writing`         | Blameless postmortem writing | devops         |

---

## Search

Advanced search capabilities.

| Skill                    | Description                                | Primary Agents           |
| ------------------------ | ------------------------------------------ | ------------------------ |
| `ripgrep`                | Text search with PCRE2 regex               | developer                |
| `code-semantic-search`   | Semantic search (Phase 1 + Phase 2 hybrid) | developer, architect     |
| `code-structural-search` | AST pattern matching                       | developer, code-reviewer |
| `frontend-expert`        | Frontend code search                       | frontend-pro             |

---

## Other

Miscellaneous skills.

| Skill                  | Description                            | Primary Agents |
| ---------------------- | -------------------------------------- | -------------- |
| `advanced-elicitation` | Meta-cognitive reasoning (15+ methods) | all agents     |
| `summarize-changes`    | Code change summarization              | developer      |
| `container-expert`     | Container orchestration                | devops         |
| `php-expert`           | PHP development                        | php-pro        |

---

## Deprecated Skills

| Deprecated Skill     | Replacement | Notes                           |
| -------------------- | ----------- | ------------------------------- |
| ~~`testing-expert`~~ | `tdd`       | Merged into tdd skill (2026-01) |

**Invocation:**

```javascript
Skill({ skill: 'testing-expert' }); // Redirects to tdd
```

---

## Archived Skills

214 dead skills (70.9% of original 302) archived to `.claude/skills/_archive/dead/`

**Reason:** Zero invocations across agents, workflows, and commands.

**See:** `.claude/skills/_archive/dead/README.md` for complete list and restoration instructions.

**Categories archived:**

- Framework Configuration (26 skills, 100% dead)
- Agent Behavior (11 skills, 92% dead)
- Other Specialized (21 skills, 95% dead)
- Project Structure (7 skills, 88% dead)
- Code Style & Linting (15 skills, 83% dead)
- And 134 more across 19 categories

---

## Skill Discovery

**By Category:** Use Quick Reference table above
**By Agent:** Check agent frontmatter `skills:` array
**By Invocation:** `Skill({ skill: 'name' })`

**Catalog Accuracy:** 100% (89/89 entries match on-disk skills)

---

**Provenance:** Pipeline #16B | Task #124 | Agent: developer | Date: 2026-02-07
