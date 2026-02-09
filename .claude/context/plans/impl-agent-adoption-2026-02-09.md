<!-- Agent: planner | Task: #60 | Session: 2026-02-09 -->

# Implementation Plan: Agent Adoption from awesome-claude-code-subagents

## Executive Summary

Adopt 10 new specialist agents from the ACCS repository analysis, organized into 2 priority batches. All agents go through our agent-creator skill with full integration (registry, routing, CLAUDE.md, catalog). Each agent uses our enterprise patterns: checklist-format definitions, search skills, memory protocol, TaskUpdate protocol. No prompt fiction.

**Total Tasks:** 28 atomic tasks
**Estimated Time:** 8-12 hours across 6 phases
**Files Modified:** 15+ (3 new agent definitions per batch + routing updates + registry + docs)
**Strategy:** Batch 1 (P0: 3 agents) -> Batch 2 (P1: 7 agents) -> Integration -> Verification

## Key Decisions (from Phase 1 Research)

- ADR-090: Selective adoption, not wholesale import
- Checklist format for new agents (40% shorter than prose)
- All new agents MUST include: search skills (Tier 2-3), memory protocol, TaskUpdate protocol
- NO prompt fiction: only describe capabilities backed by infrastructure or skills
- Each agent created via `agent-creator` skill (not direct writes -- Gate 4)

---

## Phases

### Phase 1: P0 Agent Definitions (3 agents)

**Purpose:** Create the three highest-priority agents that fill critical gaps
**Dependencies:** None
**Duration:** 2-3 hours
**Parallel OK:** Yes (each agent is independent)

These 3 agents must be created via `Skill({ skill: 'agent-creator' })` which handles:

- Agent .md file creation
- Registry entry in agent-registry.json
- Routing keyword registration
- Catalog/CLAUDE.md references

#### Tasks

- [ ] **1.1** Create `llm-architect` agent (~45 min)
  - **Target Agent:** `developer` (invokes agent-creator skill)
  - **Recommended Skills:** `agent-creator`, `research-synthesis`, `verification-before-completion`
  - **Agent Spec:**
    - **Name:** llm-architect
    - **Category:** domain (`.claude/agents/domain/llm-architect.md`)
    - **Model:** opus (complex architectural decisions)
    - **Description:** LLM system architect for RAG pipelines, prompt optimization, model selection, fine-tuning strategy, token cost optimization, and LLM-powered application design. NOT for general ML/training (use ai-ml-specialist). Focused on LLM-specific architecture: retrieval-augmented generation, agent orchestration patterns, embedding strategies, context window management, and multi-model routing.
    - **Tools:** Read, Write, Edit, Glob, Grep, Bash, WebSearch, WebFetch, TaskUpdate, TaskList, TaskCreate, TaskGet, Skill
    - **Skills:** code-semantic-search, ripgrep, architecture-review, verification-before-completion, tdd, debugging
    - **Routing Keywords (for routing-table.cjs):**
      - ROUTING_TABLE entries: `llm: 'llm-architect'`, `rag: 'llm-architect'`, `langchain: 'llm-architect'`, `llamaindex: 'llm-architect'`, `embedding: 'llm-architect'`, `tokenization: 'llm-architect'`, `promptengineering: 'llm-architect'`
      - INTENT_KEYWORDS key: `llm_architect` with keywords: `['llm architecture', 'rag pipeline', 'retrieval augmented generation', 'langchain', 'llamaindex', 'vector database', 'embedding model', 'prompt template', 'prompt chain', 'agent framework', 'context window', 'token optimization', 'model routing', 'fine-tuning strategy', 'llm gateway', 'semantic search pipeline', 'chunking strategy', 'knowledge base', 'llm orchestration', 'vllm', 'text-generation-inference', 'model serving architecture', 'multi-model', 'guardrails']`
      - INTENT_TO_AGENT entry: `llm_architect: 'llm-architect'`
    - **Disambiguation:** Add `llm` disambiguation rule: if context includes `['architecture', 'pipeline', 'rag', 'serving', 'design', 'system']` prefer `llm-architect`; if `['training', 'fine-tune', 'dataset', 'pytorch', 'tensorflow']` prefer `ai-ml-specialist`
    - **What it is NOT:** Not a prompt-writing assistant. Not a general ML agent. Not a chatbot builder. It designs LLM systems at the architecture level.
  - **Verify:** Agent file exists, frontmatter valid, routing keywords registered, agent-registry.json updated

