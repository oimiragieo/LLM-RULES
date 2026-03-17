<!-- Agent: technical-writer | Task: #9 | Session: 2026-03-17 -->

# Agent Tiers

Three-tier architecture for categorizing work units in the agent ecosystem by LLM dependency and token cost.

## Overview

Agent Studio classifies every work unit into one of three tiers based on how much LLM reasoning the unit requires. This determines model selection, cost expectations, pipeline position, and parallelism safety.

```
┌─────────────────────────────────────────────────────────────────┐
│               TIER 3 — Agents (Full LLM)                        │
│   developer, architect, qa, security-architect, planner, ...    │
├─────────────────────────────────────────────────────────────────┤
│               TIER 2 — Utilities (Minimal LLM)                  │
│   context-compressor (haiku), task-manager (haiku), ...         │
├─────────────────────────────────────────────────────────────────┤
│               TIER 1 — Adapters (No LLM)                        │
│   scripts/build-code-index.cjs, memory-rotator.cjs, ...         │
└─────────────────────────────────────────────────────────────────┘
```

The router always prefers lower tiers. Every Tier 3 agent call costs 10K–200K tokens. Every Tier 1 adapter costs zero.

---

## Tier 1: Adapters (No LLM)

Pure data fetch and format conversion. Zero token cost.

**Characteristics:**

- Deterministic output — same input always produces same output
- No reasoning required
- Sub-second execution
- Zero API calls to any LLM
- Safe to run in parallel without concern for cost

**Examples in agent-studio:**

| Work Unit | Role |
|---|---|
| `Read` tool | File retrieval |
| `scripts/build-code-index.cjs` | BM25 + vector index construction |
| `scripts/build-agent-registry.cjs` | Registry compilation from agent frontmatter |
| `scripts/validate-configs.cjs` | JSON schema validation |
| `.claude/lib/memory/memory-rotator.cjs` | File-size-based memory archive rotation |
| `.claude/lib/memory/memory-deduplicator.cjs` | Duplicate memory entry removal |
| `.claude/hooks/routing/routing-guard.cjs` | PreToolUse enforcement (rule-based, no LLM) |
| `pnpm search:code` (BM25 mode) | Keyword-ranked code search |

**When to use Tier 1:**

- Fetching files, querying the code index, or reading external data
- Building indexes, registries, or compiled artifacts from source files
- Applying deterministic rules (schema validation, hook enforcement)
- Any task where the output is fully determined by the input with no judgment needed

---

## Tier 2: Utilities (Minimal LLM)

Deterministic processing with optional lightweight LLM assistance.

**Characteristics:**

- Reproducible results with minor variation
- Minimal token cost — uses haiku model when LLM is needed
- Fewer than 10 tool calls in a typical run
- Bounded execution time
- Pipeline infrastructure rather than domain deliverables

**Examples in agent-studio:**

| Agent / Component | Role | Trigger |
|---|---|---|
| `context-compressor` | Reduces token usage via compression | Context >80K tokens |
| `task-manager` | Closes stale tasks, audits task hygiene | Drain gate, `stale-tasks.json` |
| `commit-validator` | Validates commit message format (regex, no LLM) | Pre-commit hook |
| `code-simplifier` | Bounded refactoring with scope limits | Architect-approved refactors |
| `reflection-agent` | Scores completed work against rubric | Post-pipeline audit |
| `heartbeat-orchestrator` | Registers and checks cron loops | Heartbeat reminder |

**When to use Tier 2:**

- Transforming, compressing, or validating existing content
- Managing pipeline state (task hygiene, context budget, cron loops)
- Applying quality gates between workflow phases
- Any task where the transformation rule is known and only light judgment is needed

---

## Tier 3: Agents (Full LLM)

Full LLM reasoning for non-deterministic, creative, or analytical work.

**Characteristics:**

- Significant token cost (10K–200K tokens per invocation)
- 10–100+ tool calls per task
- Creative or analytical reasoning required
- May spawn Tier 1 or Tier 2 sub-units for support
- Produces user-visible deliverables: code, docs, test suites, reports, designs

**Examples in agent-studio:**

| Agent | Domain | Model | Key Skills |
|---|---|---|---|
| `developer` | Feature implementation | sonnet | `tdd`, `debugging`, `git-expert` |
| `architect` | System design | opus | `architecture-review`, `diagram-generator` |
| `planner` | Task decomposition | opus | `plan-generator`, `writing-plans` |
| `qa` | Test strategy and execution | opus | `tdd`, `qa-workflow`, `webapp-testing` |
| `security-architect` | Threat modeling | opus | `security-scanning`, `auth-security-expert` |
| `code-reviewer` | Code quality gates | sonnet | `audit-context-building`, `fix-review` |
| `technical-writer` | Documentation | sonnet | `doc-generator`, `writing-skills` |
| `researcher` | Web research and synthesis | sonnet | `research-synthesis`, Exa MCP |

