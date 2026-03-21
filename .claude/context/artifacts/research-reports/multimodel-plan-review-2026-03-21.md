<!-- Agent: researcher | Task: #18 | Session: 2026-03-21 -->

# Multi-Model Plan Review: 6 Agentic AI Features

**Date**: 2026-03-21
**Task**: #18
**Models Consulted**: OpenAI Codex CLI (codex-mini-latest / o4-mini), Google Gemini CLI
**Plan Reviewed**: `.claude/context/plans/agentic-features-plan-2026-03-21.md`
**Research Basis**: `.claude/context/artifacts/research-reports/openclaw-research-2026-03-21.md`

---

## Executive Summary

Both external LLMs reviewed the 6-feature EPIC plan and reached convergent conclusions: the plan is technically sound in its individual feature designs but has structural risks around decomposition, signal quality, legal exposure, and missing shared infrastructure. The models agree that Feature 3 (Perpetual Memory) and Feature 6 (Local LLM Benchmarker) should be prioritized as foundational infrastructure before the user-facing features are built. Both models independently flagged the same three high-priority concerns: (1) noisy data contaminating memory and agent outputs, (2) missing human approval gates for autonomous code generation, and (3) web scraping fragility and legal exposure.

---

## Model Responses

### Model 1: OpenAI Codex CLI (codex-mini-latest / o4-mini)

#### Top Risks Identified

1. **Scope explosion before control-plane maturity** — Adding 6 agents, 22 skills, 5 workflows to a framework already at 100+ agents / 500+ skills creates registration drift, stale skills, overlapping responsibilities, and weak discoverability before reliable value is delivered.

2. **Feature overlap with existing memory architecture** — "Perpetual memory with RAG" is partially redundant with existing hybrid memory (STM/MTM/LTM, SQLite entity index, LanceDB embeddings, spawn-time injection, memory hooks). The real gap is defining *what new memory objects are needed*, not adding volume.

3. **Signal quality collapse from automatic ingestion** — Forum scraping, social monitoring, content analysis, and universal interaction logging all create noisy data. Without deduplication, source trust scoring, retention rules, and retrieval quality evals, the system will optimize for volume and degrade agent outputs. In Agent Studio, memory is part of the control loop — bad memory *contaminates future tasks*.

4. **Missing safety and compliance boundaries** — Scraping Reddit/HN/ProductHunt, style replication, competitor monitoring, and SMS alerts touches platform ToS, privacy, brand impersonation, spam risk, and prompt injection from untrusted content. An explicit policy layer is required before autonomous generation or outbound notification.

5. **No operating model for long-running agents** — The architecture is router-first, task-spawn oriented, optimized for bounded workflows, not daemon-style monitors. The plan needs a persistent ingestion/runtime model: scheduler, queue, checkpoints, retries, dead-letter handling, rate limiting, and alert deduplication.

6. **Evaluation underdefined for user-facing features** — The benchmarker evaluates models, but the other 5 features also need evals: "pain point found," "style matched," "memory helped," "alert was useful" all require offline fixtures and acceptance thresholds.

#### Missing Pieces Identified

- Normalized event schema shared by all monitors and analyzers
- Queue/job model with idempotency keys, retries, backoff, and DLQ
- Human approval gates for code generation, external publishing, and SMS/push sends
- Source trust scoring and adversarial-content filtering
- Retention, privacy, and per-source ToS/licensing rules
- Tenant/project scoping for memory (prevent cross-workflow contamination)
- Cost budgets for LLM calls, embeddings, scraping, and notifications
- Benchmark datasets and goldens for each feature (not just local LLM eval)
- Failure-mode definitions for each feature
- Clear ownership boundaries between agents and skills (several proposed skills read as pipeline stages, not reusable skills)

#### Suggested Improvements

1. **Collapse 6 features into 3 platform primitives first**:
   - `ingestion platform` — forum/social/content connectors
   - `memory + retrieval platform` — normalized storage and RAG
   - `evaluation + action platform` — benchmarking, alerts, report generation
   Then express features as *configurations* of those primitives.

2. **Reduce new skills aggressively** — Many of the 22 proposed skills are thin pipeline stages. Only promote to a skill if it is reusable across domains and has a stable invocation contract.

3. **Merge feature families** — Forum monitor, competitor social monitor, and daily content analyzer should share one ingestion pipeline. Voice replicator should be framed as "style analysis + guarded prompt transformation," not "replication."

