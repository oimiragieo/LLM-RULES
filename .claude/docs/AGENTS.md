# Agents System Documentation

## What Are Agents?

Agents are specialized AI workers with defined roles, capabilities, and constraints. Each agent is an independent AI instance spawned through the Task tool to perform specific work. Agents operate in a multi-agent orchestration system where they collaborate through task assignment, memory sharing, and skill invocation.

**Key characteristics:**

- **Specialized**: Each agent has a focused domain (development, security, architecture)
- **Autonomous**: Agents make decisions within their domain expertise
- **Collaborative**: Agents work together through task handoffs and reviews
- **Persistent**: Agents track work through the task system and memory files
- **Skill-powered**: Agents invoke reusable skills to execute workflows

## Agent Categories

**Total Agents**: 46 (8 core, 21 domain, 12 specialized, 4 orchestrators, 1 meta-router)

### Core Agents (8)

Core agents handle the fundamental software development lifecycle tasks.

| Agent                  | Purpose                                              | Model  | Context Strategy |
| ---------------------- | ---------------------------------------------------- | ------ | ---------------- |
| **developer**          | TDD implementation, bug fixes, feature coding        | sonnet | lazy_load        |
| **planner**            | Strategic planning, feature design, task breakdown   | opus   | lazy_load        |
| **architect**          | System design, architecture decisions                | opus   | full             |
| **qa**                 | Testing strategy, test execution, quality validation | opus   | lazy_load        |
| **technical-writer**   | Documentation creation, updates, clarity             | sonnet | lazy_load        |
| **router**             | Request orchestration, agent selection (meta)        | sonnet | minimal          |
| **pm**                 | Product management, requirements gathering           | sonnet | lazy_load        |
| **context-compressor** | Token optimization, context reduction                | haiku  | minimal          |

### Specialized Agents (10)

Specialized agents provide expert capabilities for specific disciplines.

| Agent                     | Purpose                                      | Model  | Context Strategy |
| ------------------------- | -------------------------------------------- | ------ | ---------------- |
| **security-architect**    | Security design, threat modeling, compliance | opus   | full             |
| **code-reviewer**         | Code quality review, PR feedback             | sonnet | lazy_load        |
| **devops**                | Infrastructure, deployment, CI/CD            | sonnet | lazy_load        |
| **devops-troubleshooter** | System debugging, incident diagnosis         | sonnet | lazy_load        |
| **incident-responder**    | Production incident handling                 | opus   | full             |
| **c4-context**            | C4 system context diagrams                   | sonnet | lazy_load        |
| **c4-container**          | C4 container diagrams                        | sonnet | lazy_load        |
| **c4-component**          | C4 component diagrams                        | sonnet | lazy_load        |
| **c4-code**               | C4 code-level diagrams                       | sonnet | lazy_load        |
| **conductor-validator**   | Context-driven development validation        | sonnet | lazy_load        |
| **reverse-engineer**      | Codebase analysis, pattern extraction        | sonnet | lazy_load        |
| **database-architect**    | Database schema design, optimization         | opus   | full             |

### Domain Agents (21)

Domain agents provide language-specific and framework-specific expertise.

| Agent                          | Purpose                                        | Model  |
| ------------------------------ | ---------------------------------------------- | ------ |
| **python-pro**                 | Python development, FastAPI, Django            | sonnet |
| **rust-pro**                   | Rust development, memory safety, performance   | sonnet |
| **golang-pro**                 | Go development, concurrency, services          | sonnet |
| **typescript-pro**             | TypeScript development, type systems           | sonnet |
| **fastapi-pro**                | FastAPI framework expertise                    | sonnet |
| **frontend-pro**               | React, Vue, frontend architecture              | sonnet |
| **nodejs-pro**                 | Node.js, Express, NestJS backend               | sonnet |
| **ios-pro**                    | iOS development, Swift, SwiftUI                | sonnet |
| **android-pro**                | Android, Kotlin, Jetpack Compose               | sonnet |
| **java-pro**                   | Java, Spring Boot, JVM ecosystem               | sonnet |
| **nextjs-pro**                 | Next.js App Router, SSR, SSG                   | sonnet |
| **php-pro**                    | PHP, Laravel framework                         | sonnet |
| **sveltekit-expert**           | SvelteKit, Svelte 5 development                | sonnet |
| **tauri-desktop-developer**    | Tauri desktop applications                     | sonnet |
| **expo-mobile-developer**      | Expo, React Native mobile                      | sonnet |
| **data-engineer**              | ETL pipelines, data processing                 | sonnet |
| **graphql-pro**                | GraphQL API design and implementation          | sonnet |
| **mobile-ux-reviewer**         | Mobile UX review and feedback                  | sonnet |
| **scientific-research-expert** | Scientific research, data analysis, 139 skills | opus   |
| **ai-ml-specialist**           | ML/AI, PyTorch, TensorFlow, MLOps              | sonnet |
| **gamedev-pro**                | Unity, Unreal, Godot game development          | sonnet |
| **web3-blockchain-expert**     | Solidity, DeFi, smart contracts                | opus   |

