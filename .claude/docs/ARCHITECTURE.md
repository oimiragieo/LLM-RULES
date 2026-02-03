# Framework Architecture

## Overview

This framework transforms a standard LLM session into a **True Multi-Agent System** using a "Router-First" architecture with **Task-based subagent spawning**. It relies on five core pillars: **Context Injection** (via `CLAUDE.md`), **Runtime Hooks**, **Subagent Orchestration** (via Task tool), **Specialized Personas**, and **Self-Evolution** (dynamic agent/skill creation).

## Multi-Agent Orchestration

### How It Works

The framework uses the **Task tool** to spawn actual subagent processes:

```
User Request → Router (analyze) → Task tool → Subagent Process → Result
```

**Key Difference from Persona-Switching:**

| Approach                        | Description                          | Parallelism | Isolation |
| ------------------------------- | ------------------------------------ | ----------- | --------- |
| Persona-switching               | Same session, different instructions | No          | No        |
| **Task-based (this framework)** | Separate subprocess agents           | Yes         | Yes       |

### Spawning Agents

The Router uses the Task tool to spawn agents. **CRITICAL**: Include skill loading in spawn prompts.

```javascript
Task({
  subagent_type: 'general-purpose',
  model: 'sonnet', // or haiku/opus
  description: 'Developer fixing bug',
  prompt: `You are DEVELOPER.

## Instructions
1. Read your agent definition: .claude/agents/core/developer.md
2. Read memory: .claude/context/memory/learnings.md
3. **Load your skills** - read each SKILL.md:
   - .claude/skills/tdd/SKILL.md
   - .claude/skills/debugging/SKILL.md
4. Execute the task following agent AND skill workflows
`,
});
```

### Skill Invocation Protocol

**Critical:** Agents must use the `Skill()` tool to invoke skills, not just read files.

```javascript
// CORRECT: Use Skill tool
Skill({ skill: 'tdd' });
Skill({ skill: 'debugging' });

// WRONG: Just reading files
Read('.claude/skills/tdd/SKILL.md'); // ❌ Does not apply skill
```

**Why the Skill() tool?**

| Approach                  | What Happens                               |
| ------------------------- | ------------------------------------------ |
| `Read("...SKILL.md")`     | Just reads text, agent must manually apply |
| `Skill({ skill: "tdd" })` | Loads AND applies skill workflow to task   |

**The Router must:**

1. Read the agent's frontmatter to get `skills` list
2. Include `Skill()` invocation instructions in spawn prompt
3. Tell the agent to invoke each skill using the tool

Without explicit skill invocation, agents won't follow their specialized workflows (TDD, debugging methodology, etc.).

**Spawn Prompt Example:**

```javascript
Task({
  prompt: `You are DEVELOPER.

## Instructions
1. Read your agent definition: .claude/agents/core/developer.md
2. **Invoke your skills using the Skill tool**:
   - Skill({ skill: "tdd" })
   - Skill({ skill: "debugging" })
3. Execute task following skill workflows
`,
});
```

### Parallel Execution

Multiple agents can work simultaneously by including multiple Task calls in one response:

```javascript
// Both spawn in parallel
Task({ description: 'Planner', prompt: '...' });
Task({ description: 'Security review', prompt: '...' });
```

### Background Agents

Long-running tasks can spawn in background:

```javascript
Task({
  run_in_background: true,
  description: 'QA running tests',
  prompt: '...',
});
```

## Multi-Agent Planning Orchestration

**Critical Principle**: Complex tasks require multiple expert perspectives. Never let a single agent make major decisions alone.

### Why Multi-Agent Planning?

Single-agent planning misses critical perspectives:

- **Planner** focuses on task breakdown and sequencing
- **Architect** catches structural issues, pattern violations, scalability concerns
- **Security Architect** catches vulnerabilities, compliance issues, attack vectors

Together they produce robust, secure, well-architected plans.

### Planning Orchestration Matrix

| Task Type                  | Primary Agent | Required Review Agents | Strategy        |
| -------------------------- | ------------- | ---------------------- | --------------- |
| Bug fix (simple)           | Developer     | -                      | Single agent    |
| Bug fix (security-related) | Developer     | Security Architect     | Sequential      |
| New feature                | Planner       | Architect + Security   | Parallel review |
| Codebase integration       | Planner       | Architect + Security   | Parallel review |
| Architecture change        | Architect     | Security Architect     | Parallel        |
| External API integration   | Planner       | Architect + Security   | Parallel review |
| Database changes           | Planner       | Architect              | Parallel        |
| Auth/Security changes      | Planner       | Security (mandatory)   | Parallel review |
| Code review/audit          | Architect     | Security Architect     | Parallel        |