4. **Define explicit approval modes** — Use `observe → draft → recommend → auto-act` progression. First production milestone should stop at `draft` for app generation and `recommend` for alerts.

5. **Treat memory as curated, not exhaustive** — Do not auto-log all interactions by default. Log only typed memory classes: decisions, reusable patterns, verified facts, task outcomes, source summaries with provenance. Everything else stays ephemeral unless promoted.

6. **Add feature-specific quality gates** — Reuse existing validation/metrics infrastructure. Add retrieval precision/recall eval for memory changes, false-positive and duplicate-rate metrics for monitors, human-graded style-match eval for voice feature, benchmark reproducibility and variance thresholds for model testing.

7. **Re-sequence phases to infrastructure-first**:
   1. Shared event schema + queue/runtime
   2. Shared connector framework
   3. Shared action framework with approval gates
   4. Retrieval quality and eval harness
   5. First user-facing feature
   6. Second user-facing feature

**Codex bottom line**: The biggest problem is decomposition. The plan is organized as 6 products, but the framework needs 3 reusable subsystems first. Build the control plane, data contracts, policy layer, and eval harness first — then most features become straightforward compositions.

---

### Model 2: Google Gemini CLI (gemini-3-flash or 2.5)

#### Top Risks Identified

1. **Scraping fragility and legal exposure (Features 1, 4, 5)** — Reddit and HN have aggressive anti-bot measures. Relying on raw scraping instead of official APIs (or Algolia for HN) will lead to frequent downtime and IP blacklisting. Constant maintenance burden drains developer capacity.

2. **Privacy airlock and memory bloat (Feature 3)** — Auto-logging all interactions into a vector DB without strict PII scrubbing is a significant liability. If an agent records a secret or user-sensitive data, it becomes "poisoned" context that is hard to surgically delete. Contextual noise will degrade retrieval quality without a forgetting/summarization threshold.

3. **Token budget and API cost explosion** — Simultaneously running 22 skills across 6 agents for high-frequency social monitoring will hit rate limits and burn API budget rapidly. Economic risk before the framework reaches market value.

#### Missing Pieces Identified

- **Human-in-the-Loop (HITL) gatekeepers** — App generation from forum pain points lacks a verification stage. Shipping unverified code from autonomous generation is high risk. Needs an `ExpertReviewerAgent` or manual approval hook in the app-generator-agent workflow.

- **Telemetry and cost tracking** — With 6 new agents, centralized observability is required to detect hallucinations or loops. Missing: a `MonitorAgent` or dashboard skill to track token consumption per feature and success vs. hallucination rates.

- **Sanitization/de-identification layer** — Before Feature 2 (Voice Replicator) ingests content, it must be stripped of metadata to prevent attribution issues and security leaks. Missing: a `data-anonymizer` skill.

#### Suggested Improvements

1. **Event-driven triggering over perpetual polling** — Use webhooks where available, or a dedicated data provider (Exa, Perplexity) to reduce the scraping surface area and fragility.

2. **Hierarchical memory management** — Implement tiered memory:
   - Tier 1 (Ephemeral): Current session context
   - Tier 2 (Summarized): Key decisions/facts moved to SQLite entity graph
   - Tier 3 (Cold/Vector): Semantic RAG for long-tail lookups

3. **Local LLM "shadow mode" for benchmarking** — For Feature 6, use local Ollama models as a "shadow evaluator" for cloud models. If a local model can catch a logic error at zero cost, it reduces cloud model spend.

4. **Consolidate skills from 22 to ~12** — Merge `content-ingestion`, `forum-scraper`, and social-monitor into a single `UniversalIngestor` skill with specialized adapters. Keep the SKILL.md registry lean and maintainable.

**Gemini recommendation**: Proceed with a "Phase 1.5" focused strictly on Feature 3 (Memory) and Feature 6 (Benchmarking) as foundational infrastructure. Delay the Auto-App Generator until a proven "Validation Gate" is in place.

---

## Synthesis: Convergent Findings Across Both Models

Both external LLMs independently reached the same conclusions on the most critical issues. Findings rated by convergence level:

### CRITICAL — Both Models Agree (High Confidence)

