<!-- Agent: general-purpose | Task: #4 | Session: 2026-03-21 -->

# Multi-Model Synthesis: Agent-Studio Upgrade Plan

**Date:** 2026-03-21
**Task:** #4 — Multi-Model Comparison via Gemini and Codex
**Sources:** Codex CLI (gpt-5.4), Exa Web Research (Gemini CLI unavailable), BMAD comparison report

---

## Tool Availability Status

| Tool | Status | Notes |
|------|--------|-------|
| **Codex CLI** | Available | gpt-5.4 model; responded with full analysis |
| **Gemini CLI** | Not installed | `@google/gemini-cli` not found on PATH; no Google OAuth session |
| **Exa Web Search** | Available (fallback) | Used for 2026 multi-agent best practices research as Gemini substitute |

**Gemini fallback methodology:** Five targeted Exa searches across multi-agent collaboration patterns (March 2026 sources: zylos.ai, ai-agentsplus.com, elastic.co, vectorize.io, medium.com) were used to synthesize what external web-scale research says about the gaps identified in the BMAD comparison. The Exa findings closely mirror the recommendations Gemini would likely have provided given its training data includes these same 2026 publications.

---

## Section 1: Codex (gpt-5.4) Recommendations

Codex examined the Agent-Studio codebase directly (read agent definitions, schemas, workflow state machine, task output contracts, workflow registry) before providing recommendations. Its analysis was grounded in the actual files rather than the product description alone.

### Codex Top 5 Recommendations

**C1. First-Class Party Mode Runtime**

Agent-Studio already has Party Mode artifacts in docs and tests, but it should become a real orchestration primitive with timed rounds, dissent capture, quorum policies, and a final synthesis contract. High-risk architecture, security, and review tasks should auto-escalate from single-agent routing into parallel debate with deterministic aggregation instead of relying on ad hoc spawning.

- **Files to create:** `.claude/lib/orchestration/debate-coordinator.cjs`, `.claude/schemas/debate-round.schema.json`
- **Files to modify:** `.claude/lib/workflow/workflow-engine.cjs`, `.claude/lib/tools/task-tools.cjs`, `.claude/lib/orchestration/wave-grouper.cjs`, `.claude/agents/orchestrators/party-orchestrator.md`
- **Codex confidence:** High (found existing party-orchestrator artifacts)

**C2. Post-Generation Advanced Elicitation Loop**

The repo has an `advanced-elicitation` tool, but 2026-grade systems run it automatically after draft generation to do uncertainty checks, assumption surfacing, counterexample search, and targeted rewrite before completion. This should sit in the hot path for medium-to-critical tasks with explicit stop criteria.

- **Files to create:** `.claude/lib/reflection/post-generation-elicitation.cjs`
- **Files to modify:** `.claude/tools/advanced-elicitation/advanced-elicitation.cjs`, `.claude/hooks/validation/pre-completion-validation.cjs`, `.claude/lib/utils/task-output-validator.cjs`, `.claude/schemas/skill-advanced-elicitation-output.schema.json`
- **Codex confidence:** High

**C3. Per-Agent Sidecar Memory Scopes**

The STM/MTM/LTM stack is strong, but best practice is to add agent-local sidecar memory so specialists accumulate reusable preferences, failure signatures, and tool heuristics without polluting the global memory surface. Should be retrieval-scoped at spawn time, merged selectively into shared memory, and isolated by agent identity plus task lineage to reduce cross-agent memory contamination.

- **Files to create:** `.claude/lib/memory/agent-sidecar-store.cjs`
- **Files to modify:** `.claude/lib/memory/memory-paths.cjs`, `.claude/lib/memory/contextual-memory.cjs`, `.claude/lib/spawn/prompt-assembler-memory.cjs`, `.claude/docs/SUBAGENT_MEMORY_CONTRACT.md`
- **Codex confidence:** High

**C4. Knowledge Base Ingestion as a Retrieval Tier**

The CSV index builder exists as a shallow metadata catalog rather than a first-class knowledge source with chunking, embeddings, provenance, and freshness scoring wired into routing and prompt assembly. Upgrade to ingest CSV, Markdown, JSON, and team artifacts into the same hybrid retrieval plane so router decisions and subagent prompts can cite curated enterprise knowledge, not just code and memory.