### Phased Execution Pattern

Complex planning follows a 4-phase pattern:

```
Phase 1: EXPLORE     Phase 2: PLAN        Phase 3: REVIEW       Phase 4: CONSOLIDATE
┌─────────────┐      ┌─────────────┐      ┌─────────────┐       ┌─────────────┐
│  Explore A  │      │             │      │  Architect  │       │             │
│  (parallel) │  →   │   Planner   │  →   │  (parallel) │   →   │   Planner   │
│  Explore B  │      │             │      │  Security   │       │             │
└─────────────┘      └─────────────┘      └─────────────┘       └─────────────┘
   Gather              Create plan         Expert review         Incorporate
   context             (save to plans/)    (save to reports/)    feedback
```

**Phase 1 - Exploration**: Gather context from codebases

```javascript
Task({ description: 'Explore codebase A', prompt: '...' });
Task({ description: 'Explore codebase B', prompt: '...' }); // Parallel
```

**Phase 2 - Planning**: Create initial plan

```javascript
Task({
  description: 'Planner creating plan',
  prompt: '...Save plan to .claude/context/plans/',
});
```

**Phase 3 - Review**: Expert review (parallel for efficiency)

```javascript
Task({
  description: 'Architect reviewing plan',
  prompt:
    'Review .claude/context/plans/ for architectural concerns. Save to .claude/context/reports/architect-review.md',
});
Task({
  description: 'Security reviewing plan',
  prompt:
    'Review .claude/context/plans/ for security concerns. Save to .claude/context/reports/security-review.md',
});
```

**Phase 4 - Consolidation**: Incorporate feedback

```javascript
Task({
  description: 'Consolidating reviews',
  prompt: 'Update plan based on reviews in .claude/context/reports/',
});
```

### Router Detection

The router-enforcer logic (invoked inside `user-prompt-unified.cjs`) automatically detects when multi-agent planning is required using the shared routing table.

```
┌─────────────────────────────────────────────────┐
│ 🔀 ROUTER ANALYSIS                              │
├─────────────────────────────────────────────────┤
│ Intent: integration                             │
│ Complexity: high                                │
│ Recommended agents:                             │
│  1. planner (score: 3)                          │
│  2. security-architect (score: 3)               │
├─────────────────────────────────────────────────┤
│ ⚠️  MULTI-AGENT PLANNING REQUIRED               │
│  → Architect review: REQUIRED                   │
│  → Security review: REQUIRED                    │
│                                                 │
│ Phases: Explore → Plan → Review → Consolidate   │
└─────────────────────────────────────────────────┘
```

**Triggers for multi-agent planning:**

- Keywords: integrate, migration, codebase, external, api, auth, security
- Complexity: 2+ complex keywords detected
- Security: Any auth/security/credential keywords → Security review mandatory

## Directory Structure

### 1. `.claude/agents/`

Contains the "Brains" of the operation. Each file is a System Prompt definition for a spawnable agent.

- **Core** (`core/`): The standard engineering loop
  - `router` - Analyzes intent, spawns agents
  - `planner` - Creates implementation plans
  - `developer` - Writes code with TDD
  - `qa` - Testing and validation
  - `architect` - System design and architecture
  - `pm` - Product management
  - `technical-writer` - Documentation creation

- **Specialized** (`specialized/`): Domain-specific experts
  - `security-architect` - Security review, threat modeling, compliance
  - `devops` - Infrastructure, CI/CD, Kubernetes operations (12 skills)
  - `devops-troubleshooter` - Production debugging, incident diagnosis
  - `incident-responder` - Incident management and runbooks
  - `code-reviewer` - Two-stage code review (spec compliance + quality)
  - `c4-context`, `c4-container`, `c4-component`, `c4-code` - C4 architecture documentation
  - `conductor-validator` - Context-driven development validation
  - `reverse-engineer` - Binary analysis, memory forensics (authorized use only)
  - `database-architect` - Database design, schema optimization

- **Domain** (`domain/`): Language and framework specialists
  - **Language Pros**: `python-pro`, `rust-pro`, `golang-pro`, `typescript-pro`, `fastapi-pro`, `java-pro`, `php-pro`, `nodejs-pro`
  - **Framework Experts**: `nextjs-pro`, `sveltekit-expert`, `frontend-pro`, `graphql-pro`
  - **Mobile/Desktop**: `ios-pro`, `expo-mobile-developer`, `tauri-desktop-developer`, `mobile-ux-reviewer`
  - **Data**: `data-engineer`
  - Custom agents created by `agent-creator` on demand

