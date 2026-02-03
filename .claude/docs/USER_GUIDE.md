# User Guide

## Getting Started

### 1. The "True Agent" Session

To start the framework, run:

```bash
claude
```

The **Bootloader** (`CLAUDE.md`) immediately activates. You should see the `[ROUTER]` persona take over.

**Router-First Protocol:**

The Router is the entry point for ALL user interactions. It:

1. **Checks TaskList()** first to see pending work
2. **Analyzes** your request (intent, complexity, domain, risk)
3. **Selects** the best agent(s) for the job
4. **Spawns** agents via the Task tool as true subprocesses

**Important:** The framework uses actual subagent spawning via the Task tool, not persona-switching. Each spawned agent runs in isolation with its own context.

### 2. Interacting with Agents

You don't need to manually pick agents. Just describe your task naturally:

- **"I want to build a new dashboard."**
  - Router -> **Planner** (Generates architecture)
  - Planner -> **Architect** (Selects stack)
  - Architect -> **Developer** (Writes code)

- **"Fix the bug in the login page."**
  - Router -> **Developer**
  - Developer -> **QA** (Verifies fix)

### 3. Using Specialized Workflows

- **Incident Response**: "Production is down!" triggers the `Incident Responder`.
- **Security Audit**: "Check this file for vulnerabilities" triggers the `Security Architect`.
- **DevOps Tasks**: "Set up CI/CD pipeline" triggers the `DevOps` agent.
- **C4 Architecture**: "Document the system architecture using C4 model" triggers the C4 agents.
- **Kubernetes**: "Create Kubernetes manifests for this app" triggers the `DevOps` agent with K8s skills.
- **Language Expert**: "I need help with Rust async patterns" triggers `rust-pro` agent.
- **Feature Development**: "Build a new payment feature end-to-end" triggers the full feature development workflow.

### 4. Multi-Agent Planning (Complex Tasks)

For complex tasks, the framework automatically orchestrates multiple agents to ensure robust planning:

**Example**: "Review this external codebase and plan how to integrate it"

The Router detects this requires multi-agent planning:

```
[ROUTER] 🔍 Analyzing Request...
- Intent: Codebase integration
- Complexity: High
- Risk Level: HIGH (external code)

⚠️ MULTI-AGENT PLANNING REQUIRED
  → Architect review: REQUIRED
  → Security review: REQUIRED

Phases: Explore → Plan → Review → Consolidate
```

**What happens:**

1. **Explore Phase**: Explore agents gather context from both codebases (parallel)
2. **Plan Phase**: Planner creates initial integration plan
3. **Review Phase**: Architect AND Security Architect review the plan (parallel)
4. **Consolidate Phase**: Planner incorporates feedback into final plan

**Tasks that trigger multi-agent planning:**

- New features
- External integrations
- Authentication/authorization changes
- Database migrations
- Architecture changes
- Codebase reviews and audits

This ensures no single agent makes critical decisions alone.

### 5. Self-Evolution: Creating Specialists

The framework creates new agents automatically when needed:

- **"I need a UX review of my iOS app"**
  - Router detects no UX agent exists
  - Routes to `agent-creator`
  - Creates `ios-ux-reviewer` agent in `.claude/agents/domain/`
  - New agent performs the UX review

- **"Analyze this dataset and predict sales"**
  - Router detects no data science agent
  - Creates `data-scientist` agent with relevant skills
  - New agent performs the analysis

### 5. Adding New Capabilities

Request new tools or MCP server integrations:

- **"Add the Slack MCP server so I can send messages"**
  - Router routes to `skill-creator`
  - Converts MCP server to skill
  - **Auto-assigns to relevant agents** (e.g., incident-responder)

- **"Create a skill for PDF extraction"**
  - Skill-creator creates new skill
  - **Auto-assigns to matching agents** based on skill keywords
  - Agents automatically get skill loading in their workflow

### 6. Skill-Agent Auto-Association

The framework automatically manages skill-agent relationships:

**When creating a new skill:**

```
Creating skill: tdd-advanced
✅ Created .claude/skills/tdd-advanced/SKILL.md

🔍 Auto-assigning skill to relevant agents...
   Found 2 relevant agent(s): developer, qa
   ✅ Assigned to developer
   ✅ Assigned to qa
```

