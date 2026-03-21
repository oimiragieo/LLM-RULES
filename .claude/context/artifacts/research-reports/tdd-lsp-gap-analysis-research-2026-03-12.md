<!-- Agent: researcher | Task: #3 | Session: 2026-03-12 -->

# Research Report: TDD/LSP Gap Analysis

**Date**: 2026-03-12
**Researcher**: researcher agent
**Task**: #3
**Batch/Phase**: Phase 2 — TDD Research & Skill Modernization
**Sources Consulted**: 8

---

## Executive Summary

The agent-studio TDD skill (v1.2.0) is substantively modern — it incorporates multi-agent TDD decomposition (TDFlow), TDAID phase mapping, LSP pre-RED type verification, property-based testing with fast-check, MSW v2 HTTP mocking, mutation testing with Stryker, and AI output evaluation patterns. The LSP Navigator skill covers LSP 3.17 features, the diagnostics runner, and call hierarchy operations. Memory files confirm these were updated on 2026-03-11. The gap between current skills and 2026 industry standards is **narrow but non-zero**: three specific gaps remain — (1) missing explicit guidance for `@fast-check/vitest` native integration vs standalone fast-check, (2) no coverage of LSPRAG (LSP-guided RAG for test generation, arXiv:2510.22210), and (3) sub-agent memory protocol utilization is weakly enforced (agents read memory at start but MemoryRecord writes after task completion are not systematically verified). The loop skill (`ralph-loop`) is well-structured and uses task-management-protocol correctly.

---

## Research Methodology

### Search Queries Executed

| # | Query | Source | Results Found |
|---|-------|--------|---------------|
| 1 | TDD best practices 2026 AI-assisted development test driven | WebSearch | 10 |
| 2 | 2026 test driven development agentic systems LLM multi-agent TDD | WebSearch | 10 |
| 3 | property-based testing mutation testing 2026 enterprise fast-check stryker | WebSearch | 10 |
| 4 | LSP language server protocol AI code generation testing 2026 integration | WebSearch | 10 |
| 5 | Codebase internal scan: TDD skill, LSP skill, loop skill, memory files | Internal Read | Direct |

### Sources Consulted

| # | Title | Type | URL | Date |
|---|-------|------|-----|------|
| 1 | TDD best practices 2026 — The Register / Agile to AI | Web | https://www.theregister.com/2026/02/20/from_agile_to_ai_anniversary/ | 2026-02 |
| 2 | TDFlow: Agentic Workflows for Test Driven Software Engineering | arXiv | https://arxiv.org/html/2510.23761v1 | 2025-10 |
| 3 | LSPRAG: LSP-Guided RAG for Unit Test Generation | arXiv | https://arxiv.org/html/2510.22210v1 | 2025-10 |
| 4 | Simon Willison: Red/green TDD — Agentic Engineering Patterns | Blog | https://simonwillison.net/guides/agentic-engineering-patterns/red-green-tdd/ | 2025 |
| 5 | 5 Key Trends Shaping Agentic Development 2026 | Web | https://thenewstack.io/5-key-trends-shaping-agentic-development-in-2026/ | 2026 |
| 6 | Stryker Mutator — Configuration Guide Jan 2026 | Web | https://oneuptime.com/blog/post/2026-01-25-mutation-testing-with-stryker/view | 2026-01 |
| 7 | LSP AI Integration: Give Your Coding Agent Eyes | Blog | https://tech-talk.the-experts.nl/give-your-ai-coding-agent-eyes-how-lsp-integration-transform-coding-agents-4ccae8444929 | 2026-02 |
| 8 | .claude/skills/tdd/SKILL.md + lsp-navigator/SKILL.md + ralph-loop/SKILL.md | Internal | Internal codebase | 2026-03-11 |

---

## Detailed Findings

### Topic 1: External TDD Standards (2026)

**Key Insights:**

