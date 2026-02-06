<!-- Agent: planner | Task: #39 | Session: 2026-02-06 -->

# Plan: Skill-to-Agent Mapping Overhaul

## Executive Summary

Map all 436 skills to the correct 49 agents, filling critical gaps where agents are missing skills they need and removing irrelevant ones. This is a data-driven overhaul: each agent's `.md` file and the `agent-registry.json` will be updated with the definitive skill list. Priority is core agents first (highest impact), then specialized, then domain agents.

## Overview

**Problem**: Most agents only have 4-10 skills listed. With 436 skills available, many agents are severely under-equipped. Key examples:
- `devops` has 10 skills but is missing 12+ DevOps-specific skills (aws, docker, k8s, terraform, ci-cd)
- `security-architect` is missing owasp-security, penetration-testing, binary-analysis, threat-modeling
- `frontend-pro` is missing styling skills, state management, build tools
- `qa` is missing qa-workflow skill
- Most domain agents lack git-expert, code-quality, and build tooling skills

**Solution**: Define a tiered mapping strategy with universal, role-specific, and domain-specific skill layers.

## Mapping Strategy (3-Tier Model)

### Tier 1: Universal Skills (ALL agents get these)

These skills apply to every agent regardless of role:

| Skill | Rationale |
|-------|-----------|
| `task-management-protocol` | Required for TaskUpdate/TaskList coordination |
| `verification-before-completion` | Quality gate before marking tasks done |

**Note**: These 2 skills are already present on most agents. Verify 100% coverage.

### Tier 2: Role-Archetype Skills (by agent category)

| Archetype | Applies To | Skills to Add |
|-----------|-----------|---------------|
| **Implementer** | developer, all domain agents, code-simplifier | `tdd`, `debugging`, `git-expert`, `ripgrep`, `code-quality-expert` |
| **Reviewer** | code-reviewer, qa, security-architect | `code-analyzer`, `code-style-validator`, `rule-auditor`, `checklist-generator` |
| **Planner** | planner, pm, master-orchestrator | `plan-generator`, `sequential-thinking`, `progressive-disclosure`, `task-breakdown`, `complexity-assessment` |
| **DevOps** | devops, devops-troubleshooter, incident-responder | `debugging`, `logging-module-usage`, `recovery`, `sentry-monitoring` |
| **Orchestrator** | all orchestrators | `plan-generator`, `task-management-protocol`, `dispatching-parallel-agents`, `swarm-coordination`, `verification-before-completion` |
| **Documenter** | technical-writer, c4-* agents | `doc-generator`, `writing-skills`, `diagram-generator` |

### Tier 3: Domain-Specific Skills (unique to each agent)

Detailed per-agent mapping in the complete mapping table below.

---

## Complete Mapping Table

### Legend
- **CURRENT**: Skills already assigned
- **+ADD**: Skills to be added (gap fill)
- **-REMOVE**: Skills to be removed (irrelevant)
- Skills in **bold** are the most impactful additions

---

### CORE AGENTS (9 agents - HIGHEST PRIORITY)

#### 1. architect
**Current (10)**: architecture-review, database-architect, security-architect, swarm-coordination, ripgrep, code-semantic-search, code-structural-search, verification-before-completion, diagram-generator, project-analyzer
**+ADD (6)**:
- **`sequential-thinking`** - architecture requires systematic reasoning
- **`spec-gathering`** - architects need to gather requirements
- **`brainstorming`** - design exploration
- **`complexity-assessment`** - assess system complexity
- `task-management-protocol` - universal
- `api-development-expert` - API design is architectural

#### 2. context-compressor
**Current (3)**: context-compressor, verification-before-completion, task-management-protocol
**+ADD (1)**:
- `session-handoff` - compressor often runs before handoffs
**Note**: Keep minimal. This agent should stay lightweight.

#### 3. developer
**Current (10)**: tdd, debugging, git-expert, ripgrep, code-semantic-search, code-structural-search, security-architect, context-compressor, github-mcp, verification-before-completion
**+ADD (7)**:
- **`code-quality-expert`** - clean code practices
- **`code-analyzer`** - static analysis
- `task-management-protocol` - universal (MISSING!)
- `commit-validator` - validate commits
- `smart-revert` - revert capabilities
- `code-style-validator` - style enforcement
- `dependency-analyzer` - dependency management

#### 4. planner
**Current (5)**: plan-generator, task-breakdown, sequential-thinking, context-compressor, progressive-disclosure
**+ADD (5)**:
- **`complexity-assessment`** - assess task complexity
- **`brainstorming`** - explore solution space
- **`spec-gathering`** - gather requirements
- `task-management-protocol` - universal (MISSING!)
- `checklist-generator` - generate quality checklists
- `verification-before-completion` - universal (MISSING!)

#### 5. pm
**Current (9)**: linear-pm, jira-pm, slack-notifications, consensus-voting, plan-generator, sequential-thinking, verification-before-completion, task-management-protocol, progressive-disclosure
**+ADD (3)**:
- **`task-breakdown`** - PMs need task decomposition
- `checklist-generator` - generate acceptance checklists
- `spec-writing` - write specifications

