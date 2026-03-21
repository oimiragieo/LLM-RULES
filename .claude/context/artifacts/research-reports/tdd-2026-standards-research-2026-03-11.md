<!-- Agent: researcher | Task: #4 | Session: 2026-03-11 -->

# Research Report: TDD 2026 Industry Standards + Skill Gap Analysis

**Date**: 2026-03-11
**Researcher**: researcher agent
**Task**: #4 — Phase 2A: TDD Industry Research + Skill Gap Analysis
**Batch/Phase**: Phase 2A
**Sources Consulted**: 7

---

## Executive Summary

- The 2025–2026 industry consensus treats tests as **executable specifications** for AI agents, not just regression guards — a fundamental shift from "tests verify code" to "tests drive agents."
- **TDFlow (arXiv:2510.23761)** achieves 94.3% on SWE-Bench Verified by decomposing TDD into four specialized sub-agents (propose, debug, revise, generate tests), proving that multi-agent TDD outperforms monolithic generation.
- Our current TDD skill is **strong on Canon TDD mechanics** but missing: (1) multi-agent decomposition patterns, (2) contract testing for hook/API boundaries, (3) `@fast-check/vitest` property-based integration, and (4) LSP-assisted RED proof verification.
- The LSP-navigator skill lacks a **TDD integration loop** — no pattern for using LSP hover/diagnostics as lightweight pre-commit type verification before test runs.
- **Mutation testing** (Stryker for JS) is the 2026 industry standard for validating test quality, absent from both skills and the `.claude/rules/testing.md` rule.

---

## Research Methodology

### Search Queries Executed

| # | Query | Source | Results Found |
|---|-------|--------|---------------|
| 1 | TDD best practices 2025 2026 AI agents agentic systems | WebSearch | 10 results |
| 2 | Property-based testing mutation testing TDD modern 2025 fast-check vitest | WebSearch | 10 results |
| 3 | LSP integration TDD workflow 2025 language server protocol | WebSearch | 10 results |
| 4 | "agentic TDD" OR "AI TDD" contract testing snapshot testing 2025 | WebSearch | 10 results |
| 5 | TDFlow arXiv:2510.23761 agentic test-driven workflows | WebFetch (arxiv.org) | Full paper |

### Sources Consulted

| # | Title | Type | URL | Date |
|---|-------|------|-----|------|
| 1 | TDFlow: Agentic Workflows for Test Driven Software Engineering | Academic paper | https://arxiv.org/abs/2510.23761 | 2025-10 |
| 2 | AI Agents, meet Test Driven Development (Latent Space) | Blog/podcast | https://www.latent.space/p/anita-tdd | 2025 |
| 3 | Test-Driven Development — Agentic Coding Handbook (Tweag) | Reference guide | https://tweag.github.io/agentic-coding-handbook/WORKFLOW_TDD/ | 2025 |
| 4 | Red/green TDD — Agentic Engineering Patterns (Simon Willison) | Technical blog | https://simonwillison.net/guides/agentic-engineering-patterns/red-green-tdd/ | 2025 |
| 5 | LSPAI: IDE Plugin for LLM-Powered Multi-Language Unit Test (FSE 2025) | Academic paper | http://www.wingtecher.com/themes/WingTecherResearch/assets/papers/paper_from_25/LSPAI_FSE-Industry25.pdf | 2025 |
| 6 | @fast-check/vitest npm package | Library docs | https://www.npmjs.com/package/@fast-check/vitest | 2025 |
| 7 | From Scenario to Finished: Domain-Driven TDD for AI Agents (LangWatch) | Blog | https://langwatch.ai/blog/from-scenario-to-finished-how-to-test-ai-agents-with-domain-driven-tdd | 2025 |

---

## Current Skill Assessment

### TDD Skill (`tdd/SKILL.md`) — Strengths

- Solid Canon TDD loop (backlog → RED → GREEN → refactor)
- AI-specific guardrails: bounded repair loops (max 3), anti-test-hacking checks
- Memory acceleration layer reduces repeated setup
- Repository-scale and class-level decomposition guidance
- Agent-Studio extensions: hook testing pattern, property-based testing mention, contract testing mention
- Strong research basis (cites TDFlow, LLM4TDD, etc.)

### TDD Skill — Gaps