- **Orchestrators** (`orchestrators/`): Multi-agent coordination
  - `master-orchestrator` - Complex task coordination
  - `swarm-coordinator` - Parallel agent swarm management

**How it works**: The `Router` analyzes the user's intent, selects the appropriate agent, and uses the **Task tool** to spawn it as a subprocess. The spawned agent reads its own definition file and executes the task in isolation.

**Dynamic Discovery**: The Router uses `Glob: .claude/agents/**/*.md` to discover all available agents at runtime. No manual registration required.

### 2. `.claude/skills/`

Contains the "Skills". These are executable capabilities provided to the agents.

Each skill has its own directory with:

- `SKILL.md` - Skill definition with YAML frontmatter
- `scripts/` - Optional executable scripts
- `references/` - Optional reference materials

**Skill Categories** (100+ total skills):

**Foundation Skills** (Core development patterns):

| Skill                            | Purpose                                |
| -------------------------------- | -------------------------------------- |
| `tdd`                            | Test-Driven Development with Iron Laws |
| `debugging`                      | 4-phase systematic debugging           |
| `verification-before-completion` | Gate Function: evidence before claims  |
| `git-expert`                     | Git operations and workflows           |

**Workflow Skills** (Development processes):

| Skill                            | Purpose                                       |
| -------------------------------- | --------------------------------------------- |
| `brainstorming`                  | Socratic design refinement                    |
| `writing-plans`                  | Bite-sized task creation (2-5 min each)       |
| `executing-plans`                | Batch execution with checkpoints              |
| `subagent-driven-development`    | Fresh subagent per task with two-stage review |
| `using-git-worktrees`            | Isolated workspace creation                   |
| `finishing-a-development-branch` | Structured merge/PR completion                |
| `requesting-code-review`         | Dispatch code-reviewer agent                  |
| `receiving-code-review`          | Process review feedback                       |

**Generation Skills** (Content creation):

| Skill               | Purpose                               |
| ------------------- | ------------------------------------- |
| `agent-creator`     | Create new specialized agents         |
| `skill-creator`     | Create skills and convert MCP servers |
| `diagram-generator` | Generate architecture diagrams        |
| `doc-generator`     | Generate documentation                |
| `test-generator`    | Generate test code                    |

**Conductor Skills** (Context-Driven Development):

| Skill                                | Purpose                                  |
| ------------------------------------ | ---------------------------------------- |
| `context-driven-development`         | Project context management               |
| `track-management`                   | Feature/bug/refactor tracks              |
| `workflow-patterns`                  | TDD task implementation patterns         |
| `interactive-requirements-gathering` | A/B/C/D/E questionnaires                 |
| `smart-revert`                       | Git-aware revert for tracks/phases/tasks |

**Kubernetes Operations Skills**:

| Skill                    | Purpose                        |
| ------------------------ | ------------------------------ |
| `k8s-manifest-generator` | Production-ready K8s manifests |
| `helm-chart-scaffolding` | Helm chart creation            |
| `gitops-workflow`        | ArgoCD/Flux GitOps             |
| `k8s-security-policies`  | Pod Security Standards, RBAC   |

**Reverse Engineering Skills** (Authorized Use Only):

| Skill                          | Purpose                      |
| ------------------------------ | ---------------------------- |
| `binary-analysis-patterns`     | x86-64/ARM assembly analysis |
| `memory-forensics`             | Volatility 3 memory analysis |
| `protocol-reverse-engineering` | Network protocol analysis    |

**Advanced Skills**:

| Skill                         | Purpose                               |
| ----------------------------- | ------------------------------------- |
| `dispatching-parallel-agents` | Concurrent agent coordination         |
| `writing-skills`              | TDD for documentation                 |
| `skill-discovery`             | How agents discover and use skills    |
| `project-onboarding`          | Codebase exploration for new projects |
| `thinking-tools`              | Self-reflection checkpoints           |
| `operational-modes`           | Mode-based tool restriction           |
| `summarize-changes`           | Structured change documentation       |
| `session-handoff`             | Prepare context for new conversations |
| `codebase-integration`        | 8-phase integration workflow          |

**How it works**: Agents are assigned skills in their frontmatter. Agents invoke skills using `Skill({ skill: "name" })` tool. Skills are discovered by scanning `.claude/skills/`.

### 3. `.claude/tools/`

Contains the "Tools". Executable Node.js scripts for agent operations.

**Core Tools:**

- `agent-creator/` - Tools for creating and spawning agents
  - `create-agent.mjs` - Create new agent definitions
  - `spawn-agent.mjs` - Spawn agents in new terminals
