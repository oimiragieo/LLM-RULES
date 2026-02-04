# Router Keyword Guide

## Overview

This guide documents how the Router uses keyword matching to analyze user requests and select appropriate agents. The Router performs comprehensive intent detection using keyword scoring, intent-to-agent mapping, and disambiguation rules, with pattern and fuzzy fallbacks defined in `.claude/lib/routing/routing-table.cjs` when exact keyword matches are weak.

## Intent Detection System

The Router uses a three-layer system for agent selection:

1. **Intent Keywords**: Extensive keyword lists for 41+ agent types
2. **Intent-to-Agent Mapping**: Deterministic mapping from detected intent to agent name
3. **Disambiguation Rules**: Contextual rules to resolve keyword overlaps

## Intent Keywords by Category

### Core Agents (8)

#### architect

**Primary Agent**: `architect`
**When to Use**: System design, architecture blueprints, technology selection, scalability planning

**Keywords**:

- Architecture: architect, system design, system architecture, architecture blueprint, technical architecture
- Technology: technology selection, tech stack, platform selection, scalability, scaling strategy
- Patterns: design patterns, architectural patterns, microservices, monolith
- Decisions: adr, architecture decision record, technical decision
- Design: component interaction, api design, non-functional requirements
- Infrastructure: cloud architecture, infrastructure design, data modeling
- Strategy: technical strategy, resilience, availability, reliability, trade-offs

#### context_compressor

**Primary Agent**: `context-compressor`
**When to Use**: Token reduction, context summarization, memory optimization

**Keywords**:

- compress, context compression, summarize, summarization, summary
- token reduction, token savings, token optimization, prune, pruning
- context window, context limits, context overflow, memory compression
- condense, extract key, key points, reduce context, distill

#### developer

**Primary Agent**: `developer`
**When to Use**: Code implementation, bug fixes, refactoring, TDD

**Keywords**:

- Code: code, implement, implementation, fix bug, debug, debugging, bugfix
- Refactoring: refactor, refactoring, clean code, code quality
- TDD: tdd, test-driven, red-green-refactor, failing test, unit test
- Actions: write code, write function, write class, commit, push, merge, branch
- Errors: syntax error, runtime error, logic error, exception
- Features: feature implementation, error, exception

#### planner

**Primary Agent**: `planner`
**When to Use**: Project planning, work breakdown, feature design, requirements analysis

**Keywords**:

- Planning: plan, planning, create plan, project plan, breakdown, break down
- Structure: decompose, wbs, work breakdown, phases, milestones, steps, stages
- Dependencies: dependencies, sequence, scope, requirements, goals, objectives
- Agile: epic, user story, estimate, timeline, schedule
- Complexity: ambiguous, complex request, roadmap, prioritize, deliverables, success criteria

#### pm

**Primary Agent**: `pm`
**When to Use**: Product management, backlog grooming, sprint planning, stakeholder management

**Keywords**:

- Backlog: product backlog, backlog, backlog grooming, user story, acceptance criteria
- Sprint: sprint planning, sprint goal, sprint review, prioritization
- Methods: rice, moscow, stakeholder, product roadmap, product vision
- Metrics: okr, objectives, key results, velocity, story points, burndown
- Agile: feature request, agile, scrum, kanban, customer, user needs, user feedback, kpi, metrics

#### qa

**Primary Agent**: `qa`
**When to Use**: Testing, quality assurance, test coverage, regression testing

**Keywords**:

- Testing: test, testing, test suite, test coverage, quality assurance, qa
- Types: regression, regression testing, edge case, boundary condition, corner case
- Planning: test plan, test case, test scenario, automation, automated testing
- Integration: e2e, end-to-end, integration testing, performance testing, load testing
- Validation: stress testing, validation, verification, acceptance testing, defect

#### router

**Primary Agent**: `router` (meta - refers to this agent)
**When to Use**: Routing analysis, agent selection, orchestration strategy

**Keywords**:

- route, routing, orchestrate, orchestration, dispatch, delegate
- multi-agent, agent coordination, spawn agent, subagent, task distribution
- workflow, pipeline, context management, which agent

#### documentation (technical-writer)

**Primary Agent**: `technical-writer`
**When to Use**: Creating/updating documentation, API docs, README files, guides

**Keywords**:

- Documents: document, docs, documentation, readme, readme.md, write guide
- API: api doc, api docs, api documentation, jsdoc, typedoc, docstring
- Formats: markdown, md file, technical writing, user guide, developer guide
- Reference: reference, reference doc, tutorial, how-to, howto, getting started
- Updates: changelog, release notes, wiki, specification, spec
- Tools: openapi, swagger, postman, docusaurus, mkdocs, sphinx
- Actions: write doc, update doc, create doc, generate docs, document this, explain, describe, guide, manual

### Domain Language Agents (6)

#### python

**Primary Agent**: `python-pro`
**When to Use**: Python development, Django, Flask, pandas, asyncio

**Keywords**:

- Language: python, py, .py
- Frameworks: django, flask, pandas, numpy, scipy
- Package Managers: pip, poetry, pipenv, uv
- Testing: pytest, unittest
- Async: asyncio
- Virtual Environments: virtualenv, venv, conda
- Config: pyproject.toml, requirements.txt
- Types: type hints, mypy, pydantic, dataclasses
- Database: sqlalchemy
- Tasks: celery
- Notebooks: jupyter, notebook
- ML: machine learning, tensorflow, pytorch