- [ ] **1.2** Create `prompt-engineer` agent (~45 min)
  - **Target Agent:** `developer` (invokes agent-creator skill)
  - **Recommended Skills:** `agent-creator`, `research-synthesis`, `verification-before-completion`
  - **Agent Spec:**
    - **Name:** prompt-engineer
    - **Category:** domain (`.claude/agents/domain/prompt-engineer.md`)
    - **Model:** sonnet (iterative prompt refinement)
    - **Description:** Prompt optimization specialist for Claude, GPT, and open-source LLMs. Designs system prompts, few-shot examples, chain-of-thought patterns, and structured output schemas. Conducts prompt A/B testing, token reduction, and quality benchmarking. NOT for LLM system architecture (use llm-architect). NOT for model training (use ai-ml-specialist).
    - **Tools:** Read, Write, Edit, Glob, Grep, Bash, TaskUpdate, TaskList, TaskGet, Skill
    - **Skills:** code-semantic-search, ripgrep, verification-before-completion, tdd
    - **Routing Keywords:**
      - ROUTING_TABLE entries: `prompt: 'prompt-engineer'`, `systemprompt: 'prompt-engineer'`, `fewshot: 'prompt-engineer'`
      - INTENT_KEYWORDS key: `prompt_engineer` with keywords: `['prompt engineering', 'prompt optimization', 'prompt design', 'system prompt', 'few-shot', 'few shot', 'chain of thought', 'cot', 'structured output', 'prompt template', 'prompt testing', 'prompt benchmark', 'token reduction', 'prompt compression', 'prompt injection defense', 'jailbreak prevention', 'output format', 'xml tags', 'function calling', 'tool use prompt', 'meta-prompt', 'prompt chain']`
      - INTENT_TO_AGENT entry: `prompt_engineer: 'prompt-engineer'`
    - **What it is NOT:** Not a coder. Not an LLM architect. Focused purely on prompt craft.
  - **Verify:** Agent file exists, frontmatter valid, routing keywords registered

- [ ] **1.3** Create `mcp-developer` agent (~45 min)
  - **Target Agent:** `developer` (invokes agent-creator skill)
  - **Recommended Skills:** `agent-creator`, `research-synthesis`, `verification-before-completion`
  - **Agent Spec:**
    - **Name:** mcp-developer
    - **Category:** domain (`.claude/agents/domain/mcp-developer.md`)
    - **Model:** sonnet (implementation-focused)
    - **Description:** MCP (Model Context Protocol) server and client developer. Builds MCP tools, resources, and prompts using the official MCP SDK. Handles MCP server lifecycle, transport protocols (stdio, HTTP SSE), tool registration, and Claude Code integration. Highly relevant to agent-studio itself.
    - **Tools:** Read, Write, Edit, Glob, Grep, Bash, WebSearch, WebFetch, TaskUpdate, TaskList, TaskCreate, TaskGet, Skill
    - **Skills:** code-semantic-search, code-structural-search, ripgrep, tdd, debugging, verification-before-completion
    - **Routing Keywords:**
      - ROUTING_TABLE entries: `mcp: 'mcp-developer'`, `mcpserver: 'mcp-developer'`, `mcpclient: 'mcp-developer'`, `modelcontextprotocol: 'mcp-developer'`
      - INTENT_KEYWORDS key: `mcp_developer` with keywords: `['mcp', 'model context protocol', 'mcp server', 'mcp client', 'mcp tool', 'mcp resource', 'mcp prompt', 'stdio transport', 'sse transport', 'tool registration', 'mcp sdk', '@modelcontextprotocol', 'mcp inspector', 'claude desktop mcp', 'mcp config']`
      - INTENT_TO_AGENT entry: `mcp_developer: 'mcp-developer'`
    - **What it is NOT:** Not a general developer. Focused specifically on MCP protocol implementation.
  - **Verify:** Agent file exists, frontmatter valid, routing keywords registered

**Success Criteria:** 3 new agent .md files created via agent-creator, all registered in agent-registry.json, routing keywords added to routing-table.cjs

---

### Phase 2: P1 Agent Definitions (7 agents)

**Purpose:** Create the seven P1-priority agents
**Dependencies:** Phase 1 complete (validates the agent-creator workflow works)
**Duration:** 4-5 hours
**Parallel OK:** Yes (each agent is independent; spawn multiple in parallel batches)

**Context Limit Strategy:** Creating 7 agents in a single developer session will exceed context limits. Split into 2 sub-batches:

- **Batch 2A (4 agents):** api-designer, microservices-architect, sre-engineer, performance-engineer
- **Batch 2B (3 agents):** penetration-tester, accessibility-tester, chaos-engineer

#### Tasks -- Batch 2A