- `diagram-generator/` - Mermaid diagram generation
- `test-generator/` - Test code generation
- `project-analyzer/` - Codebase analysis

**Companion Tools (Auto-Generated):**

When skills are complex enough (hooks, schemas, multiple dependencies), the `skill-creator` automatically generates a companion CLI tool:

```
.claude/tools/<skill-name>/
├── <skill-name>.cjs   # CLI wrapper script
└── README.md          # Tool documentation
```

Complexity is detected when a skill has 2+ of:

- Pre/post execution hooks
- Input/output schemas
- 6+ tools specified
- Command-line arguments
- Complex keywords in description (orchestration, pipeline, workflow, etc.)

### 4. `.claude/hooks/`

Contains the "Guardrails". Node.js scripts that run _automatically_ at specific lifecycle events.

**Hook Events:**

| Event              | When                      | Purpose                            |
| ------------------ | ------------------------- | ---------------------------------- |
| `UserPromptSubmit` | Before model sees message | Route enforcement, intent analysis |
| `PreToolUse`       | Before tool execution     | Safety checks (TDD, security)      |

**Hook Implementation:**

Hooks receive input from Claude Code via `process.argv[2]` as JSON:

```javascript
// Parse hook input from Claude Code
function parseHookInput() {
  try {
    if (process.argv[2]) {
      return JSON.parse(process.argv[2]);
    }
  } catch (e) {}
  return null;
}
```

**Active Hooks:**

- `routing/user-prompt-unified.cjs` - Runs router-enforcer logic using `lib/routing/routing-table.cjs`
- `safety/tdd-check.cjs` - Enforces TDD by checking for test files before code edits

**Hook Configuration** (in `settings.json`):

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [{ "command": "node .claude/hooks/routing/user-prompt-unified.cjs" }]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Edit|Write|NotebookEdit",
        "hooks": [{ "command": "node .claude/hooks/safety/tdd-check.cjs" }]
      }
    ]
  }
}
```

**TDD Enforcement Modes:**

Set `TDD_ENFORCEMENT` environment variable:

| Mode    | Behavior                                     |
| ------- | -------------------------------------------- |
| `warn`  | Show warning, allow operation (default)      |
| `block` | Block edits to production code without tests |
| `off`   | Disable TDD checking                         |

### 5. `.claude/context/`

Contains the "Memory". Persistent storage across sessions.

```
context/
├── memory/
│   ├── learnings.md      # Patterns, solutions, preferences
│   ├── decisions.md      # Architecture Decision Records (ADRs)
│   ├── issues.md         # Known issues and blockers
│   └── active_context.md # Scratchpad for ongoing work
├── reports/              # Generated reports (analysis, audits)
├── artifacts/            # Generated artifacts (diagrams, exports)
├── runtime/              # Runtime state and process tracking
├── plans/                # Implementation plans and proposals
├── sessions/             # Session logs and conversation state
└── tmp/                  # Temporary files (auto-cleaned)
```

**Memory Protocol**: All agents MUST read memory before starting and write findings after completing work.

### 6. `.claude/schemas/`

JSON schemas for validation:

- `agent-definition.schema.json` - Agent file validation
- `skill-manifest.schema.json` - Skill definition validation

### 7. `.claude/workflows/`

Contains workflow definitions organized by category:

```
workflows/
├── enterprise/                    # Complex multi-step operations
│   ├── feature-development-workflow.md   # 12-step end-to-end feature development
│   ├── c4-architecture-workflow.md       # C4 model architecture documentation
│   ├── full-stack.yaml                   # Plan → Architect → Implement → Test
│   └── code-review.yaml                  # Comprehensive code review
├── rapid/                         # Quick, focused tasks
│   └── fix.yaml                          # Rapid bug fix workflow
└── operations/                    # Operational procedures
    └── incident-response.md              # Incident response runbook
