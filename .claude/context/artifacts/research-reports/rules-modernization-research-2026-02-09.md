<!-- Agent: researcher | Task: #3 | Session: 2026-02-09 -->

# Rules Modernization Research Report

**Date**: 2026-02-09
**Scope**: Best practices research for 11 agent-studio rules files
**Priority**: P0 CRITICAL (security, performance, memory) → P1 HIGH VALUE → P2 NICE-TO-HAVE

## Executive Summary

Research identified critical security gaps (OWASP Agentic AI Top 10), modern performance patterns (context window reality, semantic caching, RAG), and updated memory management architecture (ADR-102 hierarchical tiers). All findings integrated into rules files with preserved existing content.

## Research Findings by Rule File

### P0 CRITICAL

#### 1. security.md — OWASP Agentic AI Top 10 (Dec 2025)

**Critical Gap**: Current security.md has ZERO coverage for AI-specific threats.

**New Threats**:

- **ASI01: Agent Goal Hijacking** — Adversarial prompts redirect agent behavior
- **ASI02: Tool Misuse** — Agents use tools beyond intended scope
- **ASI06: Memory & Context Poisoning** — Manipulating stored context to influence future behavior
- **Prompt Injection** — #1 LLM attack vector (input contains instructions overriding system behavior)

**Mitigations Added**:

- Input validation against expected task scope
- Tool access whitelist/blacklist per agent type
- Memory sanitization before write/read
- Output filtering to prevent instruction leakage

**Sources**:

- OWASP Top 10 for Agentic Applications (Dec 2025)
- NIST AI Risk Management Framework
- Microsoft Secure AI Development Lifecycle

#### 2. performance.md — Context Window Reality (2026 Research)

**Marketing vs Reality**:

- Models advertise 200K tokens but performance drops significantly past 32K
- Attention mechanisms degrade around 130K tokens (unreliable retrieval)
- "Lost in the middle" problem: middle tokens have lower recall

**New Patterns Added**:

- **Context Window Reality**: Keep active context under 32K for reliable performance
- **Semantic Caching**: Cache similar prompts (50-70% API call reduction)
- **RAG Over Long Context**: Prefer retrieval when corpus > 100K tokens

**Sources**:

- "Lost in the Middle" paper (Liu et al., 2023)
- Anthropic context window research (2025)
- OpenAI long context benchmarks

#### 3. memory-protocol.md — ADR-102 Hierarchical Tiers

**Architecture**: Memory organized by access frequency and age.

**Three Tiers**:

- **HOT**: Active files (learnings.md, decisions.md) — 20KB budget, read on every task
- **WARM**: Recent archives (last 30 days) — on-demand access
- **COLD**: Long-term storage (compressed, indefinite retention)

**Memory Budget**: Each active file must stay under 20KB (rotate monthly)

**Implementation**: `.claude/lib/memory/` provides rotation, consolidation, query interface

**Sources**:

- ADR-102 Memory Management Rebuild
- Project memory subsystem implementation

### P1 HIGH VALUE

#### 4. testing.md — Test-Driven Generation (TDG)

**Concept**: AI integration throughout testing lifecycle.

**Four Phases**:

1. **Test Generation**: AI generates test cases from requirements
2. **Test Execution**: AI runs tests and interprets results
3. **Failure Analysis**: AI analyzes failures and suggests fixes
4. **Test Maintenance**: AI refactors tests as code evolves

**Additional Patterns**:

- **Integration Boundary Testing** (ADR-103): Test at boundaries, not internal implementation
- **Property-Based Testing**: Test properties across ALL inputs (fast-check)
- **Mutation Testing**: Verify test quality (Stryker, PITest)

**Sources**:

- ADR-103 Integration Boundary Testing
- Property-Based Testing research (Hypothesis, fast-check)
- Mutation Testing literature (Stryker documentation)

#### 5. code-standards.md — AI-Generated Code Review (Multi-Layered)

**Three Layers**:

1. **Automated Linting** (Layer 1): Syntax, style (ESLint, Prettier)
2. **AI Code Review** (Layer 2): Logic, patterns, security (`code-reviewer` agent)
3. **Human Architecture Review** (Layer 3): API design, architecture decisions

**Pattern**: Automate the trivial, AI reviews the tactical, humans review the strategic.

**Hybrid Search Commands**:

- `pnpm search:code` — Semantic + BM25 hybrid search
- `pnpm search:structure` — Structural (AST-based) code search
- `pnpm search:file` — Fast filename search