### Orchestrators (4)

Orchestrators manage complex multi-agent workflows and coordination.

| Agent                      | Purpose                                              | Model |
| -------------------------- | ---------------------------------------------------- | ----- |
| **master-orchestrator**    | Complex project orchestration, multi-phase workflows | opus  |
| **swarm-coordinator**      | Parallel agent coordination, resource management     | opus  |
| **evolution-orchestrator** | Self-evolution workflow, artifact creation           | opus  |
| **reflection-agent**       | Quality reflection and learning extraction           | opus  |

## Agent Frontmatter Format

Agents are defined using YAML frontmatter with the following structure:

```yaml
---
name: agent-name
version: 1.0.0
description: Brief description. Use for primary use cases and when to invoke.
model: claude-sonnet-4-5 | claude-opus-4-5 | claude-haiku-4-5
temperature: 0.3 # 0.0-1.0, lower = more deterministic
context_strategy: lazy_load | minimal | full
priority: high | medium | low
extended_thinking: false # true for complex reasoning tasks (opus only)
tools:
  - Read
  - Write
  - Edit
  - Bash
  - Grep
  - Glob
  - Git
  - WebSearch
  - WebFetch
  - MCP Tools
skills:
  - tdd
  - debugging
  - security-architect
  # Add agent-specific skills
capabilities:
  - code-generation
  - refactoring
  - debugging
optimizations:
  - context-caching
context_files:
  - .claude/context/memory/learnings.md
  - .claude/context/memory/decisions.md
---
```

**Field descriptions:**

- **name**: Agent identifier (lowercase, hyphens)
- **version**: Semantic version for agent definition
- **description**: When to use this agent (appears in routing decisions)
- **model**: Claude model variant (sonnet for standard, opus for complex reasoning)
- **temperature**: Controls randomness (lower = more deterministic)
- **context_strategy**: How agent loads context (see below)
- **priority**: Scheduling priority for parallel agent execution
- **extended_thinking**: Enable extended reasoning (opus only)
- **tools**: Available tools for this agent
- **skills**: Skills this agent invokes during execution
- **capabilities**: Optional descriptive capabilities (used for display/future routing)
- **optimizations**: Optional descriptive optimizations (purely informational)
- **context_files**: Files loaded automatically into agent context

## Context Strategies

Context strategies control how agents load project context to balance detail with token efficiency.

| Strategy      | Description                               | Typical Usage                        | Token Usage      |
| ------------- | ----------------------------------------- | ------------------------------------ | ---------------- |
| **minimal**   | Only essential metadata, no project files | router, context-compressor           | Very Low (~5k)   |
| **lazy_load** | Load files as needed during execution     | Most agents (developer, planner, QA) | Medium (~20-50k) |
| **full**      | Complete project context from start       | architect, security-architect        | High (~80-150k)  |

**When to use each:**

- **minimal**: Routing decisions, quick validation, context reduction
- **lazy_load**: Standard development work where agent discovers needed files progressively
- **full**: Architecture design, security audits, comprehensive analysis

## How Agents Are Spawned

Agents are spawned by the Router using the Task tool. The Router analyzes user requests and selects appropriate agents.

**Single agent spawn:**

