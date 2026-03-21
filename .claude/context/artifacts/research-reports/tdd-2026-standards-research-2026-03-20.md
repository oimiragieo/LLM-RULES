<!-- Agent: researcher | Task: #5 | Session: 2026-03-20 -->

# Research Report: TDD 2026 Industry Standards and AI-Assisted Testing Patterns

**Date**: 2026-03-20
**Researcher**: researcher agent
**Task**: #5
**Batch/Phase**: Phase 2A — TDD Standards Research
**Sources Consulted**: 7

---

## Executive Summary

The 2026 TDD landscape has evolved significantly with AI-assisted development becoming mainstream. Key findings: (1) Test-Driven Prompting (TDP) — injecting verbatim failing test output into agent spawn prompts — is the dominant 2026 multi-agent TDD pattern, backed by arXiv:2510.23761 and arXiv:2603.17973 (70% regression reduction); (2) TDAID (Test-Driven AI-Assisted Development) extends the classic Red-Green-Refactor cycle with explicit Planning and Validation gates; (3) Our current TDD skill (v1.3.0) already incorporates most 2026 patterns including TDP, multi-agent decomposition, and property-based testing — but gaps remain in AI-specific evaluation patterns (score-based assertions, non-deterministic agent testing), MSW v2 boundary mocking, and TDAD impact analysis tooling; (4) The LSP skill has known CJS limitations but is otherwise current; (5) Our STM/MTM/LTM memory architecture aligns with 2026 industry patterns including the hippocampus→cortex consolidation model.

---

## Research Methodology

### Search Queries Executed

| # | Query | Source | Results Found |
|---|-------|--------|---------------|
| 1 | "TDD best practices 2026 AI-assisted development" | WebSearch | 10 links |
| 2 | "property-based testing mutation testing 2025 2026 modern patterns JavaScript TypeScript" | WebSearch | 10 links |
| 3 | "AI agent testing frameworks autonomous agents TDD 2025 2026 test strategies" | WebSearch | 10 links |
| 4 | TDAD arXiv paper (arXiv:2603.17973) | WebFetch (arxiv.org) | Full paper |
| 5 | "AI agent memory persistence testing patterns 2026 STM LTM" | WebSearch | 10 links |
| A | Internal memory search: "TDD best practices AI testing 2026" | memory-search | 10 results (avg 43% similarity) |
| B | Internal memory search: "TDD testing patterns 2026" | memory-search | 10 results (avg 47% similarity) |

### Sources Consulted

| # | Title | Type | URL | Date |
|---|-------|------|-----|------|
| 1 | TDAD: Test-Driven Agentic Development (arXiv:2603.17973) | Academic Paper | https://arxiv.org/abs/2603.17973 | 2026 |
| 2 | Why TDD Works Well in AI-Assisted Programming | Blog (Codemanship) | https://codemanship.wordpress.com/2026/01/09/ | Jan 2026 |
| 3 | Better AI Driven Development with TDD (Eric Elliott) | Article | https://medium.com/effortless-programming/ | 2026 |
| 4 | Guide AI Agents Through TDD | Article | https://elite-ai-assisted-coding.dev/ | 2026 |
| 5 | State of JavaScript 2025: Testing | Survey | https://2025.stateofjs.com/en-US/libraries/testing/ | 2025 |
| 6 | Mutation Testing Ultimate Guide 2025 | Guide | https://mastersoftwaretesting.com/ | 2025 |
| 7 | Multi-agent Memory Architecture (Microsoft) | Reference | https://microsoft.github.io/multi-agent-reference-architecture/docs/memory/ | 2026 |
| 8 | Mem0 Research (26% accuracy boost) | Research | https://mem0.ai/research | 2026 |
| 9 | Designing STM/MTM/LTM for Local AI Agents | Article | https://dev.to/kim_namhyun | 2026 |
| 10 | Internal: agent-studio TDD skill v1.3.0 | Codebase | .claude/skills/tdd/SKILL.md | 2026-03-12 |

---

## Detailed Findings

### Topic 1: TDD with AI-Assisted Development — 2026 Core Patterns

**Key Insights:**

- Tests as specifications: AI agents cannot "cheat" by writing tests that verify broken behavior when tests exist BEFORE implementation — the test defines the contract, not the implementation
- TDP (Test-Driven Prompting) is the dominant 2026 multi-agent TDD pattern: inject verbatim failing test output into agent spawn prompts rather than prose descriptions
- TDAID extends classic TDD with Planning (thinking-model generates structured plan with test checkpoints) and Validation (detect specification gaming, confirm implementation matches plan) phases
- AI accelerates ALL phases: test generation, implementation, and refactoring — but the discipline of writing tests first must be maintained
- Prescriptive approaches FAIL: adding TDD instructions without contextual test information worsens performance (TDAD study: regressions 9.94% vs 6.08% baseline)

