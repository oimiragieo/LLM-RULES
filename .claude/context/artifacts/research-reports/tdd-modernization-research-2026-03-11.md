<!-- Agent: researcher | Task: #5 | Session: 2026-03-11 -->

# Research Report: TDD Modernization — 2026 Gap Analysis

**Date**: 2026-03-11
**Researcher**: researcher agent
**Task**: #5
**Batch/Phase**: Ecosystem Audit Phase 1 / Research
**Sources Consulted**: 6

---

## Executive Summary

Agent Studio's TDD skill (v1.2.0) is well-structured for Canon TDD and multi-agent decomposition but has measurable gaps against 2026 industry standards. The most critical gaps are: (1) no mention of Vitest as the 2025-2026 JavaScript testing standard replacing Jest, (2) no coverage of MSW (Mock Service Worker) for API boundary testing, (3) no Pact-based consumer-driven contract testing beyond internal hook contracts, (4) no patterns for testing non-deterministic AI/LLM behavior (scoring-based evaluation instead of binary pass/fail), and (5) the LSP-navigator skill does not document LSP 3.17 features (inlay hints, type hierarchy, semantic tokens). The TDD skill's existing multi-agent decomposition and property-based testing sections are ahead of many frameworks.

---

## Research Methodology

### Search Queries Executed

| #   | Query | Source | Results Found |
| --- | ----- | ------ | ------------- |
| 1   | TDD best practices 2025 2026 AI-assisted development agentic systems | WebSearch | 10 results |
| 2   | Test-Driven Development modern JavaScript TypeScript Vitest MSW 2025 2026 patterns | WebSearch | 10 results |
| 3   | property-based testing fast-check contract testing Pact 2025 best practices TypeScript | WebSearch | 10 results |
| 4   | Direct skill read: `.claude/skills/tdd/SKILL.md` | Internal | Full file |
| 5   | Direct skill read: `.claude/skills/lsp-navigator/SKILL.md` | Internal | Full file |

### Sources Consulted

| #   | Title | Type | URL | Date |
| --- | ----- | ---- | --- | ---- |
| 1   | Red/green TDD — Agentic Engineering Patterns | Blog | https://simonwillison.net/guides/agentic-engineering-patterns/red-green-tdd/ | 2025-2026 |
| 2   | Why TDD Works So Well In AI-assisted Programming | Blog | https://codemanship.wordpress.com/2026/01/09/why-does-test-driven-development-work-so-well-in-ai-assisted-programming/ | Jan 2026 |
| 3   | Vitest 4 Adoption Guide | Article | https://blog.logrocket.com/vitest-adoption-guide/ | Dec 2025 |
| 4   | Contract Testing with Pact Best Practices 2025 | Article | https://www.sachith.co.uk/contract-testing-with-pact-best-practices-in-2025-practical-guide-feb-10-2026/ | Feb 2026 |
| 5   | Fast-Check Comprehensive Guide to Property-Based Testing | Article | https://medium.com/@joaovitorcoelho10/fast-check-a-comprehensive-guide-to-property-based-testing-2c166a979818 | 2025 |
| 6   | TDD & AI: The Giant Gap Between Claim and Practice | Article | https://kotrotsos.medium.com/tdd-ai-the-giant-gap-between-claim-and-practice-8b3bfe5a3f7f | Jan 2026 |

---

## Detailed Findings

### Topic 1: Current TDD Skill Coverage Assessment

**Key Insights:**

- The TDD skill (v1.2.0) implements Canon TDD (Kent Beck) with AI-specific guardrails and is referenced against 6 arXiv papers (LLM4TDD, TDFlow, SWE-Flow, etc.)
- Multi-agent TDD decomposition is documented (qa writes test, developer implements, reflection-agent detects test-hacking)
- Property-based testing (fast-check) is mentioned but only for routing: `routeIntent(anyString) always returns string`
- Mutation testing with Stryker JS is documented for security-critical code
- Contract testing is covered only for internal hook stdin/stdout boundaries (routing-guard, unified-creator-guard, spawn-token-guard)
- LSP pre-RED type verification is integrated into the TDD workflow
- Test commands referenced: `pnpm test <target>`, `pnpm lint`, `pnpm format:check`

**Evidence:**

