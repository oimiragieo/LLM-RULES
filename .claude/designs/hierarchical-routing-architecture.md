# Hierarchical Routing Architecture Design

> **Status**: Draft — Proposed  
> **Author**: Architecture Analysis Agent  
> **Date**: 2026-03-27  
> **Scope**: Replace flat 113-agent routing with hierarchical core-router + sub-router system

---

## 1. Problem Statement

The current routing system uses a flat architecture where a single router (the main Claude session acting as the "Router") must evaluate **all 109 agents** on every user prompt. This manifests as:

- **routing-table-core-map.cjs**: 250+ keyword→agent mappings in a single flat table
- **intent-classifier.cjs**: Iterates through `INTENT_KEYWORDS`, `ROUTING_TABLE`, `ROUTING_PREFIX_PATTERNS`, capability maps, disambiguation rules, fuzzy matching, and semantic routing — all against 109 agents
- **user-prompt-unified.core.cjs**: `scoreAgents()` loops through every loaded agent, scoring capability phrases, tags, and description matches
- **Context bloat**: Router's CLAUDE.md must reference all 109 agents for routing hints, consuming precious context tokens

**Network analogy**: This is like a backbone router that carries full routing tables for every host on every subnet — no route summarization.

---

## 2. Architecture Overview

### 2.1 Network Routing Analogy

```
CURRENT (flat):
  User → [Core Router: knows 109 agents] → Agent

PROPOSED (hierarchical):
  User → [Core Router: knows ~12 domains + 10 direct agents]
       → [Sub-Router for Domain X: knows 5-15 agents] → Agent
```

**OSPF-style hierarchy**:

- **Area 0 (backbone)** = Core Router — classifies intent into DOMAINS, not individual agents
- **Stub Areas** = Domain Sub-Routers — each deeply knows its 5-15 agents
- **Hosts** = Individual Agents — unchanged, no modifications needed
- **Default routes** = Each domain has a default agent (like a default gateway)
- **Direct routes** = Core agents (developer, planner, etc.) remain directly routable

### 2.2 Key Principles

1. **No agent definitions modified** — all 109 agents remain exactly as-is
2. **Sub-routers are agents** — defined as `.md` files in `.claude/agents/orchestrators/`
3. **Invoked via Task()** — core router spawns sub-routers using the existing Task tool
4. **Domain classification is cheap** — ~12 categories vs 109 individual agents
5. **Backward compatible** — direct routing table still works for explicit keyword matches
6. **Progressive rollout** — can be enabled per-domain with feature flags

---

## 3. Domain Groupings

### 3.1 Complete Agent-to-Domain Mapping (109 agents → 12 routing targets)

#### DIRECT ROUTES (no sub-router needed, core router handles directly)

These are "connected routes" in network terms — agents the core router knows intimately and dispatches without delegation.

| #   | Agent                | Rationale                           |
| --- | -------------------- | ----------------------------------- |
| 1   | `developer`          | Default fallback, highest frequency |
| 2   | `planner`            | Planning intent is clear and common |
| 3   | `architect`          | Architecture intent is distinct     |
| 4   | `qa`                 | Testing intent is distinct          |
| 5   | `general-assistant`  | Catch-all for conversational        |
| 6   | `code-reviewer`      | PR/review intent is distinct        |
| 7   | `code-simplifier`    | Refactor intent is distinct         |
| 8   | `technical-writer`   | Documentation intent is distinct    |
| 9   | `researcher`         | Research/investigation intent       |
| 10  | `context-compressor` | Context/compression operations      |

#### META-ORCHESTRATION (direct routes, system-level)

| #   | Agent                    | Rationale                |
| --- | ------------------------ | ------------------------ |
| 1   | `master-orchestrator`    | Multi-agent coordination |
| 2   | `swarm-coordinator`      | Parallel execution       |
| 3   | `party-orchestrator`     | Consensus/debate         |
| 4   | `evolution-orchestrator` | Self-improvement         |
| 5   | `heartbeat-orchestrator` | Scheduled tasks          |
| 6   | `loop-operator`          | Loop operations          |
| 7   | `artifact-integrator`    | Repo onboarding          |
| 8   | `reflection-agent`       | Session reflection       |
| 9   | `memory-manager`         | Memory operations        |
| 10  | `task-manager`           | Task hygiene             |
| 11  | `ecosystem-auditor`      | Ecosystem audits         |
| 12  | `conductor-validator`    | CDD validation           |
| 13  | `claude-md-auditor`      | Config audits            |
| 14  | `channel-responder`      | Channel responses        |

#### DOMAIN: `web-frontend` (Sub-Router)

**Default gateway**: `frontend-pro`  
**Trigger keywords**: react, vue, css, html, ui, frontend, web, svelte, next, vercel, tailwind, component, responsive, SPA, SSR, wordpress, angular

