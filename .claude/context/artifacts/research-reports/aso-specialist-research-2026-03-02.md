<!-- Agent: developer | Task: #8 | Session: 2026-03-02 -->

# Research Report: ASO Specialist Agent

**Artifact Type**: Agent (domain specialist)
**Domain**: App Store Optimization (ASO)
**Date**: 2026-03-02
**Complexity**: Medium (4 queries)

## Executive Summary

App Store Optimization in 2025 is a data-driven discipline combining keyword research, metadata optimization, visual asset A/B testing, competitor analysis, rating management, and localization. The primary source agent (`marketing-app-store-optimizer` from `github.com/msitarzewski/agency-agents`) provides a clear four-step framework: market research → strategy → implementation → continuous optimization. The agent-studio domain agent pattern (pm-coordinator, frontend-pro) establishes clear structural conventions to follow.

## Research Methodology

| Query # | Query | Source |
|---------|-------|--------|
| 1 | ASO best practices 2025 keyword research metadata | WebSearch |
| 2 | Source agent content from msitarzewski/agency-agents | WebFetch (raw GitHub) |
| 3 | GitHub repo overview for source agent | WebFetch |
| 4 | ASO AI capabilities A/B testing competitor analysis localization 2025 | WebSearch |

## Existing Codebase Patterns

**Similar Artifacts Found:**

- `.claude/agents/domain/pm-coordinator.md` — domain specialist with detailed capability sections, workflow steps, behavioral traits, example interactions, skill invocation protocol, and memory protocol. Uses `sonnet` model, 18 maxTurns, lazy_load context strategy.
- `.claude/agents/domain/frontend-pro.md` — domain specialist with technology stack expertise, common tasks, verification checklists, and hybrid search policy. Uses `sonnet` model with `isolation: worktree`.

**Conventions Identified:**

- **Naming**: lowercase kebab-case (e.g., `aso-specialist.md`)
- **Structure**: YAML frontmatter → enforcement hooks table → related workflows → core persona → purpose → capabilities sections → workflow → behavioral traits → example interactions → skill invocation protocol → memory protocol → hybrid search policy
- **Tools**: Read, Write, Edit, Bash, Grep, Glob, WebSearch, WebFetch, MemoryRecord, TaskUpdate, TaskList, TaskCreate, TaskGet, Skill
- **Model**: `sonnet` for domain specialists
- **Temperature**: 0.3–0.4 for data-driven specialists
- **Context strategy**: `lazy_load`
- **Output location**: Reports to `.claude/context/reports/backend/`

## Best Practices Identified

| # | Practice | Source | Confidence | Rationale |
|---|----------|--------|------------|-----------|
| 1 | Keywords in app title carry strongest ASO weight | appradar.com/academy | High | Multiple sources confirm title is highest-weight metadata field |
| 2 | Review/update metadata every 4 weeks (iOS), 4–6 weeks (Google Play) | apptweak.com | High | Algorithm and competitor shifts require regular refreshes |
| 3 | Long-tail, intent-based keywords over high-volume generic terms | splitmetrics.com | High | Less competition, more targeted traffic |
| 4 | A/B test visual assets (icons, screenshots) scientifically | SplitMetrics platform | High | Conversion rate improvements of 25%+ achievable |
| 5 | Target 4.5+ star rating; apps below 4.0 penalized in rankings | appfollow.io | High | 90% of featured apps have 4.0+ stars |
| 6 | Localize metadata per locale with cultural/slang adaptation | asomobile.net | High | Smart localization unlocks regional markets |
| 7 | Diversify keywords: synonyms + long-tail + related terms (no repetition) | practicallogix.com | High | Repeated keywords waste space and signal algorithmic inefficiency |

## Design Decisions