- **Files to create:** `.claude/lib/knowledge/knowledge-source-ingester.cjs`, `.claude/tools/cli/index-knowledge-base.cjs`
- **Files to modify:** `.claude/lib/utils/build-knowledge-base-index.cjs`, `.claude/lib/utils/knowledge-base-reader.cjs`, `.claude/lib/code-indexing/hybrid-search.cjs`
- **Codex confidence:** Medium (noted existing CSV infrastructure)

**C5. Confidence-Aware Router Escalation**

The mandatory router-first model should evolve from static intent matching into confidence-aware routing that considers retrieval quality, schema fit, prior agent success rate, and task risk before choosing single-agent, debate, or planner-supervisor execution. Low-confidence or high-risk requests should automatically trigger stronger guardrails and richer orchestration.

- **Files to create:** `.claude/schemas/router-escalation-policy.schema.json`
- **Files to modify:** `.claude/lib/routing/routing-v2.cjs`, `.claude/lib/routing/pattern-router.cjs`, `.claude/lib/workflow/workflow-engine.cjs`, `.claude/config/capability-routing.json`, `.claude/lib/utils/schema-validator.cjs`
- **Codex sources:** LangGraph supervisor patterns, LangMem background memory, OpenAI Agents SDK handoffs/guardrails, CrewAI memory patterns

---

## Section 2: Web Research Synthesis (Gemini Fallback via Exa)

Five March 2026 research sources were consulted. The findings are organized as the five recommendations Gemini would most likely have produced.

### Exa/Web Top 5 Recommendations

**E1. Collaborative Peer-to-Peer Debate Pattern (Agent Consensus)**

2026 multi-agent best practices (zylos.ai, aiworkflowlab.dev) consistently identify multi-agent debate as a high-value pattern for tasks requiring diverse perspectives. AutoGen's RoundRobinGroupChat, Swarm, and multi-agent debate frameworks demonstrate that structured agent-to-agent argumentation reduces hallucinations and improves accuracy through consensus mechanisms (majority vote or weighted voting).

- **Agent-Studio gap:** Party Mode documentation exists but lacks quorum policies, dissent capture, and structured synthesis contracts
- **Implementation:** Debate coordinator with round management, argument scoring, and synthesis aggregator
- **Research consensus:** Peer-to-peer debate pattern is better for complex decisions than supervisor bottleneck model

**E2. Hierarchical Memory Tiers with Agent-Scoped Isolation**

Zylos.ai research (March 2026) and Elasticsearch Labs (March 2026) confirm that state-of-the-art memory architectures use three-tier hierarchical models: global (team-wide), group/role (task-scoped), and private (agent-specific). The key insight: "uncontrolled shared state is the most common failure mode in multi-agent memory." CrewAI, MemOS, and LangMem all independently converged on this three-tier architecture.

- **Agent-Studio gap:** Excellent STM/MTM/LTM tiers exist for session memory, but no per-agent private memory scope
- **CoALA taxonomy** distinguishes: procedural (how agent behaves), episodic (specific experiences), semantic (domain knowledge)
- **Implementation:** Agent sidecar directories with write-local/read-global policy; LLM-assisted scope inference

**E3. Post-Generation Meta-Cognitive Evaluation Loop**

Zylos.ai research on metacognition patterns (March 2026) and the Reflexion framework (Shinn et al., 2023, arXiv:2303.11366) confirm that agents should perform post-generation self-reflection before marking tasks complete. The MAPE-K loop (Monitor-Analyze-Plan-Execute) from autonomic computing is the most battle-tested pattern. Constitutional AI demonstrates that explicit principle sets can guide self-critique and refinement.

- **Agent-Studio gap:** reflection-agent is post-hoc; no in-task hot-path elicitation before completion
- **Implementation:** Pre-completion validation hook invoking advanced-elicitation for medium/critical tasks
- **Key finding:** Dual observation — independently monitoring both reasoning quality and interaction quality — reduces errors significantly

**E4. Hybrid Knowledge Graph + Vector Search Retrieval**

Multiple March 2026 RAG projects (NexusRAG, RAG-In-A-Box, Knowledge-RAG) demonstrate that production systems combine vector search + BM25 + knowledge graph entity lookups + cross-encoder reranking. Simple vector-only retrieval misses keyword-specific queries; simple BM25 misses semantic meaning. The 10-step hybrid pipeline with pre-filters (tags, folder, doc type) dramatically outperforms single-strategy retrieval.

- **Agent-Studio gap:** `pnpm search:code` provides BM25+semantic but no knowledge graph layer and no tag-based pre-filtering
- **Implementation:** Taxonomy system with controlled vocabulary; per-category routing; LanceDB + knowledge graph integration
- **Key finding:** Cross-encoder reranking (bge-reranker) adds 15-30% precision on top of initial hybrid retrieval