**When creating a new agent:**

```
Creating agent: api-specialist
🔍 Searching for matching skills...
✨ Auto-detected 3 relevant skills:
   - test-generator
   - doc-generator
   - github-ops
✅ Agent created with skills and workflow skill loading
```

**When updating an agent's skills:**

- Frontmatter `skills:` list is updated
- Workflow "Step 0: Load Skills" section is updated with correct paths
- Both locations stay in sync automatically

**When merging skills:**

- Old skill references in agents are replaced with new merged skill
- Workflow skill paths are updated automatically
- Use `--auto-update` flag to apply changes immediately

### 7. Managing Context & Memory

The framework maintains persistent memory across sessions.

**Memory Files:**

| File                | Purpose                          |
| ------------------- | -------------------------------- |
| `learnings.md`      | Patterns, solutions, preferences |
| `decisions.md`      | Architecture Decision Records    |
| `issues.md`         | Known issues and blockers        |
| `active_context.md` | Scratchpad for ongoing work      |

**Context Directories:**

| Directory    | Purpose                              |
| ------------ | ------------------------------------ |
| `memory/`    | Persistent memory files              |
| `reports/`   | Generated reports and analysis       |
| `artifacts/` | Generated artifacts (diagrams, etc.) |
| `runtime/`   | Runtime state and process tracking   |
| `plans/`     | Implementation plans and proposals   |
| `sessions/`  | Session logs and conversation state  |
| `tmp/`       | Temporary files (auto-cleaned)       |

**Usage:**

- **Save a decision**: "Record this architecture decision to memory."
- **Recall context**: "What did we decide about the database schema?"
- **Check issues**: "What are the known issues?"

All agents automatically read memory before starting and write findings after completing work.

### 8. Using Skills

Skills provide specialized capabilities. Invoke skills using the `Skill()` tool:

```javascript
// Agents invoke skills with the Skill tool
Skill({ skill: 'tdd' });
Skill({ skill: 'debugging' });
Skill({ skill: 'diagram-generator' });
```

**Important:** Reading skill files alone does not apply them. Agents must use the `Skill()` tool to load AND apply skill instructions.

**Common Skills:**

| Skill                            | Purpose                          | Invoke With                                          |
| -------------------------------- | -------------------------------- | ---------------------------------------------------- |
| `tdd`                            | Test-Driven Development workflow | `Skill({ skill: "tdd" })`                            |
| `debugging`                      | 4-phase systematic debugging     | `Skill({ skill: "debugging" })`                      |
| `verification-before-completion` | Evidence-based completion        | `Skill({ skill: "verification-before-completion" })` |
| `diagram-generator`              | Generate architecture diagrams   | `Skill({ skill: "diagram-generator" })`              |
| `doc-generator`                  | Generate documentation           | `Skill({ skill: "doc-generator" })`                  |
| `k8s-manifest-generator`         | Kubernetes manifests             | `Skill({ skill: "k8s-manifest-generator" })`         |
| `helm-chart-scaffolding`         | Helm charts                      | `Skill({ skill: "helm-chart-scaffolding" })`         |
| `gitops-workflow`                | GitOps setup                     | `Skill({ skill: "gitops-workflow" })`                |
| `brainstorming`                  | Socratic design refinement       | `Skill({ skill: "brainstorming" })`                  |
| `writing-plans`                  | Create bite-sized tasks          | `Skill({ skill: "writing-plans" })`                  |
| `executing-plans`                | Execute plans in batches         | `Skill({ skill: "executing-plans" })`                |

### 9. Language-Specific Expertise

The framework includes domain agents for deep language and framework expertise.

**Language Pro Agents:**