| Decision | Rationale | Source | Alternatives Considered |
|----------|-----------|--------|------------------------|
| Model: sonnet (not opus) | ASO is data-driven/analytical, not architectural reasoning; sonnet sufficient | Pattern in pm-coordinator, pm-coordinator frontmatter | opus (overkill for domain specialist) |
| Temperature: 0.3 | Low temp for consistent, data-grounded recommendations matching source agent "grounded in analytics" constraint | pm-coordinator uses 0.3 | 0.5 (too creative for data-driven ASO) |
| Tools include WebSearch + WebFetch | ASO requires researching competitor listings, keyword volumes, store algorithms | Source agent does "market research" | Read-only tools (insufficient for live competitor data) |
| Skills: research-synthesis + memory-search + verification-before-completion | Research before strategies, memory for prior patterns, verify before completing | Domain agent skill conventions | No research skill (would produce uninformed strategies) |
| No isolation: worktree | ASO agent is analytical/advisory, not code-writing; no file conflict risk | frontend-pro has worktree for code isolation | worktree (unnecessary overhead) |

## Source Agent Capabilities (from msitarzewski/agency-agents)

The source agent (`marketing-app-store-optimizer`) defines these core capabilities:
- **Discoverability**: keyword research, metadata optimization, A/B testing for visual assets
- **Visual Asset Optimization**: app icons, screenshot sequences, preview videos, brand consistency
- **Sustainable Growth**: long-term organic strategies, international localization, rating management, competitive positioning

**Four-Step Workflow**: Market research → Strategy with keyword targeting → Implementation with testing → Continuous optimization

**Success Metrics**: 30%+ organic download growth monthly, top-10 rankings for 20+ terms, 25%+ conversion rate improvement, 4.5+ star rating

## Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Recommending outdated tactics (algorithm changes) | High | Medium | Include WebSearch in tools; instruct agent to verify current store policies |
| Platform-specific advice conflation (iOS vs Android) | Medium | Medium | Explicit capability sections for App Store (iOS) and Google Play separately |
| Over-confidence without actual store data access | Medium | High | Agent must note when recommendations need validation against live analytics tools |

## Recommended Implementation

**File Location**: `.claude/agents/domain/aso-specialist.md`
**Template**: Follow pm-coordinator.md structure (most similar domain specialist pattern)
**Provenance**: Source: github.com/msitarzewski/agency-agents (marketing-app-store-optimizer)

**Skills to assign**:
- `research-synthesis` — for competitor research and best practice lookup
- `memory-search` — for retrieving prior ASO strategies
- `verification-before-completion` — quality gate
- `task-management-protocol` — session coordination
- `context-compressor` — for large research sessions
- `context-compressor` — context budget management

## Quality Gate Checklist

- [x] Minimum 3 research queries executed (4 executed)
- [x] At least 3 external sources consulted (appradar.com, splitmetrics.com, apptweak.com, asomobile.net, agency-agents GitHub)
- [x] Existing codebase patterns documented (pm-coordinator.md + frontend-pro.md examined)
- [x] All design decisions have rationale and source
- [x] Risk assessment completed with mitigations
- [x] Recommended implementation path documented
- [x] Report saved with correct naming: `aso-specialist-research-2026-03-02.md`
- [x] Provenance header included

## Research Handoff to: agent-creator

**Report Location**: `.claude/context/artifacts/research-reports/aso-specialist-research-2026-03-02.md`

**Summary**: ASO specialist agent for agent-studio should follow the pm-coordinator structure (sonnet, temp 0.3, lazy_load), include WebSearch/WebFetch tools for live competitor research, cover keyword research/metadata/visual assets/competitor analysis/ratings/localization capabilities, and be based on the msitarzewski/agency-agents marketing-app-store-optimizer with 4-step workflow.

**Critical Decisions**:
1. Model: sonnet, temperature: 0.3 (data-driven, consistent recommendations)
2. Tools: include WebSearch + WebFetch (live competitor/store research required)
3. No worktree isolation (advisory agent, no code file conflicts)

**Proceed with creation**: YES
**Confidence Level**: High