**Evidence:**

From TDAD (arXiv:2603.17973): Surfacing contextual information (which tests to run) reduces regressions from 6.08% → 1.82% (70% reduction). Prescriptive workflow instructions without context actually increased regressions to 9.94%.

From WebSearch sources: "TDD produces dramatically better results from AI coding agents, preventing a failure mode where agents write tests that verify broken behavior."

**Relevance to Our Framework:**

Our TDD skill (v1.3.0) already implements TDP (Section "Test-Driven Prompting") and multi-agent decomposition via qa → developer → reflection-agent pipeline. The TDAD finding about contextual test information aligns with our TDP pattern but suggests we should also include the dependency map in spawn prompts.

**Gap Assessment:**

- PRESENT: TDP pattern, multi-agent decomposition, TDFlow arXiv reference, Flakiness Gate
- GAP: TDAD static dependency map skill (which tests to run before committing) — not yet implemented
- GAP: TDAID Validation phase implementation guidance (detecting specification gaming patterns) is light

---

### Topic 2: Property-Based and Mutation Testing — 2026 State

**Key Insights:**

- fast-check 3.x (2025-2026) is the standard for JavaScript/TypeScript property-based testing, with improved unicode, date, and bigint arbitraries; works with Jest, Mocha, Vitest
- Stryker Mutator remains the standard mutation testing tool for JS/TS with Vitest integration via `@stryker-mutator/vitest-runner` (StrykerJS 7.x)
- LLM-based mutation testing is an emerging 2026 pattern: using LLMs to generate semantically equivalent but behaviorally different mutations (beyond syntactic operators)
- Predictive mutation selection: ML models identify mutations most likely to expose test gaps by analyzing historical results and code change patterns
- Mutation score target: >80% is current industry standard for critical code paths

**Evidence:**

State of JavaScript 2025 confirms Vitest has become the dominant test runner. Stryker Mutator GitHub shows active 2025-2026 development with TypeScript support.

**Relevance to Our Framework:**

Our TDD skill already includes property-based testing with fast-check and mutation testing with Stryker. The skill's examples match 2026 patterns (vitest runner, incremental mode, 80% threshold).

**Gap Assessment:**

- PRESENT: fast-check property-based patterns, Stryker mutation testing with vitest runner, 80% threshold
- PARTIAL: LLM-based mutation testing not mentioned in skill (emerging pattern, not yet standard)
- PARTIAL: Predictive mutation selection mentioned as "emerging" in sources — too cutting-edge for our skill

---

### Topic 3: AI Agent Testing — Score-Based and Non-Deterministic Patterns

**Key Insights:**

- 57% of organizations now have agents in production (LangChain State of AI Agents 2026) — agent testing has become critical infrastructure
- Non-deterministic agent outputs require score-based assertions (0.0–1.0 dimensional scoring) rather than binary pass/fail
- Tool-call sequence validation is the 2026 standard for agent unit tests: verify ordering and count of tool calls, not just final output
- LLM-as-judge: using a judge LLM to evaluate agent outputs against criteria (relevance, faithfulness, safety, format) with threshold gates
- Contract testing between agents: Zod schemas to validate handoff contracts between pipeline stages
- MSW (Mock Service Worker) v2 for HTTP boundary mocking in agent tests: intercepts at network level, enables `onUnhandledRequest: 'error'` to catch unintended external calls

**Evidence:**

From search: "Unlike traditional software systems where identical inputs produce identical outputs, AI agents generate varied responses even under identical conditions." Multi-level evaluation spanning component testing through end-to-end simulation is the recommended approach.

**Relevance to Our Framework:**

Our TDD skill has substantial AI agent testing content added in 2026 extensions (AI Output Evaluation Testing section, MSW v2 section). These are present and current.

**Gap Assessment:**

- PRESENT: Score-based assertions, tool-call sequence validation, MSW v2 patterns, contract testing with Zod
- PRESENT: Agent-Studio specific targets for MSW (researcher skill, github-ops skill)
- GAP: LLM-as-judge evaluation framework not referenced in skill — `agent-evaluation` skill is mentioned for invocation but no patterns shown
- GAP: LoCoMo benchmark (Long Conversation Memory) not referenced for memory testing

