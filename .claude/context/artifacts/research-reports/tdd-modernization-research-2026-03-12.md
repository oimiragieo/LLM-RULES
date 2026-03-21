<!-- Agent: researcher | Task: #22 | Session: 2026-03-12 -->

# Research Report: TDD Modernization — Stryker/Vitest, TDAID, LSP 3.18

**Date**: 2026-03-12
**Researcher**: researcher agent
**Task**: #22
**Batch/Phase**: Phase 1 — Single-phase research
**Sources Consulted**: 5

---

## Executive Summary

The TDD landscape in 2025-2026 has evolved significantly across three fronts. Stryker JS 7.x now ships an official `@stryker-mutator/vitest-runner` package replacing the jest-runner for ESM/TypeScript projects. TDAID (Test-Driven AI-Assisted Development) has crystallized into a five-phase methodology that adds explicit Planning and Validation phases around the classic Red-Green-Refactor cycle, with AI agents executing the cycle at accelerated speed under human oversight. LSP 3.18 adds `SnippetTextEdit`, diagnostic `MarkupContent`, and formalizes notebook document support, with code lens remaining the primary TDD integration point. The current agent-studio TDD skill (v1.2.0) already references mutation testing with `@stryker-mutator/jest-runner`, MSW v2, and multi-agent TDD decomposition, but uses the jest-runner rather than the vitest-runner. The primary gap is the absence of a working Stryker/Vitest config example and the TDAID five-phase workflow description.

---

## Research Methodology

### Search Queries Executed

| # | Query | Source | Results Found |
|---|-------|--------|---------------|
| 1 | Stryker mutator vitest runner 2025 2026 configuration @stryker-mutator/vitest-runner | WebSearch | 10 |
| 2 | TDAID test-driven AI-assisted development methodology 2025 2026 LLM red green refactor | WebSearch | 10 |
| 3 | LSP protocol 3.18 new features test lens provider code actions 2025 | WebSearch | 9 |
| 4 | Stryker vitest runner docs (direct fetch) | WebFetch | Full page |
| 5 | TDAID awesome-testing.com article + LSP 3.18 spec | WebFetch (2x) | Full pages |

### Sources Consulted

| # | Title | Type | URL | Date |
|---|-------|------|-----|------|
| 1 | Vitest Runner — Stryker Mutator official docs | Docs | https://stryker-mutator.io/docs/stryker-js/vitest-runner/ | 2025 |
| 2 | Announcing StrykerJS 7.0: Vitest and Tap test runner support | Blog | https://stryker-mutator.io/blog/announcing-stryker-js-7/ | 2024/2025 |
| 3 | Test-Driven AI Development (TDAID) — Awesome Testing | Blog | https://www.awesome-testing.com/2025/10/test-driven-ai-development-tdaid | 2025-10 |
| 4 | Test-Driven AI Agent Definition (TDAD) — arXiv:2603.08806 | Academic | https://arxiv.org/abs/2603.08806 | 2026-03 |
| 5 | LSP 3.18 Specification | Spec | https://microsoft.github.io/language-server-protocol/specifications/lsp/3.18/specification/ | 2025 |

---

## Detailed Findings

### Topic 1: Stryker JS + Vitest Runner (2025-2026)

**Key Insights:**

- StrykerJS 7.0 shipped official `@stryker-mutator/vitest-runner` as a first-party plugin — the jest-runner is now the legacy option for ESM/TypeScript projects
- The vitest runner always uses `perTest` coverage analysis (optimal for performance), ignoring any `coverageAnalysis` setting in stryker config
- Browser Mode is **not** supported; only `threads: true` mode is supported
- `vitest.related: true` (default) runs only tests related to mutated files — disable for integration/e2e tests
- Stryker manages parallelization itself; the vitest runner forces single-threaded vitest execution per runner

**Working `stryker.config.mjs` for Vitest:**

```javascript
// stryker.config.mjs
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  testRunner: 'vitest',
  vitest: {
    configFile: 'vitest.config.ts',   // optional: path to your vitest config
    // dir: 'src',                    // optional: limit test discovery to a directory
    related: true,                    // default: run only tests related to mutated file
  },
  // Recommended thresholds
  thresholds: {
    high: 80,
    low: 60,
    break: 50,
  },
  // Reporters
  reporters: ['html', 'progress'],
  htmlReporter: {
    fileName: 'reports/mutation/html/index.html',
  },
};
export default config;
```

