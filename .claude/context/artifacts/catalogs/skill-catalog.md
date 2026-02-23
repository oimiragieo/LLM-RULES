# Skill Catalog

> **Total Skills: 133** (1 deprecated alias) | Last Updated: 2026-02-22

This catalog indexes all active skills in the Claude Code Enterprise Framework.

**Post-Cleanup Summary:**

- **Active Skills:** 129 (maintained and invoked)
- **Deprecated Aliases:** 1 (`testing-expert` → `tdd`)
- **Scientific Parent:** 1 (`scientific-skills` with 139 sub-skills)
- **Archived:** 214 dead skills → `.claude/skills/_archive/dead/` (see README)

---

## Quick Reference by Category

| Category                                             | Count | Key Skills                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Core Development](#core-development)                | 17    | tdd, debug-log-analysis, debugging, smart-debug, ripgrep, code-quality-expert, code-analyzer, stale-module-pruner, subagent-driven-development, requesting-code-review, receiving-code-review                                                                                                                                                                                            |
| [Planning & Architecture](#planning--architecture)   | 12    | brainstorming, plan-generator, prd-generator, architecture-review, complexity-assessment, diagram-generator, wave-executor, spec-critique                                                                                                                                                                                                                                                |
| [Security](#security)                                | 14    | security-architect, auth-security-expert, binary-analysis-patterns, memory-forensics, static-analysis, variant-analysis, differential-review, semgrep-rule-creator, insecure-defaults, medusa-security, content-security-scan, audit-context-building                                                                                                                                    |
| [DevOps & Infrastructure](#devops--infrastructure)   | 8     | docker-compose, terraform-infra, k8s-manifest-generator, sentry-monitoring, kafka-development-practices, monorepo-and-tooling                                                                                                                                                                                                                                                            |
| [Languages](#languages)                              | 10    | python-backend-expert, typescript-expert, go-expert, nodejs-expert, java-expert, poetry-rye-dependency-management, pyqt6-ui-development-rules, elixir-expert                                                                                                                                                                                                                             |
| [Frameworks](#frameworks)                            | 16    | react-expert, nextjs-expert, svelte-expert, graphql-expert, qwik-expert, solidjs-expert, vue-expert, angular-expert, astro-expert, fiber-logging-and-project-structure, fiber-routing-and-csrf-protection, webmcp-browser-tools                                                                                                                                                          |
| [Vercel & Web Performance](#vercel--web-performance) | 7     | enhance-prompt, next-upgrade, vercel-deploy, shadcn-ui, web-perf, next-cache-components, vercel-ai-sdk-best-practices                                                                                                                                                                                                                                                                    |
| [Mobile](#mobile)                                    | 8     | ios-expert, android-expert, expo-framework-rule, tauri-native-api-integration, mobile-first-design-rules, nativewind-and-tailwind-css-compatibility, nativescript, flutter-expert                                                                                                                                                                                                        |
| [Data & Database](#data--database)                   | 7     | database-architect, database-expert, data-expert, text-to-sql, large-data-with-dask, drizzle-orm-rules                                                                                                                                                                                                                                                                                   |
| [Documentation](#documentation)                      | 4     | doc-generator, writing-skills, readme, gamedev-expert                                                                                                                                                                                                                                                                                                                                    |
| [Git & Version Control](#git--version-control)       | 6     | commit-validator, git-expert, github-ops, finishing-a-development-branch, using-git-worktrees, smart-revert                                                                                                                                                                                                                                                                              |
| [Code Style & Linting](#code-style--linting)         | 3     | code-style-validator, dry-principle, async-operations                                                                                                                                                                                                                                                                                                                                    |
| [Creator Tools](#creator-tools)                      | 15    | research-synthesis, agent-creator, agent-updater, skill-creator, skill-updater, workflow-updater, hook-creator, workflow-creator, template-creator, schema-creator, artifact-integrator, artifact-updater, command-creator, rule-creator, tool-creator                                                                                                                                   |
| [Memory & Context](#memory--context)                 | 17    | context-compressor, token-saver-context-compression, memory-quality-auditor, session-handoff, task-management-protocol, context-driven-development, context-degradation, insight-extraction, track-management, pipeline-reflection-ux, framework-context, recommend-evolution, assimilate, creation-feasibility-gate, compliance-policy-check, troubleshooting-regression, memory-search |
| [Validation & Quality](#validation--quality)         | 12    | verification-before-completion, checklist-generator, proactive-audit, ecosystem-integrity-scanner, response-rater, test-generator, accessibility, eval-harness-updater, qa-workflow, spec-critique, strict-user-requirements-adherence, agent-evaluation                                                                                                                                 |
| [Specialized Patterns](#specialized-patterns)        | 10    | thinking-tools, spec-gathering, spec-init, sequential-thinking, consensus-voting, swarm-coordination, interactive-requirements-gathering, planning-with-files, sparc-methodology, dispatching-parallel-agents                                                                                                                                                                            |
| [External Integrations](#external-integrations)      | 5     | project-onboarding, dynamic-api-integration, medusa, convex-development-general, starknet-react-rules                                                                                                                                                                                                                                                                                    |
| [Scientific Research](#scientific-research)          | 1     | scientific-skills (parent with 139 sub-skills)                                                                                                                                                                                                                                                                                                                                           |
| [Incident Response](#incident-response)              | 3     | incident-runbook-templates, on-call-handoff-patterns, postmortem-writing                                                                                                                                                                                                                                                                                                                 |
| [Search](#search)                                    | 4     | ripgrep, code-semantic-search, code-structural-search, frontend-expert                                                                                                                                                                                                                                                                                                                   |
| [Other](#other)                                      | 12    | advanced-elicitation, summarize-changes, container-expert, php-expert, jira-pm, linear-pm, ai-ml-expert, agent-tool-design, api-development-expert, artifact-lifecycle, arxiv-mcp, ask-questions-if-underspecified                                                                                                                                                                       |

---

## Core Development

Essential development workflow skills.

| Skill                            | Description                                                                                                                                                                                                                                                                | Primary Agents                                                                                                                                                                                                                    |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tdd`                            | Canon TDD with scenario backlog and RED/GREEN proof (alias: `testing-expert`).                                                                                                                                                                                             | developer, qa, python-pro, rust-pro, golang-pro, typescript-pro, fastapi-pro, nodejs-pro, ios-pro, java-pro, php-pro, sveltekit-expert, tauri-desktop-developer, expo-mobile-developer, data-engineer, graphql-pro, code-reviewer |
| `debug-log-analysis`             | Structured debug log analysis for Claude Code sessions — copy log, run reducer, extract error patterns, correlate with full log, produce observability report. Fills 5 identified gaps: hook error body, agent identity, file path, stall correlation, success visibility. | developer                                                                                                                                                                                                                         |
| `debugging`                      | Systematic 4-phase debugging with root cause investigation                                                                                                                                                                                                                 | developer, python-pro, rust-pro, golang-pro, typescript-pro, ios-pro, java-pro, php-pro, devops-troubleshooter                                                                                                                    |
| `smart-debug`                    | AI-assisted runtime debugging with hypothesis ranking, structured instrumentation, human-in-the-loop reproduction gate, and evidence-driven root cause analysis. 11-step workflow from hypothesis through fix, verify, and cleanup.                                        | developer                                                                                                                                                                                                                         |
| `ripgrep`                        | Enhanced code search with ES module support (.mjs, .cjs, .mts, .cts)                                                                                                                                                                                                       | 36+ agents (all domain agents)                                                                                                                                                                                                    |
| `code-quality-expert`            | Clean code principles, style guides, refactoring patterns                                                                                                                                                                                                                  | code-reviewer                                                                                                                                                                                                                     |
| `code-analyzer`                  | Static code analysis and complexity metrics                                                                                                                                                                                                                                | code-reviewer, c4-code                                                                                                                                                                                                            |
| `stale-module-pruner`            | Ripgrep-powered dead-code crawler — finds stale, orphaned JS/CJS/MJS modules with no external references; optional delete pass with dry-run gate                                                                                                                           | developer, code-simplifier                                                                                                                                                                                                        |
| `code-semantic-search`           | Semantic code search using Phase 1 vectors + Phase 2 hybrid                                                                                                                                                                                                                | 36+ agents (all domain agents)                                                                                                                                                                                                    |
| `code-structural-search`         | AST-based pattern matching with ast-grep                                                                                                                                                                                                                                   | 36+ agents (all domain agents)                                                                                                                                                                                                    |
| `code-style-validator`           | Programmatic AST-based style validation                                                                                                                                                                                                                                    | developer                                                                                                                                                                                                                         |
| `dry-principle`                  | Don't Repeat Yourself enforcement                                                                                                                                                                                                                                          | developer                                                                                                                                                                                                                         |
| `verification-before-completion` | Gate function preventing unverified claims                                                                                                                                                                                                                                 | all agents                                                                                                                                                                                                                        |
| `best-practices-guidelines`      | Cross-cutting best practices                                                                                                                                                                                                                                               | all agents                                                                                                                                                                                                                        |
| `subagent-driven-development`    | Execute implementation plans via autonomous subagents with two-stage review per task                                                                                                                                                                                       | master-orchestrator                                                                                                                                                                                                               |
| `requesting-code-review`         | Dispatch code-reviewer agent for structured two-stage code review with diff context preparation                                                                                                                                                                            | code-reviewer                                                                                                                                                                                                                     |
| `receiving-code-review`          | Process and act on code review feedback — prioritize fixes by severity and confirm resolution                                                                                                                                                                              | code-reviewer                                                                                                                                                                                                                     |

**Invocation:**

```javascript
Skill({ skill: 'tdd' });
Skill({ skill: 'testing-expert' }); // Deprecated alias → redirects to tdd
Skill({ skill: 'debugging' });
```

---

## Planning & Architecture

Design and planning skills.

| Skill                   | Description                                                                                                                                                            | Primary Agents                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `brainstorming`         | Socratic design refinement before implementation — challenges assumptions, surfaces alternatives, identifies risks                                                     | developer                                                  |
| `plan-generator`        | Structured implementation plans with dependencies                                                                                                                      | planner, pm, master-orchestrator                           |
| `prd-generator`         | Hypothesis-driven PRDs with Implementation Phases tracking                                                                                                             | developer                                                  |
| `architecture-review`   | Architecture validation and design review                                                                                                                              | architect, devops, c4-context, c4-container, c4-component  |
| `complexity-assessment` | AI-based task complexity classification                                                                                                                                | planner, pm, router                                        |
| `diagram-generator`     | Mermaid architecture and flow diagrams                                                                                                                                 | architect, c4-context, c4-container, c4-component, c4-code |
| `planning-with-files`   | Manus-style file-based planning (task_plan.md, findings.md)                                                                                                            | developer                                                  |
| `spec-gathering`        | Requirements gathering workflow                                                                                                                                        | pm                                                         |
| `spec-init`             | Unified spec creation process                                                                                                                                          | developer                                                  |
| `sparc-methodology`     | SPARC (Specification, Pseudocode, Architecture, Refinement, Completion)                                                                                                | developer                                                  |
| `wave-executor`         | Fresh-process orchestration for EPIC-tier batch pipelines (SDK-based Ralph loop)                                                                                       | master-orchestrator                                        |
| `spec-critique`         | Self-critique specification documents using extended thinking — surfaces hidden assumptions, contradictions, missing edge cases, and scope creep before implementation | developer                                                  |

| | Rules for using Drizzle ORM within the src/lib/db directory. Ensures consistent data modeling and database interactions. | developer, database-architect |
| `drizzle-orm-rules` | Rules for using Drizzle ORM within the src/lib/db directory. Ensures consistent data modeling and database interactions. | developer |

---

## Security

Security analysis and validation.

| Skill                          | Description                                                                                                                     | Primary Agents     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `security-architect`           | OWASP Top 10, threat modeling, STRIDE analysis                                                                                  | security-architect |
| `auth-security-expert`         | OAuth 2.1, JWT (RFC 8725), encryption                                                                                           | security-architect |
| `binary-analysis-patterns`     | Disassembly, decompilation, reverse engineering                                                                                 | reverse-engineer   |
| `memory-forensics`             | Memory acquisition and artifact extraction                                                                                      | reverse-engineer   |
| `protocol-reverse-engineering` | Network protocol analysis                                                                                                       | reverse-engineer   |
| `accessibility`                | WCAG 2.1 AA compliance, semantic HTML, ARIA                                                                                     | mobile-ux-reviewer |
| `static-analysis`              | CodeQL and Semgrep SARIF analysis                                                                                               | developer          |
| `variant-analysis`             | Discover vulnerability variants                                                                                                 | developer          |
| `differential-review`          | Security-focused diff/PR review                                                                                                 | developer          |
| `semgrep-rule-creator`         | Create custom Semgrep rules                                                                                                     | developer          |
| `insecure-defaults`            | Detect hardcoded credentials, fail-open configs                                                                                 | developer          |
| `medusa-security`              | AI-first SAST with 3,000+ patterns: prompt injection, MCP, agents, RAG, OWASP                                                   | developer          |
| `gemini-cli-security`          | AI-powered vulnerability analysis and OSV.dev dependency scanning                                                               | developer          |
| `content-security-scan`        | 7-step security gate for external content: size, binary, tool invocation, prompt injection, exfiltration, privilege, provenance | developer          |

---

## DevOps & Infrastructure

Cloud, containers, and infrastructure.

| Skill                         | Description                                                                 | Primary Agents                |
| ----------------------------- | --------------------------------------------------------------------------- | ----------------------------- |
| `docker-compose`              | Docker Compose orchestration                                                | devops, devops-troubleshooter |
| `terraform-infra`             | Terraform with safety controls                                              | devops                        |
| `k8s-manifest-generator`      | Production-ready Kubernetes manifests                                       | devops, devops-troubleshooter |
| `sentry-monitoring`           | Error tracking and performance monitoring                                   | developer                     |
| `incident-runbook-templates`  | Incident response runbooks                                                  | incident-responder            |
| `container-expert`            | Docker, Kubernetes, Helm expertise                                          | c4-container                  |
| `kafka-development-practices` | Kafka development standards with Scala, Typesafe Config, TopologyTestDriver | developer                     |
| `monorepo-and-tooling`        | Monorepo structure, Taskfile.yml conventions, environment variable handling | developer                     |

---

## Languages

Language-specific expertise.

| Skill                   | Description                            | Primary Agents                                                                    |
| ----------------------- | -------------------------------------- | --------------------------------------------------------------------------------- |
| `python-backend-expert` | Django, FastAPI, Flask, SQLAlchemy     | python-pro, fastapi-pro, data-engineer                                            |
| `typescript-expert`     | TypeScript patterns and type systems   | typescript-pro, nodejs-pro, nextjs-pro, sveltekit-expert, tauri-desktop-developer |
| `go-expert`             | Go APIs, gRPC, concurrency             | golang-pro                                                                        |
| `nodejs-expert`         | Node.js, Express, NestJS               | nodejs-pro                                                                        |
| `java-expert`           | Java and Spring Boot                   | java-pro                                                                          |
| `rust-expert`           | Rust ownership, safety, async patterns | developer                                                                         |
| `php-expert`            | PHP, Laravel, WordPress                | php-pro                                                                           |
| `web3-expert`           | Solidity, Ethereum, smart contracts    | developer                                                                         |

| | Elixir and Phoenix expert including OTP, Ecto, and functional programming | developer |
| `elixir-expert` | Elixir and Phoenix expert including OTP, Ecto, and functional programming | developer |
| `poetry-rye-dependency-management` | Poetry or Rye for Python dependency management and packaging | developer |
| `pyqt6-ui-development-rules` | PyQt6 UI/UX excellence rules for desktop GUI applications | developer |

---

## Frameworks

Framework-specific expertise.

| Skill                                    | Description                                                                                                                                                                                                               | Primary Agents                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `react-expert`                           | React hooks, state management, React 19, Shadcn UI                                                                                                                                                                        | frontend-pro, nextjs-pro, expo-mobile-developer |
| `nextjs-expert`                          | Next.js App Router, Server Components                                                                                                                                                                                     | nextjs-pro                                      |
| `svelte-expert`                          | Svelte and SvelteKit                                                                                                                                                                                                      | sveltekit-expert, tauri-desktop-developer       |
| `graphql-expert`                         | GraphQL schema, Apollo Client/Server                                                                                                                                                                                      | graphql-pro                                     |
| `expo-framework-rule`                    | Expo Framework guidelines                                                                                                                                                                                                 | expo-mobile-developer                           |
| `frontend-expert`                        | UI/UX patterns, responsive design                                                                                                                                                                                         | frontend-pro                                    |
| `webmcp-browser-tools`                   | Browser-side API for web apps to expose their own UI actions as MCP tools TO AI agents. Chrome 146 Canary preview (Feb 2026); `@mcp-b/webmcp-polyfill` available today. NOT for web scraping — use WebFetch/Exa for that. | developer                                       |
| `htmx-expert`                            | HTMX hypermedia patterns, Django/Flask/Go integration                                                                                                                                                                     | developer                                       |
| `paraglide-js-internationalization-i18n` | Paraglide.js i18n implementation for SvelteKit with RTL support                                                                                                                                                           | developer                                       |

| | Angular framework expert including components, services, RxJS, templates, and testing | developer, frontend-pro |
| | Astro framework expert including components, content collections, and integrations | developer, frontend-pro |
| | Applies best practices for logging, project structure, and environment variable usage | developer, golang-pro |
| | Focuses on routing, CSRF protection, context handling, and template usage | developer, golang-pro, security-architect |
| `angular-expert` | Angular framework expert including components, services, RxJS, templates, and testing | developer |
| `astro-expert` | Astro framework expert including components, content collections, and integrations | developer |
| `fiber-logging-and-project-structure` | Applies best practices for logging, project structure, and environment variable usage | developer |
| `fiber-routing-and-csrf-protection` | Focuses on routing, CSRF protection, context handling, and template usage | developer |
| `qwik-expert` | Qwik framework expert including resumability, lazy loading, and optimization | developer |
| `solidjs-expert` | SolidJS expert including reactivity, signals, and store patterns | developer |
| `vue-expert` | Vue.js ecosystem expert including Vue 3, Composition API, Nuxt, and Pinia | developer |

---

## Vercel & Web Performance

Skills sourced from VoltAgent awesome-agent-skills (Vercel Labs, Google Labs, Cloudflare).

| Skill                          | Description                                                                                          | Primary Agents |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- | -------------- |
| `enhance-prompt`               | Transforms vague UI/feature requests into structured, optimized prompts with design system awareness | developer      |
| `next-upgrade`                 | 9-step Next.js version migration workflow with codemod automation (13→14→15→16)                      | developer      |
| `vercel-deploy`                | Zero-auth Vercel deployment with auto framework detection for 20+ frameworks                         | developer      |
| `shadcn-ui`                    | shadcn/ui component library deep expertise — Tailwind v4, Radix primitives, dark mode, App Router    | developer      |
| `web-perf`                     | 5-phase web performance audit (Core Web Vitals: LCP, CLS, INP) with Chrome DevTools integration      | developer      |
| `next-cache-components`        | Next.js 16 `'use cache'` directive, `cacheLife()`, `cacheTag()`, PPR integration patterns            | developer      |
| `vercel-ai-sdk-best-practices` | Vercel AI SDK best practices for streaming, server components, and LLM integration in Next.js        | developer      |

---

## Mobile

Mobile development skills.

| Skill                                       | Description                                                           | Primary Agents        |
| ------------------------------------------- | --------------------------------------------------------------------- | --------------------- |
| `ios-expert`                                | SwiftUI, UIKit, Apple frameworks                                      | ios-pro               |
| `android-expert`                            | Jetpack Compose, Kotlin, Material Design                              | developer             |
| `expo-framework-rule`                       | Expo Framework patterns                                               | expo-mobile-developer |
| `tauri-native-api-integration`              | Tauri native APIs                                                     | developer             |
| `mobile-first-design-rules`                 | Mobile-first design patterns                                          | mobile-ux-reviewer    |
| `nativewind-and-tailwind-css-compatibility` | NativeWind/Tailwind version pinning to prevent process(css) errors    | developer             |
| `nativescript`                              | NativeScript mobile app patterns, platform-specific code, TailwindCSS | developer             |

| | Flutter and Dart expert including widgets, state management, and platform integration | developer, expo-mobile-developer |
| `flutter-expert` | Flutter and Dart expert including widgets, state management, and platform integration | developer |

---

## Data & Database

Data processing and database skills.

| Skill                  | Description                                                        | Primary Agents                        |
| ---------------------- | ------------------------------------------------------------------ | ------------------------------------- |
| `database-architect`   | Schema design, query optimization, migrations                      | architect, devops, database-architect |
| `database-expert`      | Prisma, Supabase, SQL/NoSQL patterns                               | database-architect                    |
| `data-expert`          | Data parsing, transformation, validation                           | data-engineer                         |
| `text-to-sql`          | Natural language to SQL conversion                                 | database-architect                    |
| `ai-ml-expert`         | PyTorch, LangChain, LLM integration                                | developer                             |
| `large-data-with-dask` | Optimization strategies for larger-than-memory datasets using Dask | developer                             |

---

## Documentation

Documentation generation skills.

| Skill            | Description                         | Primary Agents   |
| ---------------- | ----------------------------------- | ---------------- |
| `doc-generator`  | API documentation, developer guides | technical-writer |
| `writing-skills` | TDD applied to documentation        | developer        |
| `readme`         | README and project documentation    | technical-writer |
| `gamedev-expert` | Game development documentation      | developer        |

---

## Git & Version Control

Git operations wrapper.

| Skill                            | Description                                                                                          | Primary Agents              |
| -------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------- |
| `commit-validator`               | Validates commit messages against Conventional Commits specification                                 | developer                   |
| `git-expert`                     | Advanced Git operations, token-efficient commands                                                    | developer, rust-pro, devops |
| `github-ops`                     | Structured reconnaissance via GitHub CLI (gh)                                                        | developer                   |
| `finishing-a-development-branch` | Complete a development branch with lint/test verification then commit and open PR or merge           | developer                   |
| `using-git-worktrees`            | Create isolated development workspaces for parallel feature work without affecting main working tree | developer                   |
| `smart-revert`                   | Git-aware smart revert with impact analysis and rollback gate validation before execution            | developer                   |

---

## Code Style & Linting

Code style enforcement.

| Skill                  | Description                | Primary Agents |
| ---------------------- | -------------------------- | -------------- |
| `code-style-validator` | AST-based style validation | developer      |
| `dry-principle`        | DRY principle enforcement  | developer      |

---

## Creator Tools

Framework artifact creators. All 9 creator skills now include **Step 0.5 (Companion Check)** before creation begins, displaying must-have/should-have/nice-to-have companion checklist for awareness.

| Skill                 | Description                                                             | Primary Agents         |
| --------------------- | ----------------------------------------------------------------------- | ---------------------- |
| `research-synthesis`  | Research synthesis for artifact creation (invoke BEFORE other creators) | all creators           |
| `agent-creator`       | Creates specialized AI agents (with Step 0.5 companion check)           | evolution-orchestrator |
| `agent-updater`       | Refreshes existing agent prompts/frontmatter with risk scoring          | developer              |
| `skill-creator`       | Creates and validates skills (with Step 0.5 companion check)            | evolution-orchestrator |
| `skill-updater`       | Refreshes existing skills with research + TDD + integration validation  | developer              |
| `workflow-updater`    | Refreshes existing workflows with phase-gate idempotency checks         | developer              |
| `hook-creator`        | Creates framework hooks (with Step 0.5 companion check)                 | developer              |
| `workflow-creator`    | Creates orchestration workflows (with Step 0.5 companion check)         | developer              |
| `template-creator`    | Creates templates (with Step 0.5 companion check)                       | developer              |
| `schema-creator`      | Creates JSON Schema validators (with Step 0.5 companion check)          | developer              |
| `command-creator`     | Creates thin-delegator slash commands (with Step 0.5 companion check)   | evolution-orchestrator |
| `rule-creator`        | Creates workspace convention rules (with Step 0.5 companion check)      | evolution-orchestrator |
| `tool-creator`        | Creates CLI tools and utilities (with Step 0.5 companion check)         | developer              |
| `artifact-updater`    | Updates existing artifacts (unified updater for all types)              | all creators           |
| `artifact-integrator` | Deep integration analysis for newly created artifacts                   | developer              |

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

| Skill                             | Description                                                  | Primary Agents            |
| --------------------------------- | ------------------------------------------------------------ | ------------------------- |
| `context-compressor`              | Context compression methodology                              | all agents                |
| `token-saver-context-compression` | Search-aware context compression with MemoryRecord mapping   | developer                 |
| `memory-quality-auditor`          | Audits retrieval drift, staleness, and citation groundedness | developer                 |
| `session-handoff`                 | Handoff document creation                                    | all agents                |
| `task-management-protocol`        | Task synchronization protocol                                | all agents                |
| `context-driven-development`      | Context as managed artifacts                                 | all agents                |
| `insight-extraction`              | Extract session learnings                                    | all agents                |
| `track-management`                | Logical work unit management                                 | conductor-validator       |
| `pipeline-reflection-ux`          | Step 0/reflection UX and pipeline-noise control              | developer                 |
| `framework-context`               | Structured framework context for reflection/planning         | reflection-agent, planner |
| `recommend-evolution`             | Trigger-based evolution recommendation and request recording | reflection-agent, planner |
| `assimilate`                      | External benchmark assimilation into TDD upgrade backlog     | developer                 |
| `creation-feasibility-gate`       | Preflight viability check before creator/evolution execution | developer                 |
| `compliance-policy-check`         | Rule/policy compliance gate for high-risk design/evolution   | developer                 |
| `troubleshooting-regression`      | Debug-log-first regression triage and remediation validation | developer                 |
| `memory-search`                   | Semantic search over global memory for active context lookup | developer                 |

---

## Validation & Quality

Quality validation skills.

| Skill                                | Description                                                                                                                                                 | Primary Agents           |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `verification-before-completion`     | Pre-completion gate                                                                                                                                         | all agents               |
| `checklist-generator`                | IEEE 1028 + contextual checklists                                                                                                                           | developer                |
| `proactive-audit`                    | Framework artifact health checks (hooks, skills, agents, routing)                                                                                           | developer                |
| `ecosystem-integrity-scanner`        | Deep structural health scan: phantom require() paths, missing skills, archive refs, stale catalog counts, encoding issues, empty directories                | qa, developer, architect |
| `response-rater`                     | Plan and response quality audits                                                                                                                            | master-orchestrator      |
| `test-generator`                     | Test code generation                                                                                                                                        | qa                       |
| `accessibility`                      | WCAG compliance validation                                                                                                                                  | mobile-ux-reviewer       |
| `eval-harness-updater`               | Refreshes eval harness reliability and SLO gates                                                                                                            | developer                |
| `qa-workflow`                        | QA validation and fix loop workflow — validates implementation completeness, iterates fix cycles until all acceptance criteria pass and quality gates clear | developer                |
| `strict-user-requirements-adherence` | Enforce strict adherence to user-specified flows and documented features, preventing scope creep                                                            | developer                |

---

## Specialized Patterns

Advanced patterns and methodologies.

| Skill                                | Description                                                                                                                                                                                 | Primary Agents            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `thinking-tools`                     | Self-reflection patterns (think-about-\*)                                                                                                                                                   | all agents                |
| `spec-gathering`                     | Requirements gathering                                                                                                                                                                      | pm                        |
| `spec-init`                          | Unified spec creation                                                                                                                                                                       | developer                 |
| `sequential-thinking`                | Structured problem solving                                                                                                                                                                  | all agents                |
| `consensus-voting`                   | Byzantine consensus for multi-agent decisions                                                                                                                                               | devops, swarm-coordinator |
| `swarm-coordination`                 | Multi-agent swarm patterns                                                                                                                                                                  | swarm-coordinator         |
| `interactive-requirements-gathering` | A/B/C/D/E questionnaire framework                                                                                                                                                           | developer                 |
| `planning-with-files`                | Persistent planning files                                                                                                                                                                   | developer                 |
| `sparc-methodology`                  | SPARC development methodology                                                                                                                                                               | developer                 |
| `agent-evaluation`                   | LLM-as-judge evaluation framework with 5-dimension rubric for scoring AI-generated content quality                                                                                          | developer                 |
| `context-degradation`                | Token-range severity zones with detection checklist and corrective routing actions for context window degradation                                                                           | developer                 |
| `property-based-testing`             | fast-check patterns for JS/TS — 6 canonical property categories with worked examples targeting agent-studio utilities                                                                       | developer                 |
| `agent-tool-design`                  | The Agent Tool Contract — 5 principles for designing tools agents call reliably with anti-pattern table                                                                                     | developer                 |
| `sharp-edges`                        | Living catalogue of 7 known hazard entries specific to agent-studio: Windows backslash paths, prototype pollution, hook exit codes, async swallowing, ReDoS, DST arithmetic, array mutation | developer                 |
| `brainstorming`                      | Socratic design refinement before implementation — challenges assumptions, surfaces alternatives, identifies risks before code is written                                                   | developer                 |
| `commit-validator`                   | Validate commit messages against Conventional Commits specification — provides instant feedback with types, scope, and subject rules enforcement                                            | developer                 |
| `qa-workflow`                        | QA validation and fix loop workflow — validates implementation completeness then iterates fix cycles until all acceptance criteria pass and quality gates clear                             | developer                 |
| `spec-critique`                      | Self-critique specification documents using extended thinking — surfaces hidden assumptions, contradictions, missing edge cases, and scope creep before implementation                      | developer                 |
| `subagent-driven-development`        | Execute implementation plans via autonomous subagents with two-stage review per task — dispatches specialist agents for each task and gates on quality before proceeding                    | master-orchestrator       |
| `requesting-code-review`             | Dispatch code-reviewer agent for structured two-stage code review — prepares diff context, submits review request, and tracks feedback to resolution                                        | code-reviewer             |
| `receiving-code-review`              | Process and act on code review feedback — parses reviewer findings, prioritizes fixes by severity, implements changes, and confirms resolution before sign-off                              | code-reviewer             |
| `finishing-a-development-branch`     | Complete a development branch with structured merge or PR options — verifies tests pass, lint is clean, reviews diff summary, then commits and opens PR or merges                           | developer                 |
| `using-git-worktrees`                | Create isolated development workspaces with safety verification — sets up git worktrees for parallel feature work without affecting main working tree                                       | developer                 |
| `strict-user-requirements-adherence` | Enforce strict adherence to user-specified flows and documented features — prevents scope creep by gating every change against explicit requirements                                        | developer                 |
| `smart-revert`                       | Git-aware smart revert for tracks, phases, and tasks — safely rolls back changes with impact analysis and rollback gate validation before execution                                         | developer                 |
| `dispatching-parallel-agents`        | Concurrent investigation of independent failures using parallel subagents — fans out diagnosis tasks to specialist agents and synthesizes findings for coordinated resolution               | developer                 |

---

## External Integrations

External tools and systems.

| Skill                     | Description                                                                                                    | Primary Agents |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------- |
| `project-onboarding`      | New codebase onboarding                                                                                        | all agents     |
| `dynamic-api-integration` | Discover, parse, and call external HTTP APIs at runtime using OpenAPI specs and tool templates (UTCP-inspired) | developer      |
| `medusa`                  | Medusa headless commerce rules: workflows, data models, services, admin SDK                                    | developer      |

| | Applies general rules for Convex development, emphasizing schema design, validator usage, and correct handling of system fields. | developer |
| `convex-development-general` | Applies general rules for Convex development, emphasizing schema design, validator usage, and correct handling of system fields. | developer |
| `starknet-react-rules` | Starknet React blockchain integration rules with hooks, error handling, and UI feedback patterns | developer |

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

| Skill                        | Description                  | Primary Agents     |
| ---------------------------- | ---------------------------- | ------------------ |
| `incident-runbook-templates` | Runbook creation             | incident-responder |
| `on-call-handoff-patterns`   | On-call handoff procedures   | incident-responder |
| `postmortem-writing`         | Blameless postmortem writing | incident-responder |

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

| Skill                  | Description                                                                 | Primary Agents     |
| ---------------------- | --------------------------------------------------------------------------- | ------------------ |
| `advanced-elicitation` | Meta-cognitive reasoning (15+ methods)                                      | all agents         |
| `summarize-changes`    | Code change summarization                                                   | context-compressor |
| `container-expert`     | Container orchestration                                                     | c4-container       |
| `php-expert`           | PHP development                                                             | php-pro            |
| `jira-pm`              | Jira project management, issue tracking, JQL queries, and sprint management | developer          |
| `linear-pm`            | Linear project management including issues, projects, cycles, and roadmaps  | developer          |

---

## Restored Compatibility Skills

Skills restored from archive for backward compatibility and agent reference continuity.

| Skill                                | Description                                                  | Primary Agents |
| ------------------------------------ | ------------------------------------------------------------ | -------------- |
| `build-tools-expert`                 | Build tooling patterns and optimization workflows            | developer      |
| `composer-dependency-management`     | Composer dependency governance and update safety checks      | developer      |
| `dto-conventions`                    | DTO design conventions and mapping consistency               | developer      |
| `form-and-actions-in-sveltekit`      | SvelteKit form/action patterns and validation flow           | developer      |
| `form-validation-with-zod`           | Zod-based validation patterns for form input safety          | developer      |
| `function-length-and-responsibility` | Function sizing and single-responsibility enforcement        | developer      |
| `restcontroller-conventions`         | REST controller contract and endpoint structure conventions  | developer      |
| `rule-auditor`                       | Rule quality audit and governance checks                     | developer      |
| `seo-and-meta-tags-in-sveltekit`     | SEO metadata and head management patterns for SvelteKit      | developer      |
| `service-class-conventions`          | Service-layer structure and responsibility boundaries        | developer      |
| `tall-stack-general`                 | TALL stack conventions for Laravel/Alpine/Livewire workflows | developer      |
| `tauri-security-rules`               | Tauri desktop security rules and hardening patterns          | developer      |
| `tauri-svelte-typescript-general`    | Tauri + Svelte + TypeScript integration conventions          | developer      |
| `tauri-svelte-ui-components`         | UI component architecture patterns for Tauri/Svelte projects | developer      |
| `tsconfig-json-rules`                | TypeScript compiler configuration conventions and guardrails | developer      |

---

## Additional Onboarded Skills

Skills present on disk and now explicitly cataloged for index/discovery completeness.

| Skill                                          | Description                                                                                                                                                            | Primary Agents           |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `qa-workflow`                                  | QA validation and fix loop workflow — validates implementation completeness then iterates fix cycles until all acceptance criteria pass and quality gates clear        | developer                |
| `spec-critique`                                | Self-critique specification documents using extended thinking — surfaces hidden assumptions, contradictions, missing edge cases, and scope creep before implementation | developer                |
| `advanced-elicitation`                         | Meta-cognitive elicitation patterns for requirement clarification                                                                                                      | developer                |
| `artifact-integrator`                          | Deep integration analysis and cross-artifact consistency checks                                                                                                        | developer                |
| `best-practices-guidelines`                    | Cross-cutting engineering best-practice baseline                                                                                                                       | developer                |
| `code-semantic-search`                         | Semantic code search over indexed repositories                                                                                                                         | developer                |
| `code-structural-search`                       | AST-structural pattern search for code analysis                                                                                                                        | developer                |
| `differential-review`                          | Security-focused differential review of code changes                                                                                                                   | developer                |
| `dry-principle`                                | DRY enforcement and duplication reduction patterns                                                                                                                     | developer                |
| `insecure-defaults`                            | Detection of insecure defaults and fail-open configurations                                                                                                            | developer                |
| `planning-with-files`                          | File-based planning workflow for long-running implementation tasks                                                                                                     | developer                |
| `prd-generator`                                | Product requirements document generation workflow                                                                                                                      | developer                |
| `semgrep-rule-creator`                         | Custom Semgrep rule authoring and validation                                                                                                                           | developer                |
| `sparc-methodology`                            | SPARC methodology for structured delivery workflows                                                                                                                    | developer                |
| `spec-init`                                    | Unified specification initialization and scaffolding                                                                                                                   | developer                |
| `static-analysis`                              | Static analysis execution and result triage                                                                                                                            | developer                |
| `tauri-native-api-integration`                 | Native API integration patterns for Tauri desktop applications                                                                                                         | developer                |
| `variant-analysis`                             | Variant detection workflows for vulnerability classes                                                                                                                  | developer                |
| `api-development-expert`                       | API development expert including REST design, OpenAPI, and docs                                                                                                        | fastapi-pro, graphql-pro |
| `artifact-lifecycle`                           | Unified lifecycle management for all framework artifacts                                                                                                               | evolution-orchestrator   |
| `arxiv-mcp`                                    | Search and retrieve academic papers from arXiv.org                                                                                                                     | researcher               |
| `ask-questions-if-underspecified`              | Ask minimum clarifying questions before implementation                                                                                                                 | developer                |
| `async-operations`                             | Async/await syntax patterns and async operation best practices                                                                                                         | developer                |
| `audit-context-building`                       | Ultra-granular code analysis for deep security context building                                                                                                        | developer                |
| `aws-cloud-ops`                                | AWS cloud operations for CloudWatch, S3, Lambda, EC2, and IAM                                                                                                          | developer                |
| `building-secure-contracts`                    | Smart contract and secure API contract security analysis                                                                                                               | developer                |
| `chrome-browser`                               | Browser automation with Chrome DevTools MCP and claude-in-chrome                                                                                                       | developer                |
| `ci-cd-implementation-rule`                    | GitHub Actions or GitLab CI for CI/CD implementation                                                                                                                   | developer                |
| `cloud-devops-expert`                          | Cloud and DevOps expert including AWS, GCP, Azure, and Terraform                                                                                                       | developer                |
| `comprehensive-type-annotations`               | Detailed type annotations for all Python functions and classes                                                                                                         | developer                |
| `comprehensive-unit-testing-with-pytest`       | High-coverage pytest testing for common and edge cases                                                                                                                 | developer                |
| `configuration-management`                     | Configuration management techniques and best practices                                                                                                                 | developer                |
| `containerization-rules`                       | Rules for creating and maintaining Dockerfiles                                                                                                                         | devops                   |
| `cpp`                                          | C++ coding standards and best practices                                                                                                                                | developer                |
| `dependency-analyzer`                          | Analyze project dependencies and detect outdated packages                                                                                                              | developer                |
| `design-and-user-experience-guidelines`        | Design and UX guidelines including dark mode                                                                                                                           | developer                |
| `expo-mobile-app-rule`                         | Best practices for Expo-based mobile app development                                                                                                                   | developer                |
| `feature-flag-management`                      | Feature flag lifecycle management and gradual rollouts                                                                                                                 | developer                |
| `filesystem`                                   | File system operations guidance for Claude Code                                                                                                                        | devops                   |
| `fix-review`                                   | Verify fix commits address security findings without regressions                                                                                                       | developer                |
| `gcloud-cli`                                   | Google Cloud CLI operations and resource management                                                                                                                    | developer                |
| `github-mcp`                                   | GitHub API operations via MCP - repos, issues, PRs, actions                                                                                                            | developer, devops        |
| `gitops-workflow`                              | GitOps workflows with ArgoCD and Flux for declarative K8s                                                                                                              | developer                |
| `helm-chart-scaffolding`                       | Helm chart design and management for Kubernetes packaging                                                                                                              | developer                |
| `html-tailwind-css-and-javascript-expert-rule` | HTML, Tailwind CSS, and vanilla JS expert rules                                                                                                                        | developer                |
| `jupyter-notebook-best-practices`              | Jupyter notebook structure and documentation guidelines                                                                                                                | developer                |
| `k8s-security-policies`                        | Kubernetes NetworkPolicy, PodSecurityPolicy, RBAC implementation                                                                                                       | developer                |
| `kubernetes-flux`                              | Kubernetes cluster management and Flux GitOps troubleshooting                                                                                                          | devops                   |
| `logging-module-usage`                         | Logging module best practices for production observability                                                                                                             | developer                |
| `mobile-ui-development-rule`                   | Mobile UI/UX best practices and platform conventions                                                                                                                   | mobile-ux-reviewer       |
| `modern-python`                                | Modern Python with uv, ruff, ty, and pytest — Trail of Bits style                                                                                                      | developer                |
| `multi-agent-architecture-reference`           | Decision matrix for multi-agent topology selection                                                                                                                     | developer                |
| `pandas-data-manipulation-rules`               | Pandas rules for data manipulation and method chaining                                                                                                                 | developer                |
| `powershell-expert`                            | PowerShell scripting and Windows system administration                                                                                                                 | developer                |
| `prioritize-python-3-10-features`              | Prioritize Python 3.12+ features and syntax                                                                                                                            | developer                |
| `project-analyzer`                             | Automated brownfield codebase analysis for project onboarding                                                                                                          | developer                |
| `react-best-practices-vercel`                  | React and Next.js performance optimization — Vercel guidelines                                                                                                         | frontend-pro             |
| `react-native-skills-vercel`                   | React Native and Expo best practices for mobile apps                                                                                                                   | developer                |
| `recovery`                                     | Workflow recovery protocol after context loss or session interrupt                                                                                                     | developer                |
| `skill-discovery`                              | How agents discover and invoke skills — invocation protocol guide                                                                                                      | router                   |
| `slack-notifications`                          | Slack messaging, channels, and notification management                                                                                                                 | developer                |
| `spec-to-code-compliance`                      | Verify implementation faithfully implements its specification                                                                                                          | developer                |
| `state-management-expert`                      | State management with MobX, Redux, Zustand, and reactive patterns                                                                                                      | developer                |
| `styling-expert`                               | CSS and styling expert — Tailwind, CSS-in-JS, responsive design                                                                                                        | frontend-pro             |
| `template-renderer`                            | Render templates by replacing {{TOKEN}} placeholders                                                                                                                   | developer                |
| `tool-search`                                  | Semantic tool search with embeddings for tool discovery                                                                                                                | developer                |
| `ui-components-expert`                         | UI component library expert — Chakra, Material UI, Mantine                                                                                                             | developer                |
| `visual-and-observational-rules`               | Visual observation rules for game AI and environmental sensing                                                                                                         | developer                |
| `webapp-testing`                               | Test local web applications with Playwright and Python                                                                                                                 | developer                |
| `web-design-guidelines-vercel`                 | Web Interface Guidelines compliance review — Vercel standards                                                                                                          | frontend-pro             |
| `workflow-patterns`                            | TDD task implementation patterns — red-green-refactor cycle                                                                                                            | conductor-validator      |
| `yara-authoring`                               | YARA-X detection rule authoring with expert judgment and linting                                                                                                       | developer                |

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

**Catalog Accuracy:** Updated 2026-02-22 — 143+ skills cataloged across all sections

---

**Provenance:** Pipeline #16B | Task #124 | Agent: developer | Date: 2026-02-07
