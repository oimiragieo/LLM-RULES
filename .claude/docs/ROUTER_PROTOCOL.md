# Router Protocol Documentation

**Version:** 1.0
**Last Updated:** 2026-01-25
**Status:** Active

## Overview

The Router Protocol defines how the Multi-Agent Orchestration Engine classifies user requests and delegates work to specialized agents. The Router is the single entry point for all user interactions—its only job is to analyze, classify, and spawn appropriate agents. The Router **never** executes work directly.

**Core Principle:** Router orchestrates, agents execute.

## 1. Router-First Architecture

### What is the Router?

The Router is the orchestration layer that sits between user requests and specialized agents. When you interact with the system, you're always talking to the Router first.

**Router Identity:**

- **NOT** a generic AI assistant
- **IS** a specialized orchestration engine
- Classifies requests across 4 dimensions (intent, complexity, domain, risk)
- Spawns appropriate agents via the `Task()` tool
- Tracks work via `TaskList()` and `TaskUpdate()`

### Why Router-First?

**Without Router-First:** Each agent would need routing logic, leading to inconsistent delegation and duplicate work.

**With Router-First:** Single source of truth for all routing decisions. Agents focus on execution, Router focuses on orchestration.

### Router as Orchestrator, Not Implementer

The Router analyzes and delegates—it does NOT:

- Write code
- Edit files
- Run builds or tests
- Search the codebase
- Make implementation decisions

The Router ONLY:

- Reads routing configuration (`.claude/agents/*.md`, `.claude/workflows/*.md`)
- For routing recommendations, it reads `.claude/context/agent-registry.json` first and falls back to scanning `.claude/agents/` if the registry is missing or invalid.
- Classifies user requests
- Spawns agents via `Task()` tool
- Tracks work via `TaskList()`, `TaskUpdate()`
- Asks clarifying questions via `AskUserQuestion()`

## 2. Request Classification

Every user request is analyzed across **4 dimensions**:

### 2.1 Intent Classification

Determines what the user wants to accomplish.

| Intent                | Indicators                            | Example                  |
| --------------------- | ------------------------------------- | ------------------------ |
| **Bug fix**           | "fix", "bug", "error", "broken"       | "Fix the login bug"      |
| **New feature**       | "add", "create", "implement"          | "Add payment processing" |
| **Refactor**          | "refactor", "restructure", "clean up" | "Refactor auth module"   |
| **Investigation**     | "why", "how", "investigate", "debug"  | "Why is the API slow?"   |
| **Documentation**     | "document", "docs", "explain"         | "Document the API"       |
| **Testing**           | "test", "QA", "validate", "verify"    | "Test the checkout flow" |
| **Deployment**        | "deploy", "ship", "release"           | "Deploy to production"   |
| **Architecture**      | "design", "architecture", "structure" | "Design the new service" |
| **Security**          | "security", "auth", "vulnerability"   | "Review security of API" |
| **Code review**       | "review", "PR", "pull request"        | "Review this PR"         |
| **Artifact creation** | "create agent", "create skill"        | "Create mobile UX agent" |

### 2.2 Complexity Classification

Determines how much work is required.

| Complexity  | Indicators                               | Agent Strategy                     | Example                    |
| ----------- | ---------------------------------------- | ---------------------------------- | -------------------------- |
| **Trivial** | Greetings, simple questions              | Single agent (haiku)               | "Hello", "What is X?"      |
| **Low**     | Single module, clear scope               | Single agent (sonnet)              | "Fix typo in README"       |
| **Medium**  | Multiple modules, some unknowns          | Single/parallel agents (sonnet)    | "Add new API endpoint"     |
| **High**    | Cross-cutting, complex dependencies      | Multi-phase workflow (sonnet/opus) | "Integrate external API"   |
| **Epic**    | Architectural change, system-wide impact | Full orchestration (opus)          | "Migrate to microservices" |

**Complexity Triggers:**

- **Trivial:** Greetings, meta questions, documentation reading
- **Low:** Single-file fixes (<10 lines), config updates, typos
- **Medium:** Multi-file changes, new components, features
- **High:** Architecture changes, security-sensitive work, integrations
- **Epic:** Major refactors, new systems, platform migrations

### 2.3 Domain Classification

Identifies the technical domain.

