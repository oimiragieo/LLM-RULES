# Agent Routing Table

**Source:** CLAUDE.md Section 3
**Version:** v2.2.2
**Last Updated:** 2026-03-01

---

## Common Misrouting Quick Reference

Router MUST check this table before defaulting to developer. Developer is ALWAYS last resort.

| User Request Contains                               | WRONG      | CORRECT                               |
| --------------------------------------------------- | ---------- | ------------------------------------- |
| "update docs/README"                                | developer  | **technical-writer**                  |
| "clean up/refactor/simplify"                        | developer  | **code-simplifier**                   |
| "review code/PR"                                    | developer  | **code-reviewer**                     |
| "run/write tests"                                   | developer  | **qa**                                |
| "set up Docker/CI/deploy"                           | developer  | **devops**                            |
| "design database/schema"                            | developer  | **database-architect**                |
| "research/investigate"                              | developer  | **researcher**                        |
| "debug production/incident"                         | developer  | **devops-troubleshooter**             |
| "git push / commit / deploy"                        | developer  | **devops**                            |
| "web performance / core web vitals"                 | developer  | **frontend-pro** + `web-perf` skill   |
| "upgrade Next.js / migrate framework"               | developer  | **nextjs-pro** + `next-upgrade` skill |
| "deploy to Vercel"                                  | developer  | **devops** + `vercel-deploy` skill    |
| "audit / security review / pentest"                 | developer  | **security-architect**                |
| "refactor / clean up / simplify"                    | developer  | **code-simplifier**                   |
| "medical / symptoms / diagnosis / drug interaction" | researcher | **medical-research-triage**           |

---

## PURPOSE

Complete agent routing matrix mapping request types to agent definitions across 4 categories: core agents, specialized agents, domain agents, and orchestrators.

---

## CONTENT