**Installation:**

```bash
pnpm add -D @stryker-mutator/core @stryker-mutator/vitest-runner vitest
pnpm stryker run
```

**Relevance to agent-studio TDD skill:**

The current SKILL.md (lines 491-516) references `@stryker-mutator/jest-runner`. Agent studio uses `node --test` for `.cjs` and Vitest for `.ts`/ESM. The Vitest runner should be the recommended option for any TypeScript tests. The existing config example should be updated from jest-runner to vitest-runner.

**In-source testing note:** If tests live inside source files (Vitest `import.meta.vitest`), mark the blocks with `// Stryker disable all` to prevent Stryker from mutating the tests themselves.

---

### Topic 2: TDAID — Test-Driven AI-Assisted Development (2025-2026)

**Key Insights:**

- TDAID extends classic TDD with two additional phases: **Plan** (before Red) and **Validate** (after Refactor), creating a five-phase loop: Plan → Red → Green → Refactor → Validate
- The Planning phase uses high-reasoning models (Gemini 2.5-Pro, GPT-5, Claude Opus) to generate structured implementation plans with explicit TDD checkpoints before any code is written
- Human developers manually verify test intent and implementation at each phase boundary — TDAID is explicitly **not** fully autonomous
- Git commits are made after each phase as save points; completed phases are marked (e.g., ✅) to enable session resumability across context resets
- The core risk being mitigated is "specification gaming" — AI cheating tests by deleting assertions, hardcoding expected values, or making code superficially compliant
- Test engineers become the throughput bottleneck: "Delivery speed is limited not by how fast the model writes code, but by how confidently we can verify it"

**TDAID Workflow (2025 Standard):**

```
Phase 1: PLAN
  - Use thinking model to generate phased implementation plan
  - Plan includes: objectives, ordered code changes, tests to write per phase, expected outcomes
  - Human reviews and approves plan before proceeding

Phase 2: RED (AI-assisted)
  - AI agent generates or writes tests expressing desired behavior
  - Human verifies: test fails for expected reason (missing behavior, not syntax)
  - Human verifies: test is not trivially passable

Phase 3: GREEN (AI-assisted)
  - AI agent implements minimal change to pass the test
  - Human verifies: tests pass, no regressions, no test-hacking
  - Git commit: test-only commit (no implementation)

Phase 4: REFACTOR (AI-assisted)
  - AI agent improves code quality without changing functionality
  - Human verifies: all tests still green
  - Git commit: implementation commit

Phase 5: VALIDATE (Human gate)
  - Human confirms implementation matches plan
  - Human confirms edge cases handled
  - Human confirms code readability maintained
  - Only then: move to next scenario in backlog
```

**Key difference from classic TDD:** The Plan phase prevents AI from inventing its own interpretation of requirements. The Validate phase catches specification gaming that the test suite alone may not catch.

**TDAD (2026 variant — arXiv:2603.08806):** An even more automated variant where agent prompts are treated as "compiled artifacts" — behavioral specifications are provided, a coding agent converts them into executable tests, and a second coding agent iteratively refines the prompt until all tests pass. This is fully agent-to-agent without human-in-loop test writing.

**Relevance to agent-studio TDD skill:**

The current skill's Multi-Agent TDD Decomposition section (QA writes test → Developer implements → Reflection verifies) maps closely to TDAID phases 2-4. The missing pieces are the Plan phase (currently implicit) and the explicit Validate phase (currently handled by verification-before-completion skill). Adding explicit Plan + Validate phase framing to the skill would align it with 2025-2026 standards.

---

### Topic 3: LSP Protocol 3.18 — Features Relevant to TDD

**Key Insights:**