| #   | Agent              | Specialization                    |
| --- | ------------------ | --------------------------------- |
| 1   | `frontend-pro`     | React, Vue, CSS, general frontend |
| 2   | `nextjs-pro`       | Next.js, Vercel, app router, RSC  |
| 3   | `angular-pro`      | Angular framework                 |
| 4   | `sveltekit-expert` | SvelteKit, Svelte                 |
| 5   | `wordpress-master` | WordPress, CMS                    |

#### DOMAIN: `backend-languages` (Sub-Router)

**Default gateway**: `typescript-pro` (most common) or context-detected  
**Trigger keywords**: python, rust, go, golang, java, kotlin, php, ruby, rails, django, spring, .net, C#, node, express, fastapi, laravel

| #   | Agent              | Specialization           |
| --- | ------------------ | ------------------------ |
| 1   | `python-pro`       | Python ecosystem         |
| 2   | `typescript-pro`   | TypeScript/JavaScript    |
| 3   | `golang-pro`       | Go ecosystem             |
| 4   | `rust-pro`         | Rust ecosystem           |
| 5   | `java-pro`         | Java, Spring             |
| 6   | `kotlin-pro`       | Kotlin, Android backend  |
| 7   | `php-pro`          | PHP, Laravel, Symfony    |
| 8   | `dotnet-pro`       | .NET, C#                 |
| 9   | `swift-pro`        | Swift (non-iOS)          |
| 10  | `nodejs-pro`       | Node.js, Express, NestJS |
| 11  | `rails-pro`        | Ruby on Rails            |
| 12  | `spring-boot-pro`  | Spring Boot              |
| 13  | `django-developer` | Django                   |
| 14  | `fastapi-pro`      | FastAPI                  |

#### DOMAIN: `mobile-desktop` (Sub-Router)

**Default gateway**: `expo-mobile-developer`  
**Trigger keywords**: ios, android, mobile, swift, kotlin, xcode, react native, expo, flutter, tauri, desktop, electron, app

| #   | Agent                     | Specialization           |
| --- | ------------------------- | ------------------------ |
| 1   | `ios-pro`                 | iOS, Swift, SwiftUI      |
| 2   | `android-pro`             | Android, Kotlin, Jetpack |
| 3   | `expo-mobile-developer`   | React Native, Expo       |
| 4   | `tauri-desktop-developer` | Tauri desktop apps       |
| 5   | `mobile-ux-reviewer`      | Mobile UX evaluation     |

#### DOMAIN: `ai-ml` (Sub-Router)

**Default gateway**: `ai-ml-specialist`  
**Trigger keywords**: ai, ml, llm, rag, deep learning, neural, pytorch, tensorflow, hugging face, embedding, fine-tune, model, nlp, prompt, mcp, langchain, llamaindex

| #   | Agent                     | Specialization             |
| --- | ------------------------- | -------------------------- |
| 1   | `ai-ml-specialist`        | General ML, deep learning  |
| 2   | `llm-architect`           | LLM systems, RAG pipelines |
| 3   | `data-engineer`           | ETL, data pipelines        |
| 4   | `data-scientist`          | Data analysis, statistics  |
| 5   | `ml-researcher`           | ML research                |
| 6   | `mlops-engineer`          | ML operations, deployment  |
| 7   | `nlp-engineer`            | NLP tasks                  |
| 8   | `prompt-engineer`         | Prompt design/optimization |
| 9   | `mcp-developer`           | Model Context Protocol     |
| 10  | `multi-llm-consultant`    | Multi-LLM comparison       |
| 11  | `model-benchmarker-agent` | Model evaluation           |

#### DOMAIN: `infra-devops` (Sub-Router)

**Default gateway**: `devops`  
**Trigger keywords**: deploy, docker, ci, cd, kubernetes, k8s, terraform, infrastructure, cloud, aws, azure, gcp, pipeline, container, helm, argocd, sre, incident, outage, monitoring

| #   | Agent                   | Specialization         |
| --- | ----------------------- | ---------------------- |
| 1   | `devops`                | General DevOps, CI/CD  |
| 2   | `devops-troubleshooter` | Production debugging   |
| 3   | `kubernetes-specialist` | K8s, Helm, ArgoCD      |
| 4   | `terraform-engineer`    | Terraform, IaC         |
| 5   | `terragrunt-pro`        | Terragrunt             |
| 6   | `azure-infra-pro`       | Azure infrastructure   |
| 7   | `windows-infra-pro`     | Windows infrastructure |
| 8   | `sre-engineer`          | SRE, SLOs, reliability |
| 9   | `incident-responder`    | Incident management    |
| 10  | `m365-admin`            | Microsoft 365          |

#### DOMAIN: `security-quality` (Sub-Router)

**Default gateway**: `security-architect`  
**Trigger keywords**: security, pentest, vulnerability, exploit, xss, injection, owasp, audit, penetration, chaos, resilience, reverse engineer, binary, decompile, performance, profiling, load test, a11y, accessibility, wcag