| Request Type                         | Agent                        | File                                                     |
| ------------------------------------ | ---------------------------- | -------------------------------------------------------- |
| Bug fixes, coding                    | `developer`                  | `.claude/agents/core/developer.md`                       |
| New features, planning               | `planner`                    | `.claude/agents/core/planner.md`                         |
| System design                        | `architect`                  | `.claude/agents/core/architect.md`                       |
| Testing, QA                          | `qa`                         | `.claude/agents/core/qa.md`                              |
| Documentation, docs                  | `technical-writer`           | `.claude/agents/core/technical-writer.md`                |
| Code review, PR review               | `code-reviewer`              | `.claude/agents/specialized/code-reviewer.md`            |
| Code simplification, refactoring     | `code-simplifier`            | `.claude/agents/specialized/code-simplifier.md`          |
| Security review                      | `security-architect`         | `.claude/agents/specialized/security-architect.md`       |
| Infrastructure                       | `devops`                     | `.claude/agents/specialized/devops.md`                   |
| Debugging                            | `devops-troubleshooter`      | `.claude/agents/specialized/devops-troubleshooter.md`    |
| Incidents                            | `incident-responder`         | `.claude/agents/specialized/incident-responder.md`       |
| C4 System Context                    | `c4-context`                 | `.claude/agents/specialized/c4-context.md`               |
| C4 Containers                        | `c4-container`               | `.claude/agents/specialized/c4-container.md`             |
| C4 Components                        | `c4-component`               | `.claude/agents/specialized/c4-component.md`             |
| C4 Code level                        | `c4-code`                    | `.claude/agents/specialized/c4-code.md`                  |
| Context-driven dev                   | `conductor-validator`        | `.claude/agents/specialized/conductor-validator.md`      |
| Reverse engineering                  | `reverse-engineer`           | `.claude/agents/specialized/reverse-engineer.md`         |
| Research, fact-finding               | `researcher`                 | `.claude/agents/specialized/researcher.md`               |
| Python expert                        | `python-pro`                 | `.claude/agents/domain/python-pro.md`                    |
| Rust expert                          | `rust-pro`                   | `.claude/agents/domain/rust-pro.md`                      |
| Go expert                            | `golang-pro`                 | `.claude/agents/domain/golang-pro.md`                    |
| TypeScript expert                    | `typescript-pro`             | `.claude/agents/domain/typescript-pro.md`                |
| FastAPI expert                       | `fastapi-pro`                | `.claude/agents/domain/fastapi-pro.md`                   |
| Product management                   | `pm`                         | `.claude/agents/core/pm.md`                              |
| Technical program management         | `technical-program-manager`  | `.claude/agents/core/technical-program-manager.md`       |
| Quality reflection                   | `reflection-agent`           | `.claude/agents/core/reflection-agent.md`                |
| Frontend/React/Vue                   | `frontend-pro`               | `.claude/agents/domain/frontend-pro.md`                  |
| Node.js/Express/NestJS               | `nodejs-pro`                 | `.claude/agents/domain/nodejs-pro.md`                    |
| iOS/Swift development                | `ios-pro`                    | `.claude/agents/domain/ios-pro.md`                       |
| Android/Kotlin                       | `android-pro`                | `.claude/agents/domain/android-pro.md`                   |
| Java/Spring Boot                     | `java-pro`                   | `.claude/agents/domain/java-pro.md`                      |
| Next.js App Router                   | `nextjs-pro`                 | `.claude/agents/domain/nextjs-pro.md`                    |
| PHP/Laravel                          | `php-pro`                    | `.claude/agents/domain/php-pro.md`                       |
| SvelteKit/Svelte 5                   | `sveltekit-expert`           | `.claude/agents/domain/sveltekit-expert.md`              |
| Tauri desktop apps                   | `tauri-desktop-developer`    | `.claude/agents/domain/tauri-desktop-developer.md`       |
| Expo/React Native                    | `expo-mobile-developer`      | `.claude/agents/domain/expo-mobile-developer.md`         |
| Data engineering/ETL                 | `data-engineer`              | `.claude/agents/domain/data-engineer.md`                 |
| Database design                      | `database-architect`         | `.claude/agents/specialized/database-architect.md`       |
| GraphQL APIs                         | `graphql-pro`                | `.claude/agents/domain/graphql-pro.md`                   |
| Mobile UX review                     | `mobile-ux-reviewer`         | `.claude/agents/domain/mobile-ux-reviewer.md`            |
| Scientific research                  | `scientific-research-expert` | `.claude/agents/domain/scientific-research-expert.md`    |
| Multi-LLM consultation               | `multi-llm-consultant`       | `.claude/agents/domain/multi-llm-consultant.md`          |
| Session analysis                     | `reflection-agent`           | `.claude/agents/core/reflection-agent.md`                |
| AI/ML/Deep Learning                  | `ai-ml-specialist`           | `.claude/agents/domain/ai-ml-specialist.md`              |
| Web3/Blockchain/DeFi                 | `web3-blockchain-expert`     | `.claude/agents/domain/web3-blockchain-expert.md`        |
| Game development                     | `gamedev-pro`                | `.claude/agents/domain/gamedev-pro.md`                   |
| LLM architecture/RAG/model serving   | `llm-architect`              | `.claude/agents/domain/llm-architect.md`                 |
| Prompt engineering/optimization      | `prompt-engineer`            | `.claude/agents/domain/prompt-engineer.md`               |
| MCP server/client development        | `mcp-developer`              | `.claude/agents/domain/mcp-developer.md`                 |
| API design/OpenAPI/contracts         | `api-designer`               | `.claude/agents/domain/api-designer.md`                  |
| Microservices/distributed systems    | `microservices-architect`    | `.claude/agents/domain/microservices-architect.md`       |
| SRE/reliability/SLOs                 | `sre-engineer`               | `.claude/agents/specialized/sre-engineer.md`             |
| Performance/profiling/optimization   | `performance-engineer`       | `.claude/agents/specialized/performance-engineer.md`     |
| Penetration testing/security testing | `penetration-tester`         | `.claude/agents/specialized/penetration-tester.md`       |
| Accessibility testing/WCAG           | `accessibility-tester`       | `.claude/agents/specialized/accessibility-tester.md`     |
| Chaos engineering/resilience         | `chaos-engineer`             | `.claude/agents/specialized/chaos-engineer.md`           |
| Project orchestration                | `master-orchestrator`        | `.claude/agents/orchestrators/master-orchestrator.md`    |
| Swarm coordination                   | `swarm-coordinator`          | `.claude/agents/orchestrators/swarm-coordinator.md`      |
| Party mode orchestration             | `party-orchestrator`         | `.claude/agents/orchestrators/party-orchestrator.md`     |
| Self-evolution                       | `evolution-orchestrator`     | `.claude/agents/orchestrators/evolution-orchestrator.md` |
| Context compression                  | `context-compressor`         | `.claude/agents/core/context-compressor.md`              |
| System routing                       | `router`                     | `.claude/agents/core/router.md` (Meta)                   |

**Agent Categories:**

- **Core agents:** `.claude/agents/core/`
- **Specialized agents:** `.claude/agents/specialized/`
- **Domain agents:** `.claude/agents/domain/`
- **Orchestrators:** `.claude/agents/orchestrators/`

**Routing Logic Source of Truth:**

- `.claude/lib/routing/routing-table.cjs` (INTENT_KEYWORDS, INTENT_TO_AGENT, DISAMBIGUATION_RULES)
- Resolution order in classifier (`.claude/lib/routing/intent-classifier.cjs`):
  1. `INTENT_KEYWORDS` + disambiguation
  2. `ROUTING_TABLE` keyword hits
  3. Prefix patterns
  4. Regex `ROUTING_PATTERNS`
  5. Fuzzy `INTENT_KEYWORDS` fallback

**Hybrid Search Integration (Phase 1):**

All agents have code search capabilities via integrated search skills. Domain agents (Python, TypeScript, Go, etc.) have all 3 search skills (`code-semantic-search`, `code-structural-search`, `ripgrep`), specialized agents have 2 skills (semantic + ripgrep), and orchestrators have 1 skill (ripgrep only). Three core agents (`developer`, `code-reviewer`, `code-simplifier`) include search-first protocol in their workflows.

---

## RELATED REFERENCES

- **@CREATOR_SKILLS_TABLE.md** - Creator skill invocation patterns
- **@MODEL_SELECTION.md** - Model recommendations for each agent

---

## BACK TO MAIN

See **CLAUDE.md** Section 3 for inline summary.