The skill's "Agent-Studio TDD Extensions (2026)" section shows Agent Studio-specific patterns (hook testing, memory TDD, property-based testing for routing, contract testing for TaskUpdate metadata). However, the test runner section says only "Use the project's actual commands" without recommending Vitest specifically.

**Relevance to Our Framework:**

The existing TDD skill is coherent and well-structured. Upgrades should be additive, not disruptive.

---

### Topic 2: Vitest 4 as 2025-2026 JavaScript Standard

**Key Insights:**

- Vitest 4 (released December 2025) is the de-facto replacement for Jest in new TypeScript/ESM projects
- Key advantages: Vite-native HMR (test feedback in <100ms vs 8s for Jest), first-class TypeScript + ESM support, Browser Mode (stable in v4), visual regression testing
- Vitest uses `describe`/`it`/`expect` API compatible with Jest — migration is largely a config change
- Boot time drops from 8s (Jest) to 1.2s (Vitest) in real projects — directly relevant to TDD cycle speed
- Agent Studio uses `node --test` (built-in Node.js test runner) not Vitest or Jest currently

**Evidence:**

"Vitest 4 was updated in December 2025 to cover stable Browser Mode and visual regression testing capabilities. Vitest is a blazingly fast testing framework with out-of-the-box hot module reload (HMR), TypeScript, ECMAScript module (ESM), and JSX support." (LogRocket, Dec 2025)

**Relevance to Our Framework:**

Agent Studio uses `.cjs` (CommonJS) files for hooks and lib, and `node --test` as runner. Vitest's primary advantage is for ESM/TypeScript projects. The TDD skill should at minimum document why `node --test` is used for `.cjs` files and when Vitest would be preferred (ESM skills, future TypeScript migration). The skill should reference both runners and their appropriate use cases.

---

### Topic 3: MSW (Mock Service Worker) for API Boundary Testing

**Key Insights:**

- MSW v2 (2025 standard) intercepts network requests at the service-worker/Node.js level, not by monkey-patching `fetch`
- Works with both Vitest and Jest; MSW handlers define request/response contracts
- Pattern: start MSW server in test setup → define handlers per test → MSW intercepts actual HTTP calls → no code changes needed in production code
- Critical difference from manual mocking: tests exercise real HTTP client code paths, not mocked abstractions
- MSW + Vitest is the 2025 recommended stack for testing code that makes HTTP calls (external APIs, internal services)

**Evidence:**

"Mock Service Worker (MSW) can be used with Vitest to intercept REST and GraphQL API requests. MSW is a powerful tool that allows you to intercept and mock network requests at the network level." (Steve Kinney, stevekinney.com)

**Relevance to Our Framework:**

Agent Studio hooks and skills that call external APIs (WebSearch, WebFetch, researcher skill) could benefit from MSW-based contract tests. Currently only stdin/stdout boundaries are covered. This is a genuine gap for integration testing of web-facing components.

---

### Topic 4: AI/LLM Behavior Evaluation — Non-Deterministic Testing Patterns

**Key Insights:**

- A key challenge with agentic systems: LLM outputs are non-deterministic — binary pass/fail assertions are insufficient
- 2026 emerging pattern: "evaluation-based testing" — score LLM outputs on dimensions (relevance 0-1, safety 0-1, faithfulness 0-1)
- Testing agents requires evaluating behaviors, reasoning, and decision-making rather than exact answers
- Success criteria: scores, ratings, user satisfaction metrics rather than just pass/fail
- For tool-call agents specifically: test the SEQUENCE of tool calls, not the content of generated text
- Simon Willison (2025) specifically recommends Red/Green TDD for agents with tests written as executable assertions on tool-call sequences and structured outputs

**Evidence:**

"With AI agents outcomes vary, so tests need flexibility, requiring evaluation of behaviors, reasoning, and decision-making rather than exact answers, with nuanced success criteria like scores, ratings, and user satisfaction." (Latent Space, 2025)

**Relevance to Our Framework:**

The current TDD skill covers `routeIntent(anyString) always returns string` (deterministic routing check) but does not address testing agent output quality or tool-call sequence validation. Agent Studio's reflection-agent does manual review of agent outputs — formalized evaluation-based tests would be a significant upgrade.

---

### Topic 5: Consumer-Driven Contract Testing (Pact) for Multi-Agent Boundaries