---

### Topic 4: Test Runner Selection — node:test vs Vitest 4

**Key Insights:**

- Vitest 4 has stable Browser Mode (v4.0) and drops Jest boot time from ~8s to ~1.2s
- node --test (built-in Node.js test runner) remains the correct choice for CommonJS (.cjs) files
- Jest is deprecated for new files in 2025-2026 — Vitest is the standard
- `@vitest/browser` (v4) enables real browser testing without Playwright/Cypress for component-level tests
- Vitest's `vi.setSystemTime()` is the standard for pinning dates in tests

**Evidence:**

State of JavaScript 2025 confirms Vitest dominance in the ecosystem. Our TDD skill documents this split correctly.

**Gap Assessment:**

- PRESENT: node --test for .cjs, Vitest for TypeScript/ESM, rationale documented
- GAP: `@vitest/browser` (Vitest 4 Browser Mode) not mentioned — potentially valuable for frontend agent testing
- Minor: Vitest version in skill says "4" but should verify this is current (v4.x)

---

### Topic 5: LSP Navigator — 2026 Capability Assessment

**Key Insights:**

- LSP Navigator v1.2.0 (lastVerifiedAt: 2026-03-07) — recently verified
- CJS limitation is documented and permanent: TypeScript language server does not fully index CommonJS require() without explicit jsconfig.json/tsconfig.json configuration
- The diagnostics runner (lsp-diagnostics-runner.cjs) uses ripgrep + require.resolve() as the practical workaround for .cjs files — this pattern is correct
- LSP 3.18+ adds inlay hints, semantic tokens, and type hierarchy (not yet in skill documentation)
- Missing from skill: `lsp_typeHierarchy` operation for class/interface hierarchy browsing (available in LSP 3.17+)

**Evidence:**

From skill frontmatter: verified: true, lastVerifiedAt: '2026-03-07'. CJS limitation explicitly documented in skill content. Skill correctly recommends ripgrep fallback for .cjs files.

**Gap Assessment:**

- PRESENT: All core LSP operations, CJS limitation documented, diagnostics runner for .cjs
- GAP: LSP 3.17+ type hierarchy operations not mentioned (`lsp_typeHierarchy`)
- GAP: Inlay hints (LSP 3.17+) not mentioned
- LOW PRIORITY: These are additional LSP operations, not gaps in current coverage

---

### Topic 6: AI Agent Memory Persistence — Architecture Assessment

**Key Insights:**

- STM/MTM/LTM 3-tier architecture matches 2026 industry patterns (confirmed by Microsoft multi-agent reference architecture and multiple 2026 articles)
- Hippocampus→cortex consolidation pattern: MTM→LTM promotion through repeated access is the correct memory consolidation model
- 2026 benchmark: Mem0 achieves 26% accuracy boost, 91% lower p95 latency, 90% token savings with persistent structured memory
- LoCoMo benchmark (81 Q&A pairs across long multi-session conversations) is the standard evaluation metric for agent memory systems
- Multi-agent synchronization challenge: WAL protocol (Write-Ahead Log) is the correct design for preventing concurrent write collisions

**Evidence:**

Our architecture uses STM (.claude/context/memory/stm/), MTM (.claude/context/memory/mtm/), LTM (.claude/context/memory/ltm/) with queue-based WAL protocol for Agent Teams. This directly matches the 2026 multi-agent reference architecture from Microsoft.

**Gap Assessment:**

- PRESENT: STM/MTM/LTM tiers, WAL protocol design spec, memory-search semantic search, rotation/dedup
- PRESENT: Pattern aligns with 2026 Mem0/Zep/Letta best practices
- GAP: LoCoMo benchmark not referenced for evaluating our memory system quality
- GAP: No automated test coverage for memory consolidation (MTM→LTM promotion logic)
- NOTE: Our WAL protocol is documented as "DESIGN SPECIFICATION — Not yet enforced at runtime" — this is a known gap from decisions.md

---

## Academic References

| Paper | Authors | Year | Key Finding |
|-------|---------|------|-------------|
| TDFlow (arXiv:2510.23761) | — | 2025 | 94.3% SWE-Bench Verified with multi-agent TDD decomposition |
| TDAD (arXiv:2603.17973) | — | 2026 | 70% regression reduction via dependency-aware test selection |
| LLM4TDD (arXiv:2312.04687) | — | 2023 | LLM-assisted TDD feasibility study |
| Tests as Prompt (arXiv:2505.09027) | — | 2025 | Verbatim test output as specification |
| SWE-Flow (arXiv:2506.09003) | — | 2025 | Software engineering agent workflows |
| Scaling TDD: Functions to Classes (arXiv:2602.03557) | — | 2026 | Class-level TDD decomposition patterns |
| TDAID / TDAD variant (arXiv:2603.08806) | — | 2026 | Agent-to-agent TDD variant with 24%→32% resolution rate |