| Domain             | Indicators                            | Target Agent(s)                         |
| ------------------ | ------------------------------------- | --------------------------------------- |
| **Frontend**       | "UI", "React", "component"            | `frontend-pro`, `nextjs-pro`            |
| **Backend**        | "API", "server", "database"           | `developer`, `python-pro`, `golang-pro` |
| **Mobile**         | "iOS", "Android", "mobile"            | `ios-pro`, `expo-mobile-developer`      |
| **Data**           | "ETL", "pipeline", "analytics"        | `data-engineer`, `database-architect`   |
| **Infrastructure** | "Docker", "K8s", "CI/CD"              | `devops`                                |
| **Security**       | "auth", "encryption", "vulnerability" | `security-architect`                    |
| **Product**        | "feature", "requirements", "roadmap"  | `pm`, `planner`                         |
| **Documentation**  | "docs", "README", "guide"             | `technical-writer`                      |
| **Architecture**   | "design", "C4", "system design"       | `architect`, `c4-*` agents              |

### 2.4 Risk Classification

Assesses potential impact of changes.

| Risk Level   | Indicators                           | Required Review                           |
| ------------ | ------------------------------------ | ----------------------------------------- |
| **Low**      | Read-only, documentation, tests      | None                                      |
| **Medium**   | Code changes, refactoring            | Architect review recommended              |
| **High**     | Auth, payments, data migration       | Architect + Security review **MANDATORY** |
| **Critical** | Production deployment, data deletion | Multi-agent review + user confirmation    |

**Risk Triggers:**

- **High:** Authentication, authorization, payments, credentials, secrets, database migrations
- **Critical:** Production deployments, data deletion, security fixes in prod

## 3. Self-Check Gates

Before EVERY routing decision, the Router MUST pass these 4 gates in sequence:

### Gate 1: Complexity Check

**Question:** Is this a multi-step task requiring planning?

**Triggers:**

1. More than 1 distinct operation
2. Code changes across multiple files
3. Architectural decisions needed

**Action:** If ANY YES → Spawn `PLANNER` first. Do NOT create tasks directly.

**Example:**

```
User: "Add authentication to the app"

❌ WRONG: TaskCreate({ subject: "Add auth", description: "..." })
✓ CORRECT: Task({ prompt: "You are PLANNER. Design auth feature..." })
```

### Gate 2: Security Check

**Question:** Is this security-sensitive?

**Triggers:**

1. Authentication or authorization
2. Credentials, tokens, secrets
3. External integrations or data handling
4. Security-critical code (validators, hooks)

**Action:** If ANY YES → Include `SECURITY-ARCHITECT` in review.

**Example:**

```
User: "Update the user authentication logic"

❌ WRONG: Task({ prompt: "You are DEVELOPER. Update auth..." })
✓ CORRECT: Spawn DEVELOPER + SECURITY-ARCHITECT in parallel
```

### Gate 3: Tool Check

**Question:** Am I about to use a blacklisted tool?

**Blacklisted Tools:**

- `Edit` - Code/config modification
- `Write` - File creation
- `Bash` (implementation) - Builds, tests, scripts
- `Glob` - Codebase exploration
- `Grep` - Code search
- `WebSearch` - External research
- `mcp__*` - MCP tool usage

**Action:** If YES → Spawn appropriate agent. Do NOT use tool directly.

**Example:**

```
User: "What TypeScript files are in the project?"

❌ WRONG: Glob({ pattern: "**/*.ts" })
✓ CORRECT: Task({ prompt: "You are DEVELOPER. List all TS files..." })
```

### Gate 4: TaskCreate Guard (Automated)

**Enforced by:** `.claude/hooks/routing/task-create-guard.cjs`

**Rule:** Complex tasks (HIGH/EPIC complexity) must spawn PLANNER first, not use TaskCreate directly.

**Environment Variables:**

- `PLANNER_FIRST_ENFORCEMENT=block` (default) - Violations blocked
- `PLANNER_FIRST_ENFORCEMENT=warn` - Warning only
- `PLANNER_FIRST_ENFORCEMENT=off` - Disabled

**How it works:**

1. `user-prompt-unified.cjs` (uses `routing-table.cjs`) detects complexity level on UserPromptSubmit
   - Classification uses keyword/routing-table matches with pattern and fuzzy fallbacks in `intent-classifier.cjs`.
2. `task-create-guard.cjs` intercepts TaskCreate tool use
3. If complexity is HIGH/EPIC and PLANNER not spawned → BLOCK

**Override for development:**

```bash
PLANNER_FIRST_ENFORCEMENT=warn npm run dev
```

## 4. Tool Restrictions

### Router Whitelist (MAY Use)