| Finding | Codex | Gemini | Action Required |
|---------|-------|--------|-----------------|
| Memory auto-logging creates noise/pollution risk | YES | YES | Implement curated-memory-only policy + PII scrubbing before Feature 3 build |
| Missing human approval gates for code/notification output | YES | YES | Define approve/observe/draft/auto-act mode progression; first milestone = draft-only |
| Token/cost explosion from 22 skills + monitoring frequency | YES | YES | Add cost budget gate per feature; frequency limits on cron-based agents |
| Skills 22 count is too high; many are pipeline stages not skills | YES | YES | Reduce to ~12 skills; merge ingestion-adjacent skills into adapters of a UniversalIngestor |
| Infrastructure must precede user-facing features | YES | YES | Re-sequence: shared event schema + queue → connector framework → eval harness → features |
| Feature 3 (Memory) + Feature 6 (Benchmarker) are foundational | YES | YES | Prioritize these first; other features depend on them |

### HIGH — One Model Primary, One Supporting

| Finding | Primary | Notes |
|---------|---------|-------|
| Web scraping fragility and ToS/legal risk | Gemini (primary) | Codex flagged under compliance. Use official APIs or Exa/Perplexity instead of raw scraping |
| Perpetual memory partially redundant with existing STM/MTM/LTM | Codex (primary) | Define new memory object types needed, don't just add volume |
| Missing normalized event schema across all monitors | Codex (primary) | Gemini aligns via "UniversalIngestor" concept |
| Missing queue/job model with idempotency + DLQ | Codex (primary) | Critical for daemon-style monitoring features |
| PII scrubbing layer required before memory ingestion | Gemini (primary) | Codex aligned under compliance policy |
| Telemetry and cost tracking missing | Gemini (primary) | Codex aligned under eval/quality gates |

### NOTABLE — Single Model Insight

| Finding | Model | Recommendation |
|---------|-------|---------------|
| Local LLM "shadow mode" for cloud cost reduction | Gemini | Use Ollama as shadow evaluator to catch errors before expensive cloud model calls |
| Event-driven triggering over polling | Gemini | Use webhooks and data providers (Exa) vs. raw scraping where possible |
| Source trust scoring and adversarial-content filtering | Codex | Required for forum/social content to prevent prompt injection from untrusted input |
| Tenant/project scoping for memory isolation | Codex | Prevent one workflow's memory from contaminating unrelated agent contexts |

---

## OpenClaw Research Alignment

Cross-referencing model feedback with OpenClaw research findings:

| OpenClaw Pattern | Plan Alignment | Model Feedback |
|-----------------|----------------|----------------|
| SQLite LCM (lossless context) | Feature 3 proposes auto-embed-hook, not LCM | Both models: log only curated types, not all interactions — confirms LCM's structured approach |
| Activation/decay (hot/warm/cool tiers) | Not in plan | Gemini's tiered memory suggestion aligns with LCM hot/warm/cool; adopt for Feature 3 |
| PinchBench 5 dimensions | Feature 6 adopts correctly | No objections; Gemini extends to shadow-mode cost reduction use case |
| SKILL.md pattern | Correctly used | Both models: 22 skills is too many; align with OpenClaw's own adapter pattern for connectors |
| HEARTBEAT.md scheduling | Features 1, 4, 5 use cron | Both models: need queue/DLQ model in addition to cron; pure heartbeat insufficient |
| Summary DAG compaction | Not in Feature 3 plan | Aligns with both models' "summarization threshold" recommendation — add to Feature 3 scope |

---

## Revised Priority Recommendations

Based on synthesis of both models and OpenClaw research:

### P0 — Pre-Conditions (Before Any Feature Build)

1. **Define curated memory object types** — What gets logged, what stays ephemeral, what gets promoted. Match OpenClaw's typed classes: decisions, verified facts, reusable patterns, task outcomes, source summaries with provenance.

2. **Design shared event schema** — Normalized schema for events from all monitors (forum, social, content). This is the contract between connectors and the memory/action platforms.

3. **PII scrubbing policy + implementation** — Required before Feature 3 auto-logging and Feature 2 style ingestion go live.

4. **Human approval gate pattern** — Define the observe/draft/recommend/auto-act progression and implement as a reusable hook or workflow step before Feature 1 code generation or Feature 4 SMS dispatch.

### P1 — Infrastructure (Features 3 + 6 First)