**When to use Tier 3:**

- Writing new code, designing systems, or making architectural decisions
- Creating documentation, test suites, or security analyses
- Any task that requires judgment, synthesis, or creativity
- Any task where the correct output is not derivable from a deterministic rule

---

## Decision Matrix

| Question | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|
| Needs reasoning or judgment? | No | Minimal | Yes |
| Output deterministic? | Yes | Mostly | No |
| Token cost | 0 | Low (haiku) | High (sonnet/opus) |
| Can cache results? | Yes | Usually | Rarely |
| Typical execution time | <1s | 5–30s | 30s–10min |
| Failure mode | Crash / wrong format | Wrong format | Wrong answer |
| Can run in unlimited parallel? | Yes | Yes | No (cost and overlap risk) |

---

## When to Use Each Tier

**Data fetch → Tier 1:** Reading files, querying APIs, running `pnpm search:code`, building indexes, schema validation.

**Transform → Tier 2:** Context compression, commit validation, simple bounded refactoring, task hygiene, reflection scoring.

**Create → Tier 3:** New code, architecture decisions, security analysis, documentation, test strategy.

---

## Cost Optimization

Prefer lower tiers when possible.

- Tier 1 adapters cost **zero tokens**.
- Tier 2 utilities cost **hundreds to low thousands of tokens** (haiku).
- Tier 3 agents cost **10K–200K tokens** per invocation (sonnet or opus).

Design pipelines to use Tier 1 and Tier 2 for data preparation and reserve Tier 3 for actual reasoning. A well-structured pipeline front-loads Tier 1 collection (gather all files, index all code) and Tier 2 validation before a single Tier 3 agent is spawned.

**Anti-patterns (expensive):**

- Spawning a Tier 3 developer agent to check whether a file exists (use `Read` or `Glob`)
- Spawning a Tier 3 agent to validate JSON schema (use `scripts/validate-configs.cjs`)
- Running multiple Tier 3 agents in parallel without architect pre-approval (see Gate 5 in CLAUDE.md)

---

## Model Selection by Tier

| Tier | Typical Model | Rationale |
|---|---|---|
| Tier 1 | None | Pure computation |
| Tier 2 | haiku | Speed and cost efficiency for bounded tasks |
| Tier 3 (standard) | sonnet | Balanced quality/cost for most agent work |
| Tier 3 (complex) | opus | Architecture decisions, security analysis, orchestration |

The router resolves models from `config.yaml` (ADR-075). See `.claude/docs/@MODEL_SELECTION.md` for the full precedence chain.

---

## Tier Assignment for New Work Units

When creating a new agent, script, or hook, determine the tier first:

| Question | Answer YES → Tier |
|---|---|
| Does this unit call an LLM at all? | No → **Tier 1** |
| Does this unit use haiku for simple transforms only? | Yes → **Tier 2** |
| Does this unit require sonnet/opus reasoning? | Yes → **Tier 3** |
| Does this unit bridge an external system (Exa, GitHub, CI)? | Tier 1 if data-only, Tier 3 if reasoning over it |
| Unsure? | Start at **Tier 3**, refactor down if the task proves deterministic |

**Creating new capabilities by tier:**

- **Tier 1:** Add a script to `scripts/` or a hook to `.claude/hooks/`. No creator skill needed.
- **Tier 2:** Use `Skill({ skill: 'agent-creator' })` to add a utility agent; target haiku model.
- **Tier 3:** Use `Skill({ skill: 'agent-creator' })` with appropriate model and skill assignments.

---

## Parallelism Safety

- **Tier 1:** Unlimited parallelism. Multiple adapters can read, index, or validate simultaneously with no risk.
- **Tier 2:** Safe to run multiple utilities in parallel provided they target different concerns (context compression and task hygiene can co-run).
- **Tier 3:** At most 2 heavy agents in parallel (CLAUDE.md memory rule). Multiple Tier 3 agents must not have overlapping `owned_paths` — they write to the same repository.

---

## Related References

- `.claude/context/agent-registry.json` — canonical agent list with tier information and capabilities
- `.claude/docs/@AGENT_ROUTING_TABLE.md` — routing matrix for all 74 agents
- `.claude/docs/@MODEL_SELECTION.md` — model selection guidelines and config.yaml precedence (ADR-075)
- `.claude/docs/ARCHITECTURE.md` — full framework architecture including agent categories
- `CLAUDE.md` Section 3 — Routing Table and Planning Orchestration Matrix
- `CLAUDE.md` Section 5 — Model selection guidelines
- `CLAUDE.md` Section 8 — Memory and context budget rules (80K/120K/150K thresholds)