#### 6. qa
**Current (10)**: test-generator, rule-auditor, verification-before-completion, checklist-generator, tdd, ripgrep, code-semantic-search, code-structural-search, code-analyzer, chrome-browser
**+ADD (4)**:
- **`qa-workflow`** - QA validation loop (CRITICAL MISSING!)
- **`debugging`** - QA needs debugging capability
- `task-management-protocol` - already in tags, add to skills
- `comprehensive-unit-testing-with-pytest` - pytest expertise

#### 7. reflection-agent
**Current (4)**: task-management-protocol, verification-before-completion, code-analyzer, insight-extraction
**+ADD (2)**:
- `context-compressor` - reflections need compression
- `summarize-changes` - summarize what changed
**Note**: Keep focused. Reflection is about assessment, not implementation.

#### 8. router
**Current (6)**: agent-creator, skill-creator, verification-before-completion, tool-search, swarm-coordination, skill-discovery
**+ADD (1)**:
- `task-management-protocol` - universal
**Note**: Router stays minimal. It routes, not implements.

#### 9. technical-writer
**Current (7)**: doc-generator, writing-skills, verification-before-completion, diagram-generator, project-analyzer, mkdocs-specific-rules, task-management-protocol
**+ADD (5)**:
- **`readme`** - README generation
- **`detailed-docstrings`** - docstring generation
- `writing-plans` - planning documentation work
- `content-creation-rules` - content quality
- `technical-accuracy-and-usability-rules` - accuracy

---

### SPECIALIZED AGENTS (14 agents - HIGH PRIORITY)

#### 10. c4-code
**Current (4)**: task-management-protocol, doc-generator, code-analyzer, verification-before-completion
**+ADD (2)**:
- `ripgrep` - code analysis needs search
- `code-structural-search` - structural analysis

#### 11. c4-component
**Current (5)**: task-management-protocol, doc-generator, architecture-review, verification-before-completion, diagram-generator
**+ADD (1)**:
- `code-analyzer` - component analysis needs code analysis

#### 12. c4-container
**Current (6)**: task-management-protocol, doc-generator, architecture-review, api-development-expert, verification-before-completion, diagram-generator
**No changes needed** - well-equipped for its role.

#### 13. c4-context
**Current (6)**: task-management-protocol, doc-generator, architecture-review, verification-before-completion, diagram-generator, project-analyzer
**No changes needed** - well-equipped for its role.

#### 14. code-reviewer
**Current (10)**: task-management-protocol, requesting-code-review, receiving-code-review, verification-before-completion, checklist-generator, code-analyzer, code-quality-expert, rule-auditor, code-style-validator, ripgrep
**+ADD (4)**:
- **`dry-principle`** - DRY enforcement during reviews
- **`git-expert`** - understand git history during reviews
- `function-length-and-responsibility` - SRP checks
- `security-architect` - basic security awareness in reviews

#### 15. code-simplifier
**Current (9)**: task-management-protocol, best-practices-guidelines, code-analyzer, code-style-validator, dry-principle, debugging, ripgrep, code-semantic-search, code-structural-search
**+ADD (3)**:
- **`function-length-and-responsibility`** - SRP for simplification
- `verification-before-completion` - universal
- `code-quality-expert` - quality standards

#### 16. conductor-validator
**Current (6)**: task-management-protocol, context-driven-development, track-management, workflow-patterns, verification-before-completion, rule-auditor
**No changes needed** - domain-specific, well-focused.

#### 17. database-architect
**Current (7)**: task-management-protocol, database-expert, text-to-sql, diagram-generator, sequential-thinking, doc-generator, verification-before-completion
**+ADD (3)**:
- **`database-architect`** (skill) - the matching skill!
- `data-expert` - data processing knowledge
- `architecture-review` - architectural perspective

#### 18. devops
**Current (10)**: task-management-protocol, dependency-analyzer, git-expert, github-mcp, architecture-review, database-architect, consensus-voting, context-compressor, filesystem, k8s-manifest-generator
**+ADD (12)** - MOST UNDER-EQUIPPED AGENT:
- **`aws-cloud-ops`** - AWS expertise
- **`cloud-devops-expert`** - multi-cloud
- **`container-expert`** - Docker/K8s
- **`docker-compose`** - Docker Compose
- **`terraform-infra`** - Terraform
- **`ci-cd-implementation-rule`** - CI/CD pipelines
- **`helm-chart-scaffolding`** - Helm charts (in tags but not skills)
- **`gitops-workflow`** - GitOps (in tags but not skills)
- `kubernetes-flux` - K8s with Flux
- `containerization-rules` - Dockerfile best practices
- `configuration-management` - config management
- `verification-before-completion` - universal (MISSING!)