#### rust

**Primary Agent**: `rust-pro`
**When to Use**: Rust development, systems programming, memory safety

**Keywords**:

- Language: rust, rustlang, .rs
- Package Manager: cargo, crates.io, crate, cargo.toml
- Async: tokio, async-std, futures
- Core Concepts: ownership, borrowing, lifetimes, memory safety, zero-cost
- Compiler: rustc, rustup
- Features: traits, generics, macros, unsafe, ffi
- Targets: wasm, webassembly
- Frameworks: actix, axum, rocket
- Serialization: serde

#### golang

**Primary Agent**: `golang-pro`
**When to Use**: Go development, microservices, concurrency

**Keywords**:

- Language: go, golang, .go
- Modules: go.mod, go.sum, go mod, go get
- Concurrency: goroutine, goroutines, channel, channels, concurrency
- Frameworks: gin, echo, fiber
- Core: interface, struct, defer, panic, recover
- RPC: grpc, protobuf
- HTTP: net/http
- Testing: go test, testify
- Formatting: gofmt

#### typescript

**Primary Agent**: `typescript-pro`
**When to Use**: TypeScript development, type safety, modern JavaScript

**Keywords**:

- Language: typescript, ts, .ts, .tsx
- Types: type, interface, generics, type safety, type inference
- Advanced: union types, utility types, decorators, enum, strict mode
- Package Managers: npm, yarn, pnpm, bun
- Config: tsconfig
- Testing: jest, vitest
- Linting: eslint, prettier
- Compiler: tsc, ts-node

#### java

**Primary Agent**: `java-pro`
**When to Use**: Java development, Spring Boot, enterprise applications

**Keywords**:

- Language: java, .java, jdk, jre
- Frameworks: spring, spring boot, springboot
- Build Tools: maven, gradle, pom.xml, build.gradle
- ORM: jpa, hibernate
- Testing: junit, mockito
- Packaging: jar, war
- Enterprise: enterprise, jakarta, beans, dependency injection
- Annotations: annotations, @autowired, @component
- Data: jdbc, servlet, streams, lambda, optional

#### php

**Primary Agent**: `php-pro`
**When to Use**: PHP development, Laravel, Symfony, WordPress

**Keywords**:

- Language: php, .php, php8
- Frameworks: laravel, symfony
- Package Manager: composer, composer.json
- ORM: eloquent, doctrine
- Templates: blade, twig
- CLI: artisan
- Testing: phpunit, pest
- Standards: psr, psr-4, autoloading, namespace
- Features: middleware, migration, seeder, factory, queue
- CMS: wordpress, drupal

### Domain Framework Agents (9)

#### fastapi

**Primary Agent**: `fastapi-pro`
**When to Use**: FastAPI development, async Python APIs, Pydantic validation

**Keywords**:

- fastapi, pydantic, async api, python api, starlette, uvicorn
- openapi, swagger, dependency injection, async python, basemodel
- field validation, path operations, background tasks, oauth2 python
- pydantic v2, gunicorn, hypercorn, testclient

#### nextjs

**Primary Agent**: `nextjs-pro`
**When to Use**: Next.js development, React SSR, App Router

**Keywords**:

- next.js, nextjs, app router, server components, react ssr
- server actions, use server, rsc, pages router, vercel
- server rendering, streaming, suspense, metadata, isr
- static generation, ssg, ssr, incremental static regeneration

#### sveltekit

**Primary Agent**: `sveltekit-expert`
**When to Use**: Svelte/SvelteKit development, Svelte 5, fine-grained reactivity

**Keywords**:

- svelte, sveltekit, svelte 5, runes, $state, $derived, $effect
- $props, $bindable, svelte reactivity, fine-grained reactivity
- .svelte, +page.svelte, +layout.svelte, svelte stores
- form actions, load functions, svelte adapter

#### nodejs

**Primary Agent**: `nodejs-pro`
**When to Use**: Node.js backend, Express, NestJS, REST APIs

**Keywords**:

- node.js, nodejs, express, expressjs, nestjs, nest.js, koa
- node backend, node api, express middleware, nest modules
- node microservices, node rest api, express routing, nest controllers
- fastify, socket.io, passport.js, node websocket

#### expo

**Primary Agent**: `expo-mobile-developer`
**When to Use**: React Native, Expo SDK, cross-platform mobile apps

**Keywords**:

- expo, react native, expo sdk, mobile app, cross-platform mobile
- expo router, eas build, expo go, native modules, expo config
- ios android app, mobile development, push notifications, deep linking
- expo camera, mobile navigation, nativewind, metro bundler

#### tauri

**Primary Agent**: `tauri-desktop-developer`
**When to Use**: Desktop apps, Rust + webview, Electron alternative

**Keywords**:

- tauri, desktop app, rust desktop, cross-platform desktop
- tauri 2, tauri commands, tauri plugins, webview app
- electron alternative, lightweight desktop, secure desktop app
- system tray, auto updater, tauri ipc, tauri.conf.json

#### ios

**Primary Agent**: `ios-pro`
**When to Use**: iOS development, Swift, SwiftUI, Apple platforms

**Keywords**:

- Platforms: ios, iphone, ipad, watchos, tvos, visionos
- Language: swift, swiftui, swift concurrency, swift async, swiftdata
- UI: uikit, storyboard, interface builder, auto layout
- Development: xcode, xcode project, xcworkspace, xcodeproj
- Package Managers: cocoapods, spm, swift package manager
- Distribution: app store, testflight, app store connect, apple development
- Frameworks: core data, combine, arkit, realitykit, metal, spritekit
- Services: healthkit, homekit, cloudkit, push notification apns
- Features: widget, app clip, app intent, siri, shortcuts

#### android

**Primary Agent**: `android-pro`
**When to Use**: Android development, Kotlin, Jetpack Compose

**Keywords**:

- Language: android, kotlin, java android
- Development: android studio, gradle, android sdk, ndk
- UI: jetpack, jetpack compose, compose, material design, material3
- Architecture: viewmodel, livedata, navigation component, room database
- Networking: retrofit, okhttp
- Async: coroutines, flow, kotlin flow, stateflow
- DI: hilt, dagger
- Distribution: play store, google play, aab, apk
- Services: firebase, fcm, crashlytics
- Background: work manager, broadcast receiver, content provider
- Components: intent, activity, fragment, service, notification channel
- Binding: data binding, view binding, databinding, viewbinding
- Testing: android testing, espresso, robolectric, android emulator
- UI: android ui, android navigation, android lifecycle

#### graphql

**Primary Agent**: `graphql-pro`
**When to Use**: GraphQL APIs, Apollo, schema design, resolvers

**Keywords**:

- graphql, gql, graphql api, graphql schema, schema, sdl
- apollo, apollo server, apollo client, graphql server
- Operations: resolver, resolvers, mutation, mutations, subscription, subscriptions, query
- Types: type definition, graphql types, enum type, scalar
- Federation: federation, supergraph, subgraph
- Performance: graphql n+1, graphql pagination, dataloader
- Auth: graphql auth, graphql federation
- Clients: relay, urql, mercurius
- ORM: prisma
- Hosted: hasura
- Tools: graphql-codegen, introspection, fragment, directive

### Domain Other Agents (3)

#### frontend

**Primary Agent**: `frontend-pro`
**When to Use**: Frontend development, React, Vue, CSS, UI components

**Keywords**:

- Platforms: frontend, front-end, react, vue, component
- Styling: css, tailwind, styling, responsive, layout
- UI Libraries: shadcn, radix, headless ui, chakra, material ui, mui, ant design
- State: zustand, redux
- Accessibility: a11y, accessibility, wcag
- Tools: storybook

#### data_engineer

**Primary Agent**: `data-engineer`
**When to Use**: Data pipelines, ETL, data warehousing, analytics

**Keywords**:

- Pipelines: etl, elt, data pipeline, data warehouse, data lake, data lakehouse
- Processing: batch processing, stream processing, data transformation, data ingestion
- Orchestration: airflow, prefect, dagster, luigi, temporal, dag
- Modeling: dbt, data modeling, star schema, snowflake schema
- Quality: great expectations, data quality, data validation
- Big Data: spark, pyspark
- Data Science: data science, data analysis, analytics, big data, hadoop
- Analysis: data cleaning, data wrangling, exploratory analysis, eda
- Visualization: visualization, dashboard, reporting
- Experimentation: a/b testing, experimentation, hypothesis testing, statistics

#### mobile_ux

**Primary Agent**: `mobile-ux-reviewer`
**When to Use**: UX review, UI review, mobile usability, accessibility audits

**Keywords**:

- ux review, ui review, mobile ux, usability, user experience
- heuristic evaluation, hig, human interface guidelines, material design
- accessibility audit, voiceover, talkback, touch targets
- mobile accessibility, app design, user testing, design feedback

### Vercel Skills (5)

#### react_performance

**Primary Agent**: `frontend-pro`
**Primary Skill**: `react-best-practices-vercel`
**When to Use**: React performance optimization, Next.js optimization, bundle size reduction

**Keywords**:

- Performance: react performance, next.js optimization, nextjs optimization, bundle size, performance, waterfalls
- Rendering: re-render, render optimization, server-side rendering, client-side optimization, ssr performance, csr performance, hydration
- Optimization: lazy loading, code splitting, tree shaking, image optimization, prefetching
- Metrics: lighthouse, core web vitals, lcp, fcp, cls, fid
- Code Review: code review (in React/Next.js context)

#### react_native

**Primary Agent**: `expo-mobile-developer`
**Primary Skill**: `react-native-skills-vercel`
**When to Use**: React Native performance, Expo optimization, mobile app performance

**Keywords**:

- Platforms: react native, expo, mobile, ios, android
- Performance: list performance, flatlist, animation, mobile optimization, mobile performance, react native performance
- Features: native module, gesture, navigation, hermes, metro, fast refresh, reanimated

#### composition_patterns

**Primary Agent**: `frontend-pro`
**Primary Skill**: `composition-patterns-vercel`
**When to Use**: Component architecture, design systems, React patterns

**Keywords**:

- Patterns: boolean prop, compound component, composition, component pattern, react patterns
- Architecture: component library, component architecture, design system, react 19
- Advanced: render props, higher-order component, hoc, children prop, context api, hooks pattern

#### web_design

**Primary Agent**: `frontend-pro`
**Primary Skill**: `web-design-guidelines-vercel`
**When to Use**: Accessibility audits, UI/UX review, design system validation