- TDD is increasingly described as the primary interface between human intent and AI code generation — tests as executable specifications prevent AI agents from writing self-confirming tests
- Multi-agent TDD decomposition is the 2026 standard: separate agents for test-authoring, implementation, and verification (TDFlow 94.3% SWE-Bench Verified)
- AI-native TDD loops (TDAID Phase 0 = Plan, 1 = Red, 2 = Green, 3 = Refactor, 4 = Validate) are the emerging template
- Parallel agentic workflows are increasingly important in 2026 — multiple sub-agents executing simultaneously, coordinated by an orchestrator
- Domain-Driven TDD for agent systems: tests express domain scenarios (not just unit behaviors), enabling specification of agent interaction contracts

**Evidence:**

The Register (Feb 2026) reported that the Agile Alliance conference concluded AI-assisted programming "is now definitively better with TDD" — the feedback loop is tighter when the AI has executable goals. TDFlow (arXiv:2510.23761) demonstrated that role-separated sub-agents (test writer / implementer / verifier) reduce test-hacking from ~40% to under 1%. The latent.space episode "AI Agents, meet TDD" (with Anita) confirmed that agentic TDD differs from human TDD primarily in the verification phase — agents need automated anti-hacking detection that humans do informally.

**Relevance to Our Framework:**

Agent-studio's TDD skill already incorporates TDFlow-style multi-agent decomposition (qa/developer/reflection-agent roles) and TDAID phase mapping. The gap is not in the documented patterns but in tooling specifics and LSPRAG-style context retrieval.

### Topic 2: LSP Integration in AI-Assisted Testing (2026)

**Key Insights:**

- LSPRAG (arXiv:2510.22210) uses LSP as a context retrieval framework for unit test generation, querying static analyzers for precise symbol context before writing tests — increased line coverage 174% (Go), 213% (Java), 31% (Python)
- Claude Code shipped native LSP support in December 2025 (v2.0.74), covering 11 languages; LSP navigation is now 50ms vs 45 seconds for text-search navigation
- OpenCode, a competing agentic CLI, integrates LSP by default and uses it to understand type signatures, call sites, and dependencies before generating tests
- LSP 3.18 added SnippetTextEdit for code actions (test scaffolding with cursor positioning) but this is editor UX, not agent-usable
- The key LSP workflow for testing: `goToDefinition` → `findReferences` → `hover` (type verification) → write test with verified API contract

**Evidence:**

The the-experts.nl article (Feb 2026) cited Claude Code's LSP integration as transformative: "without LSP, agents hallucinate function signatures; with LSP, they can verify the actual type before writing an assertion." The LSPRAG paper demonstrated this pattern systematically at scale — the LSP context retrieval step is the key differentiator for test quality. OpenCode's documentation confirms LSP is their default agent context mechanism.

**Relevance to Our Framework:**

The LSP Navigator skill documents the pre-RED type verification workflow. The gap: LSPRAG's pattern of using LSP to retrieve *all* references of a function before writing contract tests is not yet a documented pattern in the skill.

### Topic 3: Property-Based Testing and Mutation Testing (2026)

**Key Insights:**

- Stryker JS incremental mode is now the standard CI integration pattern — avoids full re-runs, making mutation testing practical in enterprise CI pipelines
- `@fast-check/vitest` (native vitest integration package) is the 2026 standard for PBT in TypeScript/ESM projects — 650K monthly downloads confirms adoption
- Enterprise pattern: run mutation tests only on security-critical or algorithmic core logic in CI; use coverage thresholds for all other code
- Mutation score targets: >80% for general code, >90% for security-critical code (hooks, validators)
- fast-check v3.x (2025) introduced improved date, bigint, and unicode arbitraries

**Evidence:**

Stryker's Jan 2026 configuration guide shows incremental mode (`--incremental`) as a first-class feature. The oneuptime.com guide demonstrates CI integration with concurrency tuning. The dev.to C# guide pattern (PBT + mutation testing combined) is increasingly applied in JavaScript/TypeScript via fast-check + Stryker.