```javascript
Task({
  subagent_type: 'general-purpose',
  model: 'sonnet',
  description: 'Developer fixing login bug',
  prompt: `You are the DEVELOPER agent.

## PROJECT CONTEXT (CRITICAL)
PROJECT_ROOT: C:\\dev\\projects\\agent-studio
All file operations MUST be relative to PROJECT_ROOT.

## Your Assigned Task
Task ID: 3
Subject: Fix login bug in authentication flow

## Instructions
1. Read your agent definition: .claude/agents/core/developer.md
2. Claim task: TaskUpdate({ taskId: "3", status: "in_progress" })
3. Invoke skills: Skill({ skill: "tdd" }) then Skill({ skill: "debugging" })
4. Execute the task following skill workflows
5. Mark complete: TaskUpdate({ taskId: "3", status: "completed" })
6. Get next: TaskList() to find next available task

## Memory Protocol
1. Read .claude/context/memory/learnings.md before starting
2. Record discoveries to .claude/context/memory/learnings.md
`,
});
```

**Parallel agent spawn (multiple agents, single response):**

```javascript
// Both spawned in same message for parallel execution
Task({
  subagent_type: 'general-purpose',
  model: 'opus',
  description: 'Planner designing auth feature',
  prompt: 'You are PLANNER. Design authentication feature...',
});

Task({
  subagent_type: 'general-purpose',
  model: 'opus',
  description: 'Security reviewing auth design',
  prompt: 'You are SECURITY-ARCHITECT. Review authentication design...',
});
```

**Background agent spawn (long-running tasks):**

```javascript
Task({
  subagent_type: 'general-purpose',
  model: 'sonnet',
  run_in_background: true,
  description: 'QA running full test suite',
  prompt: 'You are QA. Run comprehensive test suite and report results...',
});
```

## Agent Routing Table

The Router uses this table to select agents based on request type.

| Request Type           | Agent                     | File                                                  |
| ---------------------- | ------------------------- | ----------------------------------------------------- |
| Bug fixes, coding      | `developer`               | `.claude/agents/core/developer.md`                    |
| New features, planning | `planner`                 | `.claude/agents/core/planner.md`                      |
| System design          | `architect`               | `.claude/agents/core/architect.md`                    |
| Testing, QA            | `qa`                      | `.claude/agents/core/qa.md`                           |
| Documentation, docs    | `technical-writer`        | `.claude/agents/core/technical-writer.md`             |
| Code review, PR review | `code-reviewer`           | `.claude/agents/specialized/code-reviewer.md`         |
| Security review        | `security-architect`      | `.claude/agents/specialized/security-architect.md`    |
| Infrastructure         | `devops`                  | `.claude/agents/specialized/devops.md`                |
| Debugging              | `devops-troubleshooter`   | `.claude/agents/specialized/devops-troubleshooter.md` |
| Incidents              | `incident-responder`      | `.claude/agents/specialized/incident-responder.md`    |
| C4 System Context      | `c4-context`              | `.claude/agents/specialized/c4-context.md`            |
| C4 Containers          | `c4-container`            | `.claude/agents/specialized/c4-container.md`          |
| C4 Components          | `c4-component`            | `.claude/agents/specialized/c4-component.md`          |
| C4 Code level          | `c4-code`                 | `.claude/agents/specialized/c4-code.md`               |
| Context-driven dev     | `conductor-validator`     | `.claude/agents/specialized/conductor-validator.md`   |
| Reverse engineering    | `reverse-engineer`        | `.claude/agents/specialized/reverse-engineer.md`      |
| Python expert          | `python-pro`              | `.claude/agents/domain/python-pro.md`                 |
| Rust expert            | `rust-pro`                | `.claude/agents/domain/rust-pro.md`                   |
| Go expert              | `golang-pro`              | `.claude/agents/domain/golang-pro.md`                 |
| TypeScript expert      | `typescript-pro`          | `.claude/agents/domain/typescript-pro.md`             |
| FastAPI expert         | `fastapi-pro`             | `.claude/agents/domain/fastapi-pro.md`                |
| Product management     | `pm`                      | `.claude/agents/core/pm.md`                           |
| Frontend/React/Vue     | `frontend-pro`            | `.claude/agents/domain/frontend-pro.md`               |
| Node.js/Express/NestJS | `nodejs-pro`              | `.claude/agents/domain/nodejs-pro.md`                 |
| iOS/Swift development  | `ios-pro`                 | `.claude/agents/domain/ios-pro.md`                    |
| Java/Spring Boot       | `java-pro`                | `.claude/agents/domain/java-pro.md`                   |
| Next.js App Router     | `nextjs-pro`              | `.claude/agents/domain/nextjs-pro.md`                 |
| PHP/Laravel            | `php-pro`                 | `.claude/agents/domain/php-pro.md`                    |
| SvelteKit/Svelte 5     | `sveltekit-expert`        | `.claude/agents/domain/sveltekit-expert.md`           |
| Tauri desktop apps     | `tauri-desktop-developer` | `.claude/agents/domain/tauri-desktop-developer.md`    |
| Expo/React Native      | `expo-mobile-developer`   | `.claude/agents/domain/expo-mobile-developer.md`      |
| Data engineering/ETL   | `data-engineer`           | `.claude/agents/domain/data-engineer.md`              |
| Database design        | `database-architect`      | `.claude/agents/specialized/database-architect.md`    |
| GraphQL APIs           | `graphql-pro`             | `.claude/agents/domain/graphql-pro.md`                |
| Mobile UX review       | `mobile-ux-reviewer`      | `.claude/agents/domain/mobile-ux-reviewer.md`         |
| Project orchestration  | `master-orchestrator`     | `.claude/agents/orchestrators/master-orchestrator.md` |
| Swarm coordination     | `swarm-coordinator`       | `.claude/agents/orchestrators/swarm-coordinator.md`   |
| Context compression    | `context-compressor`      | `.claude/agents/core/context-compressor.md`           |
| System routing         | `router`                  | `.claude/agents/core/router.md` (Meta)                |