**Key Insights:**

- Pact v4+ is the 2025 standard for consumer-driven contract testing between services
- Pattern: Consumer writes a Pact test defining its expectations → Pact generates a contract file → Provider verifies the contract against its actual implementation
- Pact Broker stores contracts and enables CI/CD integration
- Key difference from current Agent Studio hook contract tests: Pact produces a shareable, versioned contract artifact; current tests are one-shot inline assertions
- TypeScript support via `@pact-foundation/pact` package
- Best for: agent-to-agent API calls, skill input/output schemas, TaskUpdate metadata schemas

**Evidence:**

"Consumer-driven contract testing with Pact v4.0.0+ includes improved message-based contract support and enhanced CLI usability. The Pact Broker serves as a repository and facilitates sharing between teams and CI pipelines." (Sachith Dassanayake, Feb 2026)

**Relevance to Our Framework:**

Agent Studio's TaskUpdate metadata schema (processedReflectionIds: string[]) is currently tested inline. Pact would formalize these as versioned, published contracts. This is most valuable for the reflection-agent → router handoff and spawn-prompt → subagent interface contracts.

---

### Topic 6: Property-Based Testing Expansion (fast-check)

**Key Insights:**

- Current skill mentions fast-check only for routing: `routeIntent(anyString) always returns string`
- 2025 best practice: property-based testing for ANY function with invariants (not just routing)
- Key properties to test in Agent Studio context:
  - Memory serialization: `serialize(deserialize(x)) === x` for all JSON-able values
  - Hook validation: `isValidInput(x) === !isBlocked(x)` for all tool inputs
  - Path normalization: `normalize(path) === normalize(normalize(path))` (idempotency)
  - Schema validation: `validate(schema, x)` never throws uncaught exception for any input
- fast-check 3.x (2025) adds improved unicode, date, and bigint arbitraries

**Evidence:**

"Property-based testing is an approach that involves specifying statements that should always be true, which enables testing functions across a large number of inputs with fewer tests." (Medium, 2025)

**Relevance to Our Framework:**

The TDD skill should expand property-based testing guidance beyond the routing example to cover memory serialization, hook validation logic, and path normalization — all areas where edge-case invariants matter.

---

### Topic 7: LSP Navigator — 2026 Protocol Gaps (LSP 3.17+)

**Key Insights:**

- LSP 3.17 (2022, widely deployed by 2025) added: Inlay Hints, Type Hierarchy, Semantic Tokens, Go-to-Declaration (distinct from definition)
- LSP Navigator skill (v1.2.0) covers 9 operations but does not document:
  - `textDocument/inlayHint` — inline parameter names and type annotations (useful for TDD pre-RED verification)
  - `textDocument/typeHierarchy` (prepareTypeHierarchy, supertypes, subtypes) — for class/interface hierarchy analysis
  - `textDocument/semanticTokens` — full-file semantic highlighting data
  - `textDocument/declaration` — go to declaration (distinct from definition, relevant for TypeScript `declare` statements)
- The skill already documents the most important limitation: LSP returns empty for `.cjs` files
- The CJS limitation documentation is thorough and accurate

**Evidence:**

LSP 3.17 specification (2022) adds these capabilities; they are broadly supported by typescript-language-server 5.x+ which would be the LSP server for this workspace.

**Relevance to Our Framework:**

Inlay hints (`textDocument/inlayHint`) would be particularly useful for TDD pre-RED verification — they show parameter names inline, making it easier to verify function signatures without a hover call. The type hierarchy operations would be useful for architect and code-reviewer agents tracing inheritance chains.

---

### Topic 8: Snapshot Testing

**Key Insights:**

- Snapshot testing (Jest/Vitest `toMatchSnapshot()`) is widely used for:
  - UI component output (React, Vue)
  - JSON/config structure validation — confirm schema structure doesn't regress
  - CLI output — confirm tool output format stability
- Not appropriate for LLM-generated content (too variable)
- Appropriate for deterministic structured outputs: routing table entries, agent registry JSON, hook output formats
- Vitest supports inline snapshots (`toMatchInlineSnapshot()`) — keeps expected value in test file

**Evidence:**

"Vitest is a powerful testing library built on top of Vite that can be used for unit, integration, end-to-end (E2E), snapshot, and performance testing." (LogRocket, Dec 2025)