#### 19. devops-troubleshooter
**Current (9)**: task-management-protocol, context-compressor, debugging, smart-debug, verification-before-completion, sentry-monitoring, recovery, chrome-browser, logging-module-usage
**+ADD (5)**:
- **`container-expert`** - debug containerized apps
- **`cloud-devops-expert`** - cloud troubleshooting
- **`aws-cloud-ops`** - AWS debugging
- `incident-runbook-templates` - runbook creation
- `postmortem-writing` - post-incident documentation

#### 20. incident-responder
**Current (9)**: task-management-protocol, debugging, postmortem-writing, on-call-handoff-patterns, incident-runbook-templates, verification-before-completion, sentry-monitoring, slack-notifications, recovery
**+ADD (4)**:
- **`smart-debug`** - AI-assisted debugging
- **`logging-module-usage`** - log analysis
- `container-expert` - container incident response
- `configuration-management` - config issues

#### 21. researcher
**Current (8)**: research-synthesis, thinking-tools, doc-generator, ripgrep, code-semantic-search, code-structural-search, task-management-protocol, context-compressor
**+ADD (3)**:
- **`arxiv-mcp`** - academic paper search
- **`chrome-browser`** - web research
- `sequential-thinking` - systematic research

#### 22. reverse-engineer
**Current (10)**: task-management-protocol, binary-analysis-patterns, memory-forensics, protocol-reverse-engineering, tdd, debugging, git-expert, security-architect, verification-before-completion, ripgrep
**+ADD (1)**:
- `code-analyzer` - code analysis for RE

#### 23. security-architect
**Current (10)**: task-management-protocol, rule-auditor, dependency-analyzer, explaining-rules, repo-rag, security-architect, doc-generator, verification-before-completion, auth-security-expert, authentication-flow-rules
**+ADD (5)**:
- **`binary-analysis-patterns`** - binary security analysis
- **`memory-forensics`** - memory security
- **`protocol-reverse-engineering`** - protocol security
- `code-analyzer` - security code analysis
- `checklist-generator` - security checklists

---

### DOMAIN AGENTS (22 agents - MEDIUM PRIORITY)

**Pattern for ALL domain agents**: Every domain agent that implements code should have:
- Its matching language/framework expert skill
- `tdd`, `debugging` (if implementing)
- `git-expert` (if not already present)
- `task-management-protocol`, `verification-before-completion` (universal)
- Relevant framework-config and styling skills for frontend agents

#### 24. ai-ml-specialist
**Current (8)**: task-management-protocol, ai-ml-expert, python-backend-expert, data-expert, tdd, debugging, verification-before-completion, scientific-skills
**+ADD (4)**:
- **`jupyter-notebook-best-practices`** - ML uses notebooks
- `git-expert` - version control for ML
- `comprehensive-type-annotations` - Python typing
- `logging-module-usage` - experiment logging

#### 25. android-pro
**Current (5)**: task-management-protocol, android-expert, tdd, debugging, verification-before-completion
**+ADD (3)**:
- **`git-expert`** - version control
- `mobile-ui-development-rule` - mobile UI
- `mobile-first-design-rules` - mobile-first design

#### 26. data-engineer
**Current (6)**: task-management-protocol, data-expert, text-to-sql, diagram-generator, tdd, verification-before-completion
**+ADD (5)**:
- **`database-expert`** - database knowledge
- **`python-backend-expert`** - Python for data
- `debugging` - debug data pipelines
- `git-expert` - version control
- `pandas-data-manipulation-rules` - Pandas

#### 27. expo-mobile-developer
**Current (7)**: task-management-protocol, expo-framework-rule, expo-mobile-app-rule, react-expert, tdd, mobile-ui-development-rule, verification-before-completion
**+ADD (4)**:
- **`react-native-skills-vercel`** - React Native patterns
- **`typescript-expert`** - TypeScript for Expo
- `debugging` - debug mobile apps
- `git-expert` - version control

#### 28. fastapi-pro
**Current (8)**: task-management-protocol, tdd, debugging, git-expert, security-architect, verification-before-completion, api-development-expert, python-backend-expert
**+ADD (3)**:
- **`comprehensive-type-annotations`** - Python typing (FastAPI relies on it)
- `form-validation-with-zod` - validation patterns
- `database-expert` - FastAPI + DB

#### 29. frontend-pro
**Current (8)**: task-management-protocol, frontend-expert, react-expert, styling-expert, ui-components-expert, tdd, accessibility, verification-before-completion
**+ADD (7)**:
- **`state-management-expert`** - state management
- **`typescript-expert`** - TypeScript for frontend
- **`build-tools-expert`** - Vite/Webpack
- `debugging` - debug frontend
- `git-expert` - version control
- `web-design-guidelines-vercel` - web design
- `html-tailwind-css-and-javascript-expert-rule` - Tailwind

#### 30. gamedev-pro
**Current (7)**: task-management-protocol, tdd, debugging, git-expert, verification-before-completion, gamedev-expert, cpp
**+ADD (2)**:
- `build-tools-expert` - game build systems
- `code-quality-expert` - code quality

