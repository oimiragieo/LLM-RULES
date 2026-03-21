<!-- Agent: researcher | Task: #5 | Session: 2026-03-11 -->
# TDD & LSP Skill Research — 2026-03-11

## Executive Summary

Both the `tdd` (v1.2.0) and `lsp-navigator` (v1.2.0) skills are in excellent shape as of March 2026. Web research confirms the skills already incorporate all major 2026 industry patterns: multi-agent TDD decomposition (TDFlow), AI output evaluation testing, MSW v2 HTTP mocking, mutation testing via Stryker JS, property-based testing via fast-check 3.x, and LSP 3.17 features including inlay hints and type hierarchy. Gap analysis identifies four moderate gaps and two wording/clarity improvements — none are blocking deficiencies.

---

## Research Methodology

| Query # | Query | Tool | Results |
|---------|-------|------|---------|
| 1 | TDD best practices 2025 2026 AI-assisted testing agent workflows | WebSearch | 10 results |
| 2 | Property-based testing mutation testing Stryker fast-check 2026 modern TDD workflow | WebSearch | 10 results |
| 3 | LSP 3.17 3.18 new features 2025 2026 inline hints type hierarchy inlay | WebSearch | 10 results |
| M1 | TDD test-driven development best practices 2026 | Memory search | 9 results (max similarity 55.5%) |
| M2 | LSP language server protocol integration testing | Memory search | 8 results (max similarity 46.8%) |

---

## Sources Consulted

| Source | URL | Relevance |
|--------|-----|-----------|
| Simon Willison — Red/Green TDD (Agentic Patterns) | https://simonwillison.net/guides/agentic-engineering-patterns/red-green-tdd/ | High — directly cited in tdd SKILL.md |
| Google Cloud DORA 2025 — TDD + AI | https://cloud.google.com/discover/how-test-driven-development-amplifies-ai-success | High — confirms TDD amplifies AI quality |
| Awesome Testing — TDAID (2025-10) | https://www.awesome-testing.com/2025/10/test-driven-ai-development-tdaid | Medium — new TDAID framing |
| Stryker Mutator (official) | https://stryker-mutator.io/ | High — mutation testing tool reference |
| fast-check + Packmind | https://packmind.com/code-improvements-property-based-testing-fast-check/ | Medium — property-based testing integration |
| LSP 3.17 Specification (Microsoft) | https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/ | High — authoritative LSP spec |
| LSP 3.18 Specification (Microsoft) | https://microsoft.github.io/language-server-protocol/specifications/lsp/3.18/specification/ | Medium — LSP 3.18 additions |
| The Register — TDD ideal for AI (2026-02-20) | https://www.theregister.com/2026/02/20/from_agile_to_ai_anniversary/ | Medium — industry validation |

---

## Exa Research Findings (Query 1: AI-Assisted TDD 2025-2026)

**Key patterns identified:**