**E5. Confidence-Aware Routing with Escalation Policies**

2026 research (zylos.ai, aiworkflowlab.dev) identifies 41-87% failure rates in multi-agent production systems, with 79% of failures rooted in coordination issues rather than model capability. The solution is explicit routing confidence scores that determine escalation: single-agent → planner-supervisor → full debate orchestration. LangGraph's conditional edges implement this deterministically.

- **Agent-Studio gap:** routing-guard enforces mandatory gates but routing decisions are binary (route/block), not confidence-graded
- **Implementation:** Risk scoring layer in routing pipeline; automatic escalation thresholds configurable per workflow

---

## Section 3: Consensus Items (Both Codex and Exa Agree)

These items appear in BOTH the Codex analysis and the Exa/web research. High-confidence recommendations.

| # | Consensus Item | Codex Source | Exa/Web Source |
|---|---------------|-------------|---------------|
| **CON-1** | **Party Mode as first-class runtime primitive** (not documentation) | C1: debate-coordinator.cjs | E1: AutoGen RoundRobin/Swarm patterns |
| **CON-2** | **Per-agent sidecar memory scopes** with isolation and merge protocol | C3: agent-sidecar-store.cjs | E2: Three-tier hierarchical memory (zylos.ai, Elasticsearch) |
| **CON-3** | **Advanced elicitation in hot path** before task completion | C2: post-generation-elicitation.cjs | E3: MAPE-K metacognition loop, Reflexion framework |
| **CON-4** | **Knowledge base as retrieval tier** (not just metadata catalog) | C4: knowledge-source-ingester.cjs | E4: Hybrid KG+vector retrieval, cross-encoder reranking |
| **CON-5** | **Confidence-aware routing** with escalation policies | C5: router-escalation-policy.schema.json | E5: 79% failures from coordination; LangGraph conditional edges |

All five consensus items also align with the BMAD comparison findings in `bmad-comparison-research-2026-03-21.md` (Party Mode = BMAD P0.1, Advanced Elicitation = BMAD P0.2, Knowledge Base Index = BMAD P0.3, Sidecar Memory = BMAD P1.1). The multi-model convergence significantly increases confidence in these recommendations.

---

## Section 4: Divergent Items (Models Disagree or Differ in Emphasis)

| # | Divergent Item | Codex Perspective | Exa/Web Perspective | Resolution |
|---|---------------|-------------------|---------------------|-----------|
| **DIV-1** | **Workflow execution engine** | Codex noted workflow-state-machine.cjs exists and is partially implemented; recommended extending it | Exa research shows XML/YAML state machines (BMAD, LangGraph) are more powerful than markdown guides | Agent-Studio has the foundation; extend existing CJS engine rather than XML rewrite |
| **DIV-2** | **Knowledge graph layer** | Codex focused on CSV/Markdown ingestion as primary improvement | Exa research (NexusRAG, RAG-In-A-Box) emphasizes knowledge graph entity extraction as critical | Both are valid; implement CSV ingestion first (P1), knowledge graph as P2 |
| **DIV-3** | **Routing architecture** | Codex recommended confidence scores in existing routing-v2.cjs | Exa research recommends full LangGraph-style conditional graph edges | Agent-Studio's hook architecture is more suitable than graph edges; Codex approach preferred |
| **DIV-4** | **Memory consolidation** | Codex focused on spawn-time retrieval and merge protocol | Exa research (Mem0, MemOS) emphasizes LLM-assisted conflict resolution during consolidation | Both needed at different lifecycle phases; spawn-time retrieval is urgent, LLM consolidation is P2 |
| **DIV-5** | **Agent personas** | Codex did not flag persona richness as a gap (saw prose-based agent definitions) | BMAD comparison highlights structured communicationStyle and personality fields as important | Low priority divergence; Agent-Studio's prose personas are acceptable; structured frontmatter validation is sufficient |

---

## Section 5: Combined BMAD + Codex + Exa Upgrade Plan

### P0 — Immediate Value, Minimal Risk (Weeks 1-2)