- [ ] **2.1** Create `api-designer` agent (~30 min)
  - **Target Agent:** `developer` (invokes agent-creator skill)
  - **Recommended Skills:** `agent-creator`, `verification-before-completion`
  - **Agent Spec:**
    - **Name:** api-designer
    - **Category:** domain (`.claude/agents/domain/api-designer.md`)
    - **Model:** sonnet
    - **Description:** REST and GraphQL API architecture specialist. Designs API contracts, versioning strategies, pagination patterns, error response schemas, rate limiting, and API documentation (OpenAPI/Swagger). Reviews existing APIs for consistency and best practices. NOT for implementation (use developer/nodejs-pro/fastapi-pro). NOT for GraphQL resolvers (use graphql-pro).
    - **Tools:** Read, Write, Edit, Glob, Grep, Bash, WebSearch, TaskUpdate, TaskList, TaskGet, Skill
    - **Skills:** code-semantic-search, ripgrep, api-development-expert, architecture-review, verification-before-completion
    - **Routing Keywords:**
      - ROUTING_TABLE entries: `apidesign: 'api-designer'`, `openapi: 'api-designer'`, `swagger: 'api-designer'`, `restapi: 'api-designer'`
      - INTENT_KEYWORDS key: `api_designer` with keywords: `['api design', 'api architecture', 'rest api design', 'api versioning', 'api contract', 'openapi spec', 'swagger spec', 'api pagination', 'api error handling', 'hateoas', 'api gateway design', 'api rate limiting design', 'resource naming', 'api standards', 'api review', 'api consistency']`
      - INTENT_TO_AGENT entry: `api_designer: 'api-designer'`
    - **Disambiguation:** Add `api` disambiguation: if context includes `['design', 'architecture', 'contract', 'versioning', 'openapi']` prefer `api-designer`; existing rules for fastapi/graphql/nodejs unchanged
  - **Verify:** Agent file created, registered, routed

- [ ] **2.2** Create `microservices-architect` agent (~30 min)
  - **Target Agent:** `developer` (invokes agent-creator skill)
  - **Agent Spec:**
    - **Name:** microservices-architect
    - **Category:** specialized (`.claude/agents/specialized/microservices-architect.md`)
    - **Model:** opus (complex distributed systems decisions)
    - **Description:** Distributed systems and microservices architecture specialist. Designs service decomposition, inter-service communication (gRPC, message queues, event sourcing), data consistency patterns (saga, CQRS), service mesh, and circuit breakers. NOT for monolith-to-microservice migration execution (use developer). NOT for Kubernetes deployment (use devops).
    - **Tools:** Read, Write, Edit, Glob, Grep, Bash, WebSearch, WebFetch, TaskUpdate, TaskList, TaskGet, Skill
    - **Skills:** code-semantic-search, ripgrep, architecture-review, diagram-generator, verification-before-completion
    - **Routing Keywords:**
      - ROUTING_TABLE entries: `microservice: 'microservices-architect'`, `microservices: 'microservices-architect'`, `distributedsystem: 'microservices-architect'`, `servicemesh: 'microservices-architect'`, `eventdriven: 'microservices-architect'`
      - INTENT_KEYWORDS key: `microservices_architect` with keywords: `['microservices', 'microservice architecture', 'service decomposition', 'distributed systems', 'service mesh', 'istio', 'linkerd', 'circuit breaker', 'saga pattern', 'cqrs', 'event sourcing', 'event-driven', 'message queue', 'rabbitmq', 'kafka', 'nats', 'grpc services', 'service discovery', 'api gateway', 'sidecar pattern', 'bulkhead pattern', 'eventual consistency', 'distributed tracing', 'jaeger', 'zipkin']`
      - INTENT_TO_AGENT entry: `microservices_architect: 'microservices-architect'`
  - **Verify:** Agent file created, registered, routed

- [ ] **2.3** Create `sre-engineer` agent (~30 min)
  - **Target Agent:** `developer` (invokes agent-creator skill)
  - **Agent Spec:**
    - **Name:** sre-engineer
    - **Category:** specialized (`.claude/agents/specialized/sre-engineer.md`)
    - **Model:** sonnet
    - **Description:** Site reliability engineering specialist. Defines SLOs/SLIs/SLAs, error budgets, toil reduction, capacity planning, and reliability reviews. Designs monitoring and alerting strategies, on-call procedures, and post-incident processes. Distinct from incident-responder (who handles active incidents) and devops (who handles infrastructure). SRE-engineer focuses on proactive reliability engineering.
    - **Tools:** Read, Write, Edit, Glob, Grep, Bash, WebSearch, TaskUpdate, TaskList, TaskGet, Skill
    - **Skills:** code-semantic-search, ripgrep, verification-before-completion
    - **Routing Keywords:**
      - ROUTING_TABLE entries: `sre: 'sre-engineer'`, `reliability: 'sre-engineer'`, `slo: 'sre-engineer'`, `errorbudget: 'sre-engineer'`
      - INTENT_KEYWORDS key: `sre_engineer` with keywords: `['sre', 'site reliability', 'slo', 'sli', 'sla', 'error budget', 'reliability', 'toil reduction', 'capacity planning', 'on-call rotation', 'runbook', 'playbook', 'monitoring strategy', 'alerting strategy', 'service level objective', 'service level indicator', 'availability target', 'latency budget', 'reliability review', 'blameless postmortem']`
      - INTENT_TO_AGENT entry: `sre_engineer: 'sre-engineer'`
    - **Disambiguation:** Add `reliability` disambiguation: if context includes `['slo', 'sli', 'error budget', 'capacity', 'toil']` prefer `sre-engineer`; if `['incident', 'outage', 'production down']` prefer `incident-responder`; if `['docker', 'kubernetes', 'deploy', 'ci/cd']` prefer `devops`
  - **Verify:** Agent file created, registered, routed