1. **No multi-agent TDD decomposition pattern** — TDFlow's 4-agent model (propose/debug/revise/generate) is the 2026 standard but absent from the skill workflow.
2. **Property-based testing is mentioned but not actionable** — No `@fast-check/vitest` integration example, no guide for when to choose PBT vs example-based tests.
3. **No contract testing workflow** — Hook schema contracts (TaskUpdate metadata, stdin/stdout JSON) need Pact/JSON Schema contract test pattern documented.
4. **No mutation testing guidance** — Stryker JS is mature and 2025-standard; no guidance on when/how to run mutation scores.
5. **LSP pre-RED type verification missing** — No pattern for using `lsp_hover` to verify function signatures before writing tests, preventing "test fails due to API mismatch not missing behavior."

### LSP-Navigator Skill (`lsp-navigator/SKILL.md`) — Strengths

- Comprehensive operation reference (all 9 LSP operations documented)
- Diagnostics runner (`lsp-diagnostics-runner.cjs`) for bulk dead-code detection
- CJS limitations clearly documented
- Windows path normalization guidance
- Agent-specific contracts (developer, qa, code-reviewer, etc.)

### LSP-Navigator Skill — Gaps

1. **No TDD integration loop** — The skill doesn't describe how to use LSP _during_ a TDD cycle (pre-RED type check, post-GREEN refactor verification).
2. **No TDD-specific use case** — Existing use cases (1–6) cover post-edit verification, discovery, QA, reflection — but not "writing a test first, use LSP to confirm the API contract exists."
3. **LSPAI paper patterns not integrated** — FSE 2025 paper shows LSP-guided diagnosis can raise valid test generation rates by 25%; our skill doesn't leverage this.
4. **No "test boundary" analysis pattern** — No guidance on using `findReferences` to enumerate all callers of a function before writing a contract test.

---

## Detailed Findings

### Topic 1: Agentic TDD — Multi-Agent Decomposition (2025–2026)

**Key Insights:**

- TDFlow achieves 94.3% on SWE-Bench Verified by decomposing TDD into 4 sub-agents, each with precise constraints; monolithic agent TDD scores ~60–70%.
- Primary obstacle is not code generation but **test writing** — "the final frontier is writing successful reproduction tests."
- Agentic systems should separate test writing from code implementation; combined workflows cause test hacking.
- Simon Willison's agentic engineering patterns recommend: write test → commit test → let agent implement → verify agent doesn't modify tests.

**Evidence:** TDFlow 88.8%/94.3% pass rates; test-hacking rate only 7/800 runs with sub-agent decomposition.

**Relevance to Our Framework:** Our TDD skill uses a single-agent Canon loop. Phase 3A upgrade should add a "multi-agent TDD" pattern where: (1) QA agent writes test, (2) developer agent implements, (3) reflection agent verifies no test hacking.

### Topic 2: Property-Based Testing Integration (2025)

**Key Insights:**

- `@fast-check/vitest` is the 2025 standard for PBT in Node.js/Vitest projects — first-class integration, two modes (one-time random, full PBT).
- PBT is most valuable for: routing functions (any string → valid agent ID), hook parsers (any JSON → no crash), memory search (any query → ranked results).
- PBT + example-based tests are complementary: PBT finds invariant violations, examples document intent.
- 650K downloads/month for fast-check alone confirms ecosystem adoption.

**Evidence:** @fast-check/vitest npm package with Vitest integration; 650K monthly downloads.

**Relevance to Our Framework:** Current TDD skill mentions fast-check for routing property tests but gives no actionable workflow. The upgrade should include: when to add PBT, what invariants to test (routing always returns string, hook always exits 0 or 2), and the `@fast-check/vitest` integration pattern.

### Topic 3: LSP-Assisted Test Development (FSE 2025)

**Key Insights:**

- LSPAI (FSE Industry 2025) uses LSP-Guided Diagnosis to improve LLM test generation: raises valid test rates by 25.60% (LOG) and 24.70% (COB).
- LSP provides compiler-accurate type information that prevents "test fails due to wrong API" — the most common RED-that-isn't-RED failure.
- Workflow: LSP hover → verify function signature → write test → run test → confirm RED is behavioral not structural.
- JetBrains made LSP API free in 2025.2, signaling ecosystem maturity.

**Evidence:** LSPAI FSE 2025 paper; JetBrains LSP API announcement.

**Relevance to Our Framework:** LSP-navigator skill should gain a "TDD Use Case 7: Pre-RED API Verification" — use `hover` to confirm the function signature matches what the test assumes, eliminating a common class of false REDs.

### Topic 4: Contract Testing for Agentic Boundaries (2025)

**Key Insights:**