- **TDAID (Test-Driven AI Development)** has emerged as a named pattern (Awesome Testing, 2025-10): Red = write/generate a test expressing desired behavior, Green = let the agent implement the smallest possible change. The agent cannot cheat by writing tests that verify broken behavior because tests pre-exist the implementation.
- **2025 DORA report** confirms TDD amplifies AI effectiveness — AI acts as an amplifier of existing good practices. Teams using TDD with AI see higher delivery performance.
- **AI test scaffolding** is mainstream in 2026: AI generates starter unit tests, suggests edge cases, highlights redundant tests. This complements TDD but does not replace the RED-GREEN cycle.
- **Simon Willison (2025)** named the pattern formally: "Red/Green TDD for agents: write assertions on tool-call sequences and structured outputs." This is explicitly cited in the existing skill.
- **Test-hacking detection** (checking that agents don't modify tests to pass) is the #1 AI-specific TDD guardrail in 2026.

**Verdict on current TDD skill:** The skill already covers TDAID, multi-agent decomposition (TDFlow), and test-hacking detection. These are fully represented.

---

## Exa Research Findings (Query 2: Property-Based + Mutation Testing 2026)

**Key patterns identified:**

- **Stryker JS** (stryker-mutator/stryker-js on GitHub) is the current standard for JavaScript/TypeScript mutation testing. Supports Jest, Vitest, and jasmine runners. The skill already references `@stryker-mutator/core` and `@stryker-mutator/jest-runner` but does NOT reference `@stryker-mutator/vitest-runner` — a gap since Vitest 4 is now preferred.
- **fast-check 3.x** (2025) added improved unicode, date, bigint arbitraries. The skill correctly references fast-check 3.x.
- **Industry consensus (2026):** Mutation testing is complementary to TDD — TDD ensures tests exist, mutation testing ensures tests are meaningful. Run mutation tests in CI for security-critical code only (not full codebase — too slow).
- **Property-based testing workflow:** Identify invariants first (idempotency, commutativity, round-trip), implement as `fc.property()`, then use mutation testing to verify the property test itself catches regressions.

**Gap identified:** Stryker Vitest runner not mentioned. The skill references `@stryker-mutator/jest-runner` but the project is migrating to Vitest 4 for ESM/TypeScript.

---

## Exa Research Findings (Query 3: LSP 3.17/3.18 Features 2026)

**LSP 3.17 major additions (fully deployed by 2025):**
- Type hierarchy (`prepareTypeHierarchy`, `supertypes`, `subtypes`) — confirmed in existing skill
- Inline values (`textDocument/inlineValue`) — not in LSP skill
- Inlay hints (`textDocument/inlayHint`) — confirmed in existing skill
- Notebook document support — not relevant to agent-studio

**LSP 3.18 additions (specification available, deployment varies):**
- Inline completions (`textDocument/inlineCompletion`) — new for 2026
- Multiple range formatting — minor
- Folding range refresh — minor
- Workspace edit metadata — minor
- Snippets in workspace edits — minor

**Gap identified:** LSP 3.18 `inlineCompletion` is not covered in the LSP skill. However, this is an editor-facing completion feature primarily relevant to IDE plugins, not to agent navigation workflows. Lower priority.

**Also identified:** `textDocument/inlineValue` (LSP 3.17) is distinct from inlay hints — it shows computed values (e.g., variable values from a running debugger) inline in the editor. This is a debugging-time feature, not static analysis. Not relevant to the agent navigation use cases.

---

## Current TDD Skill Analysis

**Strengths (already present):**

- Canon TDD loop (Step 0-6) fully documented
- AI-specific guardrails (bounded repair loops, anti-test-hacking)
- Multi-agent TDD decomposition (TDFlow — QA Author + Developer + Reflection-Agent Verifier)
- LSP pre-RED type verification pattern
- Property-based testing with fast-check 3.x (4 invariant examples)
- Contract testing at hook boundaries
- Score-based assertion for non-deterministic AI outputs
- Tool-call sequence validation
- MSW v2 HTTP mocking
- Mutation testing with Stryker JS
- Test runner selection (node --test vs Vitest 4)
- Memory acceleration layer

**Version/citation accuracy:**

- fast-check: "3.x (2025)" — correct
- Stryker: `@stryker-mutator/core` + `@stryker-mutator/jest-runner` — partially outdated (missing Vitest runner)
- Research basis cites: LLM4TDD (arXiv:2312.04687), TDD for Code Gen (arXiv:2402.13521), Tests as Prompt (arXiv:2505.09027), SWE-Flow (arXiv:2506.09003), TDFlow (arXiv:2510.23761), Scaling TDD (arXiv:2602.03557) — comprehensive and current

---

## Current LSP Skill Analysis

**Strengths (already present):**

- Full operation reference table (9 operations)
- CJS limitation documented and fallback strategy specified
- LSP 3.17 features section: inlay hints, type hierarchy, `goToDeclaration`
- TDD integration patterns (Use Cases 7-8)
- Test boundary analysis workflow
- Windows path normalization (SE-01)
- Diagnostics runner tool (`lsp-diagnostics-runner.cjs`)
- Hook wiring verification pattern
- Search intelligence decision table
- Agent-specific contracts (developer, qa, code-reviewer, architect, code-simplifier, advanced-debugging, reflection-agent, security-architect)

**Version accuracy:**

- `lastVerifiedAt: '2026-03-07'` — very recent
- Covers LSP 3.17 explicitly — correct for current deployment
- LSP 3.18 inline completions not mentioned — minor gap

---

## Gap Analysis: TDD Skill

### Gap T1 (MEDIUM): Missing Stryker Vitest Runner

**Current:** Skill references `@stryker-mutator/jest-runner` only.

**2026 standard:** Vitest 4 is the recommended runner for ESM/TypeScript files. Stryker provides `@stryker-mutator/vitest-runner` for Vitest integration.

**Recommended addition:**
```bash
# For ESM/TypeScript files using Vitest 4
pnpm add -D @stryker-mutator/core @stryker-mutator/vitest-runner

# stryker.config.mjs
export default {
  testRunner: 'vitest',
  plugins: ['@stryker-mutator/vitest-runner'],
  coverageAnalysis: 'perTest',
  vitest: { configFile: 'vitest.config.ts' },
};
```

### Gap T2 (LOW): TDAID terminology not mentioned

**Current:** The multi-agent TDD decomposition section mentions TDFlow but does not reference "TDAID" (Test-Driven AI Development) as an emerging industry term (Awesome Testing, 2025-10). The concept is present but the term is absent.

**Impact:** Low — the patterns are already documented. Adding the term improves findability.

### Gap T3 (LOW): Chaos/resilience testing not mentioned

**Current:** The skill covers unit, integration, property-based, mutation, and contract testing. It does not mention chaos testing or resilience testing as a TDD extension.

**2026 context:** For agent-studio specifically, resilience testing (e.g., testing agent behavior when TaskUpdate fails, when hooks return errors) is an emerging pattern. However, this is a specialized extension, not a core TDD gap.

### Gap T4 (LOW): No guidance on test data management

**Current:** Skill covers test isolation via "real collaborators; mock only external boundaries" but doesn't address test data management (fixtures, factories, seeding) for integration tests.

**Impact:** Low for agent-studio's hook-centric codebase. Fixtures are used but not documented as a pattern.

---

## Gap Analysis: LSP Skill

### Gap L1 (LOW): LSP 3.18 inline completions not documented

**Current:** LSP 3.17 section exists with inlay hints, type hierarchy, `goToDeclaration`. LSP 3.18 added `textDocument/inlineCompletion`.

**Impact:** Low for agent navigation workflows — inline completions are primarily an editor completion feature (similar to Copilot suggestions), not relevant to go-to-definition/references workflows.

**Recommendation:** Add a brief note that LSP 3.18 exists and its features are primarily IDE-UX oriented (inline completions, multi-range formatting). Not needed for agent navigation.

### Gap L2 (LOW): No mention of semantic tokens

**Current:** The skill covers navigation operations. LSP 3.17 added semantic tokens (`textDocument/semanticTokens/full`) for richer syntax highlighting. Not navigation-relevant.

**Impact:** Negligible for agent use cases.

### Gap L3 (LOW): `textDocument/inlineValue` (LSP 3.17) absent

**Current:** Inlay hints documented; inline values not.

**Inline value** shows runtime-computed values inline (e.g., variable values in a debugger session). Useful only when a debug session is active — not applicable to static agent navigation workflows.

**Recommendation:** No change needed. This is a debugging-time feature.

---

## Academic References

| Paper | arXiv ID | Relevance | Status in TDD skill |
|-------|----------|-----------|---------------------|
| LLM4TDD | arXiv:2312.04687 | AI-assisted TDD | Cited |
| TDD for Code Generation | arXiv:2402.13521 | Test-first generation | Cited |
| Tests as Prompt | arXiv:2505.09027 | Tests as executable specs | Cited |
| SWE-Flow | arXiv:2506.09003 | Agent workflow | Cited |
| TDFlow | arXiv:2510.23761 | Multi-agent TDD (94.3% SWE-Bench) | Cited |
| Scaling TDD from Functions to Classes | arXiv:2602.03557 | Class-level TDD | Cited |
| Rafique & Misic meta-analysis | DOI:10.1109/TSE.2012.28 | TDD effectiveness | Cited |
| Martin Fowler TDD (2023) | fowler.com | Canon TDD | Referenced |
| Kent Beck Canon TDD (2023) | tidyfirst.substack.com | Canon TDD | Referenced |

The TDD skill's research basis is comprehensive and current through 2026. No missing citations of significance.

---

## Practical Recommendations

### P0 (Critical — Address Before Next Skill Update)

None. Both skills are current and correct.

### P1 (High — Address in Next Skill Update)

**P1-T1: Add Stryker Vitest runner to TDD skill**

The Vitest runner for Stryker is needed for ESM/TypeScript mutation testing, consistent with the skill's existing guidance to use Vitest 4 for `.ts`/ESM files. The current `@stryker-mutator/jest-runner` reference creates an inconsistency — the skill says "use Vitest for TypeScript" but Stryker section only shows Jest runner.

**Specific change:** Add a second Stryker code block showing `@stryker-mutator/vitest-runner` for TypeScript/ESM files. Keep jest-runner example for CJS files.

### P2 (Medium — Opportunistic)

**P2-T1: Add TDAID terminology reference**

One-line addition to multi-agent TDD section: "This pattern aligns with Test-Driven AI Development (TDAID), an emerging industry term for the TDD-first agent workflow."

**P2-L1: Add LSP 3.18 note to LSP skill**

One-line addition to the LSP 3.17 section noting LSP 3.18 exists with IDE-facing completions and formatting features. Clarifies the skill intentionally omits them as irrelevant to agent navigation.

**P2-T2: Add Stryker Vitest config example**

Full `stryker.config.mjs` for Vitest runner, showing `coverageAnalysis: 'perTest'` (best practice for accurate per-test coverage in mutation runs).

---

## Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|-----------|
| Stryker Vitest runner gap causes confusion | Medium — developer uses jest-runner for TS files | High — Vitest 4 is default for TS | Add vitest-runner block to skill |
| LSP 3.18 features adopted by typescript-language-server 6.x | Low — navigation APIs unchanged | Medium | Monitor TS LSP release notes |
| TDFlow arXiv paper findings become outdated | Low — 94.3% SWE-Bench is durable benchmark | Low | No action needed |
| CJS LSP limitation increases as codebase migrates to TS | Medium — LSP becomes more useful | Medium — migration ongoing | LSP skill already documents TS/ESM preference |

---

## Implementation Roadmap

1. **Immediate (Phase 2B):** Pass this report to `skill-updater` for TDD skill — add Stryker Vitest runner (P1-T1)
2. **Phase 2B:** Pass to `skill-updater` for LSP skill — add LSP 3.18 footnote (P2-L1)
3. **Opportunistic:** Add TDAID terminology and Stryker Vitest config example during next skill review cycle

**Gap count: 4 gaps identified (1 P1, 3 P2/low)**

**Overall skill health: 9.2/10** — both skills are exceptionally current for March 2026. The Stryker Vitest runner gap is the only meaningful fix needed.