**Keywords**:

- Accessibility: accessibility, audit, wcag, aria, a11y, semantic html, keyboard navigation, screen reader
- Design: ux, ui review, design review, dark mode, typography, form design, color contrast, focus management
- Responsive: responsive design, mobile-first

#### vercel_deploy

**Primary Agent**: `devops`
**Primary Skill**: `vercel-deploy-claimable`
**When to Use**: Vercel deployments, Next.js production deployments, edge functions

**Keywords**:

- Deployment: deploy, vercel, production, deployment, push live, go live, release
- CI/CD: cicd, ci-cd, deployment automation
- Vercel-specific: vercel deploy, next.js deploy, edge functions, serverless, preview deployment, production deployment

### Specialized Agents (12)

#### c4_code

**Primary Agent**: `c4-code`
**When to Use**: C4 code level diagrams, code documentation, class diagrams

**Keywords**:

- c4 code, code level, code diagram, code documentation
- function signatures, class diagram, code structure, code analysis
- code elements, module documentation, code organization

#### c4_component

**Primary Agent**: `c4-component`
**When to Use**: C4 component diagrams, component architecture

**Keywords**:

- c4 component, component level, component diagram, component architecture
- logical grouping, component boundaries, component synthesis
- interface definition, component relationships, component design

#### c4_container

**Primary Agent**: `c4-container`
**When to Use**: C4 container diagrams, deployment architecture

**Keywords**:

- c4 container, container level, container diagram, deployment architecture
- runtime containers, deployment units, deployment mapping
- container synthesis, container interfaces, infrastructure correlation

#### c4_context

**Primary Agent**: `c4-context`
**When to Use**: C4 system context diagrams, high-level architecture

**Keywords**:

- c4 context, system context, context diagram, high-level architecture
- system overview, stakeholder view, user journeys, persona identification
- external dependencies, system features, big picture

#### code_reviewer

**Primary Agent**: `code-reviewer`
**When to Use**: Code reviews, PR reviews, implementation feedback

**Keywords**:

- code review, pr review, pull request review, review code, review pr
- implementation review, code feedback, spec compliance, merge approval
- review my pr, check my code, ready to merge, review changes

#### conductor_validator

**Primary Agent**: `conductor-validator`
**When to Use**: Context-driven development validation, artifact validation

**Keywords**:

- conductor, cdd, context-driven development, project validation
- artifact validation, setup validation, content validation
- track validation, consistency validation, verify artifacts

#### database_architect

**Primary Agent**: `database-architect`
**When to Use**: Database design, schema design, query optimization

**Keywords**:

- database, schema, data model, database design, schema design
- query optimization, migration, erd, entity relationship
- normalize, indexes, foreign keys, constraints
- Databases: sql, nosql, postgresql, mysql, mongodb, redis
- data warehouse architect

#### devops

**Primary Agent**: `devops`
**When to Use**: CI/CD, containerization, infrastructure as code, deployment

**Keywords**:

- devops, ci/cd, cicd, pipeline, deployment, infrastructure
- containerization, kubernetes, k8s, docker, terraform, pulumi
- github actions, gitlab ci, jenkins, iac, infrastructure as code
- prometheus, grafana, monitoring, observability, argocd, flux

#### devops_troubleshooter

**Primary Agent**: `devops-troubleshooter`
**When to Use**: System debugging, production issues, root cause analysis

**Keywords**:

- debug, troubleshoot, investigate, system issue, performance problem
- production problem, incident debug, analyze logs, trace requests
- root cause analysis, rca, kubernetes debugging, container issues
- pods crashing, oomkilled, connection timeout, network issues

#### incident_responder

**Primary Agent**: `incident-responder`
**When to Use**: Production incidents, outages, SRE, on-call response

**Keywords**:

- incident, outage, production down, sre, site reliability
- on-call, service degraded, system down, incident response, war room
- severity, postmortem, escalation, sla violation
- Severity: p0, p1, sev1, sev2
- Tools: pagerduty, opsgenie
- Metrics: mttr, mttd, error budget, slo, sli

#### reverse_engineer

**Primary Agent**: `reverse-engineer`
**When to Use**: Binary analysis, malware analysis, CTF, vulnerability research

**Keywords**:

- reverse engineer, binary analysis, disassembly, decompile
- malware analysis, ctf, security research, vulnerability research
- analyze binary, disassemble, extract strings, exploit analysis
- Tools: ida pro, ghidra, binary ninja, radare2, frida
- firmware analysis

#### security_architect

**Primary Agent**: `security-architect`
**When to Use**: Security architecture, threat modeling, compliance

**Keywords**:

- security, security review, security architecture, threat model
- vulnerability, compliance, authentication, authorization, encryption
- stride, owasp, soc2, hipaa, gdpr, pci-dss, penetration testing
- zero trust, defense-in-depth, least privilege, security assessment

### Orchestrator Agents (3)

#### master_orchestrator

**Primary Agent**: `master-orchestrator`
**When to Use**: Full project orchestration, milestone management, multi-phase coordination

**Keywords**:

- orchestrate project, manage project, project lifecycle, coordinate team
- oversee, project plan, milestone, phase, delegate, spawn agents
- quality gate, sign off, status update, end-to-end, full project

#### swarm_coordinator