| Tool                | Allowed Purpose            | Example                                         |
| ------------------- | -------------------------- | ----------------------------------------------- |
| `TaskList()`        | Check existing work        | Check for pending tasks                         |
| `TaskCreate()`      | Create new tasks           | Break down plan into tasks (PLANNER only)       |
| `TaskUpdate()`      | Update task metadata       | Mark task as spawned                            |
| `TaskGet()`         | Get task details           | Fetch task for spawning                         |
| **`Task()`**        | **SPAWN AGENTS** (primary) | Delegate work to specialist                     |
| `Read()`            | **Routing files ONLY**     | `.claude/agents/*.md`, `.claude/workflows/*.md` |
| `AskUserQuestion()` | Clarify requirements       | Ambiguous requests                              |
| `Bash`              | **Read-only git**          | `git status -s`, `git log --oneline -5`         |

### Router Blacklist (NEVER Use)

| Tool                    | Why Blacklisted          | Spawn Instead                   |
| ----------------------- | ------------------------ | ------------------------------- |
| `Edit`                  | Code/config modification | `developer`, `devops`           |
| `Write`                 | File creation            | `developer`, `technical-writer` |
| `Bash` (implementation) | Builds, tests, scripts   | `developer`, `qa`, `devops`     |
| `Glob`                  | Codebase exploration     | `architect`, `developer`        |
| `Grep`                  | Code search              | `architect`, `developer`        |
| `WebSearch`             | External research        | `planner`, domain expert        |
| `mcp__*`                | MCP tool usage           | Appropriate specialist          |

**Bash Exception:** Router may use Bash ONLY for read-only git commands:

- `git status -s`
- `git log --oneline -5`

All other Bash usage requires spawning an agent.

## 5. Agent Routing Table

Quick reference for selecting the right agent.

### Core Development Agents

| Request Type           | Agent              | File                                      |
| ---------------------- | ------------------ | ----------------------------------------- |
| Bug fixes, coding      | `developer`        | `.claude/agents/core/developer.md`        |
| New features, planning | `planner`          | `.claude/agents/core/planner.md`          |
| System design          | `architect`        | `.claude/agents/core/architect.md`        |
| Testing, QA            | `qa`               | `.claude/agents/core/qa.md`               |
| Documentation          | `technical-writer` | `.claude/agents/core/technical-writer.md` |
| Product management     | `pm`               | `.claude/agents/core/pm.md`               |

### Specialized Agents

| Request Type           | Agent                   | File                                                  |
| ---------------------- | ----------------------- | ----------------------------------------------------- |
| Code review, PR review | `code-reviewer`         | `.claude/agents/specialized/code-reviewer.md`         |
| Security review        | `security-architect`    | `.claude/agents/specialized/security-architect.md`    |
| Infrastructure         | `devops`                | `.claude/agents/specialized/devops.md`                |
| Debugging              | `devops-troubleshooter` | `.claude/agents/specialized/devops-troubleshooter.md` |
| Incidents              | `incident-responder`    | `.claude/agents/specialized/incident-responder.md`    |
| Database design        | `database-architect`    | `.claude/agents/specialized/database-architect.md`    |

### Domain Expert Agents

| Request Type      | Agent            | File                                      |
| ----------------- | ---------------- | ----------------------------------------- |
| Python expert     | `python-pro`     | `.claude/agents/domain/python-pro.md`     |
| TypeScript expert | `typescript-pro` | `.claude/agents/domain/typescript-pro.md` |
| Go expert         | `golang-pro`     | `.claude/agents/domain/golang-pro.md`     |
| Rust expert       | `rust-pro`       | `.claude/agents/domain/rust-pro.md`       |
| FastAPI expert    | `fastapi-pro`    | `.claude/agents/domain/fastapi-pro.md`    |
| Next.js expert    | `nextjs-pro`     | `.claude/agents/domain/nextjs-pro.md`     |
| iOS/Swift         | `ios-pro`        | `.claude/agents/domain/ios-pro.md`        |

**Full list:** See `.claude/agents/` directory for all available agents.

## 6. Enforcement Modes

The Router Protocol is enforced via automated hooks at three levels:

### 6.1 Router Enforcer (Advisory)

**File:** `.claude/hooks/routing/router-enforcer.cjs` (routing data in `.claude/lib/routing/routing-table.cjs`)
**Event:** Not registered by default (advisory / manual run)
**Purpose:** Analyze user prompts and suggest appropriate agents (standalone helper)

**Output:** Advisory routing recommendations (always allows, exit 0)

**Example Output:**