| Agent            | Expertise                                             | Trigger                              |
| ---------------- | ----------------------------------------------------- | ------------------------------------ |
| `python-pro`     | Python 3.12+, async, FastAPI, Django, data science    | "Python", "async", "FastAPI"         |
| `rust-pro`       | Rust 1.75+, tokio, memory safety, systems programming | "Rust", "tokio", "memory safety"     |
| `golang-pro`     | Go 1.21+, generics, concurrency, cloud-native         | "Go", "golang", "goroutines"         |
| `typescript-pro` | Advanced types, strict mode, enterprise patterns      | "TypeScript", "strict mode", "types" |
| `fastapi-pro`    | FastAPI 0.100+, async SQLAlchemy, microservices       | "FastAPI", "SQLAlchemy", "async"     |
| `java-pro`       | Java/Spring Boot, enterprise Java                     | "Java", "Spring Boot"                |
| `php-pro`        | PHP/Laravel, web applications                         | "PHP", "Laravel"                     |
| `nodejs-pro`     | Node.js/Express/NestJS, backend                       | "Node.js", "Express", "NestJS"       |

**Framework Experts:**

| Agent              | Expertise                              | Trigger                    |
| ------------------ | -------------------------------------- | -------------------------- |
| `nextjs-pro`       | Next.js App Router, server components  | "Next.js", "App Router"    |
| `sveltekit-expert` | SvelteKit/Svelte 5, reactive UI        | "SvelteKit", "Svelte"      |
| `frontend-pro`     | React, Vue, Angular, frontend patterns | "React", "Vue", "frontend" |
| `graphql-pro`      | GraphQL APIs, schema design            | "GraphQL", "schema"        |

**Mobile/Desktop Experts:**

| Agent                     | Expertise                         | Trigger                      |
| ------------------------- | --------------------------------- | ---------------------------- |
| `ios-pro`                 | iOS/Swift, UIKit, SwiftUI         | "iOS", "Swift", "SwiftUI"    |
| `expo-mobile-developer`   | Expo/React Native, cross-platform | "Expo", "React Native"       |
| `tauri-desktop-developer` | Tauri desktop apps, Rust+Web      | "Tauri", "desktop app"       |
| `mobile-ux-reviewer`      | Mobile UX review, accessibility   | "mobile UX", "accessibility" |

**Data & Product:**

| Agent           | Expertise                          | Trigger                               |
| --------------- | ---------------------------------- | ------------------------------------- |
| `data-engineer` | Data engineering, ETL, pipelines   | "ETL", "data pipeline", "engineering" |
| `pm`            | Product management, roadmaps, PRDs | "product", "roadmap", "requirements"  |

**Usage**: Just mention the language or framework:

- "Help me optimize this Python async code" → `python-pro`
- "Review my Rust error handling" → `rust-pro`
- "Design a Next.js app with server components" → `nextjs-pro`
- "Create a React Native mobile app" → `expo-mobile-developer`

### 10. C4 Architecture Documentation

Generate comprehensive architecture documentation using the C4 model:

```
"Document this codebase using C4 architecture diagrams"
```

**The C4 workflow uses 4 specialized agents:**

1. `c4-context` - System context (users, external systems)
2. `c4-container` - Container diagram (applications, databases)
3. `c4-component` - Component diagram (modules, services)
4. `c4-code` - Code-level documentation (classes, functions)

Output is saved to `.claude/context/artifacts/`.

### 11. Kubernetes Operations

The DevOps agent includes comprehensive Kubernetes skills:

```bash
# Create production-ready manifests
"Generate Kubernetes deployment for my Python app"

# Scaffold Helm charts
"Create a Helm chart for this microservice"

# Implement GitOps
"Set up ArgoCD for this repository"

# Security policies
"Add Pod Security Standards to my cluster"
```

### 12. Context-Driven Development (Conductor)

The framework supports Context-Driven Development (CDD) methodology:

**CDD Skills:**

- `context-driven-development` - Project context management
- `track-management` - Feature/bug/refactor tracks
- `workflow-patterns` - TDD task implementation patterns
- `interactive-requirements-gathering` - A/B/C/D/E questionnaires
- `smart-revert` - Git-aware revert for tracks/phases/tasks

**Conductor Workflow:**

```bash
# Set up CDD project
"Initialize this project with Conductor methodology"
```

The workflow:

1. **Project Discovery** - Analyze existing codebase
2. **Product Definition** - Interactive requirements gathering
3. **Tech Stack Configuration** - Document technology choices
4. **Workflow Setup** - Define development workflows
5. **Track Generation** - Create initial feature tracks
6. **Finalization** - Generate context artifacts

**Context Artifacts** (created in `.claude/context/`):

- `product.md` - Product vision and goals
- `product-guidelines.md` - Product rules and constraints
- `tech-stack.md` - Technology stack documentation
- `workflow.md` - Development workflow patterns
- `tracks.md` - Track registry

**Track Structure** (`.claude/context/tracks/{track-id}/`):

- `spec.md` - Feature specification
- `plan.md` - Implementation plan with tasks
- `metadata.json` - Track metadata (status, dates, commits)

### 13. Superpowers Integration

The framework includes patterns from the Superpowers methodology:

**Foundation Skills:**

- `tdd` - Enhanced with Iron Laws, rationalization tables, red flags
- `debugging` - 4-phase systematic debugging (Root Cause → Pattern → Hypothesis → Implementation)
- `verification-before-completion` - Gate Function: evidence before claims

**Workflow Skills:**

- `brainstorming` - Socratic design refinement
- `writing-plans` - Bite-sized tasks (2-5 min each) with complete code
- `executing-plans` - Batch execution with review checkpoints
- `subagent-driven-development` - Fresh subagent per task with two-stage review

**Git Workflow:**

- `using-git-worktrees` - Isolated workspace creation
- `finishing-a-development-branch` - Structured merge/PR completion

**Advanced Skills:**

- `dispatching-parallel-agents` - Concurrent investigation
- `writing-skills` - TDD for documentation
- `skill-discovery` - How agents discover and use skills

**Code Review:**

- `code-reviewer` agent - Two-stage review (spec compliance THEN code quality)
- `requesting-code-review` skill - Dispatch reviewer
- `receiving-code-review` skill - Process feedback with technical pushback

**Key Patterns:**

- **Iron Laws** - Inviolable rules (e.g., "NO CODE WITHOUT TEST FIRST")
- **Rationalization Tables** - Pre-emptive excuse countering
- **Red Flags Lists** - Self-check triggers that force STOP
- **Gate Functions** - Evidence required before claims
- **Two-Stage Review** - Spec compliance must pass before quality review

**Usage:**

```bash
# Test-driven development
Skill({ skill: "tdd" });

# Systematic debugging
Skill({ skill: "debugging" });

# Plan before implementing
Skill({ skill: "brainstorming" });
Skill({ skill: "writing-plans" });

# Verify before claiming completion
Skill({ skill: "verification-before-completion" });
```

## Command Reference

### Framework Validation

```bash
# Check framework health (recommended first step)
node .claude/tools/doctor.mjs

# Fix missing directories automatically
node .claude/tools/doctor.mjs --fix

# Verbose output showing all checks
node .claude/tools/doctor.mjs --verbose

# Validate all agents
node .claude/tools/validate-agents.mjs

# Validate all skills
node .claude/skills/skill-creator/scripts/validate-all.cjs
```

### Agent Creation

```bash
# Create a new agent manually
node .claude/tools/agent-creator/create-agent.mjs \
  --name "my-agent" \
  --description "What this agent does"

# List existing agents
node .claude/tools/agent-creator/create-agent.mjs --list

# Validate an agent definition
node .claude/tools/agent-creator/create-agent.mjs --validate ".claude/agents/domain/my-agent.md"
```

### Skill Creation

```bash
# Create a new skill (auto-assigns to relevant agents)
node .claude/skills/skill-creator/scripts/create.cjs \
  --name "my-skill" \
  --description "What this skill does"

# Convert MCP server to skill
node .claude/skills/skill-creator/scripts/convert.cjs \
  --server "@modelcontextprotocol/server-github"

# List known MCP servers
node .claude/skills/skill-creator/scripts/convert.cjs --list

# Manually assign skill to agent
node .claude/skills/skill-creator/scripts/create.cjs \
  --assign "my-skill" --agent "developer"

# Create skill without auto-assignment
node .claude/skills/skill-creator/scripts/create.cjs \
  --name "my-skill" --description "..." --no-auto-assign
```

### Skill-Agent Management