**Primary Agent**: `swarm-coordinator`
**When to Use**: Parallel multi-agent tasks, consensus, brainstorming

**Keywords**:

- swarm, multi-agent, parallel agents, consensus, voting, brainstorm
- hierarchical, mesh, distributed, task distribution, load balancing
- result aggregation, byzantine, coordination, synchronization

#### evolution_orchestrator

**Primary Agent**: `evolution-orchestrator`
**When to Use**: Creating new agents, skills, workflows; self-evolution

**Keywords**:

- create agent, create skill, new agent, evolve, capability gap
- no matching agent, add workflow, add hook, new capability
- self-improvement, artifact lifecycle, extend capabilities

### Specialized Intent Categories

#### Scientific Research

**Primary Agent**: `scientific-research-expert`
**When to Use**: Scientific research, computational biology, cheminformatics

**Keywords**:

- General: scientific, science, research, laboratory, lab
- Chemistry: chemistry, chemical, molecule, compound, rdkit, cheminformatics
- Biology: biology, bioinformatics, genomics, gene, protein, dna, rna
- Analysis: scanpy, single-cell, rna-seq, sequence, sequencing
- Pharma: drug discovery, pharma, pharmaceutical, clinical, medical
- Literature: literature review, pubmed, hypothesis, scientific writing
- Data: pandas, matplotlib, seaborn, plotly, visualization, statistics, statistical analysis, dataset, experiment
- Domains: physics, astronomy, quantum, materials science
- Databases: biopython, chembl, uniprot, pdb, pubchem
- ML: deepchem, pytorch-lightning, transformers, scikit-learn
- Omics: mass spectrometry, metabolomics, proteomics, transcriptomics
- Regulatory: clinical trials, fda, iso 13485, regulatory
- Platforms: opentrons, benchling, lamindb, anndata

#### AI/ML

**Primary Agent**: `ai-ml-specialist`
**When to Use**: Machine learning, deep learning, MLOps, model deployment

**Keywords**:

- General: ai, artificial intelligence, machine learning, ml, deep learning
- Architecture: neural network, transformer
- Tasks: model training, inference, prediction, classification, regression, clustering
- NLP: nlp, natural language, llm, large language model, embedding
- Vision: computer vision, cv
- Techniques: rag, retrieval augmented, fine-tuning, hyperparameter, cross-validation
- Frameworks: huggingface, pytorch, tensorflow, keras, scikit-learn, sklearn
- Boosting: xgboost, lightgbm, catboost
- Data: feature engineering, data augmentation
- Problems: overfitting, underfitting, regularization
- MLOps: mlops, mlflow, weights and biases, wandb, experiment tracking
- Serving: model serving, torchserve, kserve, bentoml
- Optimization: onnx, tensorrt, quantization, model optimization
- Infrastructure: distributed training, gpu training, cuda

#### Game Development

**Primary Agent**: `gamedev-pro`
**When to Use**: Game development, game engines, game design

**Keywords**:

- General: game, game development, gamedev, game engine
- Engines: unity, unreal, godot, pygame, phaser, pixi, three.js, babylon
- Graphics: sprite, animation, shader, graphics, rendering, gpu
- Physics: physics engine, collision detection, collision
- Architecture: ecs, entity component system, game loop, game state
- Multiplayer: multiplayer, netcode
- Design: game design, level design, procedural generation, pathfinding, a-star
- AI: game ai, npc, player controller, behavior tree
- Input: input handling
- Dimensions: 2d game, 3d game, vr, ar
- Assets: game asset, tilemap, sprite sheet, save system
- Performance: fps, frame rate

#### Web3/Blockchain

**Primary Agent**: `web3-blockchain-expert`
**When to Use**: Web3, blockchain, smart contracts, DeFi, NFTs

**Keywords**:

- General: web3, blockchain, smart contract, smartcontract, solidity, ethereum
- DeFi: defi, decentralized finance, dapp, decentralized app
- NFTs: nft, erc-20, erc-721, erc-1155, erc20, erc721, erc1155
- Development: hardhat, foundry, truffle, ganache, anvil, forge, openzeppelin
- Security: reentrancy, gas optimization, gas fee, slither, mythril, echidna, audit, security audit
- Wallets: metamask, wallet, private key
- Libraries: web3.js, ethers.js, viem, wagmi
- Chains: polygon, arbitrum, optimism, base, layer 2, l2, rollup
- Protocols: uniswap, aave, compound, lending protocol, amm
- Features: staking, yield farming, liquidity pool, lp token, flash loan
- Oracles: oracle, chainlink, price feed
- Upgrades: proxy contract, upgradeable, diamond pattern, uups
- Languages: vyper, cairo, starknet
- Governance: token, tokenomics, governance, dao, multisig
- MEV: mev, front-running, sandwich attack
- Transactions: transaction, gas limit, gwei

### Legacy Intents (Backward Compatibility)

#### bug

**Primary Agent**: `developer`
**Keywords**: bug, fix, error, issue, broken, crash, fail

#### feature

**Primary Agent**: `developer`
**Keywords**: add, create, implement, new feature, build

#### test

**Primary Agent**: `qa`
**Keywords**: test, spec, coverage, unit test, e2e, integration

#### security

**Primary Agent**: `security-architect`
**Keywords**: security, vulnerability, auth, permission, xss, injection

#### architecture