#### 31. golang-pro
**Current (7)**: task-management-protocol, tdd, debugging, git-expert, verification-before-completion, go-expert, api-development-expert
**+ADD (2)**:
- `code-quality-expert` - Go code quality
- `build-tools-expert` - Go build tooling

#### 32. graphql-pro
**Current (5)**: task-management-protocol, graphql-expert, api-development-expert, tdd, verification-before-completion
**+ADD (4)**:
- **`typescript-expert`** - TypeScript for GraphQL
- `debugging` - debug GraphQL
- `git-expert` - version control
- `code-quality-expert` - code quality

#### 33. ios-pro
**Current (5)**: task-management-protocol, ios-expert, tdd, debugging, verification-before-completion
**+ADD (3)**:
- **`git-expert`** - version control
- `mobile-ui-development-rule` - mobile UI
- `mobile-first-design-rules` - mobile-first design

#### 34. java-pro
**Current (6)**: task-management-protocol, java-expert, tdd, debugging, doc-generator, verification-before-completion
**+ADD (5)**:
- **`git-expert`** - version control
- **`api-development-expert`** - REST API design
- `dto-conventions` - DTO patterns
- `service-class-conventions` - service patterns
- `restcontroller-conventions` - controller patterns

#### 35. mobile-ux-reviewer
**Current (7)**: task-management-protocol, diagram-generator, doc-generator, verification-before-completion, accessibility, visual-and-observational-rules, mobile-first-design-rules
**+ADD (3)**:
- **`mobile-ui-development-rule`** - mobile UI expertise
- `design-and-user-experience-guidelines` - UX guidelines
- `checklist-generator` - review checklists

#### 36. nextjs-pro
**Current (6)**: task-management-protocol, nextjs-expert, react-expert, tdd, typescript-expert, verification-before-completion
**+ADD (5)**:
- **`react-best-practices-vercel`** - React/Next optimization
- **`styling-expert`** - styling for Next.js
- `debugging` - debug Next.js apps
- `git-expert` - version control
- `state-management-expert` - state management

#### 37. nodejs-pro
**Current (6)**: task-management-protocol, nodejs-expert, tdd, debugging, typescript-expert, verification-before-completion
**+ADD (4)**:
- **`api-development-expert`** - REST API design
- `git-expert` - version control
- `code-quality-expert` - code quality
- `async-operations` - async patterns

#### 38. php-pro
**Current (6)**: task-management-protocol, php-expert, tdd, debugging, doc-generator, verification-before-completion
**+ADD (4)**:
- **`git-expert`** - version control
- **`api-development-expert`** - REST API design
- `composer-dependency-management` - Composer
- `tall-stack-general` - TALL stack

#### 39. python-pro
**Current (7)**: task-management-protocol, tdd, debugging, git-expert, verification-before-completion, python-backend-expert, api-development-expert
**+ADD (4)**:
- **`comprehensive-type-annotations`** - Python typing
- **`prioritize-python-3-10-features`** - modern Python
- `code-quality-expert` - code quality
- `comprehensive-unit-testing-with-pytest` - pytest

#### 40. rust-pro
**Current (6)**: task-management-protocol, tdd, debugging, git-expert, verification-before-completion, build-tools-expert
**+ADD (2)**:
- **`rust-expert`** - the matching language skill!
- `code-quality-expert` - code quality

#### 41. scientific-research-expert
**Current (8)**: task-management-protocol, scientific-skills, research-synthesis, diagram-generator, doc-generator, tdd, verification-before-completion, arxiv-mcp
**+ADD (3)**:
- **`python-backend-expert`** - Python for science
- `jupyter-notebook-best-practices` - Jupyter
- `debugging` - debug research code

#### 42. sveltekit-expert
**Current (6)**: task-management-protocol, svelte-expert, form-and-actions-in-sveltekit, seo-and-meta-tags-in-sveltekit, tdd, verification-before-completion
**+ADD (4)**:
- **`typescript-expert`** - TypeScript for SvelteKit
- **`styling-expert`** - styling for SvelteKit
- `debugging` - debug SvelteKit apps
- `git-expert` - version control

#### 43. tauri-desktop-developer
**Current (7)**: task-management-protocol, tauri-native-api-integration, tauri-security-rules, tauri-svelte-typescript-general, tauri-svelte-ui-components, debugging, verification-before-completion
**+ADD (4)**:
- **`rust-expert`** - Tauri uses Rust backend
- **`typescript-expert`** - Tauri frontend
- `tdd` - test-driven development
- `git-expert` - version control

#### 44. typescript-pro
**Current (7)**: task-management-protocol, tdd, debugging, git-expert, verification-before-completion, typescript-expert, state-management-expert
**+ADD (3)**:
- **`code-quality-expert`** - TypeScript quality
- `tsconfig-json-rules` - tsconfig patterns
- `build-tools-expert` - build tooling