## Memory Protocol

Every agent follows the Memory Protocol to persist knowledge across context resets.

**Before starting work:**

```bash
cat .claude/context/memory/learnings.md
cat .claude/context/memory/decisions.md
```

**During work:**

Agents record discoveries to memory files as they happen.

**After completing work:**

```bash
# Record patterns or solutions
echo "## Pattern: Authentication Flow\nUse JWT with refresh tokens..." >> .claude/context/memory/learnings.md

# Record architectural decisions
echo "## Decision: Database Choice\nSelected PostgreSQL for ACID compliance..." >> .claude/context/memory/decisions.md

# Record blockers or issues
echo "## Issue: API Rate Limiting\nThird-party API returns 429..." >> .claude/context/memory/issues.md
```

**Memory files:**

- **learnings.md**: Patterns, solutions, techniques discovered
- **decisions.md**: Architectural decisions (ADRs)
- **issues.md**: Known blockers, bugs, technical debt
- **active_context.md**: Scratchpad for long-running tasks

> **ASSUME INTERRUPTION**: Your context may reset. If it's not in memory, it didn't happen.

## Task Synchronization Protocol

Agents track progress through the task system.

**Before starting work:**

```javascript
// 1. Check for existing/assigned work
TaskList();

// 2. Get full task details
TaskGet({ taskId: '3' });

// 3. Claim the task
TaskUpdate({
  taskId: '3',
  status: 'in_progress',
  owner: 'developer',
});
```

**During work:**

```javascript
// Update task with discoveries
TaskUpdate({
  taskId: '3',
  metadata: {
    discoveries: ['Found authentication bug in session validation'],
    keyFiles: ['src/auth/session.ts'],
    patterns: ['missing-null-check'],
  },
});
```

**On completion:**

```javascript
// Mark task complete with summary
TaskUpdate({
  taskId: '3',
  status: 'completed',
  metadata: {
    summary: 'Fixed null reference in session validation',
    filesModified: ['src/auth/session.ts', 'tests/auth/session.test.ts'],
    testsAdded: 2,
  },
});

// Check for newly unblocked tasks
TaskList();
```

**Iron Laws:**

1. **Never complete without summary** - Always include metadata with completion
2. **Always update on discovery** - Record findings as they happen
3. **Always TaskList after completion** - Check for unblocked work

## Skill Invocation