**Primary Agent**: `architect`
**Keywords**: architect, design, refactor, structure, pattern

#### incident

**Primary Agent**: `incident-responder`
**Keywords**: incident, outage, alert, urgent, emergency, down

#### plan

**Primary Agent**: `planner`
**Keywords**: plan, design, proposal, rfc, spec

#### integration

**Primary Agent**: `developer`
**Keywords**: review, integrate, codebase, migrate, import, pull

## Intent-to-Agent Mapping

The Router uses deterministic mapping from detected intent to agent name:

```javascript
const INTENT_TO_AGENT = {
  // Core agents
  architect: 'architect',
  context_compressor: 'context-compressor',
  developer: 'developer',
  planner: 'planner',
  pm: 'pm',
  qa: 'qa',
  router: 'router',
  documentation: 'technical-writer',

  // Domain languages
  python: 'python-pro',
  rust: 'rust-pro',
  golang: 'golang-pro',
  typescript: 'typescript-pro',
  java: 'java-pro',
  php: 'php-pro',

  // Domain frameworks
  fastapi: 'fastapi-pro',
  nextjs: 'nextjs-pro',
  sveltekit: 'sveltekit-expert',
  nodejs: 'nodejs-pro',
  expo: 'expo-mobile-developer',
  tauri: 'tauri-desktop-developer',
  ios: 'ios-pro',
  android: 'android-pro',
  graphql: 'graphql-pro',

  // Domain other
  frontend: 'frontend-pro',
  data_engineer: 'data-engineer',
  mobile_ux: 'mobile-ux-reviewer',

  // Vercel skills (5 skills integrated from Vercel)
  react_performance: 'frontend-pro', // Uses react-best-practices-vercel skill
  react_native: 'expo-mobile-developer', // Uses react-native-skills-vercel skill
  composition_patterns: 'frontend-pro', // Uses composition-patterns-vercel skill
  web_design: 'frontend-pro', // Uses web-design-guidelines-vercel skill
  vercel_deploy: 'devops', // Uses vercel-deploy-claimable skill

  // Specialized
  c4_code: 'c4-code',
  c4_component: 'c4-component',
  c4_container: 'c4-container',
  c4_context: 'c4-context',
  code_reviewer: 'code-reviewer',
  conductor_validator: 'conductor-validator',
  database_architect: 'database-architect',
  devops: 'devops',
  devops_troubleshooter: 'devops-troubleshooter',
  incident_responder: 'incident-responder',
  reverse_engineer: 'reverse-engineer',
  security_architect: 'security-architect',

  // Orchestrators
  master_orchestrator: 'master-orchestrator',
  swarm_coordinator: 'swarm-coordinator',
  evolution_orchestrator: 'evolution-orchestrator',

  // Specialized intents
  scientific: 'scientific-research-expert',
  ai_ml: 'ai-ml-specialist',
  data_science: 'data-engineer',
  gamedev: 'gamedev-pro',
  web3: 'web3-blockchain-expert',

  // Legacy intents
  bug: 'developer',
  feature: 'developer',
  test: 'qa',
  security: 'security-architect',
  architecture: 'architect',
  incident: 'incident-responder',
  plan: 'planner',
  integration: 'developer',
};
```

## Disambiguation Rules

When multiple agents score similarly, disambiguation rules use contextual keywords to prefer/deprioritize agents.

### Design Intent

**Keyword**: "design"

**Could Be**: architect (system design) OR planner (design plan) OR frontend-pro (UI design)

**Rules**:

1. Context: system, architecture, scalable, pattern, microservice
   - **Prefer**: architect
   - **Deprioritize**: planner

2. Context: plan, breakdown, phases, milestone, scope
   - **Prefer**: planner
   - **Deprioritize**: architect

3. Context: ui, ux, component, visual, interface
   - **Prefer**: frontend-pro
   - **Deprioritize**: architect

### Test Intent

**Keyword**: "test"

**Could Be**: qa (testing) OR developer (TDD)

**Rules**:

1. Context: tdd, test-driven, red-green, failing test
   - **Prefer**: developer
   - **Deprioritize**: qa

2. Context: regression, coverage, e2e, test suite, test plan
   - **Prefer**: qa
   - **Deprioritize**: developer

### Refactor Intent

**Keyword**: "refactor"

**Could Be**: developer (code refactoring) OR architect (architecture refactoring)

**Rules**:

1. Context: architecture, restructure, pattern, microservice, monolith
   - **Prefer**: architect
   - **Deprioritize**: developer

2. Context: code, function, class, method, clean
   - **Prefer**: developer
   - **Deprioritize**: architect

### Async Intent

**Keyword**: "async"

**Could Be**: python-pro OR rust-pro OR typescript-pro

**Rules**:

1. Context: python, asyncio, fastapi, django, flask
   - **Prefer**: python-pro
   - **Deprioritize**: typescript-pro

2. Context: rust, tokio, cargo, ownership
   - **Prefer**: rust-pro
   - **Deprioritize**: typescript-pro

3. Context: typescript, javascript, promise, await, node
   - **Prefer**: typescript-pro
   - **Deprioritize**: python-pro

### API Intent

**Keyword**: "api"

**Could Be**: fastapi-pro OR graphql-pro OR nodejs-pro

**Rules**:

1. Context: fastapi, pydantic, python, starlette
   - **Prefer**: fastapi-pro
   - **Deprioritize**: nodejs-pro