#### 45. web3-blockchain-expert
**Current (8)**: task-management-protocol, web3-expert, security-architect, auth-security-expert, tdd, debugging, git-expert, verification-before-completion
**+ADD (1)**:
- `code-quality-expert` - code quality for smart contracts

---

### ORCHESTRATOR AGENTS (4 agents - MEDIUM PRIORITY)

#### 46. evolution-orchestrator
**Current (8)**: research-synthesis, agent-creator, skill-creator, workflow-creator, hook-creator, schema-creator, template-creator, task-management-protocol
**+ADD (3)**:
- **`plan-generator`** - planning artifact creation
- `verification-before-completion` - universal
- `artifact-lifecycle` - lifecycle management

#### 47. master-orchestrator
**Current (10)**: plan-generator, task-management-protocol, response-rater, artifact-publisher, recovery, verification-before-completion, swarm-coordination, dispatching-parallel-agents, track-management, subagent-driven-development
**+ADD (2)**:
- **`complexity-assessment`** - assess task complexity for routing
- `sequential-thinking` - systematic orchestration

#### 48. party-orchestrator
**Current (3)**: party-mode, security-architect, context-compressor
**+ADD (4)**:
- **`task-management-protocol`** - universal (MISSING!)
- **`verification-before-completion`** - universal (MISSING!)
- `swarm-coordination` - multi-agent coordination
- `dispatching-parallel-agents` - parallel execution

#### 49. swarm-coordinator
**Current (6)**: swarm-coordination, task-management-protocol, consensus-voting, verification-before-completion, dispatching-parallel-agents, subagent-driven-development
**+ADD (2)**:
- **`plan-generator`** - coordinate planned work
- `context-compressor` - compress context for swarms

---

## Impact Summary

| Agent Category | Agents | Avg Current Skills | Avg After | Total Skills Added |
|---------------|--------|-------------------|-----------|-------------------|
| **Core** | 9 | 7.1 | 11.6 | ~40 |
| **Specialized** | 14 | 7.4 | 10.5 | ~43 |
| **Domain** | 22 | 6.5 | 10.0 | ~77 |
| **Orchestrators** | 4 | 6.8 | 9.5 | ~11 |
| **TOTAL** | 49 | 6.9 | 10.3 | **~171 additions** |

## Top 10 Most Impactful Changes

1. **devops** - Add 12 missing DevOps skills (aws, docker, k8s, terraform, ci-cd)
2. **developer** - Add code-quality-expert, task-management-protocol, commit-validator
3. **frontend-pro** - Add state-management, typescript, build-tools, styling
4. **security-architect** - Add binary-analysis, memory-forensics, protocol-RE
5. **planner** - Add complexity-assessment, brainstorming, spec-gathering
6. **qa** - Add qa-workflow (critical missing skill!)
7. **devops-troubleshooter** - Add container-expert, cloud-devops-expert
8. **nextjs-pro** - Add react-best-practices-vercel, styling, state-management
9. **java-pro** - Add Spring Boot specific skills (dto, service, controller)
10. **party-orchestrator** - Add task-management-protocol and verification (universal skills missing)

---

## Phases

### Phase 1: Core Agent Updates (HIGHEST PRIORITY)

**Purpose**: Update the 9 core agents with their missing skills
**Dependencies**: None
**Parallel OK**: Yes (each agent file is independent)
**Estimated Time**: ~45 min

#### Tasks

- [ ] **1.1** Update `architect.md` - add 6 skills (~5 min)
  - **Files**: `.claude/agents/core/architect.md`
  - **Verify**: `grep -c "Skill" .claude/agents/core/architect.md`

- [ ] **1.2** Update `context-compressor.md` - add 1 skill (~2 min) [parallel OK]
  - **Files**: `.claude/agents/core/context-compressor.md`

- [ ] **1.3** Update `developer.md` - add 7 skills (~5 min) [parallel OK]
  - **Files**: `.claude/agents/core/developer.md`

- [ ] **1.4** Update `planner.md` - add 5 skills (~5 min) [parallel OK]
  - **Files**: `.claude/agents/core/planner.md`

- [ ] **1.5** Update `pm.md` - add 3 skills (~3 min) [parallel OK]
  - **Files**: `.claude/agents/core/pm.md`

- [ ] **1.6** Update `qa.md` - add 4 skills (~5 min) [parallel OK]
  - **Files**: `.claude/agents/core/qa.md`

- [ ] **1.7** Update `reflection-agent.md` - add 2 skills (~2 min) [parallel OK]
  - **Files**: `.claude/agents/core/reflection-agent.md`

- [ ] **1.8** Update `router.md` - add 1 skill (~2 min) [parallel OK]
  - **Files**: `.claude/agents/core/router.md`

- [ ] **1.9** Update `technical-writer.md` - add 5 skills (~5 min) [parallel OK]
  - **Files**: `.claude/agents/core/technical-writer.md`

#### Phase 1 Verification Gate