- [ ] **2.4** Create `performance-engineer` agent (~30 min)
  - **Target Agent:** `developer` (invokes agent-creator skill)
  - **Agent Spec:**
    - **Name:** performance-engineer
    - **Category:** specialized (`.claude/agents/specialized/performance-engineer.md`)
    - **Model:** sonnet
    - **Description:** Application and system performance optimization specialist. Profiles CPU, memory, I/O, and network bottlenecks. Designs load testing strategies (k6, Artillery, Locust), interprets flame graphs, optimizes database queries, and identifies memory leaks. Distinct from devops (infrastructure) and developer (feature code). Performance-engineer focuses on measurable performance improvement with before/after benchmarks.
    - **Tools:** Read, Write, Edit, Glob, Grep, Bash, TaskUpdate, TaskList, TaskGet, Skill
    - **Skills:** code-semantic-search, code-structural-search, ripgrep, tdd, verification-before-completion
    - **Routing Keywords:**
      - ROUTING_TABLE entries: `performance: 'performance-engineer'`, `benchmark: 'performance-engineer'`, `profiling: 'performance-engineer'`, `loadtest: 'performance-engineer'`
      - INTENT_KEYWORDS key: `performance_engineer` with keywords: `['performance optimization', 'performance profiling', 'load testing', 'stress testing', 'benchmark', 'flame graph', 'cpu profiling', 'memory profiling', 'memory leak', 'heap dump', 'thread dump', 'garbage collection', 'gc tuning', 'latency optimization', 'throughput optimization', 'p99 latency', 'p95 latency', 'k6', 'artillery', 'locust', 'jmeter', 'gatling', 'perf', 'bottleneck', 'cache optimization', 'query optimization', 'n+1 query', 'connection pool', 'resource leak']`
      - INTENT_TO_AGENT entry: `performance_engineer: 'performance-engineer'`
    - **Disambiguation:** Add `performance` disambiguation: if context includes `['profile', 'benchmark', 'load test', 'latency', 'throughput', 'flame graph']` prefer `performance-engineer`; if `['react', 'bundle', 'render', 'lighthouse']` prefer `frontend-pro` (react_performance)
  - **Verify:** Agent file created, registered, routed

#### Tasks -- Batch 2B

- [ ] **2.5** Create `penetration-tester` agent (~30 min)
  - **Target Agent:** `developer` (invokes agent-creator skill)
  - **Agent Spec:**
    - **Name:** penetration-tester
    - **Category:** specialized (`.claude/agents/specialized/penetration-tester.md`)
    - **Model:** opus (security-critical reasoning)
    - **Description:** Ethical hacking and penetration testing specialist. Conducts security assessments using OWASP Testing Guide, identifies injection vulnerabilities (SQLi, XSS, SSRF, IDOR), tests authentication/authorization bypasses, and validates input sanitization. Generates security finding reports with severity ratings (CVSS). Distinct from security-architect (who designs security) and reverse-engineer (who analyzes binaries). Penetration-tester actively probes for vulnerabilities in running code.
    - **Tools:** Read, Glob, Grep, Bash, WebFetch, TaskUpdate, TaskList, TaskGet, Skill (Note: Read-heavy, minimal Write -- tester should not fix, only find)
    - **Skills:** code-semantic-search, code-structural-search, ripgrep, verification-before-completion
    - **Routing Keywords:**
      - ROUTING_TABLE entries: `pentest: 'penetration-tester'`, `pentesting: 'penetration-tester'`, `ethicalhacking: 'penetration-tester'`, `securitytest: 'penetration-tester'`
      - INTENT_KEYWORDS key: `penetration_tester` with keywords: `['penetration testing', 'pentest', 'pen test', 'ethical hacking', 'security testing', 'vulnerability scanning', 'owasp testing', 'sql injection', 'xss', 'cross-site scripting', 'ssrf', 'idor', 'authentication bypass', 'authorization bypass', 'privilege escalation', 'injection testing', 'input validation testing', 'security assessment', 'cvss', 'burp suite', 'zap', 'nmap', 'nikto', 'security finding']`
      - INTENT_TO_AGENT entry: `penetration_tester: 'penetration-tester'`
    - **Disambiguation:** Add `security` disambiguation extension: if context includes `['pentest', 'pen test', 'ethical hack', 'vulnerability scan', 'owasp testing']` prefer `penetration-tester`; existing security-architect rules for `['architecture', 'threat model', 'design']` unchanged
  - **Verify:** Agent file created, registered, routed