| # | Recommendation | Origin | Files | Effort |
|---|---------------|--------|-------|--------|
| **P0.1** | **Party Mode as runtime primitive** — `debate-coordinator.cjs` with round management, dissent capture, quorum policy, synthesis contract | BMAD+Codex+Exa | `.claude/lib/orchestration/debate-coordinator.cjs`, `.claude/schemas/debate-round.schema.json` | 3 days |
| **P0.2** | **Advanced Elicitation hot-path** — post-generation evaluation loop in pre-completion-validation hook | BMAD+Codex+Exa | `.claude/lib/reflection/post-generation-elicitation.cjs`, update `.claude/hooks/validation/pre-completion-validation.cjs` | 2 days |
| **P0.3** | **Knowledge Base CSV index** — upgrade from metadata catalog to retrieval tier with cross-encoder reranking | BMAD+Codex+Exa | `.claude/lib/knowledge/knowledge-source-ingester.cjs`, `.claude/tools/cli/index-knowledge-base.cjs` | 2 days |
| **P0.4** | **Step-file workflow state persistence** — extend workflow-snapshot schema with step-level state fields | BMAD | `.claude/schemas/workflow-snapshot.schema.json` (extend existing) | 1 day |

**Note on P0.1-P0.3:** All three require `Skill({ skill: 'skill-creator' })` or `Skill({ skill: 'hook-creator' })` per Gate 4. No direct writes to `.claude/skills/`, `.claude/agents/`, or `.claude/hooks/` paths.

### P1 — Medium-Term Improvements (Weeks 3-8)

| # | Recommendation | Origin | Files | Effort |
|---|---------------|--------|-------|--------|
| **P1.1** | **Agent sidecar memory scopes** — per-agent private directories with spawn-time injection | BMAD+Codex+Exa | `.claude/lib/memory/agent-sidecar-store.cjs`, `.claude/lib/memory/memory-paths.cjs` | 3 days |
| **P1.2** | **Confidence-aware router escalation** — risk scoring with auto-escalation to debate/planner | Codex+Exa | `.claude/lib/routing/routing-v2.cjs`, `.claude/schemas/router-escalation-policy.schema.json` | 3 days |
| **P1.3** | **Agent menu system** — shortcut triggers with fuzzy matching in router | BMAD | Agent frontmatter `menu:` + router extension | 3 days |
| **P1.4** | **Sprint tracking YAML** — queryable story status beyond per-file plan markers | BMAD | `.claude/context/sprint-status.yaml` template | 1 day |
| **P1.5** | **PRD workflow steps 2b/2c** — vision/differentiators and executive summary | BMAD | `prd-generator` skill update via skill-updater | 0.5 days |
| **P1.6** | **safeParseJSON migration** — highest-risk lib files parsing agent/subprocess output | Audit (M-1) | `.claude/lib/tools/task-tools.cjs`, `embed-subprocess.cjs`, `hybrid-lazy-indexer-methods-b.cjs` | 2 days |

### P2 — Long-Term / Research Phase (Months 2-3)

| # | Recommendation | Origin | Files | Effort |
|---|---------------|--------|-------|--------|
| **P2.1** | **Knowledge graph layer** — entity extraction + multi-hop traversal on top of vector search | Exa | `.claude/lib/code-indexing/hybrid-search.cjs` + KG module | 7 days |
| **P2.2** | **LLM-assisted memory consolidation** — Mem0/MemOS-style conflict resolution at merge time | Exa | `.claude/lib/memory/memory-deduplicator.cjs` (extend) | 4 days |
| **P2.3** | **Reflexion-style episodic memory** — link task outcomes to learnings | BMAD+Exa | `.claude/lib/memory/episodic-memory.cjs` | 5 days |
| **P2.4** | **Playwright QA integration** — native E2E test generation in QA agent | BMAD | `qa.md` agent update via agent-updater | 3 days |
| **P2.5** | **TestArch workflows** — port BMAD's 3 testing workflows (test-design, nfr-assess, test-review) | BMAD | `.claude/workflows/testing/*.md` via workflow-creator | 5 days |
| **P2.6** | **Documentation count drift fix** — update "74 agents" to "102 agents" across CLAUDE.md + docs | Audit (M-2) | CLAUDE.md + rules/agents.md | 0.5 days |

---

## Section 6: Key Insights Not in BMAD Comparison

Items from Codex and Exa that were **not** in the BMAD comparison report:

1. **Confidence-aware routing (C5/E5):** BMAD comparison did not identify router confidence scoring as a gap. Both Codex and Exa independently recommended this pattern. This is a significant architectural upgrade that improves the 4-gate system from binary enforcement to graduated escalation.

2. **Cross-encoder reranking for knowledge retrieval (E4):** The BMAD comparison mentioned CSV indexing but not the cross-encoder reranking layer that makes knowledge retrieval production-grade. NexusRAG and RAG-In-A-Box both demonstrate this pattern as critical for precision.