**Relevance to Our Framework:**

Agent Studio's agent-registry.json, routing-table-data.cjs output, and hook JSON response formats are all stable structured outputs suitable for snapshot tests. This pattern is absent from the current TDD skill.

---

### Topic 9: Playwright Component Testing

**Key Insights:**

- Playwright Component Testing (ct) mode runs component tests in a real browser at unit-test speed
- Available for React, Vue, Svelte, Solid
- Distinct from Playwright E2E tests: component tests don't require a running server
- 2025 pattern: use Playwright ct for components with complex visual behavior, use Vitest for pure logic
- Not currently relevant to Agent Studio (no UI components) but relevant if a UI is added

**Evidence:**

"A combination approach works best: Jest or Vitest for fast unit tests, plus Cypress or Playwright for critical E2E workflows." (JavaScript in Plain English, 2025)

**Relevance to Our Framework:**

Low priority for Agent Studio — purely server-side/CLI. Document as "future consideration" only.

---

## Academic References

### 1. LLM4TDD (arXiv:2312.04687, 2023)

- **Authors**: Various
- **Key Insight**: LLMs guided by failing test cases produce significantly better code than LLMs given only natural language descriptions
- **Relevance**: Validates Agent Studio's current "tests as executable specs" approach
- **URL**: https://arxiv.org/abs/2312.04687

### 2. TDFlow (arXiv:2510.23761, 2025)

- **Authors**: Various
- **Key Insight**: Multi-agent TDD decomposition (separate test-writer and implementer agents) achieves 94.3% on SWE-Bench Verified vs 60-70% for monolithic agents
- **Relevance**: Agent Studio's multi-agent TDD decomposition (qa + developer + reflection-agent) is directly aligned with this finding
- **URL**: https://arxiv.org/abs/2510.23761

### 3. Scaling TDD from Functions to Classes (arXiv:2602.03557, 2026)

- **Authors**: Various
- **Key Insight**: Method dependency ordering enables class-level TDD to work reliably; derive method dependency order before test sequence
- **Relevance**: The TDD skill documents this pattern for "class-level synthesis"
- **URL**: https://arxiv.org/abs/2602.03557

### 4. Tests as Prompt (arXiv:2505.09027, 2025)

- **Authors**: Various
- **Key Insight**: Using test cases as the primary prompt context for LLM code generation outperforms natural language descriptions
- **Relevance**: Supports Agent Studio's pattern of keeping prompts test-centric
- **URL**: https://arxiv.org/abs/2505.09027

---

## Gap Analysis Table

| Feature | Current TDD Skill | 2026 Standard | Gap Severity | Recommendation |
|---------|-------------------|---------------|--------------|----------------|
| Test runner documentation | Generic `pnpm test` | Vitest 4 + `node --test` by use case | MEDIUM | Document when to use each runner |
| API mocking strategy | Not covered | MSW v2 (network-level interception) | HIGH | Add MSW pattern for HTTP-boundary tests |
| Consumer-driven contracts | Hook stdin/stdout only | Pact v4 for inter-service contracts | MEDIUM | Add Pact pattern for TaskUpdate/agent schemas |
| AI output evaluation | Not covered | Score-based evaluation (0-1 range) | HIGH | Add LLM evaluation testing patterns |
| Property-based testing | Routing example only | All invariant-bearing functions | MEDIUM | Expand to memory, hooks, path normalization |
| Snapshot testing | Not covered | JSON/config regression testing | LOW | Add snapshot testing pattern |
| Playwright component | Not covered | Only for UI projects | SKIP | Not applicable (no UI) |
| LSP inlay hints | Not covered | LSP 3.17 `textDocument/inlayHint` | LOW | Document in lsp-navigator skill |
| LSP type hierarchy | Not covered | LSP 3.17 typeHierarchy operations | LOW | Document in lsp-navigator skill |
| Agent tool-call sequence testing | Not covered | Validate tool call order/count | HIGH | New pattern needed |
| SQLite test isolation | Not covered | In-memory SQLite + transaction rollback | MEDIUM | Add isolation pattern for agent-studio SQLite tests |

---

## Practical Recommendations

### P0 (Immediate — This Sprint)