- [ ] **2.6** Create `accessibility-tester` agent (~30 min)
  - **Target Agent:** `developer` (invokes agent-creator skill)
  - **Agent Spec:**
    - **Name:** accessibility-tester
    - **Category:** specialized (`.claude/agents/specialized/accessibility-tester.md`)
    - **Model:** sonnet
    - **Description:** WCAG 2.2 compliance testing and accessibility audit specialist. Tests keyboard navigation, screen reader compatibility, color contrast ratios, focus management, ARIA attributes, and semantic HTML. Generates accessibility audit reports with WCAG success criteria references. Distinct from frontend-pro (who implements features) and mobile-ux-reviewer (who reviews mobile UX). Accessibility-tester focuses exclusively on compliance testing against WCAG standards.
    - **Tools:** Read, Glob, Grep, Bash, TaskUpdate, TaskList, TaskGet, Skill
    - **Skills:** code-semantic-search, ripgrep, verification-before-completion
    - **Routing Keywords:**
      - ROUTING_TABLE entries: `a11y: 'accessibility-tester'`, `wcag: 'accessibility-tester'`, `accessibility: 'accessibility-tester'`
      - INTENT_KEYWORDS key: `accessibility_tester` with keywords: `['accessibility testing', 'a11y', 'wcag', 'wcag 2.2', 'wcag compliance', 'screen reader', 'voiceover', 'nvda', 'jaws', 'keyboard navigation', 'focus management', 'color contrast', 'aria', 'aria-label', 'aria-describedby', 'semantic html', 'alt text', 'accessibility audit', 'axe', 'lighthouse accessibility', 'tab order', 'focus trap', 'skip links']`
      - INTENT_TO_AGENT entry: `accessibility_tester: 'accessibility-tester'`
    - **Disambiguation:** Override existing frontend `a11y`/`accessibility` routing: if context includes `['audit', 'test', 'compliance', 'wcag']` prefer `accessibility-tester`; if `['implement', 'fix', 'component', 'add']` prefer `frontend-pro`
  - **Verify:** Agent file created, registered, routed

- [ ] **2.7** Create `chaos-engineer` agent (~30 min)
  - **Target Agent:** `developer` (invokes agent-creator skill)
  - **Agent Spec:**
    - **Name:** chaos-engineer
    - **Category:** specialized (`.claude/agents/specialized/chaos-engineer.md`)
    - **Model:** sonnet
    - **Description:** Resilience testing and failure injection specialist. Designs chaos experiments using Chaos Monkey, Litmus, Gremlin, or Toxiproxy. Tests circuit breakers, retry logic, graceful degradation, and failover mechanisms. Creates game day runbooks and blast radius assessments. Distinct from qa (who tests functionality), sre-engineer (who defines reliability targets), and performance-engineer (who optimizes speed). Chaos-engineer deliberately breaks things to prove resilience.
    - **Tools:** Read, Write, Edit, Glob, Grep, Bash, TaskUpdate, TaskList, TaskGet, Skill
    - **Skills:** code-semantic-search, ripgrep, verification-before-completion
    - **Routing Keywords:**
      - ROUTING_TABLE entries: `chaos: 'chaos-engineer'`, `resilience: 'chaos-engineer'`, `failureinjection: 'chaos-engineer'`, `gameday: 'chaos-engineer'`
      - INTENT_KEYWORDS key: `chaos_engineer` with keywords: `['chaos engineering', 'chaos testing', 'failure injection', 'resilience testing', 'chaos monkey', 'litmus chaos', 'gremlin', 'toxiproxy', 'game day', 'circuit breaker testing', 'retry testing', 'graceful degradation', 'failover testing', 'blast radius', 'steady state', 'chaos experiment', 'fault injection', 'network partition', 'latency injection', 'resource exhaustion']`
      - INTENT_TO_AGENT entry: `chaos_engineer: 'chaos-engineer'`
  - **Verify:** Agent file created, registered, routed

**Success Criteria:** 7 new agent .md files created via agent-creator, all registered in agent-registry.json, routing keywords added to routing-table.cjs

---

### Phase 3: Framework Integration