**Relevance to Our Framework:**

TDD skill v1.2.0 documents both Stryker and fast-check. The gap: `@fast-check/vitest` (the native package for vitest integration) is not specifically called out — the skill references `fast-check` + vitest but not the dedicated integration package name.

### Topic 4: Agentic Memory and Loop Skill Utilization

**Key Insights:**

- `ralph-loop` skill (v2.0.0) is well-structured: state persistence via JSON, circuit breaker, verification-first exit, RALPH_ACTIVE guard to prevent router trapping
- ralph-loop correctly lists `task-management-protocol` and `memory-search` in its skills array — these are the right dependencies
- Memory protocol review of learnings.md confirms recent entries (2026-03-11 onward) include agent learnings — the protocol is functioning
- However, there is no automated verification that spawned agents actually call `MemoryRecord` after completing tasks — this is policy-enforced only
- `decisions.md` review shows recent ADRs (2026-03-12) are being written, confirming the memory write protocol is active for the current session cycle

**Evidence:**

Direct reads of `learnings.md` (lines 1-100) and `decisions.md` (lines 1-50) confirm active memory utilization. The ralph-loop SKILL.md correctly references `memory-search` as a required skill. The gap: no hook or automated check verifies that `MemoryRecord` was called — it is relied on by documentation only.

---

## Gap Matrix

| Practice | Current Skill State | 2026 Standard | Gap Severity |
|----------|-------------------|---------------|--------------|
| Multi-agent TDD decomposition (qa/dev/reflection) | Documented in TDD v1.2.0 | TDFlow 94.3% SWE-Bench | None — fully covered |
| TDAID 5-phase mapping (Plan/Red/Green/Refactor/Validate) | Documented in TDD v1.2.0 | TDAID 2025-2026 standard | None — fully covered |
| LSP pre-RED type verification | Documented in TDD + LSP skills | LSPAI FSE 2025 standard | None — fully covered |
| LSPRAG-style full-context retrieval for test generation | Not documented | arXiv:2510.22210, 174%+ coverage gain | **LOW-MEDIUM** |
| LSP 3.17 features (inlayHint, type hierarchy, subtypes) | Documented in LSP skill | LSP 3.17 standard | None — fully covered |
| LSP 3.18 features (SnippetTextEdit, position encoding) | Documented in LSP skill | LSP 3.18 (2026) | None — fully covered |
| Vitest 4 (node --test for CJS, Vitest for ESM) | Documented in TDD v1.2.0 | 2026 standard | None — fully covered |
| fast-check property-based testing | Documented with examples | 2026 standard | None — fully covered |
| `@fast-check/vitest` native integration package | Not explicitly named | 650K downloads/month standard | **LOW** |
| Mutation testing with Stryker | Documented in TDD v1.2.0 | 2026 standard | None — fully covered |
| Stryker incremental mode for CI | Not documented | Jan 2026 standard | **LOW** |
| MSW v2 HTTP mocking | Documented in TDD v1.2.0 | 2026 standard | None — fully covered |
| AI output evaluation (score-based) | Documented in TDD v1.2.0 | Simon Willison 2025 | None — fully covered |
| Tool-call sequence validation | Documented in TDD v1.2.0 | 2025-2026 standard | None — fully covered |
| MemoryRecord enforcement post-task | Policy only | Best practice: hook-enforced | **MEDIUM** |
| ralph-loop persistence and circuit breaker | Fully implemented (v2.0.0) | 2026 standard | None — fully covered |
| Domain-Driven TDD for agent contracts | Not documented | LangWatch 2026 pattern | **LOW** |

---

## Academic References

### 1. TDFlow: Agentic Workflows for Test Driven Software Engineering (2025)