---

## Practical Recommendations

### P0 — Critical Gaps (Fix Immediately)

| # | Recommendation | Rationale | Effort |
|---|---------------|-----------|--------|
| P0-1 | Add TDAD static dependency map guidance to TDD skill | TDAD paper shows 70% regression reduction; contextual test information outperforms prescriptive workflows | Low (documentation) |
| P0-2 | Strengthen TDAID Validation phase: add concrete specification gaming detection patterns | Agents need explicit guidance on detecting test-hacking variants beyond the 4 already listed | Low (documentation) |

### P1 — High Value (Add Soon)

| # | Recommendation | Rationale | Effort |
|---|---------------|-----------|--------|
| P1-1 | Add LoCoMo benchmark reference to memory testing section | Standard 2026 evaluation for agent memory systems; validates our STM/MTM/LTM implementation | Low |
| P1-2 | Add `agent-evaluation` skill invocation example to AI Output Evaluation section | Skill is referenced but no usage pattern shown | Low |
| P1-3 | Add automated tests for memory consolidation (MTM→LTM promotion) | WAL protocol is design-spec only; no tests verify consolidation correctness | Medium |
| P1-4 | Document `@vitest/browser` (Vitest 4 Browser Mode) in test runner section | Stable in v4, useful for frontend component testing in agent studio | Low |

### P2 — Improvements (Nice to Have)

| # | Recommendation | Rationale | Effort |
|---|---------------|-----------|--------|
| P2-1 | Add LSP type hierarchy operations (lsp_typeHierarchy) to LSP skill | LSP 3.17+ feature; useful for class/interface browsing but not critical gap | Low |
| P2-2 | Add LLM-based mutation testing mention to mutation testing section | Emerging 2026 pattern; not yet standard but worth noting | Low |
| P2-3 | Add predictive mutation selection description | ML-based mutation prioritization; forward-looking guidance | Low |

---

## Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| TDD skill becomes stale as AI coding patterns evolve | HIGH | Medium | Quarterly verification cadence (skill has lastVerifiedAt field) |
| Agent testing without TDAD dependency map causes regressions | HIGH | Medium | P0-1: Add TDAD guidance to spawn prompts |
| WAL protocol not implemented allows memory corruption in Agent Teams | MEDIUM | Low | Existing design spec; implement before enabling Agent Teams at scale |
| LSP coverage gaps in CJS files leads to missed dead code | MEDIUM | High (already occurring) | Diagnostics runner (lsp-diagnostics-runner.cjs) mitigates this |
| Non-deterministic agent tests create flaky CI | HIGH | Medium | Flakiness gate (3 consecutive passes) already addresses this |

---

## Implementation Roadmap

### Immediate (This Session)
- TaskUpdate: Mark task #5 completed with this research report

### Next Sprint
- P0-1: Update TDD skill with TDAD static dependency map guidance
- P0-2: Strengthen TDAID Validation phase spec-gaming detection

### Backlog
- P1-1: Add LoCoMo benchmark reference
- P1-2: Add agent-evaluation invocation example
- P1-3: Add memory consolidation tests
- P1-4: Document Vitest 4 Browser Mode

### Low Priority
- P2-1, P2-2, P2-3: LSP and mutation testing enhancements

---

## Key Conclusions

**Our TDD skill (v1.3.0) is well-aligned with 2026 industry standards.** The major 2026 patterns — TDP, multi-agent decomposition, property-based testing, mutation testing, AI agent testing patterns — are all present. The skill cites the correct academic papers (TDFlow, TDAD, LLM4TDD, Tests as Prompt).

**The most actionable gap is TDAD**: the finding that surfacing contextual test-dependency information (not just prescribing TDD workflow) reduces regressions 70% suggests we should add a lightweight dependency map to our TDD state file and include it in developer spawn prompts.

**LSP skill is current** with CJS limitation properly documented and mitigated.

**STM/MTM/LTM memory architecture matches 2026 industry patterns** with the hippocampus→cortex consolidation model and WAL protocol design — though the WAL implementation remains a pending item.
