<!-- Generated from skill-index.json | Session: 2026-02-28 -->

# Skill Catalog

Complete inventory of all skills in the `.claude/skills/` directory, generated from the authoritative `.claude/config/skill-index.json`.

**Last Updated:** 2026-02-28
**Total Skills:** 256
**Domains:** 22
**Categories:** 25
**Source:** `.claude/config/skill-index.json`

---

## Summary Statistics

### By Priority

| Priority | Label | Count | Description |
| -------- | ----- | ----- | ----------- |
| 1 | Core | 95 | Essential skills used by most agents |
| 2 | Standard | 0 | Common skills for specific workflows |
| 3 | Extended | 161 | Specialized or domain-specific skills |

### By Domain

| Domain | Count |
| ------ | ----- |
| AI/ML | 1 |
| Architecture | 2 |
| Creator Tools | 8 |
| Database | 5 |
| Development | 10 |
| DevOps | 17 |
| Documentation | 3 |
| Frameworks | 8 |
| Git & Version Control | 2 |
| Integration | 5 |
| Languages | 10 |
| Memory & Context | 8 |
| Mobile | 7 |
| Other | 134 |
| Planning | 2 |
| Quality | 3 |
| Requirements | 2 |
| Research | 2 |
| Scientific | 1 |
| Security | 5 |
| Specialized | 14 |
| Styling | 7 |

### By Category

| Category | Count |
| -------- | ----- |
| AI/ML | 1 |
| Architecture | 2 |
| Code Quality | 1 |
| Creator Tools | 2 |
| Database | 2 |
| DevOps | 4 |
| Documentation | 2 |
| Frameworks | 3 |
| Integration | 2 |
| Languages | 3 |
| Memory | 4 |
| Mobile | 3 |
| Orchestration | 4 |
| Other | 207 |
| Planning | 1 |
| Quality | 2 |
| Requirements | 1 |
| Research | 2 |
| Scientific | 1 |
| Security | 2 |
| Specialized | 2 |
| Styling | 2 |
| Testing | 1 |
| Troubleshooting | 1 |
| Version Control | 1 |

---

## Skills by Domain

### AI/ML (1 skills)

| Name | Category | Priority | Description |
| ---- | -------- | -------- | ----------- |
| `ai-ml-expert` | AI/ML | Core | AI and ML expert covering PyTorch, TensorFlow, Hugging Face, scikit-learn, LLM integration, RAG p... |

### Architecture (2 skills)

| Name | Category | Priority | Description |
| ---- | -------- | -------- | ----------- |
| `architecture-review` | Architecture | Core | Architecture review and design validation. Evaluates system designs against best practices, ident... |
| `diagram-generator` | Architecture | Core | Generates architecture, database, and system diagrams using Mermaid syntax. Creates visual repres... |

### Creator Tools (8 skills)