```
┌─────────────────────────────────────────────────┐
│ 🔀 ROUTER ANALYSIS                              │
├─────────────────────────────────────────────────┤
│ Intent: security                                │
│ Complexity: high                                │
│ Recommended agents:                             │
│  1. security-architect (score: 5)               │
│  2. planner (score: 4)                          │
├─────────────────────────────────────────────────┤
│ ⚠️  MULTI-AGENT PLANNING REQUIRED               │
│  → Architect review: REQUIRED                   │
│  → Security review: REQUIRED                    │
│                                                 │
│ Phases: Explore → Plan → Review → Consolidate  │
│                                                 │
│ Use Task tool to spawn: security-architect      │
└─────────────────────────────────────────────────┘
```

### 6.2 TaskCreate Guard Hook

**File:** `.claude/hooks/routing/task-create-guard.cjs`
**Event:** `PreToolUse(TaskCreate)`
**Purpose:** Block complex tasks from bypassing PLANNER

**Environment Variable:** `PLANNER_FIRST_ENFORCEMENT`

**Modes:**

- `block` (default) - Violations blocked with exit code 2
- `warn` - Warning shown but allowed (exit 0)
- `off` - Enforcement disabled (not recommended)

**Violation Message:**

```
[ROUTER PROTOCOL VIOLATION] Complex task (high) requires PLANNER agent.
Spawn PLANNER first: Task({ subagent_type: 'general-purpose', description: '...', prompt: 'You are PLANNER...' })
Then PLANNER will create the tasks.
```

**Override:**

```bash
PLANNER_FIRST_ENFORCEMENT=warn  # Development mode
PLANNER_FIRST_ENFORCEMENT=off   # Disable (not recommended)
```

### 6.3 Security Review Guard Hook

**File:** `.claude/hooks/routing/security-review-guard.cjs`
**Event:** `PreToolUse(Task)`
**Purpose:** Block DEVELOPER/QA spawns when security review required but not done

**Environment Variable:** `SECURITY_REVIEW_ENFORCEMENT`

**Modes:**

- `warn` (default) - Warning shown but allowed
- `block` - Violations blocked with exit code 2
- `off` - Enforcement disabled (not recommended)

**Violation Message:**

```
[SEC-004] WARNING: Security review required before implementation.

Spawn SECURITY-ARCHITECT first to review security implications.
Set SECURITY_REVIEW_ENFORCEMENT=off to disable (not recommended).
```

**How it works:**

1. `user-prompt-unified.cjs` (uses `routing-table.cjs`) detects security-sensitive keywords
2. Sets `requiresSecurityReview` flag in router state
3. `security-review-guard.cjs` intercepts Task() spawns
4. If spawning DEVELOPER/QA without SECURITY-ARCHITECT → WARN/BLOCK

**Override:**

```bash
SECURITY_REVIEW_ENFORCEMENT=block  # Strict mode
SECURITY_REVIEW_ENFORCEMENT=off    # Disable (not recommended)
```

### Environment Variable Summary

| Variable                      | Default | Purpose                                    |
| ----------------------------- | ------- | ------------------------------------------ |
| `PLANNER_FIRST_ENFORCEMENT`   | `block` | TaskCreate guard for complex tasks         |
| `SECURITY_REVIEW_ENFORCEMENT` | `warn`  | Security review guard for sensitive tasks  |
| `ROUTER_WRITE_GUARD`          | `block` | (Deprecated) Use PLANNER_FIRST_ENFORCEMENT |

## 7. Common Patterns

### Pattern 1: Single Agent Spawn (Bug Fix)

```javascript
// User: "Fix the login bug"

[ROUTER] Classification:
- Intent: Bug fix
- Complexity: Low
- Domain: Backend
- Risk: Low

[ROUTER] Decision: Single agent spawn

Task({
  subagent_type: 'general-purpose',
  model: 'sonnet',
  description: 'Developer fixing login bug',
  prompt: `You are the DEVELOPER agent.

## PROJECT CONTEXT (CRITICAL)
PROJECT_ROOT: C:\\dev\\projects\\agent-studio
All file operations MUST be relative to PROJECT_ROOT.

## Your Assigned Task
Fix the login bug.

## Instructions
1. Read your agent definition: .claude/agents/core/developer.md
2. Invoke skills: Skill({ skill: "tdd" }), Skill({ skill: "debugging" })
3. Execute the task following skill workflows

## Memory Protocol
1. Read .claude/context/memory/learnings.md first
2. Record learnings to memory after completion
`,
});
```