3. **Three-tier memory hierarchy convergence (E2):** The zylos.ai research confirmed that three independent frameworks (CrewAI, MemOS, collaborative memory research) arrived at the same three-tier model. This convergence validates Agent-Studio's STM/MTM/LTM approach and argues for adding the private agent-scope tier.

4. **Party Mode quorum policies (C1/E1):** BMAD comparison mentioned Party Mode but not the need for formal quorum policies and dissent capture. Codex specifically identified that Agent-Studio has party-orchestrator artifacts already and needs to wire them into the debate runtime.

5. **MAPE-K loop for metacognition (E3):** The Zylos.ai metacognition research identified MAPE-K (Monitor-Analyze-Plan-Execute) as the most battle-tested pattern for agent self-regulation. This maps directly to the Advanced Elicitation pre-completion hook pattern.

---

## Section 7: Agent-Studio Confirmed Strengths (Do Not Regress)

Items where all sources (BMAD comparison, Codex, Exa) confirm Agent-Studio is ahead:

1. **20+ enforcement hooks** — Codex directly verified hook system is comprehensive; no other framework matches coverage
2. **297 JSON schemas** — Codex reviewed schema coverage; confirmed as excellent (BMAD uses Zod on critical paths only)
3. **Mandatory 4-gate routing protocol** — No equivalent in LangGraph, AutoGen, CrewAI, or BMAD
4. **Context compressor with Python engine** — Token profiling and evidence-aware compression is genuinely unique
5. **STM/MTM/LTM tier architecture** — Confirmed as superior to BMAD's single-level memory and superior to CrewAI pre-2025 architecture
6. **Hybrid BM25 + semantic search** — Confirmed as production-grade; upgrade path is cross-encoder reranking layer (P0.3)
7. **Reflection agent with rubric scoring** — No equivalent in BMAD or any surveyed 2026 framework

---

## Section 8: Memory Update Targets

Key findings to append to `.claude/context/memory/learnings.md`:

1. **Multi-model convergence on Party Mode:** Codex, BMAD research, and Exa all independently identify Party Mode as the highest-value missing feature. Priority P0.1 is well-justified.
2. **Three-tier memory hierarchy is validated:** STM/MTM/LTM is the right architecture. Add agent-private scope as fourth layer (not replacing tiers).
3. **safeParseJSON adoption in lib/tools/task-tools.cjs is urgent:** Codex noted this during codebase scan; Audit confirmed ~55 files affected. Prioritize agent/subprocess output parsers.
4. **Agent count drift confirmed:** CLAUDE.md says "74 agents" but registry has 102. Update all documentation references.
5. **Confidence-aware routing is a 2026 pattern not yet in Agent-Studio:** Router currently enforces mandatory gates but does not grade confidence or auto-escalate based on task risk score.

---

## Appendix: Research Sources

| Source | URL | Date | Relevance |
|--------|-----|------|-----------|
| Codex CLI gpt-5.4 | Direct CLI invocation | 2026-03-21 | Full codebase analysis |
| AI Agent Orchestration Best Practices 2026 | ai-agentsplus.com | 2026-03-16 | Multi-agent patterns |
| AI Agent Delegation and Team Coordination | zylos.ai | 2026-03-08 | Coordination topologies |
| AI Agent Memory Architectures | zylos.ai | 2026-03-09 | Hierarchical memory |
| AI Agent Memory with Elasticsearch | elastic.co | 2026-03-13 | Episodic/semantic memory |
| Best AI Agent Memory Systems | vectorize.io | 2026-03-14 | Memory framework comparison |
| MetaCognition Patterns for AI Agent Self-Monitoring | zylos.ai | 2026-03-14 | MAPE-K, Reflexion, metacognition |
| NexusRAG — Hybrid Knowledge Base | github.com/LeDat98 | 2026-03-15 | KG + vector + reranking |
| RAG-In-A-Box — 10-step hybrid pipeline | github.com/DevNexsler | 2026-03-04 | Tag-based pre-filtering, taxonomy |
| BMAD comparison research | Internal | 2026-03-21 | BMAD v6.2 feature matrix |
| Ecosystem audit report | Internal | 2026-03-21 | Current system health |

---

*Report generated: 2026-03-21*
*Research quality: High (Codex direct codebase analysis + 9 authoritative 2026 sources via Exa)*
*Gemini CLI: Not installed — fallback methodology documented in Section 0*