2. Context: graphql, apollo, resolver, mutation
   - **Prefer**: graphql-pro
   - **Deprioritize**: fastapi-pro

3. Context: node, express, nestjs, typescript
   - **Prefer**: nodejs-pro
   - **Deprioritize**: fastapi-pro

4. Context: rest, openapi, swagger
   - **Prefer**: fastapi-pro
   - **Deprioritize**: graphql-pro

### Migration Intent

**Keyword**: "migration"

**Could Be**: database-architect OR data-engineer OR devops

**Rules**:

1. Context: database, schema, sql, table, column, index
   - **Prefer**: database-architect
   - **Deprioritize**: data-engineer

2. Context: data, etl, pipeline, warehouse, dbt
   - **Prefer**: data-engineer
   - **Deprioritize**: database-architect

3. Context: kubernetes, cloud, infrastructure, terraform
   - **Prefer**: devops
   - **Deprioritize**: database-architect

### Mobile Intent

**Keyword**: "mobile"

**Could Be**: expo-mobile-developer OR ios-pro OR android-pro OR mobile-ux-reviewer

**Rules**:

1. Context: expo, react native, cross-platform
   - **Prefer**: expo-mobile-developer
   - **Deprioritize**: ios-pro

2. Context: ios, swift, swiftui, xcode, apple
   - **Prefer**: ios-pro
   - **Deprioritize**: expo-mobile-developer

3. Context: android, kotlin, jetpack, compose, gradle
   - **Prefer**: android-pro
   - **Deprioritize**: expo-mobile-developer

4. Context: ux, review, usability, heuristic, accessibility
   - **Prefer**: mobile-ux-reviewer
   - **Deprioritize**: expo-mobile-developer

### Component Intent

**Keyword**: "component"

**Could Be**: frontend-pro OR c4-component

**Rules**:

1. Context: c4, diagram, architecture
   - **Prefer**: c4-component
   - **Deprioritize**: frontend-pro

2. Context: react, vue, svelte, ui, tailwind
   - **Prefer**: frontend-pro
   - **Deprioritize**: c4-component

### Debug Intent

**Keyword**: "debug"

**Could Be**: developer OR devops-troubleshooter

**Rules**:

1. Context: code, function, test, bug, exception
   - **Prefer**: developer
   - **Deprioritize**: devops-troubleshooter

2. Context: production, logs, kubernetes, pod, container, system
   - **Prefer**: devops-troubleshooter
   - **Deprioritize**: developer

### Review Intent

**Keyword**: "review"

**Could Be**: code-reviewer OR mobile-ux-reviewer OR security-architect

**Rules**:

1. Context: pr, pull request, code, merge, implementation
   - **Prefer**: code-reviewer
   - **Deprioritize**: mobile-ux-reviewer

2. Context: ux, ui, mobile, usability, design
   - **Prefer**: mobile-ux-reviewer
   - **Deprioritize**: code-reviewer

3. Context: security, threat, vulnerability, compliance
   - **Prefer**: security-architect
   - **Deprioritize**: code-reviewer

### Database Intent

**Keyword**: "database"

**Could Be**: database-architect OR data-engineer

**Rules**:

1. Context: schema, table, index, query optimization, normalize
   - **Prefer**: database-architect
   - **Deprioritize**: data-engineer

2. Context: etl, pipeline, warehouse, bigquery, snowflake
   - **Prefer**: data-engineer
   - **Deprioritize**: database-architect

### React Intent (Vercel Skills)

**Keyword**: "react"

**Could Be**: frontend-pro (web) OR expo-mobile-developer (mobile)

**Rules**:

1. Context: mobile, native, ios, android, expo, flatlist
   - **Prefer**: expo-mobile-developer
   - **Deprioritize**: frontend-pro

2. Context: web, browser, next, performance, bundle
   - **Prefer**: frontend-pro
   - **Deprioritize**: expo-mobile-developer

### Component Intent (Vercel Skills)

**Keyword**: "component"

**Could Be**: composition-patterns-vercel OR react-best-practices-vercel

**Rules**:

1. Context: boolean, compound, pattern, architecture
   - **Prefer**: composition-patterns-vercel (skill routing hint)
   - **Deprioritize**: react-best-practices-vercel

2. Context: performance, optimize, re-render
   - **Prefer**: react-best-practices-vercel (skill routing hint)
   - **Deprioritize**: composition-patterns-vercel

### Design Intent (Vercel Skills)

**Keyword**: "design"

**Could Be**: web-design-guidelines-vercel OR react-best-practices-vercel

**Rules**:

1. Context: accessibility, wcag, aria, contrast
   - **Prefer**: web-design-guidelines-vercel (skill routing hint)
   - **Deprioritize**: react-best-practices-vercel

2. Context: performance, speed, optimization
   - **Prefer**: react-best-practices-vercel (skill routing hint)
   - **Deprioritize**: web-design-guidelines-vercel

## Scoring Algorithm

The Router uses a multi-factor scoring algorithm:

### Step 1: Intent Detection

1. Count keyword matches for each intent category
2. Identify primary intent (highest keyword count)
3. Map primary intent to preferred agent (via INTENT_TO_AGENT)

### Step 2: Agent Scoring

For each agent:

1. **Base Score (0-N)**: Count matching words in agent description
   - Each word match (>3 characters): +1 point