### Pattern 2: Parallel Agent Spawn (Security Feature)

```javascript
// User: "Add JWT authentication"

[ROUTER] Classification:
- Intent: New feature
- Complexity: High
- Domain: Security
- Risk: High

[ROUTER] Decision: Parallel spawn (PLANNER + SECURITY-ARCHITECT)

// BOTH in same response for parallel execution
Task({
  subagent_type: 'general-purpose',
  model: 'sonnet',
  description: 'Planner designing JWT auth feature',
  prompt: `You are the PLANNER agent.

## PROJECT CONTEXT
PROJECT_ROOT: C:\\dev\\projects\\agent-studio

## Task
Design JWT authentication feature.

## Instructions
1. Read your agent definition: .claude/agents/core/planner.md
2. Invoke skills: Skill({ skill: "plan-generator" })
3. Save plan to: .claude/context/plans/jwt-auth-plan.md
`,
});

Task({
  subagent_type: 'general-purpose',
  model: 'opus',  // Use opus for security
  description: 'Security reviewing JWT auth design',
  prompt: `You are the SECURITY-ARCHITECT agent.

## PROJECT CONTEXT
PROJECT_ROOT: C:\\dev\\projects\\agent-studio

## Task
Review JWT authentication design for security best practices.

## Instructions
1. Read your agent definition: .claude/agents/specialized/security-architect.md
2. Invoke skills: Skill({ skill: "security-architect" })
3. Review plan after planner completes
4. Save review to: .claude/context/reports/security-review.md
`,
});
```

### Pattern 3: Phased Multi-Agent Spawn (Epic Task)

```javascript
// User: "Integrate external payment API"

[ROUTER] Classification:
- Intent: Integration
- Complexity: Epic
- Domain: Backend, Security
- Risk: Critical

[ROUTER] Decision: Phased multi-agent orchestration
- Phase 1: Exploration
- Phase 2: Planning
- Phase 3: Architect + Security Review (parallel)
- Phase 4: Consolidation

// PHASE 1: Exploration
[ROUTER] Spawning ARCHITECT (exploration mode)

Task({
  subagent_type: 'general-purpose',
  description: 'Exploring codebase for payment integration',
  prompt: `You are the ARCHITECT agent in exploration mode.

## PROJECT CONTEXT
PROJECT_ROOT: C:\\dev\\projects\\agent-studio

## Task
Explore codebase to understand current payment flow and integration points.

## Instructions
1. Read your agent definition: .claude/agents/core/architect.md
2. Invoke skills: Skill({ skill: "repo-rag" })
3. Document findings in: .claude/context/exploration/payment-exploration.md
`,
});

// PHASE 2: Planning (after Phase 1)
// PHASE 3: Review (after Phase 2, parallel)
// PHASE 4: Consolidation (after Phase 3)
```

### Pattern 4: Background Agent Spawn (Long-Running Task)

```javascript
// User: "Run full test suite"

[ROUTER] Classification:
- Intent: Testing
- Complexity: Low (single operation)
- Domain: QA
- Risk: Low

[ROUTER] Decision: Background agent spawn

Task({
  subagent_type: 'general-purpose',
  run_in_background: true,
  description: 'QA running full test suite',
  prompt: `You are the QA agent.

## PROJECT CONTEXT
PROJECT_ROOT: C:\\dev\\projects\\agent-studio

## Task
Run full test suite and report results.

## Instructions
1. Read your agent definition: .claude/agents/core/qa.md
2. Invoke skills: Skill({ skill: "qa-workflow" })
3. Run tests, document failures
4. Save results to: .claude/context/reports/test-results.md
`,
});
```

## 8. Troubleshooting

### "Why was my request blocked?"

**Symptom:** Hook exits with code 2, showing violation message.

**Common Causes:**

1. **Complex task without PLANNER**
   - **Violation:** TaskCreate for HIGH/EPIC complexity
   - **Fix:** Spawn PLANNER first: `Task({ prompt: "You are PLANNER..." })`
   - **Environment Override:** `PLANNER_FIRST_ENFORCEMENT=warn`

2. **Security-sensitive task without SECURITY-ARCHITECT**
   - **Violation:** Spawning DEVELOPER/QA without security review
   - **Fix:** Spawn SECURITY-ARCHITECT first or in parallel
   - **Environment Override:** `SECURITY_REVIEW_ENFORCEMENT=off`

3. **Router using blacklisted tool**
   - **Violation:** Router using Edit, Write, Glob, Grep directly
   - **Fix:** Spawn appropriate agent instead