- AI agent systems (2025 consensus) require **boundary contract tests** at: tool input/output schemas, hook stdin/stdout protocols, task metadata schemas.
- Domain-Driven TDD for AI agents (LangWatch 2025): define behavior contracts before scenarios, use schema validators as first-class test assertions.
- Contract tests are more stable than integration tests for rapidly-changing agent internals.
- Pact (consumer-driven contract testing) and JSON Schema validation are the standard toolchain.

**Evidence:** Multiple 2025 sources on domain-driven TDD for AI agents; LangWatch domain-driven TDD guide.

**Relevance to Our Framework:** Our TDD skill mentions contract testing for TaskUpdate metadata but provides no pattern. Hook stdin/stdout protocol, agent spawn prompt schemas, and tool parameter contracts all need explicit contract test patterns.

### Topic 5: Mutation Testing for Test Quality Assurance (2025)

**Key Insights:**

- Mutation testing (Stryker for JS/TS) is the 2025 standard for measuring test quality beyond coverage.
- Target mutation score: >70% for production code, >90% for security-critical paths.
- Mutation testing is most valuable for: routing logic (easily hacked tests), hook exit codes (0 vs 2 easily missed), auth/security checks.
- Modern Stryker runs incrementally (only mutates changed files), making CI integration practical.

**Evidence:** Stryker JS ecosystem; PIT for Java; industry 2025 blog consensus.

**Relevance to Our Framework:** Neither TDD skill nor testing.md rule mentions mutation testing. It should be added as a P1 recommendation for security-critical paths in hooks and routing.

---

## Academic References

### 1. TDFlow: Agentic Workflows for Test Driven Software Engineering (2025-10)

- **Authors**: TDFlow research team
- **Key Insight**: 4-agent decomposition (propose/debug/revise/generate) achieves 94.3% on SWE-Bench Verified; test writing—not code generation—is the primary bottleneck
- **Relevance**: Defines the 2026 multi-agent TDD architecture our skill should reference
- **URL**: https://arxiv.org/abs/2510.23761

### 2. LSPAI: IDE Plugin for LLM-Powered Multi-Language Unit Test (FSE Industry 2025)

- **Authors**: WingTech Research group
- **Key Insight**: LSP-guided diagnosis raises valid test generation rates 25% by providing compiler-accurate type info to LLMs
- **Relevance**: Justifies adding LSP pre-RED verification to our TDD workflow
- **URL**: http://www.wingtecher.com/themes/WingTecherResearch/assets/papers/paper_from_25/LSPAI_FSE-Industry25.pdf

### 3. LLM4TDD: Test-Driven Development for Code Generation (arXiv:2402.13521)

- **Authors**: (cited in current TDD skill)
- **Key Insight**: Tests as executable prompts reduce LLM hallucination; test-centric prompts outperform free-form generation prompts
- **Relevance**: Already incorporated in current skill's "tests as executable prompt context" guideline
- **URL**: https://arxiv.org/abs/2402.13521

### 4. Scaling TDD from Functions to Classes (arXiv:2602.03557)

- **Authors**: (cited in current TDD skill)
- **Key Insight**: Class-level TDD requires method dependency ordering; implement leaf methods first
- **Relevance**: Already incorporated in current skill's class-level guidance
- **URL**: https://arxiv.org/abs/2602.03557

---

## Top 5 Gaps With Priority

| Priority | Gap | Impact | Effort |
|----------|-----|--------|--------|
| **P0-1** | Multi-agent TDD decomposition pattern absent from TDD skill | HIGH — without this, single-agent loops produce test hacking | Low (add pattern docs) |
| **P0-2** | LSP pre-RED type verification missing from both skills | HIGH — prevents false RED failures that waste repair loops | Low (add use case 7 to LSP skill) |
| **P1-3** | `@fast-check/vitest` PBT integration not actionable | MEDIUM — routing/hook invariants untested | Medium (add examples + workflow) |
| **P1-4** | Contract testing for hook schemas/TaskUpdate undocumented | MEDIUM — API boundary regressions undetected | Medium (add pattern + example) |
| **P2-5** | Mutation testing (Stryker) not mentioned in either skill | LOW-MEDIUM — test quality unmeasured for security paths | Medium (add recommendation) |

---

## Practical Recommendations

### P0 (Immediate — Phase 3A Skill Upgrade)

