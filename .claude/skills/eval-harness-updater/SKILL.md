---
name: eval-harness-updater
description: Refresh evaluation harnesses with live/fallback parser reliability, SLO gates, and regression checks.
version: 1.1.1
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Edit, Glob, Grep, Bash, Skill, MemoryRecord, WebSearch, WebFetch]
args: '--harness <path-or-name> [--trigger reflection|evolve|manual]'
error_handling: graceful
streaming: supported
verified: true
lastVerifiedAt: '2026-02-28'
---

# Eval Harness Updater

Refresh eval harnesses to keep live + fallback modes actionable under unstable environments.

## Focus Areas

- Prompt and parser drift
- Timeout/partial-stream handling
- SLO and regression gates
- Dual-run fallback consistency

## Workflow

1. Resolve harness path.
2. Research test/eval best practices (Exa + arXiv — see Research Gate below).
3. Add RED regressions for parsing and timeout edge cases.
4. Patch minimal harness logic.
5. Validate eval outputs and CI gates.
6. Resolve companion artifact gaps (see Cross-Reference table below).

## Research Gate (Exa + arXiv — BOTH MANDATORY)

Before proposing harness changes, gather current best practices:

1. Use Exa for implementation and ecosystem patterns:
   - `mcp__Exa__web_search_exa({ query: 'LLM eval harness 2025 best practices' })`
   - `mcp__Exa__get_code_context_exa({ query: 'eval harness parser reliability timeout handling' })`
2. Search arXiv for academic research on evaluation methodology (mandatory):
   - Via Exa: `mcp__Exa__web_search_exa({ query: 'site:arxiv.org LLM evaluation harness 2024 2025' })`
   - Direct API: `WebFetch({ url: 'https://arxiv.org/search/?query=LLM+evaluation+harness&searchtype=all&start=0' })`
3. Record decisions, constraints, and non-goals in memory learnings.

**arXiv is mandatory (not fallback) when topic involves:** LLM evaluation, agent evaluation, SLO gates, regression testing methodology, or parser reliability.

## Cross-Reference: Creator Ecosystem

This skill is part of the **Creator Ecosystem**. When research uncovers gaps, trigger the appropriate companion creator:

| Gap Discovered                           | Required Artifact | Creator to Invoke                      | When                              |
| ---------------------------------------- | ----------------- | -------------------------------------- | --------------------------------- |
| Domain knowledge needs a reusable skill  | skill             | `Skill({ skill: 'skill-creator' })`    | Gap is a full skill domain        |
| Existing skill has incomplete coverage   | skill update      | `Skill({ skill: 'skill-updater' })`    | Close skill exists but incomplete |
| Capability needs a dedicated agent       | agent             | `Skill({ skill: 'agent-creator' })`    | Agent to own the capability       |
| Existing agent needs capability update   | agent update      | `Skill({ skill: 'agent-updater' })`    | Close agent exists but incomplete |
| Domain needs code/project scaffolding    | template          | `Skill({ skill: 'template-creator' })` | Reusable code patterns needed     |
| Behavior needs pre/post execution guards | hook              | `Skill({ skill: 'hook-creator' })`     | Enforcement behavior required     |
| Process needs multi-phase orchestration  | workflow          | `Skill({ skill: 'workflow-creator' })` | Multi-step coordination needed    |
| Artifact needs structured I/O validation | schema            | `Skill({ skill: 'schema-creator' })`   | JSON schema for artifact I/O      |
| User interaction needs a slash command   | command           | `Skill({ skill: 'command-creator' })`  | User-facing shortcut needed       |
| Repeated logic needs a reusable CLI tool | tool              | `Skill({ skill: 'tool-creator' })`     | CLI utility needed                |
| Narrow/single-artifact capability only   | inline            | Document within this artifact only     | Too specific to generalize        |

## Iron Laws

1. **ALWAYS** run the Exa + arXiv research gate before updating any eval harness — updating without current external knowledge produces stale evaluation criteria.
2. **NEVER** remove existing evaluation criteria without replacing them with equivalent or better ones — reducing test coverage in an eval harness is a regression.
3. **ALWAYS** cross-reference the creator ecosystem for gaps before declaring the harness complete — missing companion artifacts (skills, agents, schemas) leave the harness unable to test new capabilities.
4. **NEVER** update eval harness in isolation from the skill/agent it evaluates — harness and artifact must stay synchronized or the harness tests the wrong behavior.
5. **ALWAYS** preserve backward compatibility in eval scoring — changing scoring semantics without migrating historical baselines makes trend analysis impossible.

## Anti-Patterns

| Anti-Pattern                                       | Why It Fails                                                                        | Correct Approach                                                                   |
| -------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Updating eval harness without research gate        | Criteria based on outdated knowledge; misses recent evaluation methodology advances | Always run Exa + arXiv research before updating any eval criteria                  |
| Removing test cases to simplify the harness        | Silently reduces coverage; regressions pass undetected                              | Only remove test cases when the behavior they tested has been deliberately removed |
| Harness and artifact in separate PRs               | Harness tests wrong behavior the moment artifact changes; immediate test drift      | Always update harness and artifact in the same commit                              |
| Changing scoring scale mid-project                 | Historical baselines become incomparable; trend analysis breaks                     | Define scoring scale once; create a migration if it must change                    |
| Declaring harness complete without companion check | Missing skills or schemas leave evaluation gaps                                     | Always run companion artifact check before marking harness update complete         |

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New evaluation pattern → `.claude/context/memory/learnings.md`
- Evaluation gap found → `.claude/context/memory/issues.md`
- Scoring decision made → `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