### How do I override for development?

Set environment variables to change enforcement mode:

```bash
# Allow TaskCreate for complex tasks (with warning)
export PLANNER_FIRST_ENFORCEMENT=warn

# Allow implementation without security review (with warning)
export SECURITY_REVIEW_ENFORCEMENT=warn

# Disable all enforcement (not recommended)
export PLANNER_FIRST_ENFORCEMENT=off
export SECURITY_REVIEW_ENFORCEMENT=off
```

**For Windows:**

```cmd
set PLANNER_FIRST_ENFORCEMENT=warn
set SECURITY_REVIEW_ENFORCEMENT=warn
```

**Recommendation:** Use `warn` mode for development, `block` mode for production.

### Common Issues

#### Issue 1: "Router doing work directly instead of spawning"

**Symptom:** Router uses Edit, Write, Bash for implementation.

**Root Cause:** Router bypassed self-check gates.

**Fix:**

1. Verify Router is following self-check protocol (Step 4)
2. Check if Router is using ONLY whitelisted tools
3. Review user-prompt-unified.cjs logs for classification (routing data from routing-table.cjs)

**Prevention:** Enforce strict tool whitelisting in router agent definition.

#### Issue 2: "Complex task created via TaskCreate"

**Symptom:** TaskCreate guard blocks with "Complex task requires PLANNER" error.

**Root Cause:** Router classified task as HIGH/EPIC but used TaskCreate directly.

**Fix:**

1. Spawn PLANNER first: `Task({ prompt: "You are PLANNER..." })`
2. PLANNER will create tasks after designing plan
3. Alternatively, reduce complexity by breaking into smaller requests

**Prevention:** Always classify complexity BEFORE deciding on TaskCreate.

#### Issue 3: "Security review skipped for auth changes"

**Symptom:** Security-review-guard warns about missing SECURITY-ARCHITECT.

**Root Cause:** Router detected security-sensitive keywords but spawned DEVELOPER without review.

**Fix:**

1. Spawn SECURITY-ARCHITECT first or in parallel with DEVELOPER
2. Ensure security review completes before implementation
3. Update plan to include security review phase

**Prevention:** Always trigger Security Check gate (Gate 2) for auth/security tasks.

#### Issue 4: "Agent spawned with syntax errors"

**Symptom:** Task() call fails with "Missing required field" error.

**Root Cause:** Malformed Task() call missing required parameters.

**Fix:**
Check Task() call includes all required fields:

```javascript
Task({
  subagent_type: 'general-purpose', // REQUIRED
  description: 'Brief description', // REQUIRED
  prompt: '...', // REQUIRED (with PROJECT_ROOT, agent def path)
  model: 'sonnet', // optional
  run_in_background: false, // optional
});
```

**Prevention:** Use Task() call templates from patterns above.

#### Issue 5: "Hooks not running"

**Symptom:** No routing analysis or enforcement messages appear.

**Root Cause:** Hooks not registered in `.claude/.mcp.json` or disabled.

**Fix:**

1. Verify `.claude/.mcp.json` includes routing hooks:
   ```json
   {
     "hooks": [
       {
         "event": "UserPromptSubmit",
         "script": ".claude/hooks/routing/user-prompt-unified.cjs"
       },
       {
         "event": "PreToolUse",
         "tool": "TaskCreate",
         "script": ".claude/hooks/routing/task-create-guard.cjs"
       },
       {
         "event": "PreToolUse",
         "tool": "Task",
         "script": ".claude/hooks/routing/security-review-guard.cjs"
       }
     ]
   }
   ```
2. Check hook files are executable
3. Verify Claude Code has hooks enabled

**Prevention:** Keep `.claude/.mcp.json` in version control.

## Related Documentation

- **Full Router Workflow:** `.claude/workflows/core/router-decision.md`
- **Agent Definitions:** `.claude/agents/`
- **Multi-Agent Workflows:** `.claude/workflows/enterprise/`
- **Enforcement Hooks:** `.claude/hooks/routing/`
- **Master Configuration:** `.claude/CLAUDE.md`

## Summary

The Router Protocol ensures consistent, predictable multi-agent orchestration. By following self-check gates and respecting tool restrictions, the Router efficiently delegates work to the right agents at the right time.

**Key Takeaways:**

1. Router orchestrates, agents execute
2. Every request is classified (intent, complexity, domain, risk)
3. Self-check gates prevent Router violations
4. Automated hooks enforce protocol compliance
5. Environment variables allow development overrides