- LSP 3.18 introduces `SnippetTextEdit` — interactive text edits with cursor positioning, directly enabling test scaffolding (e.g., auto-generate test function with cursor placed at assertion)
- Diagnostic `MarkupContent` support allows test failure messages to include formatted markdown — test output with code blocks, links to documentation
- **No dedicated test lens provider** exists in LSP 3.18 — test discovery/run/debug integration is done via the general `codeLens` provider and IDE-specific extensions (VSCode Test Explorer API, etc.)
- Relative file watcher patterns (3.18) improve test file watching accuracy
- Position encoding negotiation (3.18) fixes multi-byte character edge cases in test files with Unicode content
- Notebook document support (3.17+) enables literate testing in Jupyter-style environments

**LSP Code Lens for TDD (current state):**

The LSP `textDocument/codeLens` request is the primary mechanism for "Run Test" / "Debug Test" buttons in editors. Language servers (e.g., `ts-language-server`, `rust-analyzer`) emit code lenses over test functions. There is no LSP 3.18 change to this mechanism — it remains convention-based.

**LSP 3.18 Spec TDD-relevant additions summary:**

| Feature | Version | TDD Relevance |
|---------|---------|---------------|
| `SnippetTextEdit` | 3.18.0 | Test scaffolding with cursor positioning |
| Diagnostic `MarkupContent` | 3.18.0 | Rich test failure messages with formatting |
| Relative file watcher patterns | 3.18.0 | Accurate test file change detection |
| Position encoding negotiation | 3.18.0 | Unicode correctness in test files |
| Inlay hints with resolution | 3.17+ | Visualize assertion values, parameter types |
| Notebook document support | 3.17+ | Literate testing in Jupyter-style notebooks |

**Relevance to agent-studio TDD skill:**

The current LSP Pre-RED Type Verification section (SKILL.md lines 299-317) uses `lsp_hover` for signature verification before writing tests. LSP 3.18's `SnippetTextEdit` is primarily an editor UX feature — it does not change how the lsp-navigator skill works in agent-studio. The relevant update is: note that LSP 3.18 does NOT introduce a test lens provider — "Run Test" code lenses are still framework-specific (Vitest plugin, Jest runner) rather than an LSP standard.

---

### Topic 4: Comparison with Current Agent-Studio TDD Skill (v1.2.0)

**Current skill strengths (already ahead of 2025 baseline):**

- Multi-agent TDD decomposition (QA → Developer → Reflection) — maps to TDAID Phases 2-4
- Property-based testing with fast-check 3.x examples — current standard
- MSW v2 HTTP boundary mocking — current standard
- AI Output Evaluation Testing with score-based assertions — advanced 2025 pattern
- Tool-call sequence validation for agent testing — advanced 2025 pattern
- LSP Pre-RED Type Verification — unique to agent-studio, not in general TDAID literature

**Gaps identified vs 2025-2026 standards:**

| Gap | Severity | Description |
|-----|----------|-------------|
| Stryker config uses jest-runner | Medium | Should reference `@stryker-mutator/vitest-runner` for ESM/TypeScript targets |
| No explicit TDAID Plan phase | Low | Multi-agent section implies planning but doesn't name the TDAID Plan phase |
| No explicit Validate phase | Low | verification-before-completion skill handles this but SKILL.md doesn't cross-reference it as a TDAID phase |
| LSP 3.18 features not mentioned | Low | SnippetTextEdit and diagnostic MarkupContent not documented |
| TDAD (arXiv:2603.08806) not cited | Low | 2026 agent-to-agent variant of TDAID not in Research Basis section |

---

## Academic References

### 1. Test-Driven AI Agent Definition (TDAD) (2026)

- **Authors**: Multiple (arXiv:2603.08806)
- **Key Insight**: Treats agent prompts as compiled artifacts; behavioral specs → executable tests → iterative prompt refinement until tests pass — fully agent-to-agent TDD without human test writing
- **Relevance**: Next evolution of TDAID; relevant when agent-studio QA + developer agents can fully close the loop without human test authoring
- **URL**: https://arxiv.org/abs/2603.08806

### 2. Test-Driven Development for Code Generation (2024)

- **Authors**: Multiple (arXiv:2402.13521)
- **Key Insight**: LLMs guided by test suites achieve significantly higher code quality than unconstrained generation; tests as executable specifications outperform natural language prompts
- **Relevance**: Foundational empirical support for TDAID methodology
- **URL**: https://arxiv.org/abs/2402.13521

### 3. TDFlow (2025) — already cited in SKILL.md