| #   | Agent                  | Specialization               |
| --- | ---------------------- | ---------------------------- |
| 1   | `security-architect`   | Security architecture        |
| 2   | `penetration-tester`   | Pen testing, OWASP           |
| 3   | `chaos-engineer`       | Chaos/resilience testing     |
| 4   | `reverse-engineer`     | Binary analysis, RE          |
| 5   | `advanced-debugging`   | Deep debugging               |
| 6   | `performance-engineer` | Perf profiling, load testing |
| 7   | `accessibility-tester` | WCAG, a11y testing           |
| 8   | `compliance-checker`   | GDPR, regulatory             |

#### DOMAIN: `architecture-data` (Sub-Router)

**Default gateway**: `api-designer`  
**Trigger keywords**: api, graphql, rest, openapi, grpc, microservices, service mesh, saga, cqrs, event sourcing, ddd, schema, database, sql, postgres, c4 diagram, architecture diagram

| #   | Agent                     | Specialization              |
| --- | ------------------------- | --------------------------- |
| 1   | `api-designer`            | API design (REST, gRPC)     |
| 2   | `graphql-pro`             | GraphQL, Apollo, Federation |
| 3   | `microservices-architect` | Distributed systems, DDD    |
| 4   | `database-architect`      | Database design, schemas    |
| 5   | `sql-pro`                 | SQL optimization            |
| 6   | `postgres-pro`            | PostgreSQL specialist       |
| 7   | `c4-context`              | C4 context diagrams         |
| 8   | `c4-container`            | C4 container diagrams       |
| 9   | `c4-component`            | C4 component diagrams       |
| 10  | `c4-code`                 | C4 code diagrams            |
| 11  | `iot-engineer`            | IoT architecture            |

#### DOMAIN: `product-business` (Sub-Router)

**Default gateway**: `pm-coordinator`  
**Trigger keywords**: product, roadmap, sprint, backlog, user story, agile, scrum, kanban, marketing, brand, ux research, legal, compliance, budget, vendor, strategy, content calendar, seo, analytics

| #   | Agent                       | Specialization              |
| --- | --------------------------- | --------------------------- |
| 1   | `pm`                        | Product management          |
| 2   | `pm-coordinator`            | Project coordination, Agile |
| 3   | `product-manager`           | Product strategy            |
| 4   | `business-analyst`          | Business analysis           |
| 5   | `technical-program-manager` | TPM, cross-functional       |
| 6   | `marketing-strategist`      | Marketing, growth           |
| 7   | `ux-researcher`             | UX research                 |
| 8   | `brand-guardian`            | Brand consistency           |
| 9   | `feedback-synthesizer`      | User feedback               |
| 10  | `legal-advisor`             | Legal guidance              |
| 11  | `quant-analyst`             | Quantitative finance        |
| 12  | `aso-specialist`            | App store optimization      |
| 13  | `voice-replicator-agent`    | Voice/tone matching         |
| 14  | `forum-monitor-agent`       | Community monitoring        |
| 15  | `post-analyzer-agent`       | Content analysis            |

#### DOMAIN: `specialized-niche` (Sub-Router)

**Default gateway**: `scientific-research-expert`  
**Trigger keywords**: web3, blockchain, solidity, defi, game, unity, unreal, godot, medical, clinical, scientific, academic, legacy, modernize

| #   | Agent                        | Specialization            |
| --- | ---------------------------- | ------------------------- |
| 1   | `web3-blockchain-expert`     | Web3, Solidity, DeFi      |
| 2   | `gamedev-pro`                | Game development          |
| 3   | `medical-research-triage`    | Medical research          |
| 4   | `scientific-research-expert` | Scientific research       |
| 5   | `legacy-modernizer`          | Legacy code modernization |
| 6   | `app-generator-agent`        | App scaffolding           |
| 7   | `context-manager`            | Context management        |

### 3.2 Summary

| Routing Target      | Type            | Agent Count                              |
| ------------------- | --------------- | ---------------------------------------- |
| Direct Core         | Connected route | 10                                       |
| Meta-Orchestration  | Connected route | 14                                       |
| `web-frontend`      | Sub-router      | 5                                        |
| `backend-languages` | Sub-router      | 14                                       |
| `mobile-desktop`    | Sub-router      | 5                                        |
| `ai-ml`             | Sub-router      | 11                                       |
| `infra-devops`      | Sub-router      | 10                                       |
| `security-quality`  | Sub-router      | 8                                        |
| `architecture-data` | Sub-router      | 11                                       |
| `product-business`  | Sub-router      | 15                                       |
| `specialized-niche` | Sub-router      | 7                                        |
| **Total**           |                 | **119** (1 duplicate: `context-manager`) |

Core router now only needs to distinguish **~12 routing targets** instead of 118 individual agents.

---

## 4. Core Router Simplification

### 4.1 New Core Router CLAUDE.md Structure

The core router's CLAUDE.md should be restructured to only contain domain-level routing hints, not individual agent references.