Agents invoke skills using the Skill tool (not by reading skill files).

**Correct approach:**

```javascript
// Invoke TDD skill workflow
Skill({ skill: 'tdd' });

// Invoke debugging skill workflow
Skill({ skill: 'debugging' });

// Invoke security validation skill
Skill({ skill: 'security-architect' });
```

**Wrong approach:**

```javascript
// X WRONG: Reading skill file doesn't apply workflow
Read('.claude/skills/tdd/SKILL.md');
```

**Key difference:** Reading a skill file shows you documentation. Invoking with `Skill()` loads AND applies the workflow.

**Common skills:**

- **tdd**: Test-Driven Development (Red-Green-Refactor)
- **debugging**: Systematic debugging process
- **security-architect**: Security validation and threat modeling
- **verification-before-completion**: Quality gates before task completion
- **git-expert**: Git operations best practices
- **doc-generator**: Documentation generation patterns
- **diagram-generator**: Mermaid diagram creation

### Skill Invocation Template

When creating new agents, use the **Skill Invocation Section Template** at `.claude/templates/agent-skill-invocation-section.md` to add standardized skill invocation guidance.

**Template provides:**

- **Automatic Skills**: Skills to invoke at task start (e.g., `tdd`, primary domain skill)
- **Contextual Skills**: Condition-based skill invocation (e.g., `debugging` when troubleshooting)
- **Skill Discovery**: How to find and invoke skills from the catalog
- **Usage Examples**: Code examples for common invocation patterns
- **Placeholder Reference**: Fill-in-the-blank placeholders for agent-specific customization

**Example usage in agent definition:**

```markdown
## Skill Invocation Protocol (MANDATORY)

### Automatic Skills (Always Invoke)

| Skill                   | Purpose                  | When                 |
| ----------------------- | ------------------------ | -------------------- |
| `tdd`                   | Red-Green-Refactor cycle | Always at task start |
| `python-backend-expert` | Python patterns          | Always at task start |

### Contextual Skills (When Applicable)

| Condition         | Skill                            | Purpose                      |
| ----------------- | -------------------------------- | ---------------------------- |
| Debugging issues  | `debugging`                      | Systematic 4-phase debugging |
| Before completion | `verification-before-completion` | Evidence-based gates         |

**Important**: Always use `Skill()` tool - reading skill files does NOT apply them.
```

**See also:**

- **Skill Catalog**: `.claude/context/artifacts/skill-catalog.md` (complete skill list)
- **Skill Template**: `.claude/templates/skills/skill-template.md` (creating new skills)

## Creating New Agents

Use the agent-creator skill or the agent template.

**Using agent-creator skill:**

```javascript
Task({
  subagent_type: 'general-purpose',
  description: 'Creating mobile-performance-reviewer agent',
  prompt: `You are AGENT-CREATOR.

Invoke: Skill({ skill: "agent-creator" })

Create agent for: "Mobile app performance review and optimization"
`,
});
```

**Using template directly:**

1. Copy `.claude/templates/agents/agent-template.md`
2. Replace placeholders:
   - `{{AGENT_NAME}}` - kebab-case identifier
   - `{{BRIEF_DESCRIPTION}}` - Purpose and use cases
   - `{{PRIMARY_USE_CASES}}` - When to invoke
   - `{{DOMAIN}}` - Domain expertise
3. Define capabilities, workflow, and tools
4. Save to `.claude/agents/domain/` or `.claude/agents/specialized/`

**Template structure:**

```yaml
---
name: {{AGENT_NAME}}
description: {{BRIEF_DESCRIPTION}}. Use for {{PRIMARY_USE_CASES}}.
model: claude-sonnet-4-5
temperature: 0.4
context_strategy: lazy_load
skills:
  - tdd
  - verification-before-completion
---

# {{AGENT_DISPLAY_NAME}} Agent

## Core Persona
**Identity**: {{IDENTITY_DESCRIPTION}}
**Style**: {{WORKING_STYLE}}
**Approach**: {{METHODOLOGY}}

## Responsibilities
1. Primary responsibility description
2. Secondary responsibility description

## Workflow
### Step 0: Load Skills (FIRST)
### Step 1: Analyze Requirements
### Step 2: Research Context
### Step 3: Implement
### Step 4: Test & Validate

## Memory Protocol (MANDATORY)
[Standard memory protocol]
```