2. **Primary Intent Match (+5)**: Agent matches primary detected intent
   - Boost: +5 points

3. **Secondary Intent Match (+1 to +3)**: Agent matches other detected intents
   - Boost: +1 to +3 points (scaled by intent score)

4. **Domain Boost (+0 to +4)**: Agent has domain-specific keywords
   - Match domain keywords: +2 per match (max +4)

5. **Priority Boost (+1)**: Agent has high priority flag
   - If priority === 'high': +1 point

### Step 3: Disambiguation

1. Check if top 2 agents have close scores (difference < 3)
2. If close, apply disambiguation rules based on context
3. Preferred agent: +3 points
4. Deprioritized agent: -1 point

### Step 4: Ranking

1. Sort agents by final score (descending)
2. Return top 3 candidates with scores

## Example Routing Decisions

### Example 1: Simple Bug Fix

**User Request**: "Fix the login bug"

**Intent Detection**:

- Primary Intent: `bug` (1 keyword match)
- Secondary Intent: None

**Scoring**:

- developer: +5 (primary intent match) = 5
- qa: 0

**Routing Decision**: developer (score: 5)

### Example 2: Python API Development

**User Request**: "Create a FastAPI endpoint for user authentication"

**Intent Detection**:

- Primary Intent: `fastapi` (3 keyword matches: fastapi, endpoint, authentication)
- Secondary Intent: `python` (1 match), `security` (1 match)

**Scoring**:

- fastapi-pro: +5 (primary) +4 (domain boost) = 9
- python-pro: +1 (secondary) +2 (domain boost) = 3
- security-architect: +1 (secondary) = 1

**Routing Decision**: fastapi-pro (score: 9), with security-architect review recommended

### Example 3: Ambiguous Design Request

**User Request**: "Design the authentication system architecture"

**Intent Detection**:

- Primary Intent: `design` (1 keyword match)
- Secondary Intent: `architecture` (2 matches), `security` (1 match)

**Keyword Matches**:

- architect: system, architecture (2 matches)
- planner: design (1 match)
- security-architect: authentication, security (2 matches)

**Scoring (before disambiguation)**:

- architect: +2 (description) +3 (secondary intent) +2 (domain) = 7
- security-architect: +2 (description) +1 (secondary) +2 (domain) = 5
- planner: +1 (description) = 1

**Disambiguation Applied**:

- Keyword "design" + context ["architecture", "system"] → prefer architect (+3)
- Final: architect: 10, security-architect: 5

**Routing Decision**: architect (score: 10), security-architect (score: 5)

### Example 4: Mobile UX Review

**User Request**: "Review the mobile app UX for accessibility"

**Intent Detection**:

- Primary Intent: `mobile_ux` (3 keyword matches)
- Secondary Intent: `review` (1 match)

**Scoring**:

- mobile-ux-reviewer: +5 (primary) +4 (domain boost) = 9
- code-reviewer: +1 (secondary) = 1

**Disambiguation Applied**:

- Keyword "review" + context ["mobile", "ux", "accessibility"] → prefer mobile-ux-reviewer (+3)
- Final: mobile-ux-reviewer: 12

**Routing Decision**: mobile-ux-reviewer (score: 12)

### Example 5: Data Science Pipeline

**User Request**: "Build an ETL pipeline for data analysis with Spark"

**Intent Detection**:

- Primary Intent: `data_science` (4 keyword matches: etl, pipeline, data, analysis)
- Secondary Intent: None

**Scoring**:

- data-engineer: +5 (primary) +4 (domain boost: etl, pipeline, spark) = 9
- developer: 0

**Routing Decision**: data-engineer (score: 9)

## Source Files

The keyword mappings and routing logic are defined in:

**Primary Source**: `.claude/lib/routing/routing-table.cjs`

- `INTENT_KEYWORDS` (lines 376-735): Comprehensive keyword lists for all agents
- `INTENT_TO_AGENT` (lines 741-819): Intent-to-agent mapping
- `DISAMBIGUATION_RULES` (lines 827-891): Contextual disambiguation rules
- `scoreAgents()` (lines 930-1114): Scoring algorithm implementation
- `applyDisambiguation()` (lines 899-925): Disambiguation application

**Related Workflow**: `.claude/workflows/core/router-decision.md`

- Complete routing workflow from request analysis to agent spawning
- Self-check protocol and enforcement gates
- Multi-agent orchestration patterns

**Agent Registry**: `.claude/agents/`

- Individual agent definitions with frontmatter metadata
- Skills, priorities, and descriptions used in scoring

## Maintenance Guidelines

When adding new agents or updating routing logic:

1. **Add Intent Keywords**: Update `INTENT_KEYWORDS` in routing-table.cjs
2. **Map Intent to Agent**: Add mapping in `INTENT_TO_AGENT`
3. **Add Disambiguation Rules**: If keywords overlap with existing agents
4. **Update Domain Boosts**: Add domain-specific keywords to `domainBoosts` object
5. **Update This Guide**: Document new keywords and mappings
6. **Update CLAUDE.md**: Reference in Agent Routing Table (Section 3)

**Keep In Sync**:

- `routing-table.cjs` (source of truth)
- `CLAUDE.md` Section 3 (user-facing routing table)
- This guide (comprehensive reference)
- `.claude/agents/` (agent definitions)