```markdown
## Routing Domains

You route user requests to DOMAINS, not individual agents. For each domain,
spawn the domain sub-router via Task(). The sub-router selects the best agent.

### Direct Routes (handle immediately, no sub-router)

| Intent                 | Agent              | When                   |
| ---------------------- | ------------------ | ---------------------- |
| coding, bugs, features | developer          | Default for code tasks |
| planning, breakdown    | planner            | Multi-step planning    |
| architecture, design   | architect          | System design          |
| testing, QA            | qa                 | Test tasks             |
| documentation, docs    | technical-writer   | Doc tasks              |
| code review, PR        | code-reviewer      | Review tasks           |
| refactor, simplify     | code-simplifier    | Code cleanup           |
| research, investigate  | researcher         | Research tasks         |
| general question       | general-assistant  | Q&A, help              |
| context, compress      | context-compressor | Context ops            |

### Domain Routes (spawn sub-router via Task)

| Domain            | Keywords                                                       | Sub-Router Agent           |
| ----------------- | -------------------------------------------------------------- | -------------------------- |
| web-frontend      | react, vue, css, frontend, next, svelte, angular               | domain-router-web-frontend |
| backend-languages | python, rust, go, java, kotlin, php, node, rails, django, .net | domain-router-backend      |
| mobile-desktop    | ios, android, mobile, expo, tauri, desktop                     | domain-router-mobile       |
| ai-ml             | ai, ml, llm, rag, deep learning, nlp, prompt, mcp              | domain-router-ai-ml        |
| infra-devops      | deploy, docker, k8s, terraform, cloud, ci/cd, sre, incident    | domain-router-infra        |
| security-quality  | security, pentest, chaos, reverse engineer, performance, a11y  | domain-router-security     |
| architecture-data | api, graphql, microservices, database, sql, c4, ddd            | domain-router-arch-data    |
| product-business  | product, sprint, agile, marketing, ux, legal, brand            | domain-router-product      |
| specialized-niche | web3, blockchain, game, medical, scientific, legacy            | domain-router-niche        |

### Orchestration (direct, system-level)

| Intent                   | Agent                  |
| ------------------------ | ---------------------- |
| orchestrate, multi-agent | master-orchestrator    |
| swarm, parallel          | swarm-coordinator      |
| consensus, debate        | party-orchestrator     |
| evolve, self-improve     | evolution-orchestrator |
| heartbeat, scheduled     | heartbeat-orchestrator |
| loop operations          | loop-operator          |
| integrate, onboard repo  | artifact-integrator    |
```

### 4.2 Simplified Routing Table

Replace the 250+ flat entries in `routing-table-core-map.cjs` with a two-tier lookup:

```javascript
// routing-table-hierarchical.cjs
'use strict';

/**
 * Tier 1: Domain classification (core router uses this)
 * Maps keywords to DOMAINS, not individual agents.
 */
const DOMAIN_ROUTING_TABLE = {
  // Direct routes (core agents - no sub-router)
  bug: { type: 'direct', agent: 'developer' },
  coding: { type: 'direct', agent: 'developer' },
  feature: { type: 'direct', agent: 'planner' },
  test: { type: 'direct', agent: 'qa' },
  testing: { type: 'direct', agent: 'qa' },
  documentation: { type: 'direct', agent: 'technical-writer' },
  review: { type: 'direct', agent: 'code-reviewer' },
  refactor: { type: 'direct', agent: 'code-simplifier' },
  research: { type: 'direct', agent: 'researcher' },
  explain: { type: 'direct', agent: 'general-assistant' },
  architecture: { type: 'direct', agent: 'architect' },
  plan: { type: 'direct', agent: 'planner' },
  compress: { type: 'direct', agent: 'context-compressor' },

  // Domain routes (sub-router dispatched via Task)
  react: { type: 'domain', domain: 'web-frontend', router: 'domain-router-web-frontend' },
  vue: { type: 'domain', domain: 'web-frontend', router: 'domain-router-web-frontend' },
  css: { type: 'domain', domain: 'web-frontend', router: 'domain-router-web-frontend' },
  frontend: { type: 'domain', domain: 'web-frontend', router: 'domain-router-web-frontend' },
  nextjs: { type: 'domain', domain: 'web-frontend', router: 'domain-router-web-frontend' },
  svelte: { type: 'domain', domain: 'web-frontend', router: 'domain-router-web-frontend' },
  angular: { type: 'domain', domain: 'web-frontend', router: 'domain-router-web-frontend' },

  python: { type: 'domain', domain: 'backend-languages', router: 'domain-router-backend' },
  rust: { type: 'domain', domain: 'backend-languages', router: 'domain-router-backend' },
  golang: { type: 'domain', domain: 'backend-languages', router: 'domain-router-backend' },
  java: { type: 'domain', domain: 'backend-languages', router: 'domain-router-backend' },
  php: { type: 'domain', domain: 'backend-languages', router: 'domain-router-backend' },
  nodejs: { type: 'domain', domain: 'backend-languages', router: 'domain-router-backend' },

  ios: { type: 'domain', domain: 'mobile-desktop', router: 'domain-router-mobile' },
  android: { type: 'domain', domain: 'mobile-desktop', router: 'domain-router-mobile' },
  mobile: { type: 'domain', domain: 'mobile-desktop', router: 'domain-router-mobile' },
  tauri: { type: 'domain', domain: 'mobile-desktop', router: 'domain-router-mobile' },

  ai: { type: 'domain', domain: 'ai-ml', router: 'domain-router-ai-ml' },
  ml: { type: 'domain', domain: 'ai-ml', router: 'domain-router-ai-ml' },
  llm: { type: 'domain', domain: 'ai-ml', router: 'domain-router-ai-ml' },
  rag: { type: 'domain', domain: 'ai-ml', router: 'domain-router-ai-ml' },

  deploy: { type: 'domain', domain: 'infra-devops', router: 'domain-router-infra' },
  docker: { type: 'domain', domain: 'infra-devops', router: 'domain-router-infra' },
  kubernetes: { type: 'domain', domain: 'infra-devops', router: 'domain-router-infra' },
  terraform: { type: 'domain', domain: 'infra-devops', router: 'domain-router-infra' },

  security: { type: 'domain', domain: 'security-quality', router: 'domain-router-security' },
  pentest: { type: 'domain', domain: 'security-quality', router: 'domain-router-security' },

  graphql: { type: 'domain', domain: 'architecture-data', router: 'domain-router-arch-data' },
  microservices: { type: 'domain', domain: 'architecture-data', router: 'domain-router-arch-data' },
  database: { type: 'domain', domain: 'architecture-data', router: 'domain-router-arch-data' },

  product: { type: 'domain', domain: 'product-business', router: 'domain-router-product' },
  sprint: { type: 'domain', domain: 'product-business', router: 'domain-router-product' },
  marketing: { type: 'domain', domain: 'product-business', router: 'domain-router-product' },

  web3: { type: 'domain', domain: 'specialized-niche', router: 'domain-router-niche' },
  blockchain: { type: 'domain', domain: 'specialized-niche', router: 'domain-router-niche' },
  game: { type: 'domain', domain: 'specialized-niche', router: 'domain-router-niche' },
  medical: { type: 'domain', domain: 'specialized-niche', router: 'domain-router-niche' },
};

module.exports = { DOMAIN_ROUTING_TABLE };
```

---

## 5. Sub-Router Agent Specifications

### 5.1 Sub-Router Agent Template

Each sub-router is a lightweight agent that:

1. Receives the user's original prompt (passed via Task description)
2. Analyzes it against its domain's agents
3. Spawns the best-matching agent via Task()
4. Returns the result

```yaml
---
name: domain-router-{domain}
version: 1.0.0
description: >-
  Domain sub-router for {DOMAIN_NAME}. Analyzes user intent and selects
  the best specialist agent from the {DOMAIN_NAME} domain.
  DO NOT implement tasks directly — always delegate to a specialist.
model: haiku # Lightweight model for routing decisions
temperature: 0.1
context_strategy: lazy_load
maxTurns: 4 # Quick decision, minimal turns
permissionMode: default
priority: high
tools:
  - Read # To read agent definitions if needed
  - Task # To spawn the selected specialist
  - TaskCreate # Alternative task spawning
skills: [] # No skills needed — pure routing logic
---
```

### 5.2 Sub-Router System Prompt Template

```markdown
# Domain Sub-Router: {DOMAIN_NAME}

You are a routing agent for the **{DOMAIN_NAME}** domain. Your ONLY job is to
select the best specialist agent for the user's request and delegate to it.

## NEVER do these:

- Never implement code yourself
- Never answer questions directly
- Never use more than 2 turns to decide

## Your Domain's Agents

| Agent     | When to Use   | Keywords   |
| --------- | ------------- | ---------- |
| {agent-1} | {description} | {keywords} |
| {agent-2} | {description} | {keywords} |
| ...       | ...           | ...        |

## Default Agent

If unclear, use **{default-agent}**.

## Disambiguation Rules

{domain-specific disambiguation rules}

## Decision Process

1. Read the user's request
2. Match against agent specializations above
3. Spawn the selected agent via Task() with the FULL original user prompt
4. Return

## Task Spawning Format
```

Task({
subagent_type: "{selected-agent}",
description: "{original user prompt, passed through verbatim}"
})

```

```

### 5.3 Concrete Sub-Router: `domain-router-backend`