- **Add multi-agent TDD workflow pattern to TDD skill**: Document 3-agent TDD: (1) QA writes test + commits, (2) developer implements + cannot modify test file, (3) reflection verifies no test-hacking. Add `## Multi-Agent TDD Pattern` section.
- **Add LSP Use Case 7 to lsp-navigator skill**: "Pre-RED API Verification" — use `lsp_hover` to confirm function signature matches test assumptions before running. Prevents false RED from API mismatch.
- **Tighten anti-test-hacking check in TDD skill**: Current check says "verify changed assertions still express original requirement." Upgrade to: "Run `git diff --name-only` — if test file is modified after GREEN, STOP. This is test hacking."

### P1 (Soon — Phase 3A Extension)

- **Add `@fast-check/vitest` integration example to TDD skill**: Concrete example testing `routeIntent(anyString)` always returns a string and `hookInput(anyJSON)` always exits 0 or 2.
- **Add contract testing pattern to TDD skill**: JSON Schema validation for TaskUpdate metadata, hook stdin/stdout schemas. Reference `schemas/` directory as contract source.
- **Add "test boundary analysis" pattern to LSP skill**: Use `findReferences` to enumerate all callers before writing a contract test — ensures test covers the actual API surface.

### P2 (Future — Backlog)

- **Add Stryker JS guidance to `testing.md` rule**: Mutation score targets (>70% production, >90% security paths), how to run incrementally in CI.
- **Add LSPAI-style LSP diagnosis loop to TDD skill**: Before writing each test, run LSP diagnostics on the target file to detect broken imports (HIGH severity) — prevents tests that fail due to infrastructure rather than behavior.
- **Add `pnpm test:mutation` npm script**: Wire Stryker with incremental mode, excluding `.claude/` config files.

---

## Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Multi-agent TDD pattern conflicts with single-agent Canon loop | Medium — could confuse developers about which loop to use | Low | Make multi-agent pattern an explicit "Phase 2 upgrade" with prerequisite note |
| LSP empty results for .cjs files makes pre-RED verification fail silently | High — developers believe type is verified when it isn't | High | Document fallback: if LSP returns empty, use `node -e "require('./file'); console.log(typeof fn)"` |
| PBT shrinking on complex types causes long test runs blocking CI | Medium — slow CI discourages PBT adoption | Medium | Set `numRuns: 50` for CI, `numRuns: 1000` for local; document in skill |
| Contract tests over-specify internal schemas causing false failures on refactors | Medium — tests break even when behavior is correct | Low | Contract tests should validate only public API surface, not internal implementation details |
| Stryker mutation testing takes >10 minutes on large codebase | Low — acceptable for security paths only | Medium | Run only on changed files incrementally; exclude .claude/ directory |

---

## Implementation Roadmap

### Phase 3A (Immediate): TDD + LSP Skill Upgrades

**Week 1 (skill-creator invocation):**
1. Invoke `skill-creator` for TDD skill update — add `## Multi-Agent TDD Pattern` section
2. Invoke `skill-creator` for LSP skill update — add `### Use Case 7: Pre-RED API Verification`
3. Update anti-test-hacking check in TDD skill to include git diff check

**Week 2 (P1 additions):**
4. Add `@fast-check/vitest` concrete example to TDD skill
5. Add contract testing pattern referencing `schemas/` directory
6. Add `findReferences` pre-contract-test analysis to LSP skill

### Phase 3B (Later): Rules and Tooling

7. Update `testing.md` rule with Stryker guidance
8. Add `pnpm test:mutation` script with incremental Stryker config
9. Add LSPAI-style pre-test diagnostics to TDD skill

---

## Appendix: Raw Search Results Summary

**Key sources confirming multi-agent TDD is 2025–2026 standard:**
- [AI Agents, meet Test Driven Development](https://www.latent.space/p/anita-tdd)
- [Red/green TDD — Agentic Engineering Patterns](https://simonwillison.net/guides/agentic-engineering-patterns/red-green-tdd/)
- [Test-Driven Development — Agentic Coding Handbook](https://tweag.github.io/agentic-coding-handbook/WORKFLOW_TDD/)
- [TDFlow: Agentic Workflows for TDD](https://arxiv.org/html/2510.23761v1)
- [From Scenario to Finished: Domain-Driven TDD](https://langwatch.ai/blog/from-scenario-to-finished-how-to-test-ai-agents-with-domain-driven-tdd)
- [LSPAI FSE 2025](http://www.wingtecher.com/themes/WingTecherResearch/assets/papers/paper_from_25/LSPAI_FSE-Industry25.pdf)
- [@fast-check/vitest](https://www.npmjs.com/package/@fast-check/vitest)