```bash
# Verify all core agents have task-management-protocol and verification-before-completion
for agent in architect context-compressor developer planner pm qa reflection-agent router technical-writer; do
  grep -l "task-management-protocol" .claude/agents/core/$agent.md || echo "MISSING: $agent"
  grep -l "verification-before-completion" .claude/agents/core/$agent.md || echo "MISSING VBC: $agent"
done
```

**Success Criteria**: All 9 core agents have universal skills + their role-specific additions

---

### Phase 2: Specialized Agent Updates (HIGH PRIORITY)

**Purpose**: Update the 14 specialized agents
**Dependencies**: Phase 1 (core agents define patterns for specialized)
**Parallel OK**: Yes
**Estimated Time**: ~45 min

#### Tasks

- [ ] **2.1** Update `devops.md` - add 12 skills (~10 min) - MOST IMPACTFUL
  - **Files**: `.claude/agents/specialized/devops.md`

- [ ] **2.2** Update `security-architect.md` - add 5 skills (~5 min) [parallel OK]
  - **Files**: `.claude/agents/specialized/security-architect.md`

- [ ] **2.3** Update `code-reviewer.md` - add 4 skills (~5 min) [parallel OK]
  - **Files**: `.claude/agents/specialized/code-reviewer.md`

- [ ] **2.4** Update `devops-troubleshooter.md` - add 5 skills (~5 min) [parallel OK]
  - **Files**: `.claude/agents/specialized/devops-troubleshooter.md`

- [ ] **2.5** Update `incident-responder.md` - add 4 skills (~3 min) [parallel OK]
  - **Files**: `.claude/agents/specialized/incident-responder.md`

- [ ] **2.6** Update `researcher.md` - add 3 skills (~3 min) [parallel OK]
  - **Files**: `.claude/agents/specialized/researcher.md`

- [ ] **2.7** Update `database-architect.md` - add 3 skills (~3 min) [parallel OK]
  - **Files**: `.claude/agents/specialized/database-architect.md`

- [ ] **2.8** Update `code-simplifier.md` - add 3 skills (~3 min) [parallel OK]
  - **Files**: `.claude/agents/specialized/code-simplifier.md`

- [ ] **2.9** Update `c4-code.md` - add 2 skills (~2 min) [parallel OK]
  - **Files**: `.claude/agents/specialized/c4-code.md`

- [ ] **2.10** Update `c4-component.md` - add 1 skill (~2 min) [parallel OK]
  - **Files**: `.claude/agents/specialized/c4-component.md`

- [ ] **2.11** Update `reverse-engineer.md` - add 1 skill (~2 min) [parallel OK]
  - **Files**: `.claude/agents/specialized/reverse-engineer.md`

#### Phase 2 Verification Gate

```bash
# Verify devops has all expected DevOps skills
grep -c "aws-cloud-ops\|docker-compose\|terraform-infra\|ci-cd" .claude/agents/specialized/devops.md
# Verify security-architect has security analysis skills
grep -c "binary-analysis\|memory-forensics\|protocol-reverse" .claude/agents/specialized/security-architect.md
```

**Success Criteria**: All 14 specialized agents have their domain-specific skills

---

### Phase 3: Domain Agent Updates (MEDIUM PRIORITY)

**Purpose**: Update the 22 domain agents
**Dependencies**: Phase 2
**Parallel OK**: Yes
**Estimated Time**: ~60 min

#### Commit Checkpoint (FIRST - before starting Phase 3)

Before integration, commit Phase 1-2 changes:
```bash
git add .claude/agents/core/*.md .claude/agents/specialized/*.md
git commit -m "checkpoint: Phase 1-2 skill mapping for core and specialized agents"
```
**Rationale**: 49+ files modified. Checkpoint creates recovery point.

#### Tasks

- [ ] **3.1** Update `frontend-pro.md` - add 7 skills (~5 min) - HIGH IMPACT
  - **Files**: `.claude/agents/domain/frontend-pro.md`

- [ ] **3.2** Update `nextjs-pro.md` - add 5 skills (~5 min) [parallel OK]
  - **Files**: `.claude/agents/domain/nextjs-pro.md`

- [ ] **3.3** Update `java-pro.md` - add 5 skills (~5 min) [parallel OK]
  - **Files**: `.claude/agents/domain/java-pro.md`

- [ ] **3.4** Update `ai-ml-specialist.md` - add 4 skills (~3 min) [parallel OK]
  - **Files**: `.claude/agents/domain/ai-ml-specialist.md`

- [ ] **3.5** Update `data-engineer.md` - add 5 skills (~3 min) [parallel OK]
  - **Files**: `.claude/agents/domain/data-engineer.md`

- [ ] **3.6** Update `expo-mobile-developer.md` - add 4 skills (~3 min) [parallel OK]
  - **Files**: `.claude/agents/domain/expo-mobile-developer.md`

- [ ] **3.7** Update `fastapi-pro.md` - add 3 skills (~3 min) [parallel OK]
  - **Files**: `.claude/agents/domain/fastapi-pro.md`