```yaml
---
name: domain-router-backend
version: 1.0.0
description: >-
  Domain sub-router for backend/language specialists. Routes to the correct
  language-specific agent based on detected language, framework, or ecosystem.
model: haiku
temperature: 0.1
maxTurns: 4
tools:
  - Read
  - Task
---

# Backend Languages Domain Router

## Agents in This Domain

| Agent | Use When | Key Signals |
|-------|----------|-------------|
| python-pro | Python code, pip, venv, Poetry | `.py`, `pip`, `pytest`, `poetry` |
| typescript-pro | TypeScript types, generics, decorators | `.ts`, `tsconfig`, `tsc` |
| golang-pro | Go code, modules, goroutines | `.go`, `go.mod`, `goroutine` |
| rust-pro | Rust, cargo, ownership, lifetimes | `.rs`, `Cargo.toml`, `borrow` |
| java-pro | Java, Maven, Gradle | `.java`, `pom.xml`, `build.gradle` |
| kotlin-pro | Kotlin, coroutines, Ktor | `.kt`, `build.gradle.kts` |
| php-pro | PHP, Laravel, Symfony, Composer | `.php`, `composer.json` |
| dotnet-pro | .NET, C#, ASP.NET | `.cs`, `.csproj`, `dotnet` |
| swift-pro | Swift (non-iOS contexts) | `.swift`, `Package.swift` |
| nodejs-pro | Node.js, Express, NestJS | `package.json`, `express`, `nestjs` |
| rails-pro | Ruby on Rails | `Gemfile`, `config/routes.rb` |
| spring-boot-pro | Spring Boot, Spring Framework | `@SpringBootApplication`, `application.yml` |
| django-developer | Django, DRF | `manage.py`, `urls.py`, `settings.py` |
| fastapi-pro | FastAPI, Pydantic, Starlette | `FastAPI()`, `@app.get`, `Pydantic` |

## Default: typescript-pro (most common backend language in projects)

## Disambiguation
- Python + FastAPI → fastapi-pro (not python-pro)
- Python + Django → django-developer (not python-pro)
- Java + Spring → spring-boot-pro (not java-pro)
- TypeScript + Node/Express → nodejs-pro (not typescript-pro)
- Ruby + Rails → rails-pro
- PHP + Laravel → php-pro

## Process
1. Detect language/framework from user prompt
2. Check for framework-specific signals (trumps language)
3. Spawn best agent via Task()
```

### 5.4 Concrete Sub-Router: `domain-router-ai-ml`

```yaml
---
name: domain-router-ai-ml
version: 1.0.0
description: >-
  Domain sub-router for AI/ML specialists. Routes to the correct
  AI/ML agent based on the task type (training, serving, prompting, data, etc.).
model: haiku
temperature: 0.1
maxTurns: 4
tools:
  - Read
  - Task
---

# AI/ML Domain Router

## Agents in This Domain

| Agent | Use When | Key Signals |
|-------|----------|-------------|
| ai-ml-specialist | General ML, model training, PyTorch, TF | `train`, `model`, `pytorch`, `tensorflow` |
| llm-architect | RAG design, model serving, LLM systems | `rag`, `serving`, `pipeline`, `langchain` |
| data-engineer | ETL pipelines, data infrastructure | `etl`, `pipeline`, `warehouse`, `dbt` |
| data-scientist | Analysis, statistics, visualization | `analysis`, `pandas`, `statistics`, `visualization` |
| ml-researcher | ML research, papers, experiments | `paper`, `experiment`, `novel`, `research` |
| mlops-engineer | Model deployment, monitoring, MLflow | `deploy model`, `mlflow`, `model registry` |
| nlp-engineer | NLP tasks, tokenization, NER | `nlp`, `tokenize`, `ner`, `sentiment` |
| prompt-engineer | Prompt design, optimization, testing | `prompt`, `system prompt`, `few-shot` |
| mcp-developer | Model Context Protocol servers/clients | `mcp`, `mcp server`, `model context protocol` |
| multi-llm-consultant | Multi-LLM comparison, council | `compare llms`, `llm council`, `which model` |
| model-benchmarker-agent | Model evaluation, benchmarks | `benchmark`, `evaluate model`, `compare models` |

## Default: ai-ml-specialist

## Disambiguation
- LLM + architecture/design/pipeline → llm-architect
- LLM + training/fine-tune → ai-ml-specialist
- LLM + prompt/optimize → prompt-engineer
- Data + pipeline/etl → data-engineer
- Data + analysis/statistics → data-scientist
```

---

## 6. Routing Hook Modifications

### 6.1 Changes to `intent-classifier.cjs`

The intent classifier needs a new layer that classifies into domains first:

```javascript
// New function: classifyDomain()
function classifyDomain(prompt) {
  const promptLower = String(prompt || '')
    .trim()
    .toLowerCase();

  // Step 1: Try direct agent match (core agents)
  for (const [keyword, entry] of Object.entries(DOMAIN_ROUTING_TABLE)) {
    if (promptLower.includes(keyword)) {
      if (entry.type === 'direct') {
        return { type: 'direct', agent: entry.agent, domain: null };
      }
      return { type: 'domain', domain: entry.domain, router: entry.router };
    }
  }

  // Step 2: Fallback to 'developer' (direct)
  return { type: 'direct', agent: 'developer', domain: null };
}
```

### 6.2 Changes to `user-prompt-unified.core.cjs`

