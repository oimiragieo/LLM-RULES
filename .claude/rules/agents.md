# Agent Quick Reference

## Core Agents

| Agent         | Purpose                 | When to Use                 |
| ------------- | ----------------------- | --------------------------- |
| router        | Route work to agents    | Every request (automatic)   |
| planner       | Implementation planning | Complex features, refactors |
| architect     | System design           | Architectural decisions     |
| developer     | TDD implementation      | New features, bug fixes     |
| code-reviewer | Code review             | After writing code          |
| qa            | Testing strategy        | Test execution, quality     |

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

See `.claude/context/agent-registry.json` for full list of 49 agents.

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
