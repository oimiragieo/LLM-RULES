# Skill Catalog

> **Total Skills: 436** (2 deprecated) | Last Updated: 2026-01-30

This catalog indexes all skills available in the Claude Code Enterprise Framework.

## Quick Reference by Category

| Category | Count | Key Skills |
|----------|-------|------------|
| [Core Development](#core-development) | 10 | tdd (includes testing-expert), debugging, ripgrep |
| [Planning & Architecture](#planning--architecture) | 6 | plan-generator, architecture-review, brainstorming |
| [Security](#security) | 6 | security-architect, memory-forensics, auth-security-expert |
| [DevOps & Infrastructure](#devops--infrastructure) | 19 | aws-cloud-ops, docker-compose, kubernetes-flux, vercel-deploy-claimable |
| [Languages](#languages) | 16 | python-backend-expert, typescript-expert, go-expert |
| [Frameworks](#frameworks) | 26 | react-expert, react-best-practices-vercel, composition-patterns-vercel, nextjs-expert, flutter-expert |
| [Mobile](#mobile) | 9 | ios-expert, android-expert, react-native-skills-vercel, flutter-expert |
| [Data & Database](#data--database) | 12 | database-architect, text-to-sql, ai-ml-expert |
| [Documentation](#documentation) | 10 | doc-generator, writing-skills, readme |
| [Git & Version Control](#git--version-control) | 10 | git-expert, gitflow, finishing-a-development-branch |
| [Code Style & Linting](#code-style--linting) | 18 | code-style-validator, editing-code-rules |
| [Creator Tools](#creator-tools) | 11 | research-synthesis, agent-creator, skill-creator, template-renderer |
| [Memory & Context](#memory--context) | 9 | context-compressor, session-handoff, operational-modes |
| [Validation & Quality](#validation--quality) | 8 | qa-workflow, verification-before-completion |
| [Specialized Patterns](#specialized-patterns) | 27 | thinking-tools, spec-gathering, progressive-disclosure |
| [Framework Configuration](#framework-specific-configuration) | 26 | form-validation-with-zod, starknet-react-rules |
| [Styling & Design](#styling--design) | 15 | styling-expert, ui-components-expert, web-design-guidelines-vercel, aceternity-ui-configuration |
| [Build Tools](#build-tools--dependency-management) | 9 | build-tools-expert, dependency-analyzer |
| [External Integrations](#external-integrations) | 11 | slack-notifications, github-mcp, chrome-browser, arxiv-mcp |
| [Project Structure](#project-structure) | 8 | folder-structure, directory-naming-convention |
| [Java Spring Boot](#java-spring-boot) | 6 | dto-conventions, apiresponse-class, service-class-conventions |
| [Agent Behavior](#agent-behavior) | 12 | assistant-behavior-rules, communication-tone |
| [Scientific Research](#scientific-research) | 142 | scientific-skills (rdkit, scanpy, biopython) |
| [Other Specialized](#other-specialized) | 22 | gamedev-expert, toon-format, use-case-example |

---

## Core Development

Essential development workflow skills.

| Skill | Description | Tools |
|-------|-------------|-------|
| `tdd` | Test-Driven Development with Iron Laws enforcement. **Includes testing-expert** (aliases: testing-expert) | Read, Write, Edit, Bash, Glob, Grep |
| `debugging` | Systematic 4-phase debugging methodology | Read, Write, Edit, Bash, Glob, Grep |
| `code-quality-expert` | Clean code, style guides, and refactoring | Read, Write, Edit, Bash, Grep, Glob |
| ~~`testing-expert`~~ | **DEPRECATED** - Merged into `tdd` skill | - |
| `comprehensive-unit-testing-with-pytest` | High test coverage using pytest | Read, Write, Edit, Bash |
| `unit-testing-requirement` | Enforces unit tests for reliability | Read, Write, Edit, Bash |
| `test-generator` | Generates test code from specs | Read, Write, Glob, Grep |
| `async-operations` | Async operation patterns | Read, Write, Edit |
| `logging-module-usage` | Logging module best practices | Read, Write, Edit |
| `library-usage` | Library usage guidelines | Read, Write, Edit |
| `ripgrep` | Enhanced code search with .mjs/.cjs/.mts/.cts support | Bash |

**Invocation:**
```javascript
Skill({ skill: 'tdd' });           // Primary testing skill (includes testing-expert)
Skill({ skill: 'testing-expert' }); // Alias - redirects to tdd
Skill({ skill: 'debugging' });
```

---

## Planning & Architecture

Design and planning skills.

| Skill | Description | Tools |
|-------|-------------|-------|
| `plan-generator` | Creates structured implementation plans | Read, Write |
| `task-breakdown` | Breaks plans into Epic→Story→Task lists with P1/P2/P3 prioritization | Read, Write, Skill, TaskCreate, TaskUpdate, TaskList, Grep, Glob |
| `architecture-review` | Architecture review and design validation | Read, Write, Edit, Glob, Grep |
| `brainstorming` | Socratic design refinement | Read, Write |
| `strategic-planning-with-pseudocode` | Pseudocode before implementation | Read, Write, Edit |
| `complexity-assessment` | AI-based complexity assessment | Read, Glob, Grep |
| `diagram-generator` | Architecture and flow diagrams | Read, Write, Edit, Bash |

---

## Security

Security analysis and validation.

| Skill | Description | Tools |
|-------|-------------|-------|
| `security-architect` | OWASP Top 10, threat modeling | Read, Write, Edit, Bash, Glob, Grep |
| `auth-security-expert` | OAuth 2.1, JWT, encryption | Read, Write, Edit, Bash, Grep, Glob |
| `authentication-flow-rules` | OAuth 2.1 compliant flows | Read, Write, Edit |
| `binary-analysis-patterns` | Disassembly and decompilation | Read, Write, Edit, Bash, Glob, Grep |
| `protocol-reverse-engineering` | Network protocol RE | Read, Write, Edit, Bash, Glob, Grep |
| `memory-forensics` | Memory acquisition and artifact extraction | Read, Write, Edit, Bash, Glob, Grep |

---

## DevOps & Infrastructure

Cloud, containers, and infrastructure.

| Skill | Description | Tools |
|-------|-------------|-------|
| `aws-cloud-ops` | CloudWatch, S3, Lambda, EC2, IAM | Bash, Read |
| `cloud-devops-expert` | AWS, GCP, Azure, Terraform | Read, Write, Edit, Bash, Grep, Glob |
| `cloud-native-and-kubernetes-expertise-rules` | Cloud-native and K8s expertise | Read, Write, Edit, Bash |
| `container-expert` | Docker, Kubernetes, Helm | Read, Write, Edit, Bash, Grep, Glob |
| `docker-compose` | Docker Compose orchestration | Read, Write, Edit |
| `containerization-rules` | Dockerfile best practices | Read, Write, Edit |
| `kubernetes-flux` | Kubernetes with Flux | Read, Write, Edit |
| `k8s-manifest-generator` | Production-ready K8s manifests | Read, Write, Edit |
| `k8s-security-policies` | Kubernetes security policies | Read, Write, Edit |
| `terraform-infra` | Terraform with safety controls | Bash, Read, Glob |
| `helm-chart-scaffolding` | Helm chart management | Read, Write, Edit |
| `gcloud-cli` | Google Cloud CLI | Bash, Read |
| `sentry-monitoring` | Error tracking and monitoring | Bash, Read, WebFetch |
| `ci-cd-implementation-rule` | GitHub Actions/GitLab CI | Read, Write, Edit |
| `incident-runbook-templates` | Incident runbook creation | Read, Write, Edit |
| `on-call-handoff-patterns` | On-call handoff procedures | Read, Write, Edit |
| `postmortem-writing` | Post-incident analysis | Read, Write, Edit |
| `configuration-management` | Configuration management patterns | Read, Write, Edit |
| `vercel-deploy-claimable` | Deploy applications and websites to Vercel with auto-framework detection (40+ frameworks). Returns preview URL + claimable deployment link. No authentication required. | Bash, Read |

---

## Languages

Language-specific expertise.

| Skill | Description | Tools |
|-------|-------------|-------|
| `python-backend-expert` | Django, FastAPI, Flask, SQLAlchemy | Read, Write, Edit, Bash, Grep, Glob |
| `typescript-expert` | TypeScript patterns and types | Read, Write, Edit, Bash, Grep, Glob |
| `go-expert` | Go programming | Read, Write, Edit, Bash, Grep, Glob |
| `java-expert` | Java and Spring Boot | Read, Write, Edit, Bash, Grep, Glob |
| `php-expert` | PHP and Laravel | Read, Write, Edit, Bash, Grep, Glob |
| `cpp` | C++ programming guidelines | Read, Write, Edit |
| `elixir-expert` | Elixir and Phoenix | Read, Write, Edit, Bash, Grep, Glob |
| `nodejs-expert` | Node.js, Express, NestJS | Read, Write, Edit, Bash, Grep, Glob |
| `prioritize-python-3-10-features` | Python 3.10+ features | Read, Write, Edit |
| `comprehensive-type-annotations` | Python type annotations | Read, Write, Edit |
| `type-hinting-rule` | Strict typing with typing module | Read, Write, Edit |
| `asynchronous-programming-preference` | Async/await patterns | Read, Write, Edit |
| `functional-programming-preference` | Functional programming patterns | Read, Write, Edit |
| `rell-general-rules` | Rell programming | Read, Write, Edit |
| `latest-language-versions-and-best-practices` | Latest language features | Read, Write, Edit |
| `jupyter-notebook-best-practices` | Jupyter notebook guidelines | Read, Write, Edit |

---

## Frameworks

Framework-specific expertise.

| Skill | Description | Tools |
|-------|-------------|-------|
| `react-expert` | React 19, hooks, state management | Read, Write, Edit, Bash, Grep, Glob |
| `react-best-practices-vercel` | React/Next.js performance optimization (59 rules, 8 categories: waterfalls, bundle size, server-side, client-side, re-renders, rendering, JS, advanced) | Read, Write, Edit |
| `composition-patterns-vercel` | React composition patterns (10 rules, 4 categories: component architecture, state management, implementation patterns, React 19 APIs) | Read, Write, Edit |
| `nextjs-expert` | Next.js framework | Read, Write, Edit, Bash, Grep, Glob |
| `svelte-expert` | Svelte and SvelteKit | Read, Write, Edit, Bash, Grep, Glob |
| `vue-expert` | Vue 3, Composition API, Nuxt | Read, Write, Edit, Bash, Grep, Glob |
| `angular-expert` | Angular framework | Read, Write, Edit, Bash, Grep, Glob |
| `astro-expert` | Astro framework | Read, Write, Edit, Bash, Grep, Glob |
| `qwik-expert` | Qwik framework | Read, Write, Edit, Bash, Grep, Glob |
| `solidjs-expert` | SolidJS | Read, Write, Edit, Bash, Grep, Glob |
| `flutter-expert` | Flutter and Dart | Read, Write, Edit, Bash, Grep, Glob |
| `backend-expert` | Backend development | Read, Write, Edit, Bash, Grep, Glob |
| `frontend-expert` | Frontend development | Read, Write, Edit, Bash, Grep, Glob |
| `graphql-expert` | GraphQL | Read, Write, Edit, Bash, Grep, Glob |
| `api-development-expert` | REST design and OpenAPI | Read, Write, Edit, Bash, Grep, Glob |
| `trpc-api-rule` | tRPC API conventions | Read, Write, Edit |
| `htmx-expert` | HTMX | Read, Write, Edit, Bash, Grep, Glob |
| `tall-stack-general` | TALL stack guidelines | Read, Write, Edit |
| `chrome-extension-expert` | Chrome extension development | Read, Write, Edit, Bash, Grep, Glob |
| `state-management-expert` | MobX, Redux, Zustand | Read, Write, Edit, Bash, Grep, Glob |
| `convex-development-general` | Convex development | Read, Write, Edit |
| `additional-htmx-and-flask-instructions` | HTMX with Flask | Read, Write, Edit |
| `fiber-logging-and-project-structure` | Go Fiber logging | Read, Write, Edit |
| `fiber-routing-and-csrf-protection` | Go Fiber routing | Read, Write, Edit |
| `kafka-development-practices` | Kafka development | Read, Write, Edit, Bash |
| `activities` | Temporal activities | Read, Write, Edit |

---

## Mobile

Mobile development.

| Skill | Description | Tools |
|-------|-------------|-------|
| `ios-expert` | iOS development | Read, Write, Edit, Bash, Grep, Glob |
| `android-expert` | Android, Jetpack Compose, Kotlin | Read, Write, Edit, Bash, Grep, Glob |
| `flutter-expert` | Flutter and Dart | Read, Write, Edit, Bash, Grep, Glob |
| `react-native-skills-vercel` | React Native/Expo performance (38 rules, 8 categories: list performance, animation, navigation, UI, state, rendering, monorepo, config) | Read, Write, Edit |
| `expo-framework-rule` | Expo guidelines | Read, Write, Edit |
| `expo-mobile-app-rule` | Expo/React Native best practices | Read, Write, Edit |
| `nativescript` | NativeScript | Read, Write, Edit |
| `mobile-first-design-rules` | Mobile-first design | Read, Write, Edit |
| `mobile-ui-development-rule` | Mobile UI development | Read, Write, Edit |

---

## Data & Database

Data processing, AI/ML, and database.

| Skill | Description | Tools |
|-------|-------------|-------|
| `database-architect` | Database design and optimization | Read, Write, Edit, Bash, Grep, Glob |
| `database-expert` | Database expertise | Read, Write, Edit, Bash, Grep, Glob |
| `data-expert` | Data processing | Read, Write, Edit, Bash, Grep, Glob |
| `ai-ml-expert` | PyTorch, LangChain, LLM integration | Read, Write, Edit, Bash, Grep, Glob, WebSearch |
| `text-to-sql` | Natural language to SQL | Read, Write, Grep, Glob |
| `pandas-data-manipulation-rules` | Pandas data manipulation | Read, Write, Edit |
| `large-data-with-dask` | Dask for large data | Read, Write, Edit |
| `drizzle-orm-rules` | Drizzle ORM | Read, Write, Edit |
| `entity-class-conventions` | Entity class standards | Read, Write, Edit |
| `repository-class-conventions` | JpaRepository patterns | Read, Write, Edit |
| `vercel-kv-database-rules` | Vercel KV database | Read, Write, Edit |
| `experiment-configuration-with-hydra-yaml` | Hydra YAML experiments | Read, Write, Edit |

---

## Documentation

Documentation generation.

| Skill | Description | Tools |
|-------|-------------|-------|
| `doc-generator` | Comprehensive documentation | Read, Write, Edit, Bash, Glob, Grep |
| ~~`writing`~~ | **DEPRECATED** - Merged into `writing-skills` skill | - |
| `writing-skills` | TDD for documentation + writing style. **Includes writing** (aliases: writing) | Read, Write, Edit, Bash, Task |
| `writing-plans` | Bite-sized task lists | Read, Write |
| `readme` | README generation | Read, Write, Edit |
| `detailed-docstrings` | Google-style docstrings | Read, Write, Edit |
| `technical-accuracy-and-usability-rules` | Technical accuracy | Read, Write, Edit, Bash |
| `metadata-and-seo-rules` | Metadata and SEO | Read, Write, Edit |
| `mkdocs-specific-rules` | MkDocs rules | Read, Write, Edit |
| `content-creation-rules` | High-quality documentation | Read, Write, Edit |
| `prompt-generation-rules` | Prompt generation | Read, Write, Edit, Bash |

---

## Git & Version Control

Git operations.

| Skill | Description | Tools |
|-------|-------------|-------|
| `git-expert` | Advanced Git operations | Read, Write, Edit, Bash, Grep, Glob |
| `gitflow` | Gitflow workflow | Read, Write, Edit |
| `commit-message-guidelines` | Conventional commits | Read, Write, Edit |
| `commit-validator` | Commit message validation | Read, Grep, Bash |
| `version-control-rule` | Git for version control | Read, Write, Edit |
| `collaboration-and-version-control-rules` | Collaboration rules | Read, Write, Edit |
| `smart-revert` | Git-aware smart revert | Read, Bash, Glob, Grep, Write, Edit |
| `using-git-worktrees` | Git worktrees | Read, Bash, Glob |
| `gitops-workflow` | GitOps workflows | Read, Write, Edit |
| `finishing-a-development-branch` | Branch completion workflow | Read, Write, Edit, Bash |

---

## Code Style & Linting

Code style and validation.

| Skill | Description | Tools |
|-------|-------------|-------|
| `code-style-validator` | AST-based style validation | Read, Grep, Bash, Glob |
| `rule-auditor` | Code standards validation | Read, Write, Edit, Bash, Glob, Grep |
| `comment-usage` | Comment guidelines | Read, Write, Edit |
| `bug-handling-with-todo-comments` | TODO comments | Read, Write, Edit |
| `dry-principle` | Don't Repeat Yourself | Read, Write, Edit |
| `function-length-and-responsibility` | Single responsibility | Read, Write, Edit |
| `function-ordering-conventions` | Function ordering | Read, Write, Edit |
| `conditional-encapsulation` | Encapsulate conditionals | Read, Write, Edit |
| `minimal-code-changes-rule` | Minimal changes | Read, Write, Edit |
| `file-by-file-changes-rule` | Single chunk edits | Read, Write, Edit |
| `single-chunk-edits-rule` | All edits in one chunk | Read, Write, Edit |
| `preserve-existing-code-rule` | Preserve existing code | Read, Write, Edit |
| `editing-code-rules` | Code editing guidelines | Read, Write, Edit |
| `explaining-rules` | Explanation guidelines | Read, Write, Edit |
| `imports-aliasing` | Import aliasing patterns | Read, Write, Edit |
| `check-x-md-content-rule` | Markdown content checks | Read, Write, Edit |
| `provide-real-file-links-rule` | Real file link requirements | Read, Write, Edit |
| `html-specific-rules` | HTML-specific guidelines | Read, Write, Edit |

---

## Creator Tools

Framework self-evolution tools.

| Skill | Description | Tools |
|-------|-------------|-------|
| `research-synthesis` | Research best practices BEFORE artifact creation | mcp__Exa__web_search_exa, WebSearch, WebFetch, Read, Write, Glob, Grep |
| `agent-creator` | Creates specialized AI agents | Read, Write, Edit, Glob, Grep, WebSearch, WebFetch, Bash, Task |
| `skill-creator` | Creates and converts skills | Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch |
| `hook-creator` | Creates validation hooks | Read, Write, Edit, Bash, Glob, Grep |
| `template-creator` | Creates templates | Read, Write, Edit, Bash, Glob, Grep |
| `template-renderer` | Renders templates with {{TOKEN}} replacement and schema validation | Read, Write, mcp__filesystem__read_text_file, mcp__filesystem__write_file |
| `schema-creator` | Creates JSON Schemas | Read, Write, Edit, Bash, Glob, Grep |
| `workflow-creator` | Creates multi-agent workflows | Read, Write, Edit, Bash, Glob, Grep |
| `artifact-lifecycle` | Unified lifecycle management for all framework artifacts | Skill (invokes other creators) |
| `artifact-publisher` | Publishes artifacts | Read, Write, Edit, Bash |
| `mcp-converter` | MCP server to skill | Read, Write, Edit, Bash, Glob, Grep |

**Note:** See [CLAUDE.md Section 4.1](../CLAUDE.md) for Creator Ecosystem documentation.

---

## Memory & Context

Context management.

| Skill | Description | Tools |
|-------|-------------|-------|
| `context-compressor` | Context compression | Read, Write |
| `session-handoff` | Session context handoff | Read, Write, Glob, Grep |
| `context-driven-development` | CDD methodology | Read, Write, Edit |
| `context-files-rules` | Context file management | Read, Write, Edit |
| `recovery` | Workflow recovery | Read, Write, Edit, Bash, Glob, Grep |
| `project-onboarding` | Guided project onboarding | Read, Glob, Grep, Bash, Write |
| `project-analyzer` | Brownfield codebase analysis | Read, Glob, Grep, Bash |
| `operational-modes` | Agent mode self-regulation | Read, Glob, Grep |
| `history-and-next-task-rules` | Task history management | Read, Write, Edit |

---

## Validation & Quality

Quality assurance.

| Skill | Description | Tools |
|-------|-------------|-------|
| `qa-workflow` | QA validation and fix loop | Read, Write, Edit, Bash, Glob, Grep |
| `checklist-generator` | Generate IEEE 1028 + contextual quality checklists | Read, Write, Edit, Glob, Grep |
| `verification-before-completion` | Gate function for verification | Read, Bash |
| `response-rater` | Response quality rating | Read, Write, Edit, Bash, Glob, Grep |
| `verify-information-rule` | Verify information first | Read, Write, Edit |
| `thoughtful-and-accurate-responses` | Accurate responses | Read, Write, Edit |
| `truthfulness-and-clarity-for-ai` | Truthful answers | Read, Write, Edit |
| `handle-incomplete-tasks` | Incomplete task handling | Read, Write, Edit |
| `continuous-improvement-focus` | Continuous improvement | Read, Write, Edit |

---

## Specialized Patterns

Advanced workflow patterns.

| Skill | Description | Tools |
|-------|-------------|-------|
| `thinking-tools` | Structured self-reflection | Read, Glob, Grep |
| `sequential-thinking` | Sequential problem solving | Read, Write, Bash |
| `spec-gathering` | Requirements gathering | Read, Write, Edit, Bash, AskUserQuestion |
| `spec-writing` | Specification creation | Read, Write, Edit, Bash, Glob, Grep |
| `spec-critique` | Spec self-critique | Read, Write, Edit, Glob, Grep |
| `interactive-requirements-gathering` | Interactive questionnaires | Read, Write, Edit, Bash |
| `progressive-disclosure` | ECLAIR pattern requirements gathering (3-5 clarification limit) | Read, Write, AskUserQuestion, TaskUpdate, TaskList, Grep, Glob |
| `consensus-voting` | Byzantine consensus | Read, Write, Edit, Bash, Glob, Grep |
| `swarm-coordination` | Multi-agent coordination | Read, Write, Edit, Bash, Glob, Grep |
| `subagent-driven-development` | Autonomous agent execution | Read, Write, Edit, Bash, Task |
| `task-management-protocol` | Task sync and handoff | TaskCreate, TaskList, TaskGet, TaskUpdate, Read, Write |
| `track-management` | Logical work units | - |
| `workflow-patterns` | TDD task patterns | - |
| `smart-debug` | AI-assisted debugging | Read, Grep, Glob, Bash, Task |
| `codebase-integration` | External codebase integration | Read, Write, Edit, Bash, Glob, Grep, Task |
| `repo-rag` | Semantic codebase search | Read, Grep, Glob |
| `code-analyzer` | Static analysis and metrics | Bash, Read, Glob, Grep |
| `summarize-changes` | Change summarization | Read, Glob, Grep, Bash |
| `requesting-code-review` | Dispatch code reviewer | Read, Bash, Task |
| `receiving-code-review` | Process review feedback | Read, Write, Edit, Bash |
| `insight-extraction` | Extract coding insights | Read, Bash, Glob, Grep |
| `dispatching-parallel-agents` | Concurrent investigation | Read, Write, Edit, Bash |
| `executing-plans` | Execute plans with gates | Read, Write, Edit, Bash, Glob, Grep, Task |
| `skill-discovery` | Skill discovery protocol | Read, Glob, Grep |
| `tool-search` | Tool search and discovery | Read, Glob, Grep |
| `dependency-analyzer` | Dependency analysis | Read, Glob, Grep, Bash |
| `filesystem` | Filesystem operations | Read, Write, Bash |

---

## Framework-Specific Configuration

Framework configuration rules.

| Skill | Description |
|-------|-------------|
| `babel-configuration-for-nativewind` | NativeWind Babel config |
| `nativewind-and-tailwind-css-compatibility` | Version compatibility |
| `tsconfig-json-rules` | TypeScript configuration |
| `form-validation-with-zod` | Zod form validation |
| `form-and-actions-in-sveltekit` | SvelteKit forms |
| `seo-and-meta-tags-in-sveltekit` | SvelteKit SEO |
| `paraglide-js-internationalization-i18n` | Paraglide.js i18n |
| `class-based-state-management` | Class-based state |
| `observer-hoc-or-useobserver-hook` | Observer patterns |
| `vueuse-library-rule` | VueUse functions |
| `framer-motion-rules` | Framer Motion |
| `firebase-rules` | Firebase best practices |
| `vercel-ai-sdk-best-practices` | Vercel AI SDK |
| `livewire-implementation-rules` | Livewire guidelines |
| `medusa` | Medusa rules |
| `beefreesdk` | Beefree SDK |
| `ckeditor-rules` | CKEditor config |
| `starknet-react-rules` | StarkNet React integration |
| `tauri-native-api-integration` | Tauri native APIs |
| `tauri-security-rules` | Tauri security |
| `tauri-svelte-typescript-general` | Tauri + Svelte + TS |
| `tauri-svelte-ui-components` | Tauri Svelte UI |
| `browser-api-usage-rules` | Browser API usage |
| `pre-configured-apis-rules` | Pre-configured APIs |
| `internationalization-rule` | i18n guidelines |
| `protocol-buffer-definitions-rule` | Protocol buffers |

---

## Styling & Design

UI/UX and styling.

| Skill | Description | Tools |
|-------|-------------|-------|
| `styling-expert` | CSS and styling | Read, Write, Edit, Bash, Grep, Glob |
| `ui-components-expert` | UI component libraries | Read, Write, Edit, Bash, Grep, Glob |
| `web-design-guidelines-vercel` | Web Interface Guidelines (dynamic fetch, 100+ rules: accessibility, UI patterns, dark mode, i18n, touch optimization) | Read, WebFetch |
| `design-and-user-experience-guidelines` | UX guidelines | Read, Write, Edit, Bash |
| `html-tailwind-css-and-javascript-expert-rule` | HTML/Tailwind/JS | Read, Write, Edit |
| `image-optimization-rules` | Image optimization | Read, Write, Edit |
| `placeholder-images` | Placeholder images | Read, Write, Edit |
| `modular-design-rule` | Modular components | Read, Write, Edit |
| `private-vs-shared-components` | Component scope | Read, Write, Edit |
| `visual-and-observational-rules` | Visual guidelines | Read, Write, Edit |
| `pyqt6-ui-development-rules` | PyQt6 UI | Read, Write, Edit |
| `alpine-js-usage-rules` | Alpine.js usage | Read, Write, Edit |
| `accessibility` | Accessibility rules | Read, Write, Edit |
| `mobile-ux-reviewer` | Mobile UX review | Read, Write, Edit, Bash |
| `aceternity-ui-configuration` | Aceternity UI config | Read, Write, Edit |

---

## Build Tools & Dependency Management

Build and dependency tools.

| Skill | Description | Tools |
|-------|-------------|-------|
| `build-tools-expert` | Vite, Webpack | Read, Write, Edit, Bash, Grep, Glob |
| `dependencies-management-rules` | UV dependency management | Read, Write, Edit |
| `dependency-analyzer` | Dependency analysis | Read, Glob, Grep, Bash |
| `composer-dependency-management` | Composer rules | Read, Write, Edit |
| `poetry-rye-dependency-management` | Poetry/Rye | Read, Write, Edit |
| `virtual-environment-usage` | Virtual environments | Read, Write, Edit |
| `package-json-modification-protection` | Package.json protection | Read, Write, Edit |
| `monorepo-and-tooling` | Monorepo structure | Read, Write, Edit |
| `build-notes-file-rules` | Build notes management | Read, Write, Edit |

---

## External Integrations

Third-party integrations.

| Skill | Description | Tools |
|-------|-------------|-------|
| `slack-notifications` | Slack messaging | Bash, Read, WebFetch |
| `telegram-bot-api-rules` | Telegram Bot API | Read, Write, Edit |
| `github-ops` | GitHub operations | Bash, Read |
| `github-mcp` | GitHub API | Read, Bash |
| `jira-pm` | Jira project management | Bash, Read, WebFetch |
| `linear-pm` | Linear project management | Bash, Read, WebFetch |
| `computer-use` | Desktop automation | Read, Write, Bash, WebFetch |
| `chrome-browser` | Browser automation for testing, debugging, data extraction | mcp__claude-in-chrome__* (13 tools) |
| `arxiv-mcp` | Search and retrieve academic papers from arXiv.org | mcp__arxiv__* (11 tools) |
| `web3-expert` | Web3 and Solidity | Read, Write, Edit, Bash, Grep, Glob |
| `agp-router-rules` | AGP router integration | Read, Write, Edit |

---

## Project Structure

Project organization and structure.

| Skill | Description | Tools |
|-------|-------------|-------|
| `folder-structure` | Project folder structure | Read, Write, Edit |
| `directory-naming-convention` | Directory naming | Read, Write, Edit |
| `file-organization` | File organization | Read, Write, Edit |
| `file-management-rules` | File management | Read, Write, Edit |
| `file-path-usage` | File path conventions | Read, Write, Edit |
| `recommended-folder-structure` | Recommended structure | Read, Write, Edit |
| `root-level-project-instructions` | Root-level setup | Read, Write, Edit |
| `tech-stack` | Tech stack documentation | Read, Write, Edit |

---

## Java Spring Boot

Java Spring Boot specific skills.

| Skill | Description | Tools |
|-------|-------------|-------|
| `dto-conventions` | DTO conventions | Read, Write, Edit |
| `apiresponse-class` | API response patterns | Read, Write, Edit |
| `service-class-conventions` | Service layer patterns | Read, Write, Edit |
| `restcontroller-conventions` | REST controller patterns | Read, Write, Edit |
| `globalexceptionhandler-class` | Exception handling | Read, Write, Edit |
| `parameter-specific-logic-rules` | Parameter handling | Read, Write, Edit |

---

## Agent Behavior

Agent behavior and persona skills.

| Skill | Description | Tools |
|-------|-------------|-------|
| `assistant-behavior-rules` | Assistant behavior guidelines | Read, Write, Edit |
| `communication-tone` | Communication tone | Read, Write, Edit |
| `communication-and-problem-solving` | Problem-solving approach | Read, Write, Edit |
| `strict-user-requirements-adherence` | Requirements adherence | Read, Write, Edit |
| `best-practices-guidelines` | Best practices | Read, Write, Edit |
| `elite-software-engineer-and-product-manager` | Elite engineer persona | Read, Write, Edit |
| `persona-senior-full-stack-developer` | Senior dev persona | Read, Write, Edit |
| `full-stack-developer-persona` | Full-stack persona | Read, Write, Edit |
| `senior-frontend-developer-mindset` | Senior FE mindset | Read, Write, Edit |
| `automation-script-rule` | Automation scripting | Read, Write, Edit |
| `terminal-commands-rule` | Terminal command patterns | Read, Write, Edit |
| `custom-slash-commands` | Custom commands | Read, Write, Edit |

---

## Scientific Research

Comprehensive scientific research toolkit with 142 specialized sub-skills for biology, chemistry, medicine, data science, and computational research.

> **Source:** Integrated from [K-Dense-AI/claude-scientific-skills](https://github.com/K-Dense-AI/claude-scientific-skills)

### Invocation

```javascript
// Invoke the main skill catalog
Skill({ skill: "scientific-skills" });

// Invoke specific sub-skills using full path (REQUIRED)
Skill({ skill: "scientific-skills/rdkit" });           // Cheminformatics
Skill({ skill: "scientific-skills/scanpy" });          // Single-cell analysis
Skill({ skill: "scientific-skills/biopython" });       // Bioinformatics
Skill({ skill: "scientific-skills/chembl-database" }); // ChEMBL database
```

### Sub-Skill Categories

| Category | Count | Key Skills |
|----------|-------|------------|
| Scientific Databases | 28+ | `scientific-skills/pubchem-database`, `scientific-skills/chembl-database`, `scientific-skills/uniprot-database`, `scientific-skills/pdb-database` |
| Python Analysis Libraries | 55+ | `scientific-skills/rdkit`, `scientific-skills/scanpy`, `scientific-skills/biopython`, `scientific-skills/pytorch-lightning` |
| Bioinformatics & Genomics | 10+ | `scientific-skills/gget`, `scientific-skills/pysam`, `scientific-skills/deeptools`, `scientific-skills/pydeseq2` |
| Cheminformatics & Drug Discovery | 7+ | `scientific-skills/datamol`, `scientific-skills/molfeat`, `scientific-skills/diffdock`, `scientific-skills/torchdrug` |
| Scientific Communication | 10+ | `scientific-skills/literature-review`, `scientific-skills/scientific-writing`, `scientific-skills/hypothesis-generation` |
| Clinical & Medical | 5+ | `scientific-skills/clinical-decision-support`, `scientific-skills/pyhealth`, `scientific-skills/pydicom` |
| Laboratory & Integration | 5+ | `scientific-skills/benchling-integration`, `scientific-skills/dnanexus-integration`, `scientific-skills/pylabrobot` |
| Machine Learning & AI | 15+ | `scientific-skills/pytorch-lightning`, `scientific-skills/transformers`, `scientific-skills/scikit-learn`, `scientific-skills/shap` |
| Document Processing | 4 | `scientific-skills/document-skills/docx`, `scientific-skills/document-skills/pdf`, `scientific-skills/document-skills/pptx`, `scientific-skills/document-skills/xlsx` |

### Complete Sub-Skills Reference

| Skill | Domain | Description |
|-------|--------|-------------|
| `scientific-skills/rdkit` | Cheminformatics | Molecular manipulation and property calculation |
| `scientific-skills/scanpy` | Bioinformatics | Single-cell RNA-seq analysis |
| `scientific-skills/biopython` | Bioinformatics | Computational biology toolkit |
| `scientific-skills/chembl-database` | Databases | Bioactivity database for drug discovery |
| `scientific-skills/uniprot-database` | Databases | Protein sequence and function |
| `scientific-skills/pubmed-database` | Literature | Biomedical literature search |
| `scientific-skills/literature-review` | Communication | Systematic literature review workflow |
| `scientific-skills/hypothesis-generation` | Research | Systematic hypothesis development |
| `scientific-skills/pytorch-lightning` | ML | Deep learning framework |
| `scientific-skills/clinical-decision-support` | Clinical | Clinical reasoning and decision support |
| `scientific-skills/adaptyv` | Integration | Adaptyv Bio integration |
| `scientific-skills/aeon` | Time Series | Time series analysis |
| `scientific-skills/alphafold-database` | Proteins | AlphaFold structure database |
| `scientific-skills/anndata` | Bioinformatics | Annotated data structures |
| `scientific-skills/arboreto` | Bioinformatics | Gene regulatory networks |
| `scientific-skills/astropy` | Astronomy | Astronomical computations |
| `scientific-skills/benchling-integration` | Lab | Benchling LIMS integration |
| `scientific-skills/bioservices` | Databases | Biological web services |
| `scientific-skills/biorxiv-database` | Literature | Preprint server access |
| `scientific-skills/brenda-database` | Enzymes | Enzyme database |
| `scientific-skills/cellxgene-census` | Single-cell | Cell atlas census |
| `scientific-skills/cirq` | Quantum | Google Cirq quantum |
| `scientific-skills/citation-management` | Writing | Citation management |
| `scientific-skills/clinical-reports` | Clinical | Clinical report generation |
| `scientific-skills/clinicaltrials-database` | Clinical | Clinical trials database |
| `scientific-skills/clinpgx-database` | Pharmacogenomics | Clinical pharmacogenomics |
| `scientific-skills/clinvar-database` | Variants | Clinical variants database |
| `scientific-skills/cobrapy` | Metabolism | Constraint-based modeling |
| `scientific-skills/cosmic-database` | Cancer | Cancer mutations database |
| `scientific-skills/dask` | Computing | Parallel computing |
| `scientific-skills/datacommons-client` | Data | Data Commons client |
| `scientific-skills/datamol` | Cheminformatics | Molecular data processing |
| `scientific-skills/deepchem` | ML | Deep learning for chemistry |
| `scientific-skills/deeptools` | Genomics | Deep sequencing analysis |
| `scientific-skills/denario` | Finance | Scientific finance |
| `scientific-skills/diffdock` | Drug Discovery | Molecular docking |
| `scientific-skills/dnanexus-integration` | Genomics | DNAnexus platform |
| `scientific-skills/drugbank-database` | Drugs | Drug database |
| `scientific-skills/ena-database` | Genomics | European Nucleotide Archive |
| `scientific-skills/ensembl-database` | Genomics | Ensembl genome browser |
| `scientific-skills/esm` | Proteins | ESM protein models |
| `scientific-skills/etetoolkit` | Phylogenetics | Phylogenetic analysis |
| `scientific-skills/exploratory-data-analysis` | Analysis | EDA workflows |
| `scientific-skills/fda-database` | Regulatory | FDA database access |
| `scientific-skills/flowio` | Cytometry | Flow cytometry I/O |
| `scientific-skills/fluidsim` | Physics | Fluid simulations |
| `scientific-skills/gene-database` | Genomics | Gene information |
| `scientific-skills/generate-image` | Visualization | Image generation |
| `scientific-skills/geniml` | ML | GenIML framework |
| `scientific-skills/geo-database` | Genomics | GEO expression database |
| `scientific-skills/geopandas` | Geospatial | Geospatial analysis |
| `scientific-skills/get-available-resources` | Utility | Resource discovery |
| `scientific-skills/gget` | Genomics | Gene information retrieval |
| `scientific-skills/gtars` | Genomics | GTARS analysis |
| `scientific-skills/gwas-database` | Genomics | GWAS catalog |
| `scientific-skills/histolab` | Pathology | Histopathology analysis |
| `scientific-skills/hmdb-database` | Metabolomics | Human metabolome database |
| `scientific-skills/hypogenic` | ML | Hypogenic framework |
| `scientific-skills/iso-13485-certification` | Regulatory | ISO 13485 compliance |
| `scientific-skills/kegg-database` | Pathways | KEGG pathways |
| `scientific-skills/labarchive-integration` | Lab | LabArchives ELN |
| `scientific-skills/lamindb` | Data | LaminDB data management |
| `scientific-skills/latchbio-integration` | Cloud | Latch.bio platform |
| `scientific-skills/latex-posters` | Writing | LaTeX poster creation |
| `scientific-skills/market-research-reports` | Business | Market research |
| `scientific-skills/markitdown` | Documents | Markdown conversion |
| `scientific-skills/matchms` | Mass Spec | Mass spectrometry matching |
| `scientific-skills/matlab` | Computing | MATLAB integration |
| `scientific-skills/matplotlib` | Visualization | Matplotlib plotting |
| `scientific-skills/medchem` | Cheminformatics | Medicinal chemistry |
| `scientific-skills/metabolomics-workbench-database` | Metabolomics | Metabolomics database |
| `scientific-skills/modal` | Cloud | Modal cloud compute |
| `scientific-skills/molfeat` | Cheminformatics | Molecular featurization |
| `scientific-skills/networkx` | Networks | Network analysis |
| `scientific-skills/neurokit2` | Neuroscience | Neurophysiological analysis |
| `scientific-skills/neuropixels-analysis` | Neuroscience | Neuropixels data |
| `scientific-skills/offer-k-dense-web` | Integration | K-Dense web services |
| `scientific-skills/omero-integration` | Imaging | OMERO image platform |
| `scientific-skills/openalex-database` | Literature | OpenAlex scholarly data |
| `scientific-skills/opentargets-database` | Drug Discovery | Open Targets platform |
| `scientific-skills/opentrons-integration` | Lab Automation | Opentrons robots |
| `scientific-skills/paper-2-web` | Publishing | Paper to web conversion |
| `scientific-skills/pathml` | Pathology | Computational pathology |
| `scientific-skills/pdb-database` | Proteins | Protein Data Bank |
| `scientific-skills/peer-review` | Publishing | Peer review process |
| `scientific-skills/pennylane` | Quantum | PennyLane quantum ML |
| `scientific-skills/perplexity-search` | Search | Perplexity AI search |
| `scientific-skills/plotly` | Visualization | Interactive plots |
| `scientific-skills/polars` | Data | Polars dataframes |
| `scientific-skills/pptx-posters` | Presentations | PowerPoint posters |
| `scientific-skills/protocolsio-integration` | Lab | Protocols.io platform |
| `scientific-skills/pubchem-database` | Chemistry | PubChem database |
| `scientific-skills/pufferlib` | RL | PufferLib RL framework |
| `scientific-skills/pydeseq2` | Genomics | Differential expression |
| `scientific-skills/pydicom` | Medical Imaging | DICOM processing |
| `scientific-skills/pyhealth` | Healthcare | Healthcare ML |
| `scientific-skills/pylabrobot` | Lab Automation | Lab robot control |
| `scientific-skills/pymatgen` | Materials | Materials science |
| `scientific-skills/pymc` | Statistics | Probabilistic programming |
| `scientific-skills/pymoo` | Optimization | Multi-objective optimization |
| `scientific-skills/pyopenms` | Mass Spec | OpenMS wrapper |
| `scientific-skills/pysam` | Genomics | SAM/BAM processing |
| `scientific-skills/pytdc` | Drug Discovery | TDC benchmarks |
| `scientific-skills/qiskit` | Quantum | IBM Qiskit |
| `scientific-skills/qutip` | Quantum | Quantum Toolbox |
| `scientific-skills/reactome-database` | Pathways | Reactome pathways |
| `scientific-skills/research-grants` | Funding | Grant writing |
| `scientific-skills/research-lookup` | Literature | Research search |
| `scientific-skills/rowan` | Computing | Rowan framework |
| `scientific-skills/scholar-evaluation` | Metrics | Scholar evaluation |
| `scientific-skills/scientific-brainstorming` | Research | Scientific ideation |
| `scientific-skills/scientific-critical-thinking` | Research | Critical analysis |
| `scientific-skills/scientific-schematics` | Visualization | Scientific diagrams |
| `scientific-skills/scientific-slides` | Presentations | Scientific slides |
| `scientific-skills/scientific-visualization` | Visualization | Data visualization |
| `scientific-skills/scientific-writing` | Writing | Scientific writing |
| `scientific-skills/scikit-bio` | Bioinformatics | scikit-bio toolkit |
| `scientific-skills/scikit-learn` | ML | scikit-learn |
| `scientific-skills/scikit-survival` | ML | Survival analysis |
| `scientific-skills/scvi-tools` | Single-cell | scVI deep learning |
| `scientific-skills/seaborn` | Visualization | Statistical graphics |
| `scientific-skills/shap` | ML | SHAP explanations |
| `scientific-skills/simpy` | Simulation | Discrete event simulation |
| `scientific-skills/stable-baselines3` | RL | Reinforcement learning |
| `scientific-skills/statistical-analysis` | Statistics | Statistical methods |
| `scientific-skills/statsmodels` | Statistics | Statistical models |
| `scientific-skills/string-database` | Networks | STRING protein networks |
| `scientific-skills/sympy` | Math | Symbolic mathematics |
| `scientific-skills/torch_geometric` | ML | Graph neural networks |
| `scientific-skills/torchdrug` | Drug Discovery | Drug discovery ML |
| `scientific-skills/transformers` | ML | Hugging Face Transformers |
| `scientific-skills/treatment-plans` | Clinical | Treatment planning |
| `scientific-skills/umap-learn` | ML | UMAP dimensionality reduction |
| `scientific-skills/uspto-database` | Patents | USPTO patents |
| `scientific-skills/vaex` | Data | Vaex dataframes |
| `scientific-skills/venue-templates` | Publishing | Venue-specific templates |
| `scientific-skills/zarr-python` | Data | Zarr array storage |
| `scientific-skills/zinc-database` | Chemistry | ZINC compound database |

### Example Workflows

**Drug Discovery Pipeline:**
```javascript
Skill({ skill: "scientific-skills/chembl-database" });
Skill({ skill: "scientific-skills/rdkit" });
Skill({ skill: "scientific-skills/datamol" });
Skill({ skill: "scientific-skills/diffdock" });
```

**Single-Cell Analysis:**
```javascript
Skill({ skill: "scientific-skills/scanpy" });
Skill({ skill: "scientific-skills/anndata" });
Skill({ skill: "scientific-skills/cellxgene-census" });
```

**Literature Review:**
```javascript
Skill({ skill: "scientific-skills/literature-review" });
Skill({ skill: "scientific-skills/pubmed-database" });
Skill({ skill: "scientific-skills/citation-management" });
```

---

## Other Specialized

Additional specialized skills.

| Skill | Description | Tools |
|-------|-------------|-------|
| `gamedev-expert` | DragonRuby, Unity, game mechanics | Read, Write, Edit, Bash, Grep, Glob |
| `toon-format` | Toon format guidelines | Read, Write, Edit |
| `use-case-example` | Use case examples | Read, Write, Edit |
| `todo-app-general-rules` | Todo app patterns | Read, Write, Edit |
| `admin-interface-rules` | Admin interface guidelines | Read, Write, Edit |
| `windows-compatibility` | Windows compatibility | Read, Write, Edit, Bash |
| `elon-musk-s-algorithm-for-efficiency` | Efficiency principles | Read, Write, Edit |
| `publishing-rules` | Publishing guidelines | Read, Write, Edit |
| `payment-tracking-rule` | Payment tracking | Read, Write, Edit |
| `param-parameterized-class-rules` | Parameterized classes | Read, Write, Edit |
| `submission-process-outline` | Submission process | Read, Write, Edit |

---

## How to Use Skills

### Invoke in Agent Code
```javascript
Skill({ skill: 'tdd' });
Skill({ skill: 'debugging' });
Skill({ skill: 'scientific-skills/rdkit' });  // Full path for sub-skills
```

### Assign to Agents
Add to agent frontmatter:
```yaml
skills:
  - tdd
  - debugging
  - verification-before-completion
```

### Search for Skills
```javascript
// Use skill-discovery
Skill({ skill: 'skill-discovery' });

// Or use Glob to find skills
Glob({ pattern: '.claude/skills/**/SKILL.md' });
```

---

## Deprecated Skills

The following skills have been deprecated and merged into other skills. Use the superseding skill instead.

| Skill | Superseded By | Notes |
|-------|---------------|-------|
| ~~`testing-expert`~~ | `tdd` | Use `tdd` for all testing workflows. Testing-expert functionality fully merged. |
| ~~`writing`~~ | `writing-skills` | Use `writing-skills` for all documentation. Writing functionality fully merged. |

**Migration:**
- Invoking deprecated skills will automatically redirect to the superseding skill
- Update any agent configurations or workflows referencing deprecated skills
- Aliases are maintained for backward compatibility

---

## Maintenance

This catalog is generated from `.claude/skills/` directory.

**To update:**
1. Add new skill to `.claude/skills/{skill-name}/SKILL.md`
2. Re-run skill catalog generation
3. Update this file

**Registry:** `.claude/context/artifacts/catalogs/creator-registry.json`
