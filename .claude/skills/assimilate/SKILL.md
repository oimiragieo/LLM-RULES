---
name: assimilate
description: Benchmark external agent frameworks and convert findings into a concrete TDD upgrade backlog for agent-studio evolution.
version: 1.2.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Edit, Glob, Grep, Bash, WebSearch, WebFetch, Skill]
error_handling: graceful
streaming: supported
verified: true
lastVerifiedAt: 2026-02-22T00:00:00.000Z
---

# Assimilate

## Overview

Use this skill when the user asks the framework to improve itself, or when EVOLVE identifies a capability gap that should be benchmarked against other codebases.

## When to Use

- User request: "improve the framework", "compare to competitor repos", "adopt best ideas"
- EVOLVE phase where external pattern benchmarking is needed before creating new artifacts
- Reflection/recommend-evolution output calls for concrete upgrade candidates

## Iron Laws

1. **NEVER implement borrowed ideas directly** — always produce a comparable feature map, explicit gap list, and TDD backlog with checkpoints before writing any code; direct copying without analysis creates undetected regressions.
2. **ALWAYS create workspace under `.claude/context/runtime/assimilate/<run-id>/`** — never clone repos to arbitrary or project-root locations; contained workspaces enable clean teardown and prevent accidental overwrites.
3. **ALWAYS use shallow clones (`--depth=1`) when possible** — full history is unnecessary for feature analysis and wastes disk; only use full clone when commit history is part of the comparison surface.
4. **NEVER execute external project scripts during assimilation** — no `npm install`, `make`, or `./setup.sh` from cloned repos; analysis is read-only; untrusted scripts can modify the host environment.
5. **ALWAYS score gaps by impact×feasibility before writing the TDD backlog** — an unordered backlog wastes implementation effort on low-value items; prioritize by expected benefit divided by complexity.

## Anti-Patterns

| Anti-Pattern                                          | Why It Fails                                         | Correct Approach                                                |
| ----------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------- |
| Implementing external patterns without gap analysis   | Blind copying introduces incompatible assumptions    | Always produce feature map and gap list first                   |
| Cloning repos outside assimilate workspace            | Leftover files pollute project root, hard to clean   | Use `.claude/context/runtime/assimilate/<run-id>/`              |
| Running `npm install` / project scripts from clones   | Untrusted scripts can modify host environment        | Read-only analysis only; never execute external scripts         |
| Writing TDD backlog items without acceptance criteria | Developers can't verify completion objectively       | Every backlog item needs RED test + measurable GREEN criteria   |
| Including gaps without complexity/risk scoring        | Low-value work gets implemented over high-value gaps | Score all gaps: impact, complexity (S/M/L), risk (low/med/high) |

## Four-Phase Execution

Default kickoff message:

```text
I’ll do this in four phases: clone competitor repos into a temp workspace, extract comparable features/tooling surfaces, build a gap list against our repo, then convert that into a concrete TDD backlog with checkpoints to implement and validate improvements. I’m starting by creating the temp comparison workspace and cloning the repos.
```

### Phase 1: Clone + Stage

1. Create workspace under `.claude/context/runtime/assimilate/<run-id>/`.
2. Clone target repos into `externals/<repo-name>/` using shallow clones where possible.
3. Capture inventory:
   - commit hash
   - default branch
   - top-level structure snapshot
4. Never execute untrusted project scripts during assimilation.

### Phase 2: Comparable Surface Extraction

Extract structured comparisons for each external repo and local repo across these surfaces:

- Memory model (tiers, retrieval APIs, persistence, indexing)
- Search stack (lexical, semantic, hybrid, daemon/prewarm, ranking)
- Agent communication/orchestration (task protocol, hooks, event/state flow)
- Creator system (templates, validators, CI gates, policy enforcement)
- Observability/quality (metrics, eval harnesses, state guards)

Output one normalized comparison table per surface.

### Phase 3: Gap List

Build a local gap list with:

- `gap_id`
- current state
- reference pattern (external source + path)
- expected benefit
- complexity (`S|M|L`)
- risk (`low|medium|high`)
- recommended artifact type (`skill|workflow|hook|schema|tool|agent`)

Prioritize by impact and implementation feasibility.

### Phase 4: TDD Upgrade Backlog

Convert prioritized gaps into implementable TDD items:

1. RED: failing test(s) and measurable acceptance criteria
2. GREEN: minimal implementation path
3. REFACTOR: hardening/cleanup
4. VERIFY: integration checks, hook/CI gates, docs updates

Each backlog item must include:

- owner agent
- target files
- command-level validation steps
- rollback/safety notes

## Alternative: Seven-Phase CLI Conversion Pipeline

When assimilating a CLI tool (rather than a full framework), use this streamlined pipeline inspired by CLI-Anything (HKUDS/CLI-Anything):

### Phase A: Analyze

1. Run `TOOL --help` (and `TOOL SUBCOMMAND --help`) to auto-discover all flags, subcommands, and options.
2. Parse output into a structured capability map: `{ commands: [], flags: [], outputFormats: [] }`.
3. Identify the tool's primary domain and interaction model (REPL, one-shot, daemon).

### Phase B: Design

1. Map CLI capabilities to agent-studio skill sections (When to Use, Workflow, Commands).
2. Define the JSON output contract — all generated wrappers MUST support `--output json` or equivalent structured output to eliminate parsing complexity for agents.
3. Identify which capabilities map to existing skills (dedup) vs. new skills (create).

### Phase C: Implement

1. Write the SKILL.md with workflow steps that invoke the CLI tool.
2. Include concrete command examples with expected JSON output.
3. Add error handling for common CLI failure modes (missing auth, network errors, invalid args).

### Phase D: Plan Tests

1. Define RED tests: expected CLI output for known inputs.
2. Define boundary tests: invalid flags, missing required args, permission errors.

### Phase E: Write Tests

1. Create test fixtures with mock CLI output.
2. Write assertions against the JSON output contract.

### Phase F: Document

1. Generate usage examples for each major workflow.
2. Document environment requirements (tool installation, auth setup).

### Phase G: Publish

1. Register in skill index via `pnpm skills:index`.
2. Update agent-registry if skill is assigned to a specialist agent.

### Iterative Refinement Loop

After initial publication, run a refinement cycle:

1. Compare the skill's coverage against the full `--help` output.
2. Identify uncovered subcommands or flags.
3. Repeat Phases B-G for uncovered capabilities.
4. Score coverage: `covered_commands / total_commands * 100%`.
5. Target >80% coverage before marking skill as complete.

## Output Contract

Return markdown with sections in this order:

1. `## Repo Set`
2. `## Comparable Surfaces`
3. `## Gap List`
4. `## TDD Backlog`
5. `## Execution Checkpoints`

If comparison repos are missing, return a blocked state with exact clone commands needed.

## Tooling Notes

- Prefer `pnpm search:code`/`ripgrep` in local repo for precise parity checks.
- Use `research-synthesis` when external research context is needed before scoring gaps.
- Use `framework-context` before writing system-level recommendations.
- Use `recommend-evolution` to record high-priority changes after backlog generation.

## Memory Protocol (MANDATORY)

Before work:

```bash
cat .claude/context/memory/learnings.md
```

After work:

- Record assimilated patterns: `.claude/context/memory/learnings.md`
- Record adoption risks/tradeoffs: `.claude/context/memory/decisions.md`
- Record unresolved blockers: `.claude/context/memory/issues.md`