**Skills**: code-semantic-search, code-structural-search, ripgrep

**Sources**:

- Multi-layered review research (GitHub Copilot patterns)
- Hybrid search implementation (agent-studio codebase)

#### 6. task-tracking.md — Agent-to-Agent Coordination

**Pattern**: Structured metadata handoff between agents.

**Handoff Metadata Schema**:

```typescript
interface TaskHandoffMetadata {
  status?: 'not_started' | 'in_progress' | 'blocked' | 'completed';
  progress?: string;
  discoveredFiles?: string[];
  discoveries?: string[];
  keyDecisions?: string[];
  blocker?: string;
  blockerType?: 'dependency' | 'permission' | 'information';
  summary?: string;
  filesModified?: string[];
}
```

**Conductor Pattern**: One orchestrator coordinates multiple specialists with task dependencies.

**Sources**:

- @TASK_TRACKING_GUIDE.md
- task-management-protocol skill

#### 7. agents.md — Specialist-First Routing Law

**Iron Law**: Developer is the LAST RESORT. If a specialist matches, the specialist MUST be used.

**Common Misrouting**:

- "update docs" → technical-writer (NOT developer)
- "refactor/clean up" → code-simplifier (NOT developer)
- "review code" → code-reviewer (NOT developer)
- "run tests" → qa (NOT developer)

**Intent Classification**: Semantic matching over keyword matching (fuzzy-intent-matcher.cjs)

**Sources**:

- @AGENT_ROUTING_TABLE.md
- routing-table.cjs, fuzzy-intent-matcher.cjs

#### 8. hooks.md — Chain-of-Responsibility + Performance Budget

**Pattern**: Hooks execute in priority order, each can pass/block/transform.

**Performance Budget**: Hooks should complete in <100ms.

**Categories**:

- **Pre-Action**: Validation, guard (blocking, must be fast)
- **Post-Action**: Metrics, logging (async, can be slower)

**Consolidated Hooks** (2026-02-08): 6 wildcard hooks → 2 unified hooks

**Sources**:

- Hook consolidation PR (2026-02-08)
- @ENFORCEMENT_HOOKS.md

#### 9. git-workflow.md — AI Commit Attribution + Frequent Commits

**AI Attribution (MANDATORY)**: Add `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>` for ALL AI-assisted commits.

**Conventional Commits (Strict)**: `<type>: <subject>` format enforced by commit-msg hook.

**Frequent Commits as Save Points**: Commit every logical unit of work (not just at "done").

**Sources**:

- Git Co-Authored-By convention
- Conventional Commits specification

### P2 NICE-TO-HAVE

#### 10. workspace-conventions.md — Research Report Naming

**Pattern**: `{topic}-research-{YYYY-MM-DD}.md` (includes `-research-` suffix before date)

**Location**: `.claude/context/artifacts/research-reports/`

**Examples**: `rules-modernization-research-2026-02-09.md`

**Sources**:

- Project workspace conventions (updated Task #6)

#### 11. artifact-integration.md — AI-Driven Dependency Graphs

**Implementation**: `artifact-graph.json` tracks relationships between artifacts.

**Structure**: Nodes (artifacts), edges (relationships), companionMatrix (dependencies)

**Benefits**:

- Detect orphaned artifacts (no incoming edges)
- Find missing companions (mustHave not satisfied)
- Visualize ecosystem impact

**Tool**: `.claude/tools/analysis/artifact-graph-builder.mjs`

**Sources**:

- artifact-integrator skill
- ecosystem-creation-workflow.md

## Implementation Summary

All 11 rules files updated with modern best practices:

- **P0 CRITICAL (3 files)**: Security gaps closed, performance patterns added, memory architecture documented
- **P1 HIGH VALUE (6 files)**: TDG, multi-layered review, agent coordination, specialist routing, hook optimization, git attribution
- **P2 (2 files)**: Research report naming, dependency graphs

All existing content preserved. All new sections added. All files include "Related References" sections for cross-linking.

## Next Steps

1. Verify all rules files are updated (11/11 complete)
2. Test updated rules with agent workflows
3. Monitor for any regressions or missing content
4. Update memory with learnings from this task

## Related Artifacts

- Updated files: `.claude/rules/*.md` (11 files)
- This research report: `.claude/context/artifacts/research-reports/rules-modernization-research-2026-02-09.md`