- [ ] **3.8** Update `python-pro.md` - add 4 skills (~3 min) [parallel OK]
  - **Files**: `.claude/agents/domain/python-pro.md`

- [ ] **3.9** Update `sveltekit-expert.md` - add 4 skills (~3 min) [parallel OK]
  - **Files**: `.claude/agents/domain/sveltekit-expert.md`

- [ ] **3.10** Update `tauri-desktop-developer.md` - add 4 skills (~3 min) [parallel OK]
  - **Files**: `.claude/agents/domain/tauri-desktop-developer.md`

- [ ] **3.11** Update `typescript-pro.md` - add 3 skills (~3 min) [parallel OK]
  - **Files**: `.claude/agents/domain/typescript-pro.md`

- [ ] **3.12** Update `golang-pro.md` - add 2 skills (~2 min) [parallel OK]
  - **Files**: `.claude/agents/domain/golang-pro.md`

- [ ] **3.13** Update `graphql-pro.md` - add 4 skills (~3 min) [parallel OK]
  - **Files**: `.claude/agents/domain/graphql-pro.md`

- [ ] **3.14** Update `ios-pro.md` - add 3 skills (~3 min) [parallel OK]
  - **Files**: `.claude/agents/domain/ios-pro.md`

- [ ] **3.15** Update `android-pro.md` - add 3 skills (~3 min) [parallel OK]
  - **Files**: `.claude/agents/domain/android-pro.md`

- [ ] **3.16** Update `nodejs-pro.md` - add 4 skills (~3 min) [parallel OK]
  - **Files**: `.claude/agents/domain/nodejs-pro.md`

- [ ] **3.17** Update `php-pro.md` - add 4 skills (~3 min) [parallel OK]
  - **Files**: `.claude/agents/domain/php-pro.md`

- [ ] **3.18** Update `rust-pro.md` - add 2 skills (~2 min) [parallel OK]
  - **Files**: `.claude/agents/domain/rust-pro.md`

- [ ] **3.19** Update `scientific-research-expert.md` - add 3 skills (~3 min) [parallel OK]
  - **Files**: `.claude/agents/domain/scientific-research-expert.md`

- [ ] **3.20** Update `mobile-ux-reviewer.md` - add 3 skills (~3 min) [parallel OK]
  - **Files**: `.claude/agents/domain/mobile-ux-reviewer.md`

- [ ] **3.21** Update `gamedev-pro.md` - add 2 skills (~2 min) [parallel OK]
  - **Files**: `.claude/agents/domain/gamedev-pro.md`

- [ ] **3.22** Update `web3-blockchain-expert.md` - add 1 skill (~2 min) [parallel OK]
  - **Files**: `.claude/agents/domain/web3-blockchain-expert.md`

#### Phase 3 Verification Gate

```bash
# Spot-check: verify frontend-pro has styling + state-management
grep "state-management-expert" .claude/agents/domain/frontend-pro.md
grep "styling-expert" .claude/agents/domain/frontend-pro.md
# Verify all domain agents have task-management-protocol
for f in .claude/agents/domain/*.md; do
  grep -L "task-management-protocol" "$f" && echo "MISSING TMP: $f"
done
```

**Success Criteria**: All 22 domain agents have their language/framework + tooling skills

---

### Phase 4: Orchestrator Updates + Registry Regeneration

**Purpose**: Update orchestrators and regenerate agent-registry.json
**Dependencies**: Phases 1-3
**Parallel OK**: Partial
**Estimated Time**: ~30 min

#### Tasks

- [ ] **4.1** Update `evolution-orchestrator.md` - add 3 skills (~3 min)
  - **Files**: `.claude/agents/orchestrators/evolution-orchestrator.md`

- [ ] **4.2** Update `master-orchestrator.md` - add 2 skills (~3 min) [parallel OK]
  - **Files**: `.claude/agents/orchestrators/master-orchestrator.md`

- [ ] **4.3** Update `party-orchestrator.md` - add 4 skills (~3 min) [parallel OK]
  - **Files**: `.claude/agents/orchestrators/party-orchestrator.md`

- [ ] **4.4** Update `swarm-coordinator.md` - add 2 skills (~3 min) [parallel OK]
  - **Files**: `.claude/agents/orchestrators/swarm-coordinator.md`

- [ ] **4.5** Regenerate `agent-registry.json` (~10 min)
  - **Command**: Run the registry scanner to rebuild from agent .md files
  - **Verify**: `node .claude/lib/routing/agent-registry-scanner.cjs`
  - **Verify**: JSON is valid and all 49 agents present

- [ ] **4.6** Verify routing-table consistency (~5 min)
  - **Command**: Verify `.claude/lib/routing/routing-table.cjs` recognizes new skills
  - **Verify**: Cross-reference routing table with updated registry

#### Phase 4 Verification Gate

```bash
# Verify registry has all 49 agents
node -e "const r=require('./.claude/context/agent-registry.json');console.log('Agents:',Object.keys(r.agents).length)"
# Verify party-orchestrator has universal skills
node -e "const r=require('./.claude/context/agent-registry.json');console.log(r.agents['party-orchestrator'].capabilities[0].skills)"
```