```bash
# Add skills to an existing agent (updates frontmatter + workflow)
node .claude/tools/agent-creator/create-agent.mjs \
  --update "developer" --add-skills "new-skill,another-skill"

# Remove skills from an agent
node .claude/tools/agent-creator/create-agent.mjs \
  --update "developer" --remove-skills "old-skill"

# Merge two skills into one (with auto-update of agents)
node .claude/skills/skill-creator/scripts/create.cjs \
  --merge "skill-a" "skill-b" --as "merged-skill" --auto-update
```

## TDD Enforcement

The framework enforces Test-Driven Development via a hook. Configure the enforcement level:

```bash
# Default: Show warning but allow edits
claude

# Strict: Block edits to files without tests
TDD_ENFORCEMENT=block claude

# Disabled: No TDD checking
TDD_ENFORCEMENT=off claude
```

## Troubleshooting

### Framework Health Check

Run the doctor first to identify issues:

```bash
node .claude/tools/doctor.mjs --verbose
```

This checks:

- Required directories exist
- Required files (CLAUDE.md, settings.json, config.yaml) exist
- Agents have valid frontmatter
- Skills have proper structure
- Hooks reference existing scripts
- MCP configuration is valid

### Common Issues

- **"Agents aren't using their skills"**:
  - Agents must use `Skill({ skill: "name" })` tool to invoke skills
  - Reading skill files alone does not apply them
  - Check the spawn prompt tells agent to use `Skill()` tool
  - Verify skill paths: `.claude/skills/<skill-name>/SKILL.md`
  - The Router should read agent frontmatter and include skill invocation in prompts
  - See CLAUDE.md Section 7 (Skill Invocation Protocol)

- **"The hooks aren't firing"**:
  - Check `settings.json` has correct format with `matcher` and `hooks` array
  - Ensure hook files use `.cjs` extension
- Test hook directly: `node .claude/hooks/routing/router-enforcer.cjs '{"prompt":"test"}'` (uses `.claude/lib/routing/routing-table.cjs`)

- **"Agents aren't switching"**: Remind the model: "Read the agent profile for [Agent Name]."

- **"Missing skills"**: Ensure the skill directory exists in `.claude/skills/` with a `SKILL.md` file.

- **"Memory not persisting"**: Check that `.claude/context/memory/` directory exists with the memory files.

- **"New agent not found"**: The Router discovers agents dynamically. Ensure the agent file is in `.claude/agents/` with proper YAML frontmatter.

- **"TDD hook blocking edits"**:
  - Create a test file first (e.g., `myfile.test.js` for `myfile.js`)
  - Or set `TDD_ENFORCEMENT=off` to disable checking
  - Or set `TDD_ENFORCEMENT=warn` (default) to see warnings without blocking

- **"Doctor reports errors"**: Run `node .claude/tools/doctor.mjs --fix` to auto-create missing directories.

- **"Language pro agent not matching"**: The Router may not detect language-specific requests. Try being explicit: "Use the rust-pro agent to review this code."

- **"C4 diagrams not generating"**: Ensure Mermaid or Graphviz is available. The C4 agents generate diagram code that needs rendering.

- **"Kubernetes skills not loading"**: Verify the DevOps agent has the K8s skills in its frontmatter. Check with: `node .claude/tools/validate-agents.mjs`

## Best Practices

1. **Let the Router decide**: Don't manually specify agents unless necessary.
2. **Use memory**: Record important decisions and learnings for future sessions.
3. **Trust self-evolution**: Let the framework create specialized agents when needed.
4. **Write tests first**: The TDD hook encourages test-first development.
5. **Run doctor regularly**: Check framework health with `node .claude/tools/doctor.mjs`.
6. **Validate after changes**: Run validators after modifying agents or skills.

## Environment Variables

| Variable          | Purpose                        | Values                 |
| ----------------- | ------------------------------ | ---------------------- |
| `TDD_ENFORCEMENT` | TDD hook behavior              | `warn`, `block`, `off` |
| `VERBOSE`         | Enable verbose output in hooks | `1` or unset           |
| `DEBUG`           | Enable debug logging           | `1` or unset           |