- **Add AI output evaluation pattern** to TDD skill: document how to test LLM/agent outputs using score-based assertions (not binary pass/fail), including tool-call sequence validation for agent tests (verify `TaskUpdate(in_progress)` called before `TaskUpdate(completed)`)
- **Add MSW v2 pattern** to TDD skill for testing skills/agents that make HTTP calls — specifically relevant for researcher skill and WebFetch boundary tests
- **Add agent tool-call sequence testing pattern** — how to mock/spy on tool calls (`WebSearch`, `TaskUpdate`, `Bash`) and assert they were called in expected sequence and count

### P1 (Soon — Next Sprint)

- **Document test runner selection** in TDD skill: `node --test` for `.cjs` CommonJS (current standard for hooks and lib), Vitest 4 for ESM/TypeScript files (future standard as project migrates)
- **Expand property-based testing examples**: add `serialize/deserialize` roundtrip, hook validation invariants, and path normalization idempotency examples beyond the routing-only example
- **Add Pact consumer-driven contract testing** for TaskUpdate metadata schema, spawn-prompt → subagent interface, and reflection-agent handoff contracts
- **Add SQLite test isolation pattern**: in-memory SQLite (`:memory:`) for unit tests, transaction rollback for integration tests — relevant to TaskStateMachine and A2A components

### P2 (Future — Backlog)

- **Add LSP 3.17 feature documentation** to lsp-navigator skill: `textDocument/inlayHint`, `textDocument/typeHierarchy` (supertypes/subtypes), `textDocument/declaration`
- **Snapshot testing guidance**: document when to use `toMatchSnapshot()` for agent-registry.json, routing table outputs, hook response JSON
- **Evaluation harness design**: formal design for LLM evaluation-based test infrastructure — scoring pipeline, threshold configuration, CI gate integration

---

## Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| TDD skill remains Jest-centric as project migrates to ESM | High — slows ESM adoption | Medium | Document Vitest + node:test selection criteria now |
| Agent output quality tested only by humans (reflection-agent) | High — undetected regressions in routing quality | High | Add score-based evaluation pattern; automate with CI threshold |
| HTTP-boundary changes untested (researcher, WebFetch) | Medium — silent breakage on API changes | Medium | Add MSW-based boundary tests for researcher skill |
| Pact contracts not formalized → schema drift | Medium — TaskUpdate metadata schema diverges across agents | Low | Formalize 3-4 key contracts with Pact before drift occurs |
| LSP 3.17 features unknown to agents → missed tooling opportunities | Low — agents use slower workarounds | Medium | Document inlay hints as TDD pre-RED verification shortcut |
| Property-based tests only cover routing → undetected edge cases in memory/hooks | High — memory and hook bugs from edge inputs | Medium | Expand fast-check coverage to 5+ modules |

---

## Implementation Roadmap

**Week 1 (P0 items):**
1. Update TDD skill with AI output evaluation pattern (tool-call sequence testing)
2. Add MSW v2 pattern to TDD skill under "API Boundary Testing"
3. Add agent tool-call spy/mock pattern to "Agent-Studio TDD Extensions"

**Week 2 (P1 items):**
1. Document `node --test` vs Vitest selection in TDD skill "Pre-Completion Commands" section
2. Expand property-based testing examples to cover memory + hooks + paths
3. Add Pact contract testing guidance for inter-agent schema contracts
4. Add SQLite test isolation patterns to TDD skill

**Week 3 (P2 items):**
1. Update lsp-navigator skill with LSP 3.17 feature table
2. Add snapshot testing section to TDD skill
3. Design formal LLM evaluation harness specification

---

## Appendix: Key URLs

- Vitest 4 adoption guide: https://blog.logrocket.com/vitest-adoption-guide/
- MSW quick start: https://mswjs.io/docs/quick-start/
- Pact best practices 2025: https://www.sachith.co.uk/contract-testing-with-pact-best-practices-in-2025-practical-guide-feb-10-2026/
- TDD & AI gap analysis (Jan 2026): https://kotrotsos.medium.com/tdd-ai-the-giant-gap-between-claim-and-practice-8b3bfe5a3f7f
- AI Agents meet TDD (Latent Space): https://www.latent.space/p/anita-tdd
- Simon Willison agentic TDD: https://simonwillison.net/guides/agentic-engineering-patterns/red-green-tdd/