**Purpose:** Update all framework files that reference agent counts, routing, and documentation
**Dependencies:** Phase 1 and Phase 2 complete
**Parallel OK:** No (sequential updates to shared files)
**Duration:** 1-2 hours

**Commit Checkpoint:** This plan modifies 15+ files. Commit Phase 1-2 agent definitions BEFORE starting Phase 3 integration.

#### Tasks

- [ ] **3.0** Commit checkpoint: Commit Phase 1-2 changes before integration (~5 min)
  - **Target Agent:** `devops`
  - **Command:** Stage and commit all new agent .md files and routing-table.cjs changes
  - **Commit message:** `feat: add 10 new specialist agents (llm-architect, prompt-engineer, mcp-developer, api-designer, microservices-architect, sre-engineer, performance-engineer, penetration-tester, accessibility-tester, chaos-engineer)`
  - **Verify:** `git log --oneline -1` shows checkpoint commit

- [ ] **3.1** Update routing-table.cjs with all new routing entries (~30 min)
  - **Target Agent:** `developer`
  - **Recommended Skills:** `verification-before-completion`
  - **File:** `.claude/lib/routing/routing-table.cjs`
  - **Changes:**
    - Add ROUTING_TABLE entries for all 10 new agents (see individual agent specs above)
    - Add INTENT_KEYWORDS blocks for all 10 new agents
    - Add INTENT_TO_AGENT mappings for all 10 new agents
    - Add DISAMBIGUATION_RULES for: `llm`, `api` (extend existing), `reliability`, `performance` (extend existing), `security` (extend existing), `accessibility` (new)
    - Add ROUTING_PREFIX_PATTERNS if needed
  - **Verify:** `node -e "const rt = require('.claude/lib/routing/routing-table.cjs'); console.log(Object.keys(rt.INTENT_TO_AGENT).length)"` shows increased count

- [ ] **3.2** Regenerate agent-registry.json (~10 min)
  - **Target Agent:** `developer`
  - **Command:** Run registry regeneration script (if exists) or manually verify all 10 new agents appear
  - **Verify:** `node -e "const r = require('.claude/context/agent-registry.json'); console.log(r.metadata.totalAgents)"` shows 59 (49 + 10)

- [ ] **3.3** Update @AGENT_ROUTING_TABLE.md (~20 min)
  - **Target Agent:** `technical-writer`
  - **Recommended Skills:** `verification-before-completion`
  - **File:** `.claude/docs/@AGENT_ROUTING_TABLE.md`
  - **Changes:** Add routing entries for all 10 new agents with keywords, descriptions, and agent-to-intent mappings
  - **Verify:** File contains all 10 new agent names

- [ ] **3.4** Update AGENT_ROUTING_CARD.md (~15 min)
  - **Target Agent:** `technical-writer`
  - **File:** `.claude/docs/AGENT_ROUTING_CARD.md`
  - **Changes:**
    - Add `llm-architect`, `prompt-engineer`, `mcp-developer` to Language Specialists or new "AI/LLM Specialists" section
    - Add `api-designer` to Framework Specialists or Review & Quality
    - Add `microservices-architect`, `sre-engineer`, `performance-engineer` to Infrastructure & Ops
    - Add `penetration-tester`, `accessibility-tester`, `chaos-engineer` to Review & Quality
    - Update total count from 49 to 59
  - **Verify:** File lists 59 agents

- [ ] **3.5** Update CLAUDE.md routing table (~15 min)
  - **Target Agent:** `technical-writer`
  - **File:** `.claude/CLAUDE.md`
  - **Changes:**
    - Update Section 3 Quick Routing table with new agents
    - Update agent count references (49 -> 59)
  - **Verify:** CLAUDE.md references all 10 new agents

**Success Criteria:** All framework files updated, agent count = 59, routing table includes all new keywords

---

### Phase 4: Verification and Quality Gates

**Purpose:** Validate all new agents work correctly and pass quality gates
**Dependencies:** Phase 3 complete
**Parallel OK:** Partial (lint/format sequential, tests can run after)
**Duration:** 1-2 hours

#### Tasks

- [ ] **4.1** Run lint and format (~10 min)
  - **Target Agent:** `qa`
  - **Recommended Skills:** `verification-before-completion`
  - **Commands:**
    - `pnpm lint:fix` -- must produce 0 errors
    - `pnpm format` -- must produce no changes
  - **Verify:** Both commands exit 0 with clean output
  - **BLOCKING:** Must pass before any other Phase 4 tasks

- [ ] **4.2** Validate routing-table.cjs loads without errors (~5 min)
  - **Target Agent:** `qa`
  - **Command:** `node -e "const rt = require('./.claude/lib/routing/routing-table.cjs'); console.log('ROUTING_TABLE keys:', Object.keys(rt.ROUTING_TABLE).length); console.log('INTENT_TO_AGENT keys:', Object.keys(rt.INTENT_TO_AGENT).length); console.log('INTENT_KEYWORDS keys:', Object.keys(rt.INTENT_KEYWORDS).length)"`
  - **Verify:** No errors, counts increased by expected amounts