## Model Selection Guidelines

| Model      | Use For                                   | Cost   | Token Limit |
| ---------- | ----------------------------------------- | ------ | ----------- |
| **haiku**  | Simple validation, quick checks           | Low    | 200k        |
| **sonnet** | Standard agent work (default)             | Medium | 200k        |
| **opus**   | Complex reasoning, architecture, security | High   | 200k        |

**When to use each:**

- **haiku**: Context compression, simple file operations, validation checks
- **sonnet**: Feature development, bug fixes, testing, documentation (90% of work)
- **opus**: System design, security architecture, complex planning, critical decisions

## Agent Collaboration

Agents collaborate through several mechanisms:

**Task handoffs:**

- Planner creates tasks → Developer implements → QA validates

**Parallel review:**

- Developer writes code + Security Architect reviews (parallel spawn)

**Sequential workflow:**

- Developer completes task → QA starts testing (task dependencies)

**Memory sharing:**

- All agents read/write to shared memory files

**Skill sharing:**

- Common skills invoked by multiple agents (tdd, verification-before-completion)

## Best Practices

**For agent creators:**

1. **Single Responsibility**: Each agent should have a clear, focused purpose
2. **Skill Composition**: Leverage existing skills rather than duplicating logic
3. **Memory Usage**: Always follow memory protocol to persist knowledge
4. **Task Tracking**: Use task system for progress visibility
5. **Context Efficiency**: Choose appropriate context_strategy for agent needs

**For agent users (Router):**

1. **Right Agent for Job**: Select specialist agents for their domain
2. **Parallel When Possible**: Spawn multiple agents for independent work
3. **Dependencies**: Set task dependencies for sequential workflows
4. **Review Requirements**: Include security-architect for sensitive changes

**For spawned agents:**

1. **Claim Tasks Early**: Update task status to "in_progress" immediately
2. **Record Discoveries**: Update task metadata as you find things
3. **Complete with Summary**: Always include completion metadata
4. **Check for Next Work**: Run TaskList() after completing tasks
5. **Invoke Skills**: Use Skill() tool, don't just read skill files

## Common Patterns

**Feature development:**

1. Router spawns PLANNER to design feature
2. PLANNER creates implementation tasks
3. Router spawns DEVELOPER to implement
4. Router spawns QA to validate
5. Router spawns TECHNICAL-WRITER to document

**Bug fix:**

1. Router spawns DEVELOPER directly (low complexity)
2. DEVELOPER invokes debugging skill
3. DEVELOPER implements fix following TDD
4. DEVELOPER verifies fix with tests

**Security-sensitive change:**

1. Router spawns PLANNER + SECURITY-ARCHITECT in parallel
2. PLANNER designs feature, SECURITY-ARCHITECT reviews design
3. Router spawns DEVELOPER to implement
4. Router spawns SECURITY-ARCHITECT again to review implementation

**Architecture decision:**

1. Router spawns ARCHITECT (opus model for complex reasoning)
2. ARCHITECT uses extended_thinking for deep analysis
3. ARCHITECT records decision to memory/decisions.md
4. Router spawns relevant domain agents to implement

## Troubleshooting

**Agent not spawning:**

- Check agent name matches routing table
- Verify agent file exists at specified path
- Check YAML frontmatter syntax

**Agent not following skills:**

- Ensure agent invokes Skill() tool (not just Read)
- Check skill name is correct
- Verify skill file exists in .claude/skills/

**Task not progressing:**

- Check task status with TaskList()
- Verify no blockers (check task metadata)
- Ensure dependencies are completed

**Memory not persisting:**

- Verify agent writes to memory files after work
- Check file paths are absolute
- Ensure memory protocol followed

## New Domain Agents (Added January 2026)

Five new domain agents have been added to expand specialized expertise:

### scientific-research-expert

**Purpose**: Scientific research, academic methodologies, data analysis

**Model**: opus (complex reasoning required for research methodologies)

**Primary Skills**:

- `scientific-skills` (139 specialized sub-skills covering research methodologies)
- `research-synthesis` (evidence-based research patterns)
- `data-expert` (data processing and analysis)

**Contextual Skills**:

- `ai-ml-expert` (when ML/AI project detected)
- `python-backend-expert` (when Python project)
- `pandas-data-manipulation-rules` (when data processing)

**Use Cases**:

- Academic research and hypothesis testing
- Scientific computing and simulations
- Data analysis with statistical methods
- Reproducible research and documentation
- Chemistry, biology, physics computational projects

**File**: `.claude/agents/domain/scientific-research-expert.md`

### ai-ml-specialist

**Purpose**: Machine learning, deep learning, MLOps

**Model**: sonnet

**Primary Skills**:

- `ai-ml-expert` (ML frameworks, training pipelines)
- `python-backend-expert` (Python ML ecosystem)
- `tdd` (Test-Driven Development for ML code)

**Contextual Skills**:

- `scientific-skills` (when research project)
- `data-expert` (when data engineering)
- `large-data-with-dask` (when working with large datasets)

**Use Cases**:

- PyTorch and TensorFlow model development
- ML model training and optimization
- MLOps pipelines and deployment
- Model evaluation and validation
- Feature engineering and preprocessing

**File**: `.claude/agents/domain/ai-ml-specialist.md`

### android-pro

**Purpose**: Native Android development with Kotlin and Jetpack Compose

**Model**: sonnet

**Primary Skills**:

- `android-expert` (Android SDK, Jetpack libraries)
- `tdd` (Test-Driven Development)
- `mobile-ui-development-rule` (mobile UI patterns)

**Contextual Skills**:

- `kotlin-expert` (when Kotlin-specific patterns needed)
- `security-architect` (when security-sensitive features)

**Use Cases**:

- Native Android app development
- Jetpack Compose declarative UI
- Material Design implementation
- Kotlin coroutines and Flow
- Android architecture components (ViewModel, LiveData, Room)

**File**: `.claude/agents/domain/android-pro.md`

### gamedev-pro

**Purpose**: Game development across Unity, Unreal Engine, and Godot

**Model**: sonnet

**Primary Skills**:

- `gamedev-expert` (game development patterns and architectures)
- `tdd` (Test-Driven Development for game logic)
- `debugging` (systematic game debugging)

**Contextual Skills**:

- `cpp` (when Unreal Engine or C++ project)
- `dragonruby-best-practices` (when DragonRuby project)

**Use Cases**:

- Unity C# game development
- Unreal Engine C++ development
- Godot GDScript development
- Game architecture and design patterns
- Performance optimization for games
- Physics and rendering systems

**File**: `.claude/agents/domain/gamedev-pro.md`

### web3-blockchain-expert

**Purpose**: Web3, blockchain, smart contracts, DeFi protocols

**Model**: opus (security-critical smart contract work)

**Primary Skills**:

- `web3-expert` (blockchain development patterns)
- `security-architect` (ALWAYS for smart contracts - security critical)
- `tdd` (Test-Driven Development)

**Contextual Skills**:

- `typescript-expert` (when Ethereum dApp development)
- `starknet-react-rules` (when StarkNet project)

**Use Cases**:

- Solidity smart contract development
- Smart contract security auditing
- DeFi protocol implementation
- Web3 dApp frontend (ethers.js, web3.js)
- Blockchain integration and testing

**File**: `.claude/agents/domain/web3-blockchain-expert.md`

**Security Note**: This agent ALWAYS loads security-architect skill due to the critical nature of smart contract security.

## Additional Resources

- **Agent-Skill Discovery**: `.claude/docs/AGENT-SKILL-DISCOVERY.md` (how agents find and use skills)
- **Agent Template**: `.claude/templates/agents/agent-template.md`
- **Routing Workflow**: `.claude/workflows/core/router-decision.md`
- **Skill Catalog**: `.claude/context/artifacts/skill-catalog.md`
- **Agent-Skill Matrix**: `.claude/context/config/agent-skill-matrix.json`
- **Task System**: Task tools (TaskList, TaskUpdate, TaskCreate)
- **Multi-Agent Workflows**: `.claude/workflows/enterprise/`
