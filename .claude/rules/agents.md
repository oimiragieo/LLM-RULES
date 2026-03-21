# Agent Quick Reference

## Core Agents (`core/`)

| Agent     | Purpose                 | When to Use                 |
| --------- | ----------------------- | --------------------------- |
| router    | Route work to agents    | Every request (automatic)   |
| planner   | Implementation planning | Complex features, refactors |
| architect | System design           | Architectural decisions     |
| developer | TDD implementation      | New features, bug fixes     |
| qa        | Testing strategy        | Test execution, quality     |

## Specialized Agents (`specialized/`)

| Agent         | Purpose     | When to Use        |
| ------------- | ----------- | ------------------ |
| code-reviewer | Code review | After writing code |

## Security & Documentation

| Agent              | Purpose           | When to Use        |
| ------------------ | ----------------- | ------------------ |
| security-architect | Security analysis | Auth, payment, PII |
| technical-writer   | Documentation     | Docs and guides    |

## Orchestration

| Agent                  | Purpose                  | When to Use              |
| ---------------------- | ------------------------ | ------------------------ |
| master-orchestrator    | Multi-agent coordination | Complex multi-phase work |
| evolution-orchestrator | Framework evolution      | Adding new capabilities  |

## Domain Specialists

Available for specific technologies: `python-pro`, `typescript-pro`, `frontend-pro`, `devops-troubleshooter`, and 15+ others.

See `.claude/context/agent-registry.json` for full list of 102 agents.

## Specialist-First Routing Law (IRON LAW)

**Developer is the LAST RESORT.** If a specialist agent matches the task, the specialist MUST be used.

**Common Misrouting** (verify EVERY spawn):

| User Request             | WRONG      | CORRECT                   |
| ------------------------ | ---------- | ------------------------- |
| "update docs"            | developer  | **technical-writer**      |
| "refactor/clean up"      | developer  | **code-simplifier**       |
| "review code"            | developer  | **code-reviewer**         |
| "run tests"              | developer  | **qa**                    |
| "deploy/Docker/CI"       | developer  | **devops**                |
| "design database"        | developer  | **database-architect**    |
| "research/investigate"   | developer  | **researcher**            |
| "integrate repo/onboard" | researcher | **artifact-integrator**   |
| "debug production"       | developer  | **devops-troubleshooter** |

**Why**: 102 agents exist. Specialists have domain-specific prompts, skills, and patterns. Using developer for specialist work produces inferior results.

## Intent Classification (Semantic Matching)

**Pattern**: Route by semantic intent, not just keywords.

**Implementation**:

- `fuzzy-intent-matcher.cjs` - Semantic similarity scoring
- `routing-table.cjs` - Intent → Agent mapping
- `routing-guard.cjs` - Enforcement hook (warns on misrouting)

**Example**:

```
User: "improve code readability"
Intent: "refactor" (semantic match)
Agent: code-simplifier (NOT developer)
```

## Routing Reminders

- Complex request (multi-step, architecture) → **planner** (mandatory)
- Code written → **code-reviewer**
- Security-sensitive (auth, PII, integrations) → **security-architect** (mandatory)
- Documentation needed → **technical-writer**
- Testing strategy → **qa**
- Multi-phase work → **master-orchestrator**
- Infrastructure/deployment → **devops**
- Database design → **database-architect**
- Bug fix with unclear root cause → **developer** + **debugging** skill

## Router Self-Check Gates

Before spawning, Router checks 4 gates:

1. **Complexity**: Multi-step or multi-file? → Spawn **planner** first
2. **Security**: Auth/credentials/PII? → Include **security-architect**
3. **Tool**: Need blacklisted tools? → Spawn appropriate agent
4. **Creator**: Creating skills/agents/hooks? → Invoke creator skill first

## Related References

- `@AGENT_ROUTING_TABLE.md` - Complete agent routing matrix
- `.claude/lib/routing/routing-table.cjs` - Source of truth for routing
- `.claude/lib/routing/fuzzy-intent-matcher.cjs` - Semantic intent matching
- `routing-guard.cjs` - Enforcement hook for specialist routing