- [ ] **4.3** Validate agent-registry.json structure (~5 min)
  - **Target Agent:** `qa`
  - **Command:** `node -e "const r = require('./.claude/context/agent-registry.json'); console.log('Total agents:', r.metadata.totalAgents); const newAgents = ['llm-architect', 'prompt-engineer', 'mcp-developer', 'api-designer', 'microservices-architect', 'sre-engineer', 'performance-engineer', 'penetration-tester', 'accessibility-tester', 'chaos-engineer']; const found = newAgents.filter(a => r.agents[a]); console.log('Found:', found.length, '/', newAgents.length)"`
  - **Verify:** All 10 new agents found, total = 59

- [ ] **4.4** Validate each agent .md file has required sections (~15 min)
  - **Target Agent:** `qa`
  - **Recommended Skills:** `checklist-generator`, `verification-before-completion`
  - **Checklist for each of 10 agents:**
    - [ ] YAML frontmatter with name, model, skills, tools
    - [ ] Enforcement Hooks table
    - [ ] Memory Protocol section
    - [ ] Task Progress Protocol section (TaskUpdate warning box)
    - [ ] Code Search Optimization section (search skills)
    - [ ] Skills section with `Skill()` invocation examples
    - [ ] No prompt fiction (no fake metrics, no claimed capabilities without backing)
    - [ ] Description matches routing keywords
  - **Verify:** All 10 agents pass all 8 checklist items

- [ ] **4.5** Run existing tests to verify no regressions (~10 min)
  - **Target Agent:** `qa`
  - **Command:** `pnpm test`
  - **Verify:** No NEW test failures (pre-existing failures acceptable, count should not increase)

**Success Criteria:** Lint clean, format clean, all validations pass, no regressions

---

### Phase 5: Documentation and Memory Updates

**Purpose:** Update documentation and memory files
**Dependencies:** Phase 4 complete
**Parallel OK:** Yes
**Duration:** 30-45 min

#### Tasks

- [ ] **5.1** Update learnings.md with adoption patterns (~10 min)
  - **Target Agent:** `developer`
  - **File:** `.claude/context/memory/learnings.md`
  - **Content:** Document the agent adoption pattern: batch creation via agent-creator, routing integration, disambiguation rules

- [ ] **5.2** Update decisions.md with ADR-090 status (~5 min)
  - **Target Agent:** `developer`
  - **File:** `.claude/context/memory/decisions.md`
  - **Content:** Update ADR-090 status from "Proposed" to "Accepted" with implementation date

- [ ] **5.3** Commit all changes (~10 min)
  - **Target Agent:** `devops`
  - **Recommended Skills:** `verification-before-completion`
  - **Commands:**
    - `pnpm lint:fix && pnpm format` (final verification)
    - Stage all changes
    - Commit with: `feat: integrate 10 new specialist agents with routing, registry, and documentation`
  - **Verify:** `git log --oneline -3` shows clean commits, `git status` shows clean working tree

**Success Criteria:** Memory updated, all changes committed, working tree clean

---

### Phase FINAL: Evolution and Reflection Check

**Purpose:** Quality assessment and learning extraction
**Dependencies:** Phase 5 complete

**Tasks:**

1. Spawn reflection-agent to analyze completed work
2. Extract learnings and update memory files
3. Check for evolution opportunities (new agents/skills needed)

**Spawn Command:**

```
Task({
  subagent_type: "reflection-agent",
  description: "Session reflection and learning extraction",
  prompt: "You are REFLECTION-AGENT. Read @.claude/agents/core/reflection-agent.md. Analyze the completed agent adoption work from this plan (10 new agents from awesome-claude-code-subagents analysis). Extract learnings to memory files, and check for evolution opportunities. Focus on: (1) Was the batch agent creation pattern efficient? (2) Are there integration gaps? (3) Should any disambiguation rules be refined based on routing behavior?"
})
```

**Success Criteria:**

- Reflection-agent spawned and completed
- Learnings extracted to `.claude/context/memory/learnings.md`
- Evolution opportunities logged if any detected

---

## Risks