| Name | Category | Priority | Description |
| ---- | -------- | -------- | ----------- |
| `agent-creator` | Creator Tools | Core | Creates specialized AI agents on-demand when no existing agent matches a request. Use when the Ro... |
| `artifact-lifecycle` | Other | Core | Unified lifecycle management for all framework artifacts (skills, agents, hooks, workflows, templ... |
| `hook-creator` | Other | Extended | Creates and registers hooks for the Claude Code framework. Handles pre/post tool execution, valid... |
| `schema-creator` | Other | Extended | Creates JSON Schema validation files for skills, agents, hooks, workflows, and data structures. E... |
| `skill-creator` | Creator Tools | Core | Create, validate, and convert skills for the agent ecosystem. Enforces standardized structure for... |
| `template-creator` | Other | Extended | Creates and registers templates for agents, skills, workflows, hooks, and code patterns. Handles ... |
| `template-renderer` | Other | Extended | Render templates by replacing {{TOKEN}} placeholders with actual values, supporting all three tem... |
| `workflow-creator` | Other | Extended | Creates multi-agent orchestration workflows for complex tasks. Handles enterprise workflows, oper... |

### Database (5 skills)

| Name | Category | Priority | Description |
| ---- | -------- | -------- | ----------- |
| `data-expert` | Other | Core | Data processing expert including parsing, transformation, and validation |
| `database-architect` | Database | Core | Database design and optimization specialist. Schema design, query optimization, indexing strategi... |
| `database-expert` | Other | Core | Database expert including Prisma, Supabase, SQL, and NoSQL patterns |
| `pandas-data-manipulation-rules` | Other | Extended | Focuses on pandas-specific rules for data manipulation, including method chaining, data selection... |
| `text-to-sql` | Database | Core | Convert natural language queries to SQL. Use for database queries, data analysis, and reporting. |

### Development (10 skills)

| Name | Category | Priority | Description |
| ---- | -------- | -------- | ----------- |
| `async-operations` | Other | Extended | Specifies the preferred syntax for asynchronous operations using async/await and onMount for comp... |
| `code-analyzer` | Other | Core | Static code analysis and complexity metrics |
| `code-quality-expert` | Code Quality | Core | Code quality expert including clean code, style guides, and refactoring |
| `code-style-validator` | Other | Core | Programmatic code style validation using AST analysis. Complements (not replaces) code-style rule... |
| `comprehensive-unit-testing-with-pytest` | Other | Extended | Aims for high test coverage using pytest, testing both common and edge cases. |
| `debugging` | Troubleshooting | Core | Systematic 4-phase debugging with root cause investigation. Use when fixing bugs to prevent rando... |
| `logging-module-usage` | Other | Extended | Employs the logging module judiciously to log important events, warnings, and errors. |
| `ripgrep` | Other | Core | Enhanced code search with custom ripgrep binary supporting ES module extensions and advanced patt... |
| `tdd` | Testing | Core | Canon TDD for humans and AI agents. Use for production code changes by writing tests first, provi... |
| `test-generator` | Other | Core | Generates test code from specifications, components, and API endpoints. Creates unit tests, integ... |

### DevOps (17 skills)

| Name | Category | Priority | Description |
| ---- | -------- | -------- | ----------- |
| `aws-cloud-ops` | DevOps | Extended | AWS cloud operations for CloudWatch, S3, Lambda, EC2, and IAM |
| `ci-cd-implementation-rule` | Other | Extended | Uses GitHub Actions or GitLab CI for CI/CD implementation. |
| `cloud-devops-expert` | Other | Extended | Cloud and DevOps expert including AWS, GCP, Azure, and Terraform |
| `configuration-management` | Other | Extended | Configuration management techniques |
| `container-expert` | Other | Core | Container orchestration expert including Docker, Kubernetes, Helm, and service mesh |
| `containerization-rules` | Other | Core | Rules for creating and maintaining Dockerfiles. |
| `docker-compose` | DevOps | Core | Docker Compose container orchestration and management. Manage multi-container applications, servi... |
| `gcloud-cli` | Other | Extended | Google Cloud CLI operations and resource management |
| `helm-chart-scaffolding` | Other | Extended | Design, organize, and manage Helm charts for templating and packaging Kubernetes applications wit... |
| `incident-runbook-templates` | Other | Core | Create structured incident response runbooks with step-by-step procedures, escalation paths, and ... |
| `k8s-manifest-generator` | Other | Core | Create production-ready Kubernetes manifests for Deployments, Services, ConfigMaps, and Secrets f... |
| `k8s-security-policies` | Other | Extended | Implement Kubernetes security policies including NetworkPolicy, PodSecurityPolicy, and RBAC for p... |
| `kubernetes-flux` | DevOps | Core | Kubernetes cluster management and troubleshooting. Query pods, deployments, services, logs, and e... |
| `on-call-handoff-patterns` | Other | Core | Master on-call shift handoffs with context transfer, escalation procedures, and documentation. Us... |
| `postmortem-writing` | Other | Core | Write effective blameless postmortems with root cause analysis, timelines, and action items. Use ... |
| `sentry-monitoring` | Other | Extended | Sentry error tracking and performance monitoring for real-time visibility into application errors... |
| `terraform-infra` | DevOps | Core | Terraform infrastructure operations with safety controls |

### Documentation (3 skills)

| Name | Category | Priority | Description |
| ---- | -------- | -------- | ----------- |
| `doc-generator` | Documentation | Core | Generates comprehensive documentation from code, APIs, and specifications. Creates API documentat... |
| `readme` | Other | Core | Use when creating, updating, or generating README and documentation files for projects and libraries |
| `writing-skills` | Documentation | Extended | TDD applied to documentation - create production-ready skills. Use when authoring new skills. Inc... |

### Frameworks (8 skills)

| Name | Category | Priority | Description |
| ---- | -------- | -------- | ----------- |
| `api-development-expert` | Other | Core | API development expert including REST design, OpenAPI, and documentation |
| `frontend-expert` | Other | Core | Frontend development expert including UI/UX patterns, responsive design, and accessibility |
| `graphql-expert` | Other | Core | GraphQL expert including schema design, Apollo Client/Server, and caching |
| `nextjs-expert` | Frameworks | Core | Next.js framework expert including App Router, Server Components, and API routes |
| `react-best-practices-vercel` | Frameworks | Core | React and Next.js performance optimization guidelines from Vercel Engineering. This skill should ... |
| `react-expert` | Frameworks | Core | React ecosystem expert including hooks, state management, component patterns, React 19 features, ... |
| `state-management-expert` | Other | Extended | State management expert including MobX, Redux, Zustand, and reactive patterns |
| `svelte-expert` | Other | Core | Svelte and SvelteKit expert including components, stores, and routing |

### Git & Version Control (2 skills)

| Name | Category | Priority | Description |
| ---- | -------- | -------- | ----------- |
| `git-expert` | Version Control | Core | Advanced Git operations wrapper. Optimizes token usage by guiding complex git workflows into effi... |
| `gitops-workflow` | Other | Extended | Implement GitOps workflows with ArgoCD and Flux for automated, declarative Kubernetes deployments... |

### Integration (5 skills)

| Name | Category | Priority | Description |
| ---- | -------- | -------- | ----------- |
| `chrome-browser` | Integration | Extended | Browser automation with two integrations - Chrome DevTools MCP (always available, performance tra... |
| `github-mcp` | Integration | Core | GitHub API operations - repositories, issues, pull requests, actions, code security, discussions,... |
| `github-ops` | Other | Extended | Workflow for repository reconnaissance and operations using GitHub CLI (gh). Optimizes token usag... |
| `slack-notifications` | Other | Extended | Slack messaging, channels, and notifications - send messages, manage channels, interact with user... |
| `web3-expert` | Other | Core | Web3 and blockchain expert including Solidity, Ethereum, and smart contracts |

### Languages (10 skills)

| Name | Category | Priority | Description |
| ---- | -------- | -------- | ----------- |
| `comprehensive-type-annotations` | Other | Extended | Requires detailed type annotations for all Python functions, methods, and class members. |
| `cpp` | Other | Extended | C++ coding standards and best practices. |
| `go-expert` | Languages | Core | Go programming expert including APIs, gRPC, concurrency, and best practices |
| `java-expert` | Other | Core | Java and Spring Boot expert including REST APIs, JPA, and microservices |
| `jupyter-notebook-best-practices` | Other | Extended | Guidelines for structuring and documenting Jupyter notebooks for reproducibility and clarity. |
| `nodejs-expert` | Other | Core | Node.js backend expert including Express, NestJS, and async patterns |
| `php-expert` | Other | Core | PHP expert including Laravel, WordPress, and Drupal development |
| `prioritize-python-3-10-features` | Other | Extended | Prioritizes the use of new features available in Python 3.12 and later versions. |
| `python-backend-expert` | Languages | Core | Python backend expert including Django, FastAPI, Flask, SQLAlchemy, and async patterns |
| `typescript-expert` | Languages | Core | TypeScript and JavaScript expert including type systems, patterns, and tooling |

### Memory & Context (8 skills)

| Name | Category | Priority | Description |
| ---- | -------- | -------- | ----------- |
| `context-compressor` | Memory | Core | Context compression and summarization methodology. Techniques for reducing token usage while pres... |
| `context-driven-development` | Other | Core | Context-Driven Development methodology - treating project context as managed artifacts alongside ... |
| `framework-context` | Memory | Core | Load and synthesize framework architecture context for reflection and planning tasks. |
| `project-analyzer` | Other | Extended | Automated brownfield codebase analysis. Detects project type, frameworks, dependencies, architect... |
| `project-onboarding` | Other | Core | Guided project onboarding for new codebases. Helps agents understand project structure, build sys... |
| `recommend-evolution` | Memory | Core | Detect capability gaps and record standardized evolution recommendations. |
| `recovery` | Other | Extended | Workflow recovery protocol for resuming workflows after context loss, session interruption, or er... |
| `session-handoff` | Memory | Core | Prepare context for new conversations when session is lost or ending. Creates handoff documents t... |

### Mobile (7 skills)

| Name | Category | Priority | Description |
| ---- | -------- | -------- | ----------- |
| `android-expert` | Mobile | Core | Comprehensive Android development expert covering Jetpack Compose, Kotlin coroutines/Flow, Archit... |
| `expo-framework-rule` | Other | Core | Expo Framework-specific guidelines. Includes best practices for Views, Blueprints, and Extensions. |
| `expo-mobile-app-rule` | Other | Extended | Specifies best practices and conventions for Expo-based mobile app development. |
| `ios-expert` | Mobile | Core | iOS development expert including SwiftUI, UIKit, and Apple frameworks |
| `mobile-first-design-rules` | Other | Core | Focuses on rules and best practices for mobile-first design and responsive typography using tailw... |
| `mobile-ui-development-rule` | Other | Core | General rules pertaining to Mobile UI development. Covers UI/UX best practices, state management,... |
| `react-native-skills-vercel` | Mobile | Extended | React Native and Expo best practices for building performant mobile apps. Use |

### Other (134 skills)

| Name | Category | Priority | Description |
| ---- | -------- | -------- | ----------- |
| `advanced-elicitation` | Other | Core | Use when you want to improve response quality through meta-cognitive reasoning. Applies 15+ reaso... |
| `agent-evaluation` | Other | Extended | LLM-as-judge evaluation framework with 5-dimension rubric (accuracy, groundedness, coherence, com... |
| `agent-tool-design` | Other | Extended | The Agent Tool Contract — 5 principles for designing tools agents call reliably: predictable sign... |
| `agent-updater` | Other | Extended | Research-backed workflow to refresh existing agent prompts/frontmatter with diff-based risk scori... |
| `angular-expert` | Other | Extended | Angular framework expert including components, services, RxJS, templates, and testing |
| `artifact-integrator` | Other | Extended | Deep integration analysis for newly created artifacts |
| `artifact-updater` | Other | Extended | [DEPRECATED] Route through type-specific updaters: skill-updater, agent-updater, workflow-updater. |
| `ask-questions-if-underspecified` | Other | Extended | Ask the minimum clarifying questions before implementation when requirements are ambiguous or mis... |
| `assimilate` | Other | Extended | Benchmark external agent frameworks and convert findings into a concrete TDD upgrade backlog for ... |
| `astro-expert` | Other | Extended | Astro framework expert including components, content collections, and integrations |
| `audit-context-building` | Other | Extended | Ultra-granular code analysis for deep architectural context building. Line-by-line and block-by-b... |
| `authentication-flow-rules` | Other | Core | OAuth 2.1 compliant authentication flows (MANDATORY Q2 2026). PKCE required for ALL clients, Impl... |
| `best-practices-guidelines` | Other | Extended | Specifies best practices, including following RESTful API design principles, implementing respons... |
| `brainstorming` | Other | Extended | Socratic design refinement before implementation — challenges assumptions, surfaces alternatives,... |
| `build-tools-expert` | Other | Extended | Build tools expert including Vite, Webpack, and bundler configuration |
| `building-secure-contracts` | Other | Extended | Smart contract and secure API contract security analysis — invariant checking, access control, re... |
| `code-semantic-search` | Other | Extended | Semantic code search using Phase 1 vector embeddings and Phase 2 hybrid search. |
| `code-structural-search` | Other | Extended | Use ast-grep for AST-based code pattern matching. |
| `command-creator` | Other | Core | Creates command files for the Claude Code framework. Commands are user-facing shortcuts that dele... |
| `commit-validator` | Other | Extended | Validates commit messages against Conventional Commits specification using programmatic validatio... |
| `compliance-policy-check` | Other | Extended | Validate planned changes against local framework rules and policy guardrails before implementatio... |
| `composer-dependency-management` | Other | Extended | Rules pertaining to Composer dependency management, promoting best practices for declaring and up... |
| `content-security-scan` | Other | Extended | Automated security scanner for external skill/agent content fetched from GitHub or web sources. R... |
| `context-degradation` | Other | Extended | Token-range severity zones (Green/Yellow/Orange/Red/Critical) with detection checklist, early war... |
| `convex-development-general` | Other | Extended | Applies general rules for Convex development, emphasizing schema design, validator usage, and cor... |
| `creation-feasibility-gate` | Other | Extended | Validate whether a proposed new artifact is feasible in the current stack before creator workflow... |
| `debug-log-analysis` | Other | Extended | Structured debug log analysis for Claude Code sessions — copy log, run reducer, extract error pat... |
| `differential-review` | Other | Extended | Perform security-focused review of code diffs and pull requests, identifying newly introduced vul... |
| `dispatching-parallel-agents` | Other | Extended | Concurrent investigation of independent failures. Use when multiple unrelated issues need paralle... |
| `drizzle-orm-rules` | Other | Extended | Rules for using Drizzle ORM within the src/lib/db directory. Ensures consistent data modeling and... |
| `dry-principle` | Other | Extended | This rule enforces the Don't Repeat Yourself principle to avoid code duplication and improve main... |
| `dto-conventions` | Other | Extended | Sets standards for Data Transfer Objects (DTOs), typically records, including parameter validatio... |
| `dynamic-api-integration` | Other | Extended | Discover, parse, and call external HTTP APIs at runtime using OpenAPI specs, tool templates, and ... |
| `ecosystem-integrity-scanner` | Other | Extended | Deeply analyzes Agent Studio framework structural health: catching phantom require() references, ... |
| `elixir-expert` | Other | Extended | Elixir and Phoenix expert including OTP, Ecto, and functional programming |
| `enhance-prompt` | Other | Extended | Transforms vague UI/feature requests into structured, optimized prompts with design system awaren... |
| `eval-harness-updater` | Other | Extended | Refresh evaluation harnesses with live/fallback parser reliability, SLO gates, and regression che... |
| `feature-flag-management` | Other | Extended | Feature flag lifecycle management — toggling features safely, gradual rollouts, A/B testing patte... |
| `fiber-logging-and-project-structure` | Other | Extended | Applies best practices for logging, project structure, and environment variable usage specificall... |
| `fiber-routing-and-csrf-protection` | Other | Extended | Focuses on routing, CSRF protection, context handling, and template usage within the internal han... |
| `finishing-a-development-branch` | Other | Extended | Complete development with structured merge/PR options. Use when ready to merge or submit work. |
| `fix-review` | Other | Extended | Verify fix commits address security findings without introducing new bugs or regressions. Analyze... |
| `flutter-expert` | Other | Extended | Flutter and Dart expert including widgets, state management, and platform integration |
| `form-and-actions-in-sveltekit` | Other | Extended | Describes Form and Actions implementations. |
| `form-validation-with-zod` | Other | Extended | Enforces the use of Zod for form validation throughout the project. |
| `function-length-and-responsibility` | Other | Extended | This rule enforces the single responsibility principle, ensuring functions are short and focused. |
| `gamedev-expert` | Other | Core | Game development expert including DragonRuby, Unity, and game mechanics |
| `gemini-cli-security` | Other | Extended | AI-powered code vulnerability analysis and dependency scanning using Gemini CLI security extensio... |
| `htmx-expert` | Other | Extended | HTMX expert including hypermedia patterns, Django/Flask integration |
| `insecure-defaults` | Other | Extended | Detect hardcoded credentials, default passwords, fail-open configurations, insecure default setti... |
| `integration` | Other | Extended | Integration skills |
| `jira-pm` | Other | Extended | Jira project management and issue tracking integration |
| `kafka-development-practices` | Other | Extended | Applies general coding standards and best practices for Kafka development with Scala. |
| `large-data-with-dask` | Other | Extended | Specific optimization strategies for Python scripts working with larger-than-memory datasets via ... |
| `linear-pm` | Other | Extended | Linear project management - issues, projects, cycles, and roadmaps. Use for Linear-related tasks ... |
| `llm-council` | Other | Extended | Orchestrate multi-LLM parallel debate and synthesis. Dispatches prompts to available omega CLI wr... |
| `medusa` | Other | Extended | Medusa rules and best practices. These rules should be used when building applications with Medusa. |
| `medusa-security` | Other | Extended | AI-first security scanning with Medusa. 3,000+ detection patterns covering AI/ML, agents, MCP, RA... |
| `memory-quality-auditor` | Other | Extended | Audit memory retrieval quality (drift, staleness, citation-groundedness) and produce remediation ... |
| `memory-search` | Other | Extended | Semantic search over global agent memory. Use to retrieve previously learned patterns, decisions,... |
| `modern-python` | Other | Extended | Modern Python tooling best practices using uv, ruff, ty, and pytest. Mandates the Trail of Bits P... |
| `monorepo-and-tooling` | Other | Extended | Outlines the monorepo structure and tooling conventions, emphasizing the use of Taskfile.yml, and... |
| `multi-agent-architecture-reference` | Other | Extended | Decision matrix for selecting multi-agent topologies (Supervisor, Swarm, Hierarchical, Conductor)... |
| `nativescript` | Other | Extended | NativeScript best practices and patterns for mobile applications |
| `nativewind-and-tailwind-css-compatibility` | Other | Extended | Provides specific version compatibility notes for NativeWind and Tailwind CSS to prevent common i... |
| `next-cache-components` | Other | Extended | Next.js 16 caching model expertise covering the 'use cache' directive, cacheLife() API, cacheTag(... |
| `next-upgrade` | Other | Extended | Structured workflow for upgrading Next.js applications across major versions. Use when migrating ... |
| `omega-claude-cli` | Other | Core | Shell out to Claude Code CLI to invoke a second Claude session headlessly. Useful for cross-valid... |
| `omega-codex-cli` | Other | Core | Shell out to OpenAI Codex CLI for headless code generation, analysis, and question-answering. Opt... |
| `omega-cursor-cli` | Other | Extended | Shell out to Cursor Agent CLI for headless IDE-aware code tasks. Supports multi-model routing (au... |
| `omega-gemini-cli` | Other | Core | Use when the user wants to use Google Gemini for analysis, large files or codebases, sandbox exec... |
| `paraglide-js-internationalization-i18n` | Other | Extended | Details Paraglide.js i18n implementations. |
| `pipeline-reflection-ux` | Other | Extended | Improve router-facing pipeline and reflection narration to reduce noisy status churn and make Ste... |
| `planning-with-files` | Other | Extended | Manus-style file-based planning for complex tasks. Use task_plan.md, findings.md, and progress.md... |
| `poetry-rye-dependency-management` | Other | Extended | Specifies Poetry or Rye for dependency management in Python projects. |
| `powershell-expert` | Other | Extended | Master PowerShell scripting and Windows system administration for 2026. Enforces cross-platform c... |
| `prd-generator` | Other | Extended | Generate structured Product Requirements Documents using hypothesis-driven methodology with Imple... |
| `proactive-audit` | Other | Extended | Automated health checks for framework artifacts modified during a pipeline. Validates hook syntax... |
| `property-based-testing` | Other | Extended | fast-check patterns for JS/TS — 6 canonical property categories with worked examples targeting ag... |
| `pyqt6-ui-development-rules` | Other | Extended | Specific rules for PyQt6 based UI development focusing on UI/UX excellence and performance. |
| `qa-workflow` | Other | Extended | QA validation and fix loop workflow — validates implementation completeness then iterates fix cyc... |
| `qwik-expert` | Other | Extended | Qwik framework expert including resumability, lazy loading, and optimization |
| `ralph-loop` | Orchestration | Core | Autonomous iteration loop with dual-mode support. Standalone mode uses Stop hooks. Multi-agent mode uses router-managed iteration. |
| `receiving-code-review` | Other | Core | Process and act on code review feedback. Use when receiving review results. |
| `requesting-code-review` | Other | Core | Dispatch code-reviewer agent for two-stage review. Use after completing implementation tasks. |
| `restcontroller-conventions` | Other | Extended | Specifies standards for RestController classes, including API route mappings, HTTP method annotat... |
| `rule-auditor` | Other | Extended | Validates code against coding standards and best practices. Reports compliance violations and sug... |
| `rule-creator` | Other | Core | Creates rule files for the Claude Code framework. Rules are markdown files in .claude/rules/ that... |
| `rust-expert` | Other | Extended | Rust programming expert including ownership, borrowing, lifetimes, async Tokio patterns, error ha... |
| `scientific-skills/biopython` | Scientific | Extended | BioPython integration (accessed via parent `scientific-skills` skill) |
| `scientific-skills/hypothesis-generation` | Scientific | Extended | Hypothesis generation (accessed via parent `scientific-skills` skill) |
| `scientific-skills/literature-review` | Scientific | Extended | Literature review (accessed via parent `scientific-skills` skill) |
| `scientific-skills/rdkit` | Scientific | Extended | RDKit chemistry toolkit (accessed via parent `scientific-skills` skill) |
| `scientific-skills/scanpy` | Scientific | Extended | Scanpy single-cell analysis (accessed via parent `scientific-skills` skill) |
| `scientific-skills/scientific-schematics` | Scientific | Extended | Scientific diagram generation (accessed via parent `scientific-skills` skill) |
| `semgrep-rule-creator` | Other | Extended | Create custom Semgrep rules for detecting project-specific vulnerabilities, enforcing coding stan... |
| `seo-and-meta-tags-in-sveltekit` | Other | Extended | Provides SEO and Meta Tags guidelines in SvelteKit. |
| `service-class-conventions` | Other | Extended | Defines the structure and implementation of service classes, enforcing the use of interfaces, Ser... |
| `shadcn-ui` | Other | Extended | Deep expertise on shadcn/ui component library including installation, customization, theming, and... |
| `sharp-edges` | Other | Extended | Living catalogue of 7 known hazard entries (SE-01 through SE-07) specific to agent-studio: Window... |
| `skill-updater` | Other | Extended | Research-backed skill refresh workflow for updating existing skills with TDD checkpoints, memory-... |
| `smart-revert` | Other | Extended | Git-aware smart revert for tracks, phases, and tasks. Handles rewritten history, finds related co... |
| `solidjs-expert` | Other | Extended | SolidJS expert including reactivity, components, and store patterns |
| `sparc-methodology` | Other | Extended | SPARC (Specification, Pseudocode, Architecture, Refinement, Completion) comprehensive development... |
| `spec-critique` | Other | Extended | Self-critique specification documents using extended thinking — surfaces hidden assumptions, cont... |
| `spec-init` | Other | Extended | Unified skill that guides spec creation through structured, interactive process. |
| `spec-to-code-compliance` | Other | Extended | Verify that implementation code faithfully implements its specification — checks function contrac... |
| `stale-module-pruner` | Other | Extended | Ripgrep-powered dead-code crawler that finds stale, broken, or orphaned JavaScript/CJS/MJS module... |
| `starknet-react-rules` | Other | Extended | Specific rules for Starknet React projects, focusing on blockchain integration. |
| `static-analysis` | Other | Extended | Run CodeQL and Semgrep static analysis with SARIF output for vulnerability detection, code qualit... |
| `strict-user-requirements-adherence` | Other | Extended | Strictly adheres to specified user flow and game rules, making sure to follow documented features. |
| `subagent-driven-development` | Other | Core | Execute plans via autonomous agents with two-stage review per task. Use for complex implementatio... |
| `tall-stack-general` | Other | Extended | General guidelines for TALL stack development, emphasizing Laravel and PHP best practices. |
| `tauri-native-api-integration` | Other | Extended | Rules for integrating Tauri's native APIs in the frontend application. |
| `tauri-security-rules` | Other | Extended | Security-related rules for Tauri application development. |
| `tauri-svelte-typescript-general` | Other | Extended | General rules for developing desktop applications using Tauri with Svelte and TypeScript for the ... |
| `tauri-svelte-ui-components` | Other | Extended | Rules specific to Svelte UI component development in Tauri applications. |
| `token-saver-context-compression` | Other | Extended | Search-aware context compression workflow for agent-studio. Use pnpm hybrid search + token-saver ... |
| `tool-creator` | Other | Extended | Creates tool files for the Claude Code framework. Tools are executable utilities organized by cat... |
| `troubleshooting-regression` | Other | Extended | Regression troubleshooting workflow for hook/router/memory/search failures with enforced evidence... |
| `tsconfig-json-rules` | Other | Extended | Defines general rules for tsconfig.json. It suggest using strict TypeScript checks |
| `using-git-worktrees` | Other | Extended | Create isolated development workspaces with safety verification. Use when needing parallel develo... |
| `variant-analysis` | Other | Extended | Discover vulnerability variants by identifying similar code patterns across a codebase using Code... |
| `vercel-ai-sdk-best-practices` | Other | Extended | Best practices for using the Vercel AI SDK in Next.js 15 applications with React Server Component... |
| `vercel-deploy` | Other | Extended | Zero-auth Vercel deployment workflow with automatic framework detection for 20+ frameworks. Use w... |
| `vue-expert` | Other | Extended | Vue.js ecosystem expert including Vue 3, Composition API, Nuxt, and Pinia |
| `wave-executor` | Orchestration | Core | Fresh-process orchestration for EPIC-tier batch pipelines. Spawns a new Bun process per wave via ... |
| `web-perf` | Other | Extended | Structured 5-phase web performance audit workflow with Core Web Vitals thresholds and actionable ... |
| `webapp-testing` | Other | Extended | Test local web applications using Playwright with Python. Verify frontend functionality, debug UI... |
| `webmcp-browser-tools` | Other | Extended | WebMCP — browser-side API that lets web applications expose their own functionality as MCP tools ... |
| `workflow-updater` | Other | Extended | Research-backed workflow to refresh existing workflow files with phase-gate regression checks, id... |
| `writing` | Other | Core | Deprecated alias for writing-skills skill |
| `yara-authoring` | Other | Extended | YARA-X detection rule authoring with expert judgment, linting, atom analysis, and best practices.... |

### Planning (2 skills)

| Name | Category | Priority | Description |
| ---- | -------- | -------- | ----------- |
| `complexity-assessment` | Other | Core | AI-based complexity assessment for task analysis. Use when determining the appropriate workflow, ... |
| `plan-generator` | Planning | Core | Creates structured plans from requirements. Generates comprehensive plans with steps, dependencie... |

### Quality (3 skills)

| Name | Category | Priority | Description |
| ---- | -------- | -------- | ----------- |
| `checklist-generator` | Quality | Extended | Generate context-aware quality checklists for code review and QA using IEEE 1028 base standards p... |
| `response-rater` | Other | Core | Rates responses and plans against quality rubrics. Used for plan validation, response quality aud... |
| `verification-before-completion` | Quality | Core | Gate function preventing unverified completion claims. Use before claiming any task is done. |

### Requirements (2 skills)

| Name | Category | Priority | Description |
| ---- | -------- | -------- | ----------- |
| `interactive-requirements-gathering` | Other | Extended | Structured interactive questionnaire framework for gathering requirements from users. Uses A/B/C/... |
| `spec-gathering` | Requirements | Core | Requirements gathering workflow for specification creation. Use when starting a new feature, task... |

### Research (2 skills)

| Name | Category | Priority | Description |
| ---- | -------- | -------- | ----------- |
| `arxiv-mcp` | Research | Core | Search and retrieve academic papers from arXiv.org using WebFetch and Exa. No MCP server required... |
| `research-synthesis` | Research | Core | Research best practices and synthesize into design decisions for artifact creation. Invoke BEFORE... |

### Scientific (1 skills)

| Name | Category | Priority | Description |
| ---- | -------- | -------- | ----------- |
| `scientific-skills` | Scientific | Core | Comprehensive scientific research toolkit with 139 specialized skills for biology, chemistry, med... |

### Security (5 skills)

| Name | Category | Priority | Description |
| ---- | -------- | -------- | ----------- |
| `auth-security-expert` | Security | Core | OAuth 2.1, JWT (RFC 8725), encryption, and authentication security expert. Enforces 2026 security... |
| `binary-analysis-patterns` | Other | Core | Master binary analysis patterns including disassembly, decompilation, control flow analysis, and ... |
| `memory-forensics` | Other | Core | Master memory forensics techniques including memory acquisition, process analysis, and artifact e... |
| `protocol-reverse-engineering` | Other | Core | Master network protocol reverse engineering including packet analysis, protocol dissection, and c... |
| `security-architect` | Security | Core | Security architecture and threat modeling. OWASP Top 10 2025 analysis, OWASP Agentic AI Top 10 (A... |

### Specialized (14 skills)

| Name | Category | Priority | Description |
| ---- | -------- | -------- | ----------- |
| `consensus-voting` | Orchestration | Core | Byzantine consensus voting for multi-agent decision making. Implements voting protocols, conflict... |
| `dependency-analyzer` | Other | Extended | Analyzes project dependencies, detects outdated packages, identifies breaking changes, and sugges... |
| `filesystem` | Other | Core | File system operations guidance - read, write, search, and manage files using Claude Code's built... |
| `insight-extraction` | Other | Core | Extract actionable insights from completed coding sessions. Use when a session completes to captu... |
| `sequential-thinking` | Specialized | Core | Sequential thinking and structured problem solving. Break down complex problems into steps with r... |
| `skill-discovery` | Other | Core | How agents discover and use skills. Use to understand skill invocation protocol. |
| `smart-debug` | Other | Extended | AI-assisted debugging specialist with deep knowledge of modern debugging tools, observability pla... |
| `summarize-changes` | Other | Core | Structured workflow for summarizing code changes after completing tasks. Creates clear, actionabl... |
| `swarm-coordination` | Orchestration | Core | Multi-agent swarm coordination patterns. Orchestrates parallel agent execution, manages agent com... |
| `task-management-protocol` | Other | Core | Protocol for task synchronization, context handoff, and cross-session coordination using Claude C... |
| `thinking-tools` | Specialized | Extended | Structured thinking patterns for agent self-reflection. Includes think-about-collected-informatio... |
| `tool-search` | Other | Extended | Semantic tool search with embeddings for scalable tool discovery. Enables on-demand tool loading ... |
| `track-management` | Other | Core | Track management methodology - creating and managing logical work units (features, bugs, refactor... |
| `workflow-patterns` | Other | Core | TDD task implementation patterns - red-green-refactor cycle, phase checkpoints, git commits, and ... |

### Styling (7 skills)

| Name | Category | Priority | Description |
| ---- | -------- | -------- | ----------- |
| `accessibility` | Other | Core | Ensure accessibility in UI components including semantic HTML, ARIA attributes, keyboard navigati... |
| `design-and-user-experience-guidelines` | Other | Extended | Specifies design and user experience guidelines, including dark mode compatibility, responsive de... |
| `html-tailwind-css-and-javascript-expert-rule` | Other | Extended | Sets the AI to act as an expert in HTML, Tailwind CSS, and vanilla JavaScript, focusing on clarit... |
| `styling-expert` | Styling | Core | CSS and styling expert including Tailwind, CSS-in-JS, and responsive design |
| `ui-components-expert` | Other | Extended | UI component library expert including Chakra, Material UI, and Mantine |
| `visual-and-observational-rules` | Other | Extended | Defines the visual aspects of the game and how the player observes the world. This includes map c... |
| `web-design-guidelines-vercel` | Styling | Core | Review UI code for Web Interface Guidelines compliance. Use when asked to "review my UI", "check ... |


---

## Skill Discovery Methods

**For finding skills:**

1. **This catalog:** Reference this file for complete inventory by domain
2. **Skill index:** `.claude/config/skill-index.json` (machine-readable source of truth)
3. **Skill invocation:** `Skill({ skill: "<name>" })` (agents invoke skills this way)
4. **Slash commands:** `/<command-name>` delegates to corresponding skill (see command-catalog.md)
5. **Skill catalog table:** `.claude/docs/@SKILL_CATALOG_TABLE.md` (routing reference)

**For creating new skills:**

1. Invoke `research-synthesis` skill first (mandatory pre-creation research)
2. Then invoke `skill-creator` skill to create the skill
3. Skill will be auto-added to skill-index.json on next generation run

---

## Related Documentation

- **Skill Index:** `.claude/config/skill-index.json` — Machine-readable source of truth
- **Skill Catalog Table:** `.claude/docs/@SKILL_CATALOG_TABLE.md` — Routing reference for CLAUDE.md
- **Command Catalog:** `.claude/context/artifacts/catalogs/command-catalog.md` — Slash commands that delegate to skills
- **Agent Registry:** `.claude/context/agent-registry.json` — Agent-to-skill assignments
- **Skill Creator:** `.claude/skills/skill-creator/SKILL.md` — Skill creation workflow
- **Skill Updater:** `.claude/skills/skill-updater/SKILL.md` — Skill refresh workflow

---

## Maintenance Notes

**When adding new skills:**

1. Create via `skill-creator` skill (never write SKILL.md directly)
2. Run `node .claude/tools/cli/generate-skill-index.cjs` to regenerate index
3. Update this catalog (or regenerate from skill-index.json)
4. Verify skill appears in at least one agent's frontmatter
5. Add corresponding slash command if user-facing

**When archiving skills:**

1. Move to `.claude/skills/_archive/`
2. Remove from agent frontmatter assignments
3. Update this catalog
4. Run skill-index generation to update index

**When updating skills:**

1. Use `skill-updater` skill for structured updates
2. Run validation: `node .claude/tools/cli/validate-integration.cjs <path>`
3. Regenerate index if metadata changed
