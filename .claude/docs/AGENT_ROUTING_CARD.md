# Agent Routing Card (60 Agents)

> Compact reference for planners and orchestrators. Read this BEFORE assigning agents to tasks.
> Source of truth: `.claude/context/agent-registry.json`

## Core Agents (10)

| Agent                     | Use When                                                       | NOT For                               |
| ------------------------- | -------------------------------------------------------------- | ------------------------------------- |
| architect                 | System design, architecture decisions, tech stack selection    | Writing code                          |
| developer                 | General coding, bug fixes, new features — **LAST RESORT**      | Docs, review, tests, deploy, refactor |
| planner                   | Task breakdown, implementation planning, complexity analysis   | Executing plans                       |
| qa                        | Testing strategy, test execution, coverage, quality validation | Writing production code               |
| pm                        | Product requirements, user stories, roadmap                    | Implementation                        |
| technical-program-manager | Cross-team delivery, dependencies, phase gates, RAID tracking  | Writing production code               |
| technical-writer          | Documentation, README, guides, API docs, doc reviews           | Writing code                          |
| context-compressor        | Context reduction, summarization, token optimization           | Implementation                        |
| reflection-agent          | Quality assessment, learning extraction, post-task analysis    | Implementation                        |
| router                    | Request routing — you don't spawn this, it spawns you          | Everything                            |

## Review & Quality (3)

| Agent              | Use When                                                            |
| ------------------ | ------------------------------------------------------------------- |
| code-reviewer      | Code review, PR review, implementation audit                        |
| code-simplifier    | Refactoring, cleanup, readability improvement, complexity reduction |
| security-architect | Security review, threat modeling, auth/authz design, OWASP analysis |

## Infrastructure & Ops (4)

| Agent                 | Use When                                                      |
| --------------------- | ------------------------------------------------------------- |
| devops                | Docker, CI/CD, deployment, Kubernetes, Helm, infrastructure   |
| devops-troubleshooter | Production debugging, incident triage, system troubleshooting |
| incident-responder    | Active production incidents, SRE, post-mortems                |
| database-architect    | Schema design, query optimization, migrations, data modeling  |

## Language Specialists (10)

| Agent          | Use When                                                |
| -------------- | ------------------------------------------------------- |
| python-pro     | Python 3.12+, Django, Flask, SQLAlchemy, async Python   |
| typescript-pro | Advanced TypeScript types, generics, strict type safety |
| golang-pro     | Go 1.21+, gRPC, advanced concurrency, microservices     |
| rust-pro       | Rust 1.75+, async patterns, systems programming, Tokio  |
| java-pro       | Java 21+, Spring Boot 3.x, JPA, enterprise backends     |
| php-pro        | PHP 8.x, Laravel 11+, WordPress, Drupal                 |
| nodejs-pro     | Node.js, Express, NestJS, async patterns, WebSocket     |
| fastapi-pro    | FastAPI, async Python APIs, Pydantic V2                 |

## Framework Specialists (5)

| Agent            | Use When                                                        |
| ---------------- | --------------------------------------------------------------- |
| frontend-pro     | React, Vue, CSS, component libraries, UI/UX, accessibility      |
| nextjs-pro       | Next.js 14+ App Router, React Server Components, Server Actions |
| sveltekit-expert | SvelteKit, Svelte 5 runes, SSR/SSG                              |
| graphql-pro      | GraphQL schema, Apollo Client/Server, subscriptions             |

## Mobile & Desktop (4)

| Agent                   | Use When                                            |
| ----------------------- | --------------------------------------------------- |
| ios-pro                 | Swift, SwiftUI, UIKit, Apple platform integrations  |
| android-pro             | Kotlin, Jetpack Compose, Material Design            |
| expo-mobile-developer   | React Native, Expo, cross-platform mobile           |
| tauri-desktop-developer | Tauri 2.0, Rust backend + web frontend desktop apps |

## Specialist Domains (5)

| Agent                      | Use When                                                       |
| -------------------------- | -------------------------------------------------------------- |
| data-engineer              | ETL pipelines, data validation, analytics, data infrastructure |
| ai-ml-specialist           | PyTorch, TensorFlow, Hugging Face, MLOps, model deployment     |
| web3-blockchain-expert     | Solidity, DeFi, smart contracts, security auditing             |
| scientific-research-expert | Computational biology, cheminformatics, scientific workflows   |
| gamedev-pro                | Unity, Unreal, Godot, ECS, game loops, shaders                 |

## UX & Research (2)

| Agent              | Use When                                                 |
| ------------------ | -------------------------------------------------------- |
| mobile-ux-reviewer | Mobile UX/UI review, accessibility audit, HIG compliance |
| researcher         | External research, fact-finding, technology comparisons  |

## Architecture Docs (4)

| Agent        | Use When                                              |
| ------------ | ----------------------------------------------------- |
| c4-context   | C4 system context diagrams, personas, user journeys   |
| c4-container | C4 container diagrams, deployment architecture        |
| c4-component | C4 component diagrams, component boundaries           |
| c4-code      | C4 code-level docs, function signatures, dependencies |

## Orchestrators (4)

| Agent                  | Use When                                   |
| ---------------------- | ------------------------------------------ |
| master-orchestrator    | Multi-phase project coordination           |
| evolution-orchestrator | Framework self-evolution (EVOLVE workflow) |
| party-orchestrator     | Multi-agent team discussions, consensus    |
| swarm-coordinator      | Parallel agent swarms, distributed tasks   |

## Meta (1)

| Agent               | Use When                                        |
| ------------------- | ----------------------------------------------- |
| conductor-validator | Project context validation                      |
| reverse-engineer    | Legacy code understanding, undocumented systems |