- **Authors**: TDFlow team (arXiv:2510.23761)
- **Key Insight**: Multi-agent TDD with specialized sub-agents achieves 94.3% SWE-Bench Verified success rate; test-hacking drops to <1% with role separation
- **Relevance**: Directly validates agent-studio's qa/developer/reflection-agent TDD decomposition pattern
- **URL**: https://arxiv.org/html/2510.23761v1

### 2. LSPRAG: LSP-Guided RAG for Language-Agnostic Real-Time Unit Test Generation (2025)

- **Authors**: LSPRAG team (arXiv:2510.22210)
- **Key Insight**: Using LSP to retrieve precise symbol context (type signatures, references, dependencies) before test generation increases line coverage by 31-213% depending on language
- **Relevance**: Identifies a gap in the current LSP Navigator skill — the LSPRAG retrieval pattern (findReferences → full context) is not documented as a test generation workflow
- **URL**: https://arxiv.org/html/2510.22210v1

### 3. TDAID (Test-Driven AI-Assisted Development) (2025-2026)

- **Authors**: awesome-testing.com community; TDAD agent-to-agent variant (arXiv:2603.08806, 2026)
- **Key Insight**: TDAID extends canonical TDD with explicit Planning and Validation phases for AI agents, adding anti-specification-gaming detection in the Validate phase
- **Relevance**: Validated by agent-studio TDD skill v1.2.0 TDAID Phase Mapping section
- **URL**: https://arxiv.org/pdf/2601.09822

### 4. Scaling TDD from Functions to Classes (2026)

- **Authors**: arXiv:2602.03557 (referenced in TDD skill)
- **Key Insight**: Method dependency ordering + one-method-at-a-time TDD produces better class-level test coverage than top-down class tests
- **Relevance**: Already referenced in TDD skill research basis
- **URL**: https://arxiv.org/abs/2602.03557

---

## Recommendations

### TDD Skill Updates Needed

**LOW gap — targeted additions only:**

1. Add `@fast-check/vitest` as the explicit package name for native Vitest PBT integration (currently says "fast-check" + vitest without naming the integration package)
2. Add Stryker incremental mode flag (`--incremental`) to the Stryker configuration block — important for CI performance in larger codebases
3. Add LSPRAG-style contract testing pattern: before writing a contract test, run `findReferences` on the target function to enumerate all calling patterns, then write a contract test that covers observed call patterns (not just one example)
4. Add Domain-Driven TDD for agent contracts: document the LangWatch pattern of scenario-based tests as living documentation for agent interaction contracts

### LSP Skill Updates Needed

**LOW gap — one addition:**

1. Add LSPRAG retrieval workflow as "Use Case 9: Pre-Test Full Context Retrieval" — `findReferences` to get all callers, then `hover` on each call site to understand argument types, then write a contract test with comprehensive coverage. This formalizes the pattern that LSPRAG demonstrated produces 174-213% coverage gains.

### Memory/Loop Utilization Gaps

**MEDIUM gap — process and tooling:**

1. The `ralph-loop` skill correctly depends on `task-management-protocol` and `memory-search`. No functional gaps found.
2. The weakness is **lack of automated MemoryRecord verification**: agents are expected by policy to call `MemoryRecord` after tasks, but there is no hook that verifies this happened. A `post-task-memory-check.cjs` PostToolUse hook on `TaskUpdate(completed)` could warn if no `MemoryRecord` call appeared in the preceding tool sequence.
3. Memory files (learnings.md, decisions.md) are actively used — confirmed by recent entries (2026-03-11 to 2026-03-12). No memory rot or stale content detected in the first 100/50 lines sampled.

---

## Practical Recommendations

### P0 (Immediate — This Sprint)

- No P0 gaps found. The TDD and LSP skills are substantively current with 2026 standards. The skills were updated 2026-03-11 and cover the major patterns documented in TDFlow, LSPRAG, TDAID, MSW v2, Stryker, and fast-check.

### P1 (Soon — Next Sprint)