- **Authors**: Multiple (arXiv:2510.23761)
- **Key Insight**: 94.3% SWE-Bench Verified score with multi-agent TDD decomposition (QA → Developer → Verifier); monolithic TDD agents score 60-70%
- **Relevance**: Empirical foundation for agent-studio Multi-Agent TDD Decomposition section
- **URL**: https://arxiv.org/abs/2510.23761

---

## Practical Recommendations

### P0 (Immediate — This Sprint)

- Replace `@stryker-mutator/jest-runner` with `@stryker-mutator/vitest-runner` in the SKILL.md Mutation Testing section; include the working `stryker.config.mjs` example above
- Add `pnpm add -D @stryker-mutator/vitest-runner` install command (replacing the jest-runner command on line 494)

### P1 (Soon — Next Sprint)

- Add explicit TDAID Plan + Validate phase framing to the Multi-Agent TDD Decomposition section — label the five phases and note that the `planner` agent handles the Plan phase in agent-studio
- Add TDAD (arXiv:2603.08806) to the Research Basis section as the 2026 agent-to-agent variant
- Add a note in the LSP Pre-RED section clarifying that LSP 3.18 does not introduce a test lens provider standard — "Run Test" buttons remain IDE-extension territory

### P2 (Future — Backlog)

- Consider a TDAID-specific workflow document (`.claude/workflows/tdaid-workflow.md`) that maps agent-studio agents to TDAID phases for complex multi-phase features
- Investigate Stryker Browser Mode support timeline — currently blocked, but Vitest 3+ Browser Mode is stable and Stryker integration is a roadmap item
- Evaluate `SnippetTextEdit` (LSP 3.18) for test scaffolding code actions in the lsp-navigator skill

---

## Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Stryker jest-runner example works but becomes stale | Medium | High (ESM migration ongoing) | Update to vitest-runner in P0; add version annotation |
| TDAID Validate phase omitted causing AI spec gaming | High | Medium | Add Validate phase cross-ref to verification-before-completion skill |
| Stryker Browser Mode gap | Low | Low | Note limitation in SKILL.md; re-evaluate when Stryker 8.x ships |
| TDAD (agent-to-agent) not yet production-ready | Low | Low | Cite as forward-looking reference only; don't change workflow yet |
| LSP test lens confusion (developers expect LSP 3.18 to "add" test lenses) | Low | Medium | Clarify in SKILL.md: test lenses are IDE-extension, not LSP standard |

---

## Implementation Roadmap

### Immediate (P0) — Stryker/Vitest config update

1. Locate SKILL.md lines 491-516 (Mutation Testing section)
2. Replace `@stryker-mutator/jest-runner` install line with `@stryker-mutator/vitest-runner`
3. Replace the `pnpm stryker run` note with the working `stryker.config.mjs` example from this report
4. Add vitest-runner limitations (no Browser Mode, threads-only)

### Short-term (P1) — TDAID and LSP 3.18 documentation

1. Locate Multi-Agent TDD Decomposition section (lines 279-296)
2. Add TDAID five-phase framing as a reference; map to existing QA/Developer/Reflection agents
3. Add `planner` agent as the Plan phase owner
4. Add verification-before-completion as the Validate phase owner
5. Add arXiv:2603.08806 to Research Basis section
6. Add LSP 3.18 clarification note in LSP Pre-RED section

### Validation

After skill update, verify:
- `pnpm add -D @stryker-mutator/vitest-runner` succeeds in a test project
- `stryker.config.mjs` above produces a valid mutation run against a Vitest test file
- TDAID phase mapping does not conflict with existing Multi-Agent TDD Decomposition content

---

## Appendix: Key URLs for Skill Update

- Stryker Vitest Runner docs: https://stryker-mutator.io/docs/stryker-js/vitest-runner/
- StrykerJS 7.0 announcement: https://stryker-mutator.io/blog/announcing-stryker-js-7/
- TDAID methodology: https://www.awesome-testing.com/2025/10/test-driven-ai-development-tdaid
- TDAD arXiv paper: https://arxiv.org/abs/2603.08806
- LSP 3.18 specification: https://microsoft.github.io/language-server-protocol/specifications/lsp/3.18/specification/
