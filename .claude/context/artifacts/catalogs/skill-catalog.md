# Skill Catalog

> **Total Skills: 109** (1 deprecated alias) | Last Updated: 2026-02-17

This catalog indexes all active skills in the Claude Code Enterprise Framework.

**Post-Cleanup Summary:**

- **Active Skills:** 106 (maintained and invoked)
- **Deprecated Aliases:** 1 (`testing-expert` → `tdd`)
- **Scientific Parent:** 1 (`scientific-skills` with 139 sub-skills)
- **Archived:** 214 dead skills → `.claude/skills/_archive/dead/` (see README)

---

## Quick Reference by Category

| Category                                           | Count | Key Skills                                                                                                                                                                                             |
| -------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Core Development](#core-development)              | 11    | tdd, debugging, ripgrep, code-quality-expert, code-analyzer                                                                                                                                            |
| [Planning & Architecture](#planning--architecture) | 9     | plan-generator, prd-generator, architecture-review, complexity-assessment, diagram-generator                                                                                                           |
| [Security](#security)                              | 12    | security-architect, auth-security-expert, binary-analysis-patterns, memory-forensics, static-analysis, variant-analysis, differential-review, semgrep-rule-creator, insecure-defaults, medusa-security |
| [DevOps & Infrastructure](#devops--infrastructure) | 6     | docker-compose, terraform-infra, k8s-manifest-generator, sentry-monitoring                                                                                                                             |
| [Languages](#languages)                            | 7     | python-backend-expert, typescript-expert, go-expert, nodejs-expert, java-expert                                                                                                                        |
| [Frameworks](#frameworks)                          | 6     | react-expert, nextjs-expert, svelte-expert, graphql-expert                                                                                                                                             |
| [Mobile](#mobile)                                  | 5     | ios-expert, android-expert, expo-framework-rule, tauri-native-api-integration, mobile-first-design-rules                                                                                               |
| [Data & Database](#data--database)                 | 4     | database-architect, database-expert, data-expert, text-to-sql                                                                                                                                          |
| [Documentation](#documentation)                    | 4     | doc-generator, writing-skills, readme, gamedev-expert                                                                                                                                                  |
| [Git & Version Control](#git--version-control)     | 2     | git-expert, github-ops                                                                                                                                                                                 |

| [Code Style & Linting](#code-style--linting) | 2 | code-style-validator, dry-principle |
| [Creator Tools](#creator-tools) | 15 | research-synthesis, agent-creator, agent-updater, skill-creator, skill-updater, workflow-updater, hook-creator, workflow-creator, template-creator, schema-creator, artifact-integrator, artifact-updater, command-creator, rule-creator, tool-creator |
| [Memory & Context](#memory--context) | 15 | context-compressor, token-saver-context-compression, memory-quality-auditor, session-handoff, task-management-protocol, context-driven-development, insight-extraction, track-management, pipeline-reflection-ux, framework-context, recommend-evolution, assimilate, creation-feasibility-gate, compliance-policy-check, troubleshooting-regression |
| [Validation & Quality](#validation--quality) | 6 | verification-before-completion, checklist-generator, response-rater, test-generator, accessibility, eval-harness-updater |
| [Specialized Patterns](#specialized-patterns) | 9 | thinking-tools, spec-gathering, spec-init, sequential-thinking, consensus-voting, swarm-coordination, interactive-requirements-gathering, planning-with-files, sparc-methodology |
| [External Integrations](#external-integrations) | 2 | project-onboarding, dynamic-api-integration |
| [Scientific Research](#scientific-research) | 1 | scientific-skills (parent with 139 sub-skills) |
| [Incident Response](#incident-response) | 3 | incident-runbook-templates, on-call-handoff-patterns, postmortem-writing |
| [Search](#search) | 4 | ripgrep, code-semantic-search, code-structural-search, frontend-expert |
| [Other](#other) | 4 | advanced-elicitation, summarize-changes, container-expert, php-expert |

---

## Core Development

Essential development workflow skills.

| Skill                            | Description                                                                    | Primary Agents                 |
| -------------------------------- | ------------------------------------------------------------------------------ | ------------------------------ |
| `tdd`                            | Canon TDD with scenario backlog and RED/GREEN proof (alias: `testing-expert`). | developer, qa                  |
| `debugging`                      | Systematic 4-phase debugging with root cause investigation                     | developer                      |
| `ripgrep`                        | Enhanced code search with ES module support (.mjs, .cjs, .mts, .cts)           | 36+ agents (all domain agents) |
| `code-quality-expert`            | Clean code principles, style guides, refactoring patterns                      | code-reviewer, developer       |
| `code-analyzer`                  | Static code analysis and complexity metrics                                    | code-reviewer, architect       |
| `code-semantic-search`           | Semantic code search using Phase 1 vectors + Phase 2 hybrid                    | 36+ agents (all domain agents) |
| `code-structural-search`         | AST-based pattern matching with ast-grep                                       | 36+ agents (all domain agents) |
| `code-style-validator`           | Programmatic AST-based style validation                                        | code-reviewer                  |
| `dry-principle`                  | Don't Repeat Yourself enforcement                                              | code-reviewer                  |
| `verification-before-completion` | Gate function preventing unverified claims                                     | all agents                     |
| `best-practices-guidelines`      | Cross-cutting best practices                                                   | all agents                     |

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
| `prd-generator`         | Hypothesis-driven PRDs with Implementation Phases tracking              | pm                 |
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

| Skill                          | Description                                                                   | Primary Agents                                        |
| ------------------------------ | ----------------------------------------------------------------------------- | ----------------------------------------------------- |
| `security-architect`           | OWASP Top 10, threat modeling, STRIDE analysis                                | security-architect                                    |
| `auth-security-expert`         | OAuth 2.1, JWT (RFC 8725), encryption                                         | security-architect                                    |
| `binary-analysis-patterns`     | Disassembly, decompilation, reverse engineering                               | security-architect                                    |
| `memory-forensics`             | Memory acquisition and artifact extraction                                    | security-architect                                    |
| `protocol-reverse-engineering` | Network protocol analysis                                                     | security-architect                                    |
| `accessibility`                | WCAG 2.1 AA compliance, semantic HTML, ARIA                                   | frontend-expert                                       |
| `static-analysis`              | CodeQL and Semgrep SARIF analysis                                             | security-architect                                    |
| `variant-analysis`             | Discover vulnerability variants                                               | security-architect                                    |
| `differential-review`          | Security-focused diff/PR review                                               | security-architect                                    |
| `semgrep-rule-creator`         | Create custom Semgrep rules                                                   | security-architect                                    |
| `insecure-defaults`            | Detect hardcoded credentials, fail-open configs                               | security-architect                                    |
| `medusa-security`              | AI-first SAST with 3,000+ patterns: prompt injection, MCP, agents, RAG, OWASP | security-architect, penetration-tester, code-reviewer |
| `gemini-cli-security`          | AI-powered vulnerability analysis and OSV.dev dependency scanning             | security-architect, developer, code-reviewer          |

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

| Skill        | Description                                       | Primary Agents                 |
| ------------ | ------------------------------------------------- | ------------------------------ |
| `git-expert` | Advanced Git operations, token-efficient commands | developer, devops              |
| `github-ops` | Structured reconnaissance via GitHub CLI (gh)     | artifact-integrator, developer |

---

## Code Style & Linting

Code style enforcement.

| Skill                  | Description                | Primary Agents |
| ---------------------- | -------------------------- | -------------- |
| `code-style-validator` | AST-based style validation | code-reviewer  |
| `dry-principle`        | DRY principle enforcement  | code-reviewer  |

---

## Creator Tools

Framework artifact creators. All 9 creator skills now include **Step 0.5 (Companion Check)** before creation begins, displaying must-have/should-have/nice-to-have companion checklist for awareness.

| Skill                 | Description                                                             | Primary Agents                           |
| --------------------- | ----------------------------------------------------------------------- | ---------------------------------------- |
| `research-synthesis`  | Research synthesis for artifact creation (invoke BEFORE other creators) | all creators                             |
| `agent-creator`       | Creates specialized AI agents (with Step 0.5 companion check)           | router                                   |
| `agent-updater`       | Refreshes existing agent prompts/frontmatter with risk scoring          | reflection-agent, evolution-orchestrator |
| `skill-creator`       | Creates and validates skills (with Step 0.5 companion check)            | router                                   |
| `skill-updater`       | Refreshes existing skills with research + TDD + integration validation  | reflection-agent, evolution-orchestrator |
| `workflow-updater`    | Refreshes existing workflows with phase-gate idempotency checks         | evolution-orchestrator, planner          |
| `hook-creator`        | Creates framework hooks (with Step 0.5 companion check)                 | router                                   |
| `workflow-creator`    | Creates orchestration workflows (with Step 0.5 companion check)         | router                                   |
| `template-creator`    | Creates templates (with Step 0.5 companion check)                       | router                                   |
| `schema-creator`      | Creates JSON Schema validators (with Step 0.5 companion check)          | router                                   |
| `command-creator`     | Creates thin-delegator slash commands (with Step 0.5 companion check)   | router                                   |
| `rule-creator`        | Creates workspace convention rules (with Step 0.5 companion check)      | router                                   |
| `tool-creator`        | Creates CLI tools and utilities (with Step 0.5 companion check)         | router                                   |
| `artifact-updater`    | Updates existing artifacts (unified updater for all types)              | all creators                             |
| `artifact-integrator` | Deep integration analysis for newly created artifacts                   | architect, planner, developer            |

**Creation Pattern:**

```javascript
// ALWAYS invoke research-synthesis first
Skill({ skill: 'research-synthesis', args: 'topic' });

// Creator automatically runs Step 0.5 companion check (displays checklist)
Skill({ skill: 'skill-creator', args: 'skill-name' });

// After creation, check integration
Skill({ skill: 'artifact-integrator' });
```

**Step 0.5 Companion Check:** Uses `companion-check.cjs` library to load companion matrix from `ecosystem-impact-graph.json`, check existing companions, and display must-have/should-have/nice-to-have checklist before creation. Prevents 70% orphan rate by making creators aware of ecosystem dependencies.

---

## Memory & Context

Memory and context management.

| Skill                             | Description                                                  | Primary Agents                           |
| --------------------------------- | ------------------------------------------------------------ | ---------------------------------------- |
| `context-compressor`              | Context compression methodology                              | all agents                               |
| `token-saver-context-compression` | Search-aware context compression with MemoryRecord mapping   | developer, planner, context-compressor   |
| `memory-quality-auditor`          | Audits retrieval drift, staleness, and citation groundedness | reflection-agent, qa                     |
| `session-handoff`                 | Handoff document creation                                    | all agents                               |
| `task-management-protocol`        | Task synchronization protocol                                | all agents                               |
| `context-driven-development`      | Context as managed artifacts                                 | all agents                               |
| `insight-extraction`              | Extract session learnings                                    | all agents                               |
| `track-management`                | Logical work unit management                                 | planner, developer                       |
| `pipeline-reflection-ux`          | Step 0/reflection UX and pipeline-noise control              | router, planner                          |
| `framework-context`               | Structured framework context for reflection/planning         | reflection-agent, planner                |
| `recommend-evolution`             | Trigger-based evolution recommendation and request recording | reflection-agent, planner                |
| `assimilate`                      | External benchmark assimilation into TDD upgrade backlog     | evolution-orchestrator, reflection-agent |
| `creation-feasibility-gate`       | Preflight viability check before creator/evolution execution | planner, technical-program-manager       |
| `compliance-policy-check`         | Rule/policy compliance gate for high-risk design/evolution   | reflection-agent, planner                |
| `troubleshooting-regression`      | Debug-log-first regression triage and remediation validation | qa, code-reviewer, devops-troubleshooter |

---

## Validation & Quality

Quality validation skills.

| Skill                            | Description                                      | Primary Agents       |
| -------------------------------- | ------------------------------------------------ | -------------------- |
| `verification-before-completion` | Pre-completion gate                              | all agents           |
| `checklist-generator`            | IEEE 1028 + contextual checklists                | qa, code-reviewer    |
| `response-rater`                 | Plan and response quality audits                 | qa                   |
| `test-generator`                 | Test code generation                             | developer, qa        |
| `accessibility`                  | WCAG compliance validation                       | frontend-expert      |
| `eval-harness-updater`           | Refreshes eval harness reliability and SLO gates | qa, reflection-agent |

---

## Specialized Patterns

Advanced patterns and methodologies.

| Skill                                 | Description                                                                    | Primary Agents |
| ------------------------------------- | ------------------------------------------------------------------------------ | -------------- |
| `thinking-tools`                      | Self-reflection patterns (think-about-\*)                                      | all agents     |
| `spec-gathering`                      | Requirements gathering                                                         | planner        |
| `spec-init`                           | Unified spec creation                                                          | planner        |
| `sequential-thinking`                 | Structured problem solving                                                     | all agents     |
| `consensus-voting`                    | Byzantine consensus for multi-agent decisions                                  | orchestrators  |
| `swarm-coordination`                  | Multi-agent swarm patterns                                                     | orchestrators  |
| `interactive-requirements-gathering`  | A/B/C/D/E questionnaire framework                                              | planner        |
| `planning-with-files`                 | Persistent planning files                                                      | planner        |
| `sparc-methodology`                   | SPARC development methodology                                                  | architect      |

---

## External Integrations

External tools and systems.

| Skill                     | Description                                                                                                    | Primary Agents                    |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `project-onboarding`      | New codebase onboarding                                                                                        | all agents                        |
| `dynamic-api-integration` | Discover, parse, and call external HTTP APIs at runtime using OpenAPI specs and tool templates (UTCP-inspired) | developer, researcher, nodejs-pro |

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

Advanced search capabilities. All 3 search skills (ripgrep, code-semantic-search, code-structural-search) are now assigned to 36+ agents (all domain-level agents across all tiers).

| Skill                    | Description                                | Primary Agents                 |
| ------------------------ | ------------------------------------------ | ------------------------------ |
| `ripgrep`                | Text search with PCRE2 regex               | 36+ agents (all domain agents) |
| `code-semantic-search`   | Semantic search (Phase 1 + Phase 2 hybrid) | 36+ agents (all domain agents) |
| `code-structural-search` | AST pattern matching                       | 36+ agents (all domain agents) |
| `frontend-expert`        | Frontend code search                       | frontend-pro                   |

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

## Restored Compatibility Skills

Skills restored from archive for backward compatibility and agent reference continuity.

| Skill                                | Description                                                      | Primary Agents |
| ------------------------------------ | ---------------------------------------------------------------- | -------------- |
| `build-tools-expert`                 | Build tooling patterns and optimization workflows                | developer      |
| `composer-dependency-management`     | Composer dependency governance and update safety checks          | php-pro        |
| `dto-conventions`                    | DTO design conventions and mapping consistency                   | developer      |
| `form-and-actions-in-sveltekit`      | SvelteKit form/action patterns and validation flow               | svelte-pro     |
| `form-validation-with-zod`           | Zod-based validation patterns for form input safety              | svelte-pro     |
| `function-length-and-responsibility` | Function sizing and single-responsibility enforcement            | code-reviewer  |
| `restcontroller-conventions`         | REST controller contract and endpoint structure conventions      | developer      |
| `rule-auditor`                       | Rule quality audit and governance checks                         | architect      |
| `rust-expert`                        | Rust implementation patterns and idiomatic architecture guidance | rust-pro       |
| `seo-and-meta-tags-in-sveltekit`     | SEO metadata and head management patterns for SvelteKit          | svelte-pro     |
| `service-class-conventions`          | Service-layer structure and responsibility boundaries            | developer      |
| `tall-stack-general`                 | TALL stack conventions for Laravel/Alpine/Livewire workflows     | fullstack-pro  |
| `tauri-security-rules`               | Tauri desktop security rules and hardening patterns              | tauri-pro      |
| `tauri-svelte-typescript-general`    | Tauri + Svelte + TypeScript integration conventions              | tauri-pro      |
| `tauri-svelte-ui-components`         | UI component architecture patterns for Tauri/Svelte projects     | tauri-pro      |
| `tsconfig-json-rules`                | TypeScript compiler configuration conventions and guardrails     | typescript-pro |

---

## Additional Onboarded Skills

Skills present on disk and now explicitly cataloged for index/discovery completeness.

| Skill                          | Description                                                        | Primary Agents     |
| ------------------------------ | ------------------------------------------------------------------ | ------------------ |
| `advanced-elicitation`         | Meta-cognitive elicitation patterns for requirement clarification  | planner            |
| `artifact-integrator`          | Deep integration analysis and cross-artifact consistency checks    | developer          |
| `best-practices-guidelines`    | Cross-cutting engineering best-practice baseline                   | developer          |
| `code-semantic-search`         | Semantic code search over indexed repositories                     | developer          |
| `code-structural-search`       | AST-structural pattern search for code analysis                    | developer          |
| `differential-review`          | Security-focused differential review of code changes               | security-architect |
| `dry-principle`                | DRY enforcement and duplication reduction patterns                 | code-reviewer      |
| `insecure-defaults`            | Detection of insecure defaults and fail-open configurations        | security-architect |
| `planning-with-files`          | File-based planning workflow for long-running implementation tasks | planner            |
| `prd-generator`                | Product requirements document generation workflow                  | pm                 |
| `semgrep-rule-creator`         | Custom Semgrep rule authoring and validation                       | security-architect |
| `sparc-methodology`            | SPARC methodology for structured delivery workflows                | architect          |
| `spec-init`                    | Unified specification initialization and scaffolding               | planner            |
| `static-analysis`              | Static analysis execution and result triage                        | security-architect |
| `tauri-native-api-integration` | Native API integration patterns for Tauri desktop applications     | tauri-pro          |
| `variant-analysis`             | Variant detection workflows for vulnerability classes              | security-architect |

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