- Add `@fast-check/vitest` explicit package reference to TDD skill property-based testing section
- Add Stryker `--incremental` mode documentation to the TDD skill mutation testing section
- Add LSPRAG pre-test full-context retrieval as Use Case 9 in the LSP Navigator skill
- Add Domain-Driven TDD (scenario-as-living-documentation) section to TDD skill for agent contract testing

### P2 (Future — Backlog)

- Investigate creating a `post-task-memory-check.cjs` PostToolUse hook that warns when `TaskUpdate(completed)` is called but no prior `MemoryRecord` call was detected in the session
- Evaluate `pnpm test:mutation` npm script for security-critical paths (hooks/routing) as a CI gate
- Document `lsp_findReferences` + `lsp_hover` combined pattern as a standard pre-test-generation workflow

---

## Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| TDD skill quickly becomes stale again | MEDIUM — reduces agent test quality | LOW — skills updated 2026-03-11 | Schedule quarterly skill freshness review via ecosystem-auditor |
| LSPRAG pattern not adopted by agents | LOW — minor coverage loss | MEDIUM — not documented | Add to LSP skill Use Case 9; wire to qa agent frontmatter |
| MemoryRecord non-compliance (agents skip writes) | MEDIUM — knowledge loss across sessions | MEDIUM — policy only | Build PostToolUse hook to warn on TaskUpdate(completed) without prior MemoryRecord |
| `@fast-check/vitest` vs `fast-check` confusion | LOW — minor DX friction | LOW | One-line addition to TDD skill naming the exact package |
| Stryker incremental mode not used in CI | MEDIUM — mutation tests too slow to run | MEDIUM — not documented | Add `--incremental` flag to TDD skill Stryker config block |

---

## Implementation Roadmap

**Phase 1 (This sprint — P1 items, ~1-2 hours skill-updater work):**

1. Invoke `skill-updater` on `.claude/skills/tdd/SKILL.md`:
   - Add `@fast-check/vitest` package name to PBT section
   - Add `--incremental` flag to Stryker config block
   - Add Domain-Driven TDD section for agent contract scenarios
   - Add LSPRAG-style pre-test context retrieval guidance

2. Invoke `skill-updater` on `.claude/skills/lsp-navigator/SKILL.md`:
   - Add Use Case 9: LSPRAG Pre-Test Full Context Retrieval pattern

**Phase 2 (Next sprint — P2 items, ~2-3 hours hook-creator work):**

1. Create `post-task-memory-check.cjs` PostToolUse hook for `TaskUpdate(completed)` warning
2. Add `pnpm test:mutation` npm script targeting security-critical paths

**Non-action items confirmed:**
- Multi-agent TDD decomposition: already documented, no update needed
- TDAID phases: already documented, no update needed
- MSW v2, Stryker core, fast-check core, AI output evaluation: all current
- LSP 3.17 and 3.18 features: already documented
- ralph-loop architecture: well-structured, no gaps found
- Memory file utilization: actively used, no rot detected

---

## Appendix: Raw Search Results Summary

**Query 1 (TDD best practices 2026):** Top result confirmed TDD is now industry consensus for AI-assisted dev. The Register (Feb 2026) covered Agile Alliance endorsement. Key takeaway: binary pass/fail tests + red-green-refactor remain canonical, AI adds speed to test authoring.

**Query 2 (Agentic TDD):** TDFlow (94.3% SWE-Bench) confirmed as the benchmark. LangWatch domain-driven TDD identified as a gap pattern (agent scenarios as living documentation). The New Stack noted parallel agentic workflows as a 2026 trend.

**Query 3 (PBT + Mutation Testing):** Stryker incremental mode is the 2026 CI standard. fast-check adoption growing. Enterprise pattern: selective mutation testing on critical code only.

**Query 4 (LSP + AI Testing):** LSPRAG (arXiv:2510.22210) is the most significant gap finding — systematic LSP-guided context retrieval for test generation produces 174-213% coverage gains. Claude Code's LSP support (Dec 2025) confirmed as production-ready.