| Risk                                              | Impact | Mitigation                                                                    | Rollback                                          |
| ------------------------------------------------- | ------ | ----------------------------------------------------------------------------- | ------------------------------------------------- |
| Agent-creator skill fails mid-batch               | Medium | Commit after each batch (Phase 3.0 checkpoint)                                | `git revert HEAD`                                 |
| Routing keyword conflicts with existing agents    | Medium | Disambiguation rules for all ambiguous keywords                               | Remove conflicting entries from routing-table.cjs |
| Context limit hit during 7-agent batch            | High   | Split into Batch 2A (4) and Batch 2B (3)                                      | Complete remaining agents in new session          |
| New agents break existing routing tests           | Low    | Run `pnpm test` in Phase 4.5                                                  | Fix failing tests or adjust routing keywords      |
| Agent definitions too long (not checklist format) | Medium | Explicit constraint: checklist format, no prose paragraphs, no prompt fiction | Code review in Phase 4.4                          |

## Timeline Summary

| Phase                   | Tasks   | Est. Time      | Parallel?       |
| ----------------------- | ------- | -------------- | --------------- |
| Phase 1: P0 Agents      | 3       | 2-3 hours      | Yes             |
| Phase 2: P1 Agents      | 7       | 4-5 hours      | Yes (2 batches) |
| Phase 3: Integration    | 6       | 1-2 hours      | No              |
| Phase 4: Verification   | 5       | 1-2 hours      | Partial         |
| Phase 5: Documentation  | 3       | 30-45 min      | Yes             |
| Phase FINAL: Reflection | 1       | 15-30 min      | N/A             |
| **Total**               | **25+** | **8-12 hours** |                 |

## Explicit Exclusions (What NOT to Do)

1. **DO NOT** adopt ACCS plugin/marketplace system (P2, future work per ADR-090)
2. **DO NOT** convert existing 49 agents to checklist format (separate pipeline, P2)
3. **DO NOT** create LOW priority agents (rails-expert, django-developer, etc.)
4. **DO NOT** copy prompt fiction patterns (fake metrics, fictional capabilities)
5. **DO NOT** reorganize agent directories (numbered prefixes are P3 per code-simplifier report)
6. **DO NOT** create CLAUDE-QUICK.md (P2 per code-simplifier report)
7. **DO NOT** adopt ACCS agents that duplicate existing AS capabilities (context-manager, agent-organizer, multi-agent-coordinator, task-distributor)

## Agent Creation Template (Reference for Developers)

All 10 new agents should follow this pattern (from code-simplifier report recommendations):

```yaml
---
name: {agent-name}
model: {opus|sonnet}
description: {one-line description for routing}
tools:
  - Read
  - Write  # (if writes code)
  - Edit   # (if edits code)
  - Glob
  - Grep
  - Bash
  - TaskUpdate
  - TaskList
  - TaskGet
  - Skill
skills:
  - task-management-protocol
  - code-semantic-search
  - ripgrep
  - verification-before-completion
  # (domain-specific skills)
context_files:
  - '@.claude/context/memory/learnings.md'
---

# {Agent Name} Agent

## Enforcement Hooks
(standard hook table -- copy from ai-ml-specialist.md template)

## Core Persona
**Identity**: {role}
**Style**: {approach}
**Values**: {principles}

## Responsibilities
1. {responsibility 1}
2. {responsibility 2}
3. {responsibility 3}

## Development Checklist
- [ ] Read memory: learnings.md, decisions.md
- [ ] Search first: Skill({ skill: 'code-semantic-search' })
- [ ] {domain-specific step 1}
- [ ] {domain-specific step 2}
- [ ] Verify: run appropriate tests/checks
- [ ] Complete: TaskUpdate({ status: 'completed', metadata: {...} })

## Skills
- code-semantic-search: Find code by meaning
- ripgrep: Fast text search
- {domain-skill}: {description}

## What This Agent Is NOT
- NOT for {common confusion 1}
- NOT for {common confusion 2}

## Code Search Optimization
(standard search table -- copy from template)

## Memory Protocol (MANDATORY)
(standard memory protocol)

## Task Progress Protocol (MANDATORY)
(standard TaskUpdate warning box)
```

## Quality Checklist (IEEE 1028 + Contextual)

### Code Quality

- [ ] All new files follow kebab-case naming
- [ ] Provenance headers on all generated files
- [ ] No console.log in production code

### Testing

- [ ] Routing table loads without errors
- [ ] Agent registry validates
- [ ] No new test failures

### Documentation

- [ ] AGENT_ROUTING_CARD.md updated
- [ ] @AGENT_ROUTING_TABLE.md updated
- [ ] CLAUDE.md routing table updated
- [ ] ADR-090 status updated

### Framework-Specific (AI-Generated)

- [ ] Each agent has search skills (Tier 2-3)
- [ ] Each agent has memory protocol
- [ ] Each agent has TaskUpdate protocol
- [ ] No prompt fiction in any agent definition
- [ ] Each agent has disambiguation rules where needed
- [ ] Routing keywords do not conflict with existing agents

---

**Total Items:** 43 (checklist) + 25 (tasks) = 68 verification points