The `checkRouterEnforcement()` function needs to be modified to:

1. **First**, classify into domain (cheap operation)
2. **If direct route**: emit the recommendation as today (no change)
3. **If domain route**: recommend spawning the sub-router agent

```javascript
// In checkRouterEnforcement():
async function checkRouterEnforcement(hookInput, options = {}) {
  const userPrompt = hookInput?.prompt || hookInput?.message || '';

  // NEW: Hierarchical domain classification first
  const domainClassification = classifyDomain(userPrompt);

  if (domainClassification.type === 'domain') {
    // Recommend sub-router spawn instead of individual agent
    console.error('\n+--------------------------------------------------+');
    console.error('| ROUTER ANALYSIS (Hierarchical)                   |');
    console.error('+--------------------------------------------------+');
    console.error(`| Domain: ${domainClassification.domain.padEnd(39)} |`);
    console.error(`| Sub-Router: ${domainClassification.router.padEnd(36)} |`);
    console.error('| Spawn sub-router via Task tool                   |');
    console.error('+--------------------------------------------------+\n');

    return {
      candidates: [
        {
          agent: { name: domainClassification.router },
          score: 10,
          intent: domainClassification.domain,
          source: 'hierarchical',
        },
      ],
      domain: domainClassification.domain,
      routingType: 'hierarchical',
      // Pass original prompt for the sub-router
      originalPrompt: userPrompt,
    };
  }

  // Direct route: existing logic (unchanged)
  // ... existing scoreAgents() code ...
}
```

### 6.3 Changes to `scoreAgents()`

The `scoreAgents()` function should be updated to only score agents relevant to the classified domain:

```javascript
function scoreAgents(prompt, agents, classification, domain = null) {
  // If domain is specified, filter agents to that domain only
  const filteredAgents = domain
    ? agents.filter(a => DOMAIN_AGENT_MAP[domain]?.includes(a.name))
    : agents;

  // ... existing scoring logic on filteredAgents ...
}
```

### 6.4 Message Format for Sub-Router Spawning

When the core router decides to use a sub-router, it formats the Task call:

```
ROUTER RECOMMENDATION: Spawn domain sub-router

Task({
  subagent_type: "domain-router-backend",
  description: "Route this request to the best backend language specialist:\n\n<original-prompt>\n{user's original prompt}\n</original-prompt>"
})
```

The sub-router then:

1. Reads the original prompt
2. Selects the best agent in its domain
3. Spawns that agent with the original prompt

---

## 7. Migration Strategy

### 7.1 Phase 1: Create Sub-Router Agents (Non-Breaking)

1. Create 9 sub-router agent `.md` files in `.claude/agents/orchestrators/`
2. Add them to agent registry
3. No changes to existing routing — they exist but aren't used yet

**Files to create:**

- `.claude/agents/orchestrators/domain-router-web-frontend.md`
- `.claude/agents/orchestrators/domain-router-backend.md`
- `.claude/agents/orchestrators/domain-router-mobile.md`
- `.claude/agents/orchestrators/domain-router-ai-ml.md`
- `.claude/agents/orchestrators/domain-router-infra.md`
- `.claude/agents/orchestrators/domain-router-security.md`
- `.claude/agents/orchestrators/domain-router-arch-data.md`
- `.claude/agents/orchestrators/domain-router-product.md`
- `.claude/agents/orchestrators/domain-router-niche.md`

### 7.2 Phase 2: Add Domain Classification Layer

1. Create `routing-table-hierarchical.cjs` with domain-level routing
2. Add `classifyDomain()` to intent-classifier.cjs
3. Feature-flag the hierarchical routing: `HIERARCHICAL_ROUTING=on`
4. When flag is off, existing flat routing works unchanged

### 7.3 Phase 3: Modify Router Hooks

1. Update `user-prompt-unified.core.cjs` to use domain classification
2. Update CLAUDE.md to reference domains instead of individual agents
3. Keep flat routing as fallback when domain classification confidence is low

### 7.4 Phase 4: Optimize & Prune

1. Remove redundant entries from `routing-table-core-map.cjs` that are now handled by sub-routers
2. Move disambiguation rules into sub-routers (where they naturally belong)
3. Slim down the agent-skill-matrix sections that were only needed for flat routing

---

## 8. Preservation Guarantees

### 8.1 What Does NOT Change

| Component                       | Status                                                 |
| ------------------------------- | ------------------------------------------------------ |
| All 109 agent `.md` definitions | **Unchanged**                                          |
| Agent skill matrix              | **Unchanged**                                          |
| Agent registry                  | **Augmented** (adds 9 sub-router agents)               |
| Trust scorer                    | **Unchanged** (works per-agent, including sub-routers) |
| Capability routing              | **Unchanged** (still used within sub-routers)          |
| Semantic router                 | **Unchanged** (can be used as fallback)                |
| Task/TaskCreate tools           | **Unchanged** (sub-routers use same mechanism)         |