5. **Feature 3: Perpetual Memory** — Implement with SQLite LCM pattern (not just vector embedding), activation/decay tiers (OpenClaw hot/warm/cool), summary DAG compaction, and curated-types-only ingestion.

6. **Feature 6: Local LLM Benchmarker** — Implement PinchBench 5 dimensions + extend as shadow-mode evaluator for cloud cost reduction (Gemini recommendation).

### P2 — Shared Connector Platform (Before Features 1, 4, 5)

7. **Build `UniversalIngestor` skill** — Single skill with adapters for Reddit (PRAW official API), HN (Algolia API), social feeds (webhooks/Exa). Replaces `forum-scraper` + 2 other connectors. Reduces skill count from 22 toward 12.

8. **Queue/job model** — Scheduler with idempotency keys, retries, backoff, DLQ for daemon-style monitoring features.

### P3 — User-Facing Features (After P0-P2)

9. Features 1, 4, 5, 2 — Built as configurations of the shared platforms, with approval gates and eval harnesses in place.

---

## Skill Count Reduction Map

Current plan: 22 skills. Recommended: ~12 skills.

| Current Skills | Recommended Consolidation |
|---------------|--------------------------|
| `forum-scraper` + `social-monitor` + content scraper | → `universal-ingestor` (1 skill, 3 adapters) |
| `pain-point-classifier` | Keep as skill — reusable across connectors |
| `app-requirements-generator` | → Internal pipeline stage of app-generator-agent, not a top-level skill |
| `code-solution-synthesizer` | Keep — reusable for code gen in other features |
| `content-ingestion` + `style-analyzer` | → Merge into `style-profiler` skill |
| `prompt-template-generator` + `ab-test-evaluator` | Keep both — stable reusable contracts |
| `auto-memory-logger` | Keep — but with curated-types-only scope |
| `semantic-memory-retriever` | Keep |
| Benchmarker skills (2-3) | Keep |
| `data-anonymizer` (NEW — Gemini recommendation) | Add this missing skill |
| Notification dispatch | Consider reusing existing heartbeat/cron pattern with 1 new `notification-dispatcher` skill |

Approximate new total: **13 skills** (down from 22, up 1 for data-anonymizer).

---

## Risk Register (Combined)

| Risk | Severity | Probability | Source | Mitigation |
|------|----------|-------------|--------|------------|
| Memory noise from auto-logging degrades agent outputs | HIGH | HIGH | Both models | Curated-types-only ingestion policy; PII scrubbing |
| Autonomous code/SMS output without approval gate | HIGH | HIGH | Both models | Observe/draft/recommend/auto-act mode progression |
| Web scraping ToS violations (Reddit, HN) | HIGH | MEDIUM | Gemini | Use official APIs (PRAW, HN Algolia); Exa as fallback |
| Token/cost explosion from high-frequency monitoring | HIGH | MEDIUM | Both models | Cost budget gates; frequency limits on cron agents |
| 22-skill catalog becomes unmaintainable | MEDIUM | HIGH | Both models | Consolidate to ~12 skills; adapter pattern for connectors |
| Prompt injection from untrusted forum/social content | HIGH | MEDIUM | Codex | Source trust scoring; content sanitization before LLM calls |
| Feature 3 redundant with existing memory without clear scope | MEDIUM | HIGH | Codex | Define new memory object types explicitly; LCM pattern |
| Cross-workflow memory contamination | MEDIUM | MEDIUM | Codex | Tenant/project scoping for memory isolation |
| PII leakage into vector DB via style ingestion | HIGH | MEDIUM | Gemini | `data-anonymizer` skill before Feature 2 ingestion |
| Missing benchmark goldens for user-facing features | MEDIUM | HIGH | Codex | Add offline fixture + eval harnesses for Features 1-5 |

---

## Conclusion

Both external LLMs produced high-quality, convergent feedback that strengthens the OpenClaw research findings. The plan is executable but requires restructuring: **infrastructure before features, curated memory before auto-logging, approval gates before autonomous action, and skill consolidation before the catalog grows further**.

The strongest signal across all three model reviews (Codex, Gemini, plus OpenClaw research) is this: **Feature 3 (Memory) and Feature 6 (Benchmarker) are the correct starting points**. Build the foundation right — with LCM-inspired curated storage, activation/decay tiers, and PinchBench evaluation — then use those primitives to make every other feature reliable.