```

**Enterprise Workflows**:

| Workflow                          | Purpose                                                         | Agents Used                                                   |
| --------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------- |
| `feature-development-workflow.md` | End-to-end feature from requirements to production              | planner, architect, developer, qa, security-architect, devops |
| `c4-architecture-workflow.md`     | C4 model documentation (context → container → component → code) | c4-context, c4-container, c4-component, c4-code               |

Auto-generated workflows from skill/agent creation:

- `<agent-name>-workflow.md` - Created by `agent-creator`
- `<skill-name>-skill-workflow.md` - Created by `skill-creator`

### 8. `config.yaml` & `settings.json`

- `config.yaml`: High-level behavior (token limits, routing complexity).
- `settings.json`: Low-level wiring for Hooks and MCP servers.

## Self-Evolution Architecture

The framework can evolve itself by creating new agents and skills on demand.

### Agent Evolution Flow

```
User Request → Router → No Match? → agent-creator → New Agent → Execute
```

1. User makes specialized request (e.g., "UX review of iOS app")
2. Router checks existing agents - no match found
3. Router routes to `agent-creator` skill
4. Agent-creator:
   - Researches the domain via WebSearch
   - Auto-detects relevant skills from existing skills
   - Creates agent definition in `.claude/agents/domain/`
   - Runs `pnpm format` on new file
5. New agent executes the original task

### Skill Evolution Flow

```
User Request → Router → Need Capability? → skill-creator → New Skill (+Tool?) → Auto-Assign
```

1. User requests new capability (e.g., "Add Slack MCP server")
2. Router detects need for new skill/tool
3. Router routes to `skill-creator` skill
4. Skill-creator:
   - Creates new skill OR converts MCP server
   - Generates executor scripts in `scripts/`
   - Creates workflow example in `.claude/workflows/`
   - Updates memory in `.claude/context/memory/learnings.md`
   - **Auto-creates companion CLI tool** if skill is complex
   - **Auto-assigns to relevant agents** based on keyword matching
   - Runs `pnpm format` on all new files
5. Agents are updated with new skill in frontmatter

### Skill-Agent Auto-Association

The framework automatically maintains skill-agent relationships:

**Agent-Skill Relevance Matrix:**

| Skill Keywords                | Auto-Assigned To                 |
| ----------------------------- | -------------------------------- |
| test, tdd, coverage           | developer, qa                    |
| debug, troubleshoot           | developer, devops-troubleshooter |
| doc, diagram                  | planner, architect               |
| security, audit, auth         | security-architect               |
| docker, k8s, terraform, cloud | devops                           |
| git, github                   | developer                        |
| plan, sequential, thinking    | planner                          |
| incident, alert, slack        | incident-responder               |

**What Gets Updated:**

When skills are added/removed from agents, both locations are updated:

1. **Frontmatter** - The `skills:` array in agent definition
2. **Workflow** - The "Step 0: Load Skills" section with skill paths

```markdown
## Workflow

### Step 0: Load Skills (FIRST)

Read your assigned skill files:

- `.claude/skills/tdd/SKILL.md`
- `.claude/skills/debugging/SKILL.md`
```

**Skill Merge Updates:**

When skills are merged with `--auto-update`:

- Agent frontmatter: `- old-skill` → `- merged-skill`
- Workflow paths: `.claude/skills/old-skill/SKILL.md` → `.claude/skills/merged-skill/SKILL.md`

**Companion Tool Auto-Creation:**

Complex skills automatically get a CLI tool wrapper in `.claude/tools/<skill-name>/`:

```bash
# Force tool creation
node .claude/skills/skill-creator/scripts/create.cjs \
  --name "my-skill" --description "..." --create-tool

# Skip tool even if complex
node .claude/skills/skill-creator/scripts/create.cjs \
  --name "my-skill" --description "..." --hooks --schemas --no-tool
```

### Dynamic Discovery

Both agents and skills are discovered at runtime:

- **Agents**: `Glob: .claude/agents/**/*.md`
- **Skills**: Scan `.claude/skills/` for `SKILL.md` files

No manual registration in the Router required.

## Framework Validation

### Doctor Tool

The `doctor.mjs` tool validates framework health:

```bash
# Run all checks
node .claude/tools/doctor.mjs

# Attempt to fix issues (creates missing directories)
node .claude/tools/doctor.mjs --fix

# Verbose output
node .claude/tools/doctor.mjs --verbose
```

**Checks Performed:**

| Check          | Description                                    |
| -------------- | ---------------------------------------------- |
| Required Dirs  | All framework directories exist                |
| Required Files | CLAUDE.md, settings.json, config.yaml exist    |
| Agents         | Agent files have valid frontmatter             |
| Skills         | Skills have SKILL.md with proper structure     |
| Hooks          | Hook scripts referenced in settings.json exist |
| MCP Config     | .mcp.json is valid, version pins recommended   |
| Doc/Path Drift | Paths referenced in docs still exist           |

### Skill Validation

The skill validator checks all skills:

```bash
node .claude/skills/skill-creator/scripts/validate-all.cjs
```

**Validation Rules:**

- Required: `SKILL.md` with `name` and `description` frontmatter
- Optional: `scripts/`, `hooks/`, `schemas/` directories
- Scripts are syntax-checked with `node --check`
- Schemas validated for `$schema` and `type` fields
