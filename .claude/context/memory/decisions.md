# Decisions

This file records architectural decisions and their rationale (ADRs).

## Format

Each decision should include:

- Date
- Decision made
- Context/problem
- Rationale
- Consequences

---

## ADR-078: Workspace Conventions and Directory Reorganization

**Date:** 2026-02-06

**Status:** Accepted

**Context:**
Deep audit (Task #19) found 55+ misplaced files in `.claude/context/artifacts/` root, no naming convention, no provenance tracking, and inconsistent report placement. Research (Task #20) identified industry best practices for agent workspace organization.

**Decision:**

1. Establish `.claude/rules/workspace-conventions.md` as the canonical workspace rules file
2. Create new directory structure: `reports/{domain}/`, `artifacts/{analysis,catalogs,summaries,database}/`
3. Adopt kebab-case naming with ISO 8601 date suffixes: `{name}-{YYYY-MM-DD}.{ext}`
4. Require provenance headers on all generated files: `<!-- Agent: {type} | Task: #{id} | Session: {date} -->`
5. Move `spawn-size-audit.jsonl` to `metrics/`, `rule-index-cache.json` to `config/`
6. Keep `evolution-state.json`, `reflection-queue.jsonl`, and `agent-registry.json` at context root (35+ cross-cutting references each)
7. Inject workspace conventions into the spawn template so all agents know the rules

**Rationale:**

- Flat structure (Option A) chosen over nested because it is simpler and easier to enforce
- Files with deep cross-cutting references (evolution-state.json has 35+ refs in hooks, workflows, agents) are too risky to move; pragmatic decision to document as canonical
- Provenance headers enable traceability without complex metadata systems
- Rules placed in `.claude/rules/` which Claude Code auto-loads as project instructions

**Consequences:**

- All new agent-generated files will follow naming and placement conventions
- Spawn template instructs every agent on correct file locations
- Legacy files in `artifacts/` root remain for now (Task #22 handles migration)
- Three root-level context files documented as canonical exceptions

---

## ADR-079: Agent Utilization Remediation Strategy

**Date:** 2026-02-06

**Status:** Proposed (pending implementation)

**Context:**
Audit (Task #35) found that 94% of agents (46/49) have never been spawned. The Router collapses all requests to `developer` because enforcement hooks default to `warn` and no post-completion workflow chain exists.

**Decision:**
Implement a 4-phase remediation strategy:

1. **Phase 1 (Immediate):** Change enforcement defaults to `block` mode for `PLANNER_FIRST_ENFORCEMENT` and `SECURITY_REVIEW_ENFORCEMENT`. This forces the Router to spawn planner for complex tasks and security-architect for security-sensitive tasks.

2. **Phase 2 (Short-term):** Create a PostToolUse hook on TaskUpdate(completed) that triggers follow-up agent spawns: code-reviewer for implementation tasks, qa for code changes, technical-writer for documentation changes, and reflection-agent for all completions.

3. **Phase 3 (Medium-term):** Fix the reflection deadlock by making Step 0 either spawn reflection-agent automatically or make reflections asynchronous. Implement a workflow state machine in `.claude/context/runtime/workflow-state.json`.

4. **Phase 4 (Long-term):** Add Router intent-to-agent enforcement that prevents spawning `developer` when the classified intent maps to a different agent.

**Rationale:**
- Phase 1 is zero-code (env var changes) and immediately activates planner + security-architect
- Phase 2 activates 5 more agents (code-reviewer, qa, technical-writer, reflection-agent, architect)
- Phase 3 fixes the reflection/learning loop
- Phase 4 prevents regression to developer-only routing

**Consequences:**
- Agent spawn costs will increase (more agents = more API calls)
- Task completion will take longer (multi-phase review)
- Quality and security will significantly improve
- The multi-agent architecture will finally be utilized as designed

**Full Analysis:** `.claude/context/reports/architecture/agent-utilization-audit-2026-02-06.md`

---

## ADR-080: Enterprise Orchestration Workflow State Machine

**Date:** 2026-02-06

**Status:** Accepted

**Context:**
Agent utilization audit (Task #35, ADR-079) established that 94% of agents are never spawned. The Router collapses all requests to `developer` due to: (1) enforcement hooks defaulting to `warn`, (2) no post-completion workflow chain, (3) no workflow state machine, and (4) no phase-based execution model. Research (Task #36) identified that LangGraph-style state machines with CrewAI-style role-based teams and quality gates between phases represent industry best practices for enterprise multi-agent orchestration in 2026.

**Decision:**
Implement a 7-phase enterprise orchestration workflow state machine that the Router MUST follow for every request:

1. **Phase 0: TRIAGE** -- Router classifies request (intent, complexity, domain, risk) and determines phase path
2. **Phase 0.5: DYNAMIC CREATION** -- When capability gap detected, create missing agents/skills via EVOLVE workflow
3. **Phase 1: DESIGN** -- Parallel spawn of planner + architect + security-architect (varies by complexity)
4. **Phase 2: IMPLEMENT** -- Developer + domain specialist following the plan from Phase 1
5. **Phase 3: REVIEW** -- Parallel spawn of code-reviewer + qa + security-architect
6. **Phase 4: DEPLOY** -- DevOps agent: lint, format, commit, push, CI verification
7. **Phase 5: DOCUMENT** -- Technical-writer updates docs, README, CHANGELOG
8. **Phase 6: REFLECT** -- Reflection-agent extracts learnings and updates memory

Key architectural decisions within this ADR:

- **Complexity-based phase skipping:** TRIVIAL tasks skip to Phase 2+4 only; LOW adds Phase 1+3; MEDIUM adds Phase 5; HIGH runs all phases; EPIC adds orchestrator coordination
- **Persistent state in workflow-state.json:** Router reads this file every turn to know which phase to advance to. Survives context resets.
- **Quality gates between every phase:** Blocking checks prevent advancement; non-blocking checks generate warnings
- **Post-completion chain hook:** PostToolUse on TaskUpdate(completed) automatically triggers next phase advancement
- **Enforcement hooks in block mode by default:** `PLANNER_FIRST_ENFORCEMENT=block`, `SECURITY_REVIEW_ENFORCEMENT=block`, `SPAWN_PROMPT_VALIDATOR=block`
- **Intent-to-agent enforcement:** New hook prevents spawning `developer` when classified intent maps to a different agent
- **Agent handoff via artifacts + TaskUpdate metadata:** Agents communicate through files at workspace-convention-compliant paths plus structured metadata in TaskUpdate calls

**Alternatives Considered:**

1. **Keep current ad-hoc routing (status quo):** Rejected. 94% agent under-utilization makes the multi-agent architecture pointless. No quality gates, no post-implementation review.
2. **Full LangGraph runtime integration:** Rejected. Would require a Python runtime and external dependency. The existing Task/TaskUpdate infrastructure provides equivalent state management capability.
3. **CrewAI-only approach (role-based, no state machine):** Rejected. CrewAI crews lack quality gates between phases. State machine ensures each phase completes before the next begins.
4. **Event-driven architecture (pub/sub between agents):** Rejected for now. The file-based blackboard pattern (workflow-state.json + artifact files) is simpler and works within Claude Code's single-conversation model. Event-driven could be added later as an optimization.

**Rationale:**

- The hybrid approach (LangGraph state machine + CrewAI role-based teams) combines the strengths of both frameworks
- File-based state (workflow-state.json) survives context resets -- critical for long-running workflows
- Quality gates enforce multi-agent collaboration rather than making it optional
- Complexity-based phase skipping prevents overhead for simple tasks (TRIVIAL tasks still get just developer + devops)
- The design uses ONLY existing infrastructure (Task, TaskUpdate, TaskList, file system) -- no new external dependencies
- Block-mode enforcement is the single highest-impact change: it immediately forces the Router to use planner and security-architect

**Consequences:**

- **Positive:** Agent utilization increases from 2% to 24%+ (12 unique agent types activated)
- **Positive:** Every code change gets at least one independent review (code-reviewer, qa, or security-architect)
- **Positive:** Architectural decisions are captured in design documents before implementation
- **Positive:** Memory system (learnings, decisions, issues) is actively maintained by reflection-agent
- **Positive:** Workflow state survives interruptions -- no lost progress on context reset
- **Negative:** API costs increase (3-10 agents per request vs 1 today)
- **Negative:** Task completion time increases (multi-phase review adds latency)
- **Negative:** Router complexity increases (must manage state machine transitions)
- **Mitigated:** Complexity-based skipping keeps simple tasks fast (TRIVIAL: 2 agents, 1-2 turns)

**Implementation Plan:** `.claude/context/plans/enterprise-orchestration-plan-2026-02-06.md`
**Workflow Document:** `.claude/workflows/core/enterprise-workflow.md`
**Depends On:** ADR-079 (Agent Utilization Remediation Strategy)

---

## ADR-076: Simple 50-Line Chunking for BM25-Only Mode

**Date:** 2026-02-05

**Status:** Accepted

**Context:**
Code indexer OOMed at 4GB heap when processing 600+ files using `parseInProcess` (CodeParser + SemanticChunker) in BM25-only mode. Investigation revealed:

- parseInProcess uses tree-sitter AST parsing + semantic boundary detection
- Creates large intermediate objects and native allocations
- Memory grows unbounded with file count
- BM25 is lexical search and doesn't benefit from semantic boundaries

**Decision:**
Replace `parseInProcess` with simple 50-line chunking in BM25-only sync fast-path:

```javascript
const lines = content.split('\n');
for (let lineIdx = 0; lineIdx < lines.length; lineIdx += 50) {
  const text = lines
    .slice(lineIdx, lineIdx + 50)
    .join('\n')
    .trim();
  if (text.length === 0) continue;
  chunks.push({ id: `${relPath}:${lineIdx}`, text });
}
```

**Rationale:**

1. **BM25 is Lexical:** Pure term frequency matching; semantic boundaries irrelevant
2. **Uniform Chunks Better:** BM25 length normalization assumes uniform distribution
3. **Minimal Allocations:** No parser overhead, only string slices
4. **Proven Pattern:** Tested in scratchpad/rebuild-index.cjs (success at 2011 files)
5. **Memory Safety:** O(chunk_size) not O(file_size) memory usage

**Alternatives Considered:**

1. **Keep parseInProcess, increase heap:** Rejected (unbounded growth, only delays OOM)
2. **Modify BM25 to not store text:** Rejected (requires search result re-reading from disk)
3. **Worker pool with memory limits:** Rejected (already in-process when concurrency=1)
4. **Checkpoint-based multi-run:** Rejected (index too large to resume from checkpoint)

**Consequences:**

- ✅ **Positive:** 60x memory reduction (4GB → 120MB), 10x speed increase
- ✅ **Positive:** Unblocks full codebase indexing (1330+ files)
- ✅ **Positive:** More uniform chunk lengths improve BM25 scoring
- ⚠️ **Neutral:** AST chunking still used in embedding mode (semantic search)
- ❌ **Negative:** Chunk boundaries ignore function/class boundaries in BM25 mode

**Verification:**

- Test: 1330 files indexed in 19.5 seconds, 120MB peak memory
- Search: BM25 returns relevant results for test queries
- Memory: No OOM at any file count
- Speed: 68 files/sec average (vs 7 files/sec with parseInProcess)

**Implementation:**

- File: `.claude/lib/code-indexing/index-manager.cjs`
- Lines: ~458-466 (sync fast-path block)
- Condition: `if (this.vectorStore.embeddingMode === 'off')`