**Success Criteria**: Registry regenerated, all agents have correct skill lists

---

### Phase 5: Validation and Testing

**Purpose**: Validate complete mapping, run tests, verify no regressions
**Dependencies**: Phase 4
**Parallel OK**: Partial
**Estimated Time**: ~20 min

#### Tasks

- [ ] **5.1** Run framework tests (~5 min)
  - **Command**: `pnpm test:framework`
  - **Verify**: All tests pass (0 failures)

- [ ] **5.2** Validate universal skill coverage (~5 min)
  - **Command**: Script to verify all 49 agents have task-management-protocol and verification-before-completion
  - **Verify**: 100% coverage

- [ ] **5.3** Validate no duplicate skills per agent (~3 min)
  - **Command**: Check each agent for duplicate skill entries
  - **Verify**: Zero duplicates

- [ ] **5.4** Validate skill names match catalog (~5 min)
  - **Command**: Cross-reference all skill names in agent files against skill-catalog.md
  - **Verify**: All skill names are valid

- [ ] **5.5** Commit all changes (~2 min)
  - **Command**: `git add . && git commit -m "feat: comprehensive skill-to-agent mapping overhaul (171 skills added across 49 agents)"`

#### Phase 5 Verification Gate

```bash
pnpm test:framework && echo "ALL TESTS PASS"
```

**Success Criteria**: All tests pass, all agents validated, changes committed

---

### Phase FINAL: Evolution and Reflection Check

**Purpose**: Quality assessment and learning extraction

**Tasks**:

1. Spawn reflection-agent to analyze completed work
2. Extract learnings and update memory files
3. Check for evolution opportunities (new agents/skills needed)

**Success Criteria**:
- Reflection-agent spawned and completed
- Learnings extracted to `.claude/context/memory/learnings.md`
- Evolution opportunities logged if any detected

---

## Risks

| Risk | Impact | Mitigation | Rollback |
|------|--------|------------|----------|
| Agent file format breaks after edits | High | Edit only skills section, preserve structure | `git checkout -- .claude/agents/` |
| Registry regeneration fails | Medium | Manual JSON fix or re-run scanner | Use previous registry version |
| Skill name typo causes runtime error | Medium | Validate against skill catalog before commit | Fix typo and re-commit |
| Too many skills overload context | Low | Cap at ~15 skills per agent for domain, ~20 for core | Remove least-used skills |

## Timeline Summary

| Phase | Tasks | Est. Time | Parallel? |
|-------|-------|-----------|-----------|
| 1 - Core Agents | 9 | 45 min | Yes |
| 2 - Specialized | 11 | 45 min | Yes |
| 3 - Domain | 22 | 60 min | Yes |
| 4 - Orchestrators + Registry | 6 | 30 min | Partial |
| 5 - Validation | 5 | 20 min | Partial |
| FINAL - Reflection | 3 | 10 min | No |
| **Total** | **56** | **~3.5 hours** | |

## Implementation Notes

### How to Update Agent .md Files

Each agent `.md` file has a YAML frontmatter with a `skills:` array. The update process:

1. Read the agent `.md` file
2. Find the `skills:` section in frontmatter
3. Add new skills to the array (alphabetical order preferred)
4. Ensure no duplicates
5. Save the file

Example edit for `devops.md`:
```yaml
# Before
skills:
  - task-management-protocol
  - dependency-analyzer
  - git-expert

# After
skills:
  - aws-cloud-ops
  - ci-cd-implementation-rule
  - cloud-devops-expert
  - configuration-management
  - container-expert
  - containerization-rules
  - dependency-analyzer
  - docker-compose
  - git-expert
  - gitops-workflow
  - helm-chart-scaffolding
  - k8s-manifest-generator
  - kubernetes-flux
  - task-management-protocol
  - terraform-infra
  - verification-before-completion
```

### Parallelization Strategy

Within each phase, agent files can be updated in parallel since they are independent files. Use 3-5 parallel developer agents for maximum throughput:

- **Batch 1**: Core agents (Phase 1) - 1-2 developers
- **Batch 2**: Specialized agents (Phase 2) - 2-3 developers
- **Batch 3**: Domain agents (Phase 3) - 3-5 developers (largest batch)
- **Batch 4**: Orchestrators + registry (Phase 4) - 1 developer

### Skills NOT to Map (Exclusion List)

Some skills should NOT be mapped to agents:

| Skill Category | Reason |
|---------------|--------|
| Deprecated skills (testing-expert, writing) | Merged into other skills |
| Agent behavior personas (elite-engineer, senior-frontend-mindset) | These are personality presets, not functional skills |
| Framework-specific config (babel-config, nativewind-compatibility) | Too specific; loaded on-demand via Skill() |
| Scientific sub-skills (142 individual) | Mapped via parent `scientific-skills` skill |