### 8.2 What Changes

| Component                          | Change                                         |
| ---------------------------------- | ---------------------------------------------- |
| `routing-table-core-map.cjs`       | **New version**: Domain-level entries          |
| `intent-classifier.cjs`            | **New function**: `classifyDomain()`           |
| `user-prompt-unified.core.cjs`     | **Modified**: Domain-first classification      |
| `CLAUDE.md` (router)               | **Simplified**: ~12 domains vs 109 agents      |
| `routing-table-disambiguation.cjs` | **Redistributed**: Rules move into sub-routers |

### 8.3 Backward Compatibility

- Feature flag `HIERARCHICAL_ROUTING=on|off` controls the new routing
- When off, existing flat routing is 100% preserved
- Sub-router agents can be spawned directly even without hierarchical routing enabled
- Direct routes (core agents) work identically in both modes

---

## 9. Performance Analysis

### 9.1 Context Token Savings

| Component                         | Current                         | Proposed                    |
| --------------------------------- | ------------------------------- | --------------------------- |
| Router CLAUDE.md agent references | ~109 agent names + descriptions | ~12 domain names + keywords |
| Routing table entries scanned     | 250+ per prompt                 | ~50 per prompt              |
| Agents scored per prompt          | 109 (loadAgents loop)           | 10-15 (domain-filtered)     |
| Disambiguation rules evaluated    | All 15+ rules                   | Only domain-relevant rules  |

**Estimated context savings**: 60-70% reduction in routing-related tokens in the main session.

### 9.2 Latency Trade-off

| Scenario                        | Current                    | Proposed                       |
| ------------------------------- | -------------------------- | ------------------------------ |
| Core agent (developer, planner) | 1 routing decision         | 1 routing decision (same)      |
| Domain agent (python-pro)       | 1 routing decision         | 2 decisions (domain + agent)   |
| Ambiguous domain                | 1 routing decision + fuzzy | 1 domain decision + sub-router |

**Added latency for domain routes**: ~1-2 seconds for sub-router Task spawn. This is offset by the context savings in the main session which speeds up all subsequent reasoning.

### 9.3 Cost Model

Sub-routers use `haiku` model with `maxTurns: 4`, meaning:

- Sub-router invocation cost: ~500-1000 tokens (haiku pricing)
- Main session savings: ~5000-10000 tokens of context per prompt cycle
- **Net savings**: Positive after first prompt in a session

---

## 10. Open Questions

1. **Should sub-routers cache their last decision?** If a user sends 5 Python prompts in a row, should the sub-router skip re-evaluation after the first?

2. **Cross-domain requests**: What happens when a request spans multiple domains (e.g., "Build a FastAPI backend with React frontend")? Options:
   - Route to the primary domain, let that agent handle cross-cutting concerns
   - Use master-orchestrator for multi-domain requests
   - Allow core router to spawn multiple sub-routers in parallel

3. **Sub-router model choice**: `haiku` is proposed for speed/cost, but should high-stakes domains (security, architecture) use `sonnet` for better judgment?

4. **Embedding-based domain classification**: The existing `semantic-router.cjs` uses embeddings. Should we create domain-level prototypes for embedding-based domain classification as a secondary signal?

---

## 11. File Manifest

Files to be created/modified in implementation:

### New Files (Phase 1)

```
.claude/agents/orchestrators/domain-router-web-frontend.md
.claude/agents/orchestrators/domain-router-backend.md
.claude/agents/orchestrators/domain-router-mobile.md
.claude/agents/orchestrators/domain-router-ai-ml.md
.claude/agents/orchestrators/domain-router-infra.md
.claude/agents/orchestrators/domain-router-security.md
.claude/agents/orchestrators/domain-router-arch-data.md
.claude/agents/orchestrators/domain-router-product.md
.claude/agents/orchestrators/domain-router-niche.md
.claude/lib/routing/routing-table-hierarchical.cjs
.claude/config/domain-routing.json
.claude/designs/hierarchical-routing-architecture.md (this file)
```

### Modified Files (Phase 2-3)

```
.claude/lib/routing/intent-classifier.cjs          # Add classifyDomain()
.claude/hooks/routing/user-prompt-unified.core.cjs  # Domain-first routing
.claude/CLAUDE.md                                   # Simplified routing section
.claude/config/capability-routing.json              # Add domain mappings
.claude/context/config/agent-skill-matrix.json      # Add sub-router entries
```

### Unchanged Files

```
.claude/agents/core/*                               # All core agents
.claude/agents/specialized/*                        # All specialized agents
.claude/agents/domain/*                             # All domain agents
.claude/agents/orchestrators/master-orchestrator.md # Existing orchestrators
.claude/lib/routing/trust-scorer.cjs                # Trust scoring
.claude/lib/routing/skill-auto-router.cjs           # Skill routing
.claude/lib/routing/semantic-router.cjs             # Semantic routing
.claude/lib/routing/routing-v2.cjs                  # V2 routing logic
```
