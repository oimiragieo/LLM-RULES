<!-- Agent: planner | Task: #9 | Session: 2026-03-21 -->

# Plan: 6 Agentic AI Features — EPIC Implementation

## Overview

EPIC-tier implementation plan for 6 new agentic capabilities in the agent-studio framework. Each feature requires new agents, skills, workflows, and/or integrations with external services. All features are greenfield additions that extend the existing multi-agent architecture.

**Complexity**: EPIC
**Context**: GREENFIELD (new agents/skills extending existing framework)
**Total Estimated Waves**: 6
**Total Estimated Tasks**: ~42 microtasks across 6 features

---

## Project Context Classification

**HYBRID** — new modules and agents added to an existing brownfield framework.

Conventions to preserve:
- All agents in `.claude/agents/` must be created via `agent-creator` skill
- All skills in `.claude/skills/` must be created via `skill-creator` skill
- All workflows in `.claude/workflows/` must be created via `workflow-creator` skill
- Token reporting at every phase end (P0 requirement)
- TaskUpdate(in_progress) before work, TaskUpdate(completed) after

---

## Phase 0: Research & Planning (FOUNDATION)

**Purpose**: Validate technical feasibility, identify external APIs, assess security implications, document architectural decisions
**Duration**: 6-8 hours (parallelizable across features)
**Parallel OK**: Partially — research per feature can run in parallel

### Research Requirements

- [ ] Minimum 3 research queries per feature area
- [ ] External API documentation reviewed (Reddit API, HN API, ProductHunt API, Twitter/X API, HuggingFace API, Twilio, Pushover)
- [ ] Security implications assessed (API credentials, rate limiting, data storage)
- [ ] LanceDB/vector store upgrade path documented
- [ ] ADRs created for major architectural decisions

**Research Output**: `.claude/context/artifacts/research-reports/agentic-features-research-2026-03-21.md`

### Constitution Checkpoint (ALL 4 GATES)

1. **Research Completeness**
   - [ ] Each feature has at least 1 external source citation
   - [ ] API rate limits documented for all 3rd party integrations
   - [ ] ADRs written for: vector DB strategy, social media API choices, model benchmarking approach

2. **Technical Feasibility**
   - [ ] Reddit PRAW / HN Algolia API accessible without auth restrictions
   - [ ] LanceDB upgrade path non-breaking to existing search subsystem
   - [ ] HuggingFace Hub API confirmed available for model listing/downloads
   - [ ] Twilio/Pushover SMS/push dispatch confirmed for notification feature

3. **Security Review**
   - [ ] API credentials handling documented (env vars, no hardcoding)
   - [ ] Rate-limit violation protection in cron-based agents
   - [ ] Data retention policy for scraped content
   - [ ] No PII stored in vector DB without explicit tagging

4. **Specification Quality**
   - [ ] Each feature has measurable acceptance criteria
   - [ ] Cron schedules defined for time-based agents
   - [ ] Output artifact paths defined for each agent

### Phase 0 Tasks

- [ ] **0.1** Research Reddit/HN/ProductHunt APIs for Forum Monitor (~1 hour)
  - **Target Agent**: `researcher`
  - **Verify**: Research report exists at artifacts/research-reports/

- [ ] **0.2** Research social API options for Competitor Monitor (X/Twitter, alternative feeds) (~1 hour)
  - **Target Agent**: `researcher`
  - **Verify**: Twitter API v2 rate limits documented

- [ ] **0.3** Research HuggingFace Hub API and model download strategies (~1 hour)
  - **Target Agent**: `researcher`
  - **Verify**: HF Hub REST API endpoints documented

- [ ] **0.4** Assess LanceDB upgrade path and embedding pipeline for Perpetual Memory (~1 hour)
  - **Target Agent**: `architect`
  - **Verify**: ADR written for memory system upgrade

- [ ] **0.5** Security review of all 6 features (API key management, data scraping legality) (~2 hours)
  - **Target Agent**: `security-architect`
  - **Verify**: Security assessment report exists

**Success Criteria**: Constitution checkpoint passed, all 4 gates green

- [ ] **Phase 0.final** Report token usage (`cat .claude/context/runtime/ccusage-status.txt`)

---

## Phase 1: Architecture Design

**Purpose**: Design agent/skill/workflow architecture for each feature, establish shared infrastructure patterns
**Dependencies**: Phase 0 complete
**Parallel OK**: Yes — features can be designed in parallel after shared infra decided

### Shared Infrastructure Decisions (Blocking)

Before feature-specific design:
- Cron scheduling pattern (all 4 time-based features use same heartbeat/cron mechanism)
- External API client pattern (shared `api-client-base` skill or per-feature)
- Notification dispatch pattern (Feature 4 — reusable by others)
- Report output format standard (Features 2, 5, 6 all produce comparison reports)

### Phase 1 Tasks

- [ ] **1.1** Design shared cron/scheduler architecture for Features 1, 4, 5, 6 (~2 hours)
  - **Target Agent**: `architect`
  - **Recommended Skills**: `sequential-thinking`, `multi-agent-architecture-reference`
  - **Owned Paths**: `.claude/context/artifacts/analysis/`
  - **Deliverable**: Architecture decision doc at `.claude/context/artifacts/analysis/agentic-features-arch-2026-03-21.md`

- [ ] **1.2** Design Feature 1 (Autonomous App Generator) agent topology (~1.5 hours)
  - **Target Agent**: `architect`
  - **Recommended Skills**: `sequential-thinking`
  - **Deliverable**: Agent spec: `forum-monitor-agent`, `app-generator-agent`, skills: `forum-scraper`, `pain-point-classifier`, `code-solution-generator`

- [ ] **1.3** Design Feature 2 (Auto-Tuning Voice Replicator) agent topology (~1 hour)
  - **Target Agent**: `architect`
  - **Deliverable**: Agent spec: `voice-replicator-agent`, skills: `style-analyzer`, `prompt-tuner`, `ab-test-evaluator`

- [ ] **1.4** Design Feature 3 (Perpetual Memory Architecture) system design (~2 hours)
  - **Target Agent**: `database-architect`
  - **Recommended Skills**: `sequential-thinking`
  - **Deliverable**: ADR for auto-logging pipeline, vector store schema, retrieval strategy
  - **Note**: Must preserve backward compatibility with existing LanceDB/BM25 search subsystem

- [ ] **1.5** Design Features 4, 5, 6 agent topologies (~2 hours)
  - **Target Agent**: `architect`
  - **Deliverable**: Agent specs for `competitor-monitor-agent`, `post-analyzer-agent`, `model-benchmarker-agent`

**Success Criteria**: All 6 features have documented agent/skill/workflow topology, shared infra pattern decided

- [ ] **Phase 1.final** Report token usage (`cat .claude/context/runtime/ccusage-status.txt`)

---

## Phase 2: Feature 1 — Autonomous App Generator

**Purpose**: Build agent that monitors forums for pain points and auto-generates code solutions
**Dependencies**: Phase 1 complete
**Parallel OK**: No (sequential: skills → agent → workflow → cron wiring)

### Architecture

- **New Agent**: `forum-monitor-agent` (domain specialist)
- **New Agent**: `app-generator-agent` (domain specialist)
- **New Skills**: `forum-scraper`, `pain-point-classifier`, `app-requirements-generator`, `code-solution-synthesizer`
- **New Workflow**: `forum-to-app-workflow.md`
- **External Dependencies**: `praw` (Reddit), `hn-algolia-api` (HN), `producthunt-api`
- **Cron**: Daily scan, weekly synthesis

### Microtask DAG

| task_id | target_agent | owned_paths | depends_on | parallel_group | wave |
|---------|-------------|-------------|-----------|---------------|------|
| F1-M1 | researcher | `.claude/context/artifacts/research-reports/` | 0.1 | G1 | 2 |
| F1-M2 | skill-creator (via `skill-creator` skill) | `.claude/skills/forum-scraper/` | F1-M1 | G2 | 3 |
| F1-M3 | skill-creator | `.claude/skills/pain-point-classifier/` | F1-M1 | G2 | 3 |
| F1-M4 | skill-creator | `.claude/skills/app-requirements-generator/` | F1-M2, F1-M3 | G3 | 4 |
| F1-M5 | skill-creator | `.claude/skills/code-solution-synthesizer/` | F1-M4 | G3 | 4 |
| F1-M6 | agent-creator | `.claude/agents/domain/forum-monitor-agent.md` | F1-M2, F1-M3 | G4 | 5 |
| F1-M7 | agent-creator | `.claude/agents/domain/app-generator-agent.md` | F1-M4, F1-M5 | G4 | 5 |
| F1-M8 | workflow-creator | `.claude/workflows/forum-to-app-workflow.md` | F1-M6, F1-M7 | G5 | 6 |

### External Dependencies

```
pip: praw>=7.7.0 (Reddit API)
npm/node: axios (HTTP client for HN Algolia, ProductHunt)
python: transformers (NLP pain point classification)
env vars: REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, PRODUCTHUNT_API_TOKEN
```

### Estimated Token Budget

- Skills creation (×4): 4 × 15K = 60K tokens
- Agent creation (×2): 2 × 20K = 40K tokens
- Workflow creation: 15K tokens
- Total: ~115K tokens (split across sub-agents, safe per task)

### Phase 2 Tasks

- [ ] **2.1** Create `forum-scraper` skill via skill-creator (~1 hour)
  - **Target Agent**: `developer` (invokes `skill-creator` skill)
  - **Recommended Skills**: `skill-creator`, `tdd`
  - **Acceptance**: `Skill({ skill: 'forum-scraper' })` resolves; handles Reddit/HN/PH pagination

- [ ] **2.2** Create `pain-point-classifier` skill via skill-creator (~1 hour)
  - **Target Agent**: `ai-ml-specialist` (invokes `skill-creator` skill)
  - **Recommended Skills**: `skill-creator`
  - **Acceptance**: Classifies post into pain-point categories with confidence score

- [ ] **2.3** Create `app-requirements-generator` skill (~1 hour)
  - **Target Agent**: `developer` (invokes `skill-creator` skill)
  - **Recommended Skills**: `skill-creator`, `tdd`

- [ ] **2.4** Create `code-solution-synthesizer` skill (~1 hour)
  - **Target Agent**: `developer` (invokes `skill-creator` skill)
  - **Recommended Skills**: `skill-creator`, `tdd`

- [ ] **2.5** Create `forum-monitor-agent` via agent-creator (~1 hour)
  - **Target Agent**: `developer` (invokes `agent-creator` skill after `research-synthesis`)
  - **Recommended Skills**: `research-synthesis`, `agent-creator`

- [ ] **2.6** Create `app-generator-agent` via agent-creator (~1 hour)
  - **Target Agent**: `developer` (invokes `agent-creator` skill)
  - **Recommended Skills**: `research-synthesis`, `agent-creator`

- [ ] **2.7** Create `forum-to-app-workflow.md` via workflow-creator (~45 min)
  - **Target Agent**: `developer` (invokes `workflow-creator` skill)
  - **Recommended Skills**: `workflow-creator`

- [ ] **2.8** Write tests for forum scraper and classifier skills (~1 hour)
  - **Target Agent**: `qa`
  - **Recommended Skills**: `tdd`, `verification-before-completion`
  - **Deliverable**: `tests/skills/forum-scraper.test.cjs`, `tests/skills/pain-point-classifier.test.cjs`

**Success Criteria**: Both agents registered in agent-registry.json, workflow runnable, tests pass

- [ ] **Phase 2.final** Report token usage (`cat .claude/context/runtime/ccusage-status.txt`)

---

## Phase 3: Feature 2 — Auto-Tuning Voice Replicator

**Purpose**: Build agent that analyzes user content style and fine-tunes prompts to mimic tone/vocabulary
**Dependencies**: Phase 1 complete
**Parallel OK**: Can run in parallel with Phase 4 (no shared paths)

### Architecture

- **New Agent**: `voice-replicator-agent` (domain specialist)
- **New Skills**: `content-ingestion`, `style-analyzer`, `prompt-template-generator`, `ab-test-evaluator`
- **New Workflow**: `voice-replication-workflow.md`
- **Storage**: Profiles stored in `.claude/context/artifacts/style-profiles/`
- **No external API**: Pure NLP/prompt engineering, uses existing Claude models

### Microtask DAG

| task_id | target_agent | owned_paths | depends_on | parallel_group | wave |
|---------|-------------|-------------|-----------|---------------|------|
| F2-M1 | skill-creator | `.claude/skills/content-ingestion/` | 1.3 | G2 | 3 |
| F2-M2 | skill-creator | `.claude/skills/style-analyzer/` | 1.3 | G2 | 3 |
| F2-M3 | skill-creator | `.claude/skills/prompt-template-generator/` | F2-M2 | G3 | 4 |
| F2-M4 | skill-creator | `.claude/skills/ab-test-evaluator/` | F2-M3 | G3 | 4 |
| F2-M5 | agent-creator | `.claude/agents/domain/voice-replicator-agent.md` | F2-M1–F2-M4 | G4 | 5 |
| F2-M6 | workflow-creator | `.claude/workflows/voice-replication-workflow.md` | F2-M5 | G5 | 6 |

### Estimated Token Budget

- Skills creation (×4): 60K tokens
- Agent creation: 20K tokens
- Workflow creation: 15K tokens
- Total: ~95K tokens

### Phase 3 Tasks

- [ ] **3.1** Create `content-ingestion` skill (~45 min)
  - **Target Agent**: `developer` (invokes `skill-creator`)
  - **Recommended Skills**: `skill-creator`, `tdd`
  - **Acceptance**: Ingests markdown, plain text, and conversation history into structured corpus

- [ ] **3.2** Create `style-analyzer` skill (~1 hour)
  - **Target Agent**: `ai-ml-specialist` (invokes `skill-creator`)
  - **Recommended Skills**: `skill-creator`
  - **Acceptance**: Extracts vocabulary richness, sentence length distribution, formality score, recurring phrases

- [ ] **3.3** Create `prompt-template-generator` skill (~1 hour)
  - **Target Agent**: `developer` (invokes `skill-creator`)
  - **Recommended Skills**: `skill-creator`, `tdd`

- [ ] **3.4** Create `ab-test-evaluator` skill (~1 hour)
  - **Target Agent**: `developer` (invokes `skill-creator`)
  - **Recommended Skills**: `skill-creator`, `tdd`
  - **Acceptance**: Given two prompt outputs, scores style similarity to reference corpus

- [ ] **3.5** Create `voice-replicator-agent` via agent-creator (~1 hour)
  - **Target Agent**: `developer` (invokes `research-synthesis`, then `agent-creator`)
  - **Recommended Skills**: `research-synthesis`, `agent-creator`

- [ ] **3.6** Create `voice-replication-workflow.md` (~45 min)
  - **Target Agent**: `developer` (invokes `workflow-creator`)
  - **Recommended Skills**: `workflow-creator`

- [ ] **3.7** Write tests for style-analyzer and ab-test-evaluator (~45 min)
  - **Target Agent**: `qa`
  - **Recommended Skills**: `tdd`, `verification-before-completion`

**Success Criteria**: Agent registered, A/B evaluation pipeline runnable end-to-end with test fixtures

- [ ] **Phase 3.final** Report token usage (`cat .claude/context/runtime/ccusage-status.txt`)

---

## Phase 4: Feature 3 — Perpetual Memory Architecture

**Purpose**: Upgrade existing memory system to auto-log all interactions into a self-organizing vector DB with zero explicit "remember" commands
**Dependencies**: Phase 1.4 (database-architect ADR) complete
**Parallel OK**: No — modifies core memory subsystem (high blast radius)

### Architecture

- **Upgrade**: Existing LanceDB pipeline in `.claude/lib/memory/`
- **New Skill**: `auto-memory-logger` (intercept tool-use events and embed them)
- **New Hook**: `auto-embed-hook.cjs` (PostToolUse — auto-logs interactions)
- **New Skill**: `semantic-memory-retriever` (replaces/augments manual memory-search)
- **Existing System**: Must preserve `pnpm search:code`, BM25 index, STM/MTM/LTM tiers

### Critical Constraints

- MUST NOT break `pnpm search:code` or existing BM25 indexing
- MUST NOT break `node .claude/lib/memory/memory-search.cjs`
- Auto-logging must be async/non-blocking (zero impact on tool call latency)
- Vector embeddings batched, not per-interaction (avoid embedding model saturation)
- Existing memory files (learnings.md, decisions.md, issues.md) remain canonical for structured memory

### Microtask DAG

| task_id | target_agent | owned_paths | depends_on | parallel_group | wave |
|---------|-------------|-------------|-----------|---------------|------|
| F3-M1 | database-architect | `.claude/context/artifacts/analysis/` | 1.4 | G1 | 2 |
| F3-M2 | developer | `.claude/lib/memory/auto-embed-pipeline.cjs` | F3-M1 | G2 | 3 |
| F3-M3 | hook-creator | `.claude/hooks/memory/auto-embed-hook.cjs` | F3-M2 | G3 | 4 |
| F3-M4 | skill-creator | `.claude/skills/auto-memory-logger/` | F3-M2 | G3 | 4 |
| F3-M5 | skill-creator | `.claude/skills/semantic-memory-retriever/` | F3-M2 | G3 | 4 |
| F3-M6 | qa | tests/lib/memory/ | F3-M3–F3-M5 | G4 | 5 |
| F3-M7 | devops | `.claude/settings.json` (hook registration) | F3-M6 | G5 | 6 |

### Estimated Token Budget per Task

- F3-M2 (new lib module): reads 10 existing lib files (~40K) + writes: ~60K total — SPLIT allowed
- F3-M3 (hook creation): ~25K tokens
- F3-M4, F3-M5 (skills): ~30K tokens each

### Phase 4 Tasks

- [ ] **4.1** Design auto-embedding pipeline schema and LanceDB table structure (~1.5 hours)
  - **Target Agent**: `database-architect`
  - **Recommended Skills**: `sequential-thinking`
  - **Deliverable**: Schema doc + migration plan at `.claude/context/artifacts/database/perpetual-memory-schema-2026-03-21.md`
  - **Constraint**: Must coexist with existing `code_index` table without key collisions

- [ ] **4.2** Implement `auto-embed-pipeline.cjs` in `.claude/lib/memory/` (~2 hours)
  - **Target Agent**: `developer`
  - **Recommended Skills**: `tdd`, `verification-before-completion`
  - **Owned Paths**: `.claude/lib/memory/auto-embed-pipeline.cjs`
  - **Forbidden Paths**: `.claude/lib/memory/memory-manager.cjs` (do not modify existing public API)
  - **Acceptance**: `pnpm test -- --grep "auto-embed"` passes; BM25 search unaffected

- [ ] **4.3** Create `auto-embed-hook.cjs` via hook-creator (~1 hour)
  - **Target Agent**: `developer` (invokes `hook-creator` skill)
  - **Recommended Skills**: `hook-creator`, `tdd`
  - **Acceptance**: Hook intercepts PostToolUse(Edit,Write,Bash) and queues content for embedding; exits 0 always (advisory hook)

- [ ] **4.4** Create `auto-memory-logger` skill via skill-creator (~1 hour)
  - **Target Agent**: `developer` (invokes `skill-creator`)
  - **Recommended Skills**: `skill-creator`

- [ ] **4.5** Create `semantic-memory-retriever` skill via skill-creator (~1 hour)
  - **Target Agent**: `developer` (invokes `skill-creator`)
  - **Recommended Skills**: `skill-creator`
  - **Acceptance**: `Skill({ skill: 'semantic-memory-retriever' })` queries interaction history by semantic similarity; returns ranked results

- [ ] **4.6** Write regression tests for memory system (~1.5 hours)
  - **Target Agent**: `qa`
  - **Recommended Skills**: `tdd`, `verification-before-completion`
  - **Deliverable**: `tests/lib/memory/auto-embed-pipeline.test.cjs`
  - **Critical**: Must include test that existing `memory-search.cjs` still works after upgrade

- [ ] **4.7** Register hook in `.claude/settings.json` and run full validation (~30 min)
  - **Target Agent**: `devops`
  - **Recommended Skills**: `verification-before-completion`
  - **Acceptance**: `pnpm validate:full` passes; hook appears in settings.json PostToolUse section

**Success Criteria**: Auto-embed pipeline active, all existing memory tests pass, new semantic retrieval skill functional

- [ ] **Phase 4.final** Report token usage (`cat .claude/context/runtime/ccusage-status.txt`)

---

## Phase 5: Features 4, 5, 6 — Monitor/Analyzer/Benchmarker Agents

**Purpose**: Three parallel feature builds — competitor monitor, post analyzer, model benchmarker
**Dependencies**: Phase 1 complete (shared infra architecture decided)
**Parallel OK**: Yes — Features 4, 5, 6 have no path overlap and can run in parallel

### Feature 4: Competitor Performance Monitor

**Architecture**:
- **New Agent**: `competitor-monitor-agent`
- **New Skills**: `social-feed-tracker`, `engagement-baseline-calculator`, `anomaly-detector`, `notification-dispatcher`
- **New Workflow**: `competitor-monitor-workflow.md`
- **External**: X/Twitter API v2 (Bearer token), Twilio SMS API, Pushover HTTP API
- **Cron**: Every 4 hours baseline recalc, immediate alert on anomaly
- **env vars**: `TWITTER_BEARER_TOKEN`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `PUSHOVER_APP_TOKEN`, `PUSHOVER_USER_KEY`

**Phase 5.A Tasks**:

- [ ] **5A.1** Create `social-feed-tracker` skill (~1 hour)
  - **Target Agent**: `developer` (invokes `skill-creator`)
  - **Recommended Skills**: `skill-creator`, `tdd`
  - **Acceptance**: Fetches last N posts from a Twitter handle; returns engagement metrics (likes, retweets, replies, views)

- [ ] **5A.2** Create `engagement-baseline-calculator` skill (~45 min)
  - **Target Agent**: `developer` (invokes `skill-creator`)
  - **Recommended Skills**: `skill-creator`, `tdd`
  - **Acceptance**: Maintains rolling 30-day baseline per account; baseline stored in `.claude/context/data/baselines.json`

- [ ] **5A.3** Create `anomaly-detector` skill (~45 min)
  - **Target Agent**: `ai-ml-specialist` (invokes `skill-creator`)
  - **Recommended Skills**: `skill-creator`
  - **Acceptance**: Given post metrics + baseline, returns `{ isAnomaly: bool, score: float, reason: string }`

- [ ] **5A.4** Create `notification-dispatcher` skill (~1 hour)
  - **Target Agent**: `developer` (invokes `skill-creator`)
  - **Recommended Skills**: `skill-creator`, `tdd`
  - **Acceptance**: Sends SMS via Twilio or push via Pushover; gracefully handles missing credentials

- [ ] **5A.5** Create `competitor-monitor-agent` and workflow (~1 hour)
  - **Target Agent**: `developer` (invokes `research-synthesis`, `agent-creator`, `workflow-creator`)
  - **Recommended Skills**: `research-synthesis`, `agent-creator`, `workflow-creator`

### Feature 5: Daily Post Analyzer

**Architecture**:
- **New Agent**: `post-analyzer-agent`
- **New Skills**: `content-scraper`, `sentiment-analyzer`, `structural-hook-detector`, `engagement-report-generator`
- **New Workflow**: `post-analysis-workflow.md`
- **External**: Web scraping (Playwright or axios + cheerio), no proprietary API required
- **Cron**: Daily at 06:00 UTC
- **Output**: `.claude/context/reports/backend/post-analysis-{date}.md`

**Phase 5.B Tasks**:

- [ ] **5B.1** Create `content-scraper` skill (~1 hour)
  - **Target Agent**: `developer` (invokes `skill-creator`)
  - **Recommended Skills**: `skill-creator`, `tdd`
  - **Acceptance**: Fetches published posts from a given URL list; returns `{ url, title, content, publishedAt }`

- [ ] **5B.2** Create `sentiment-analyzer` skill (~45 min)
  - **Target Agent**: `ai-ml-specialist` (invokes `skill-creator`)
  - **Recommended Skills**: `skill-creator`
  - **Acceptance**: Returns sentiment score (positive/negative/neutral) + top emotional triggers per post

- [ ] **5B.3** Create `structural-hook-detector` skill (~45 min)
  - **Target Agent**: `developer` (invokes `skill-creator`)
  - **Recommended Skills**: `skill-creator`
  - **Acceptance**: Identifies hook type (question, statistic, story, controversy), word count, reading time, power words

- [ ] **5B.4** Create `engagement-report-generator` skill (~45 min)
  - **Target Agent**: `developer` (invokes `skill-creator`)
  - **Recommended Skills**: `skill-creator`, `tdd`
  - **Acceptance**: Produces structured markdown report with trend analysis, top performers, improvement recommendations

- [ ] **5B.5** Create `post-analyzer-agent` and workflow (~1 hour)
  - **Target Agent**: `developer` (invokes `research-synthesis`, `agent-creator`, `workflow-creator`)
  - **Recommended Skills**: `research-synthesis`, `agent-creator`, `workflow-creator`

### Feature 6: Local Model Benchmarker

**Architecture**:
- **New Agent**: `model-benchmarker-agent`
- **New Skills**: `hf-model-monitor`, `model-downloader`, `benchmark-harness`, `benchmark-report-generator`
- **New Workflow**: `model-benchmark-workflow.md`
- **External**: HuggingFace Hub API (public, no auth for public models), `transformers` library, `ollama` CLI (optional)
- **Cron**: Weekly scan for new models in specified categories
- **Storage**: Benchmark results in `.claude/context/artifacts/database/benchmark-results.jsonl`

**Phase 5.C Tasks**:

- [ ] **5C.1** Create `hf-model-monitor` skill (~1 hour)
  - **Target Agent**: `ai-ml-specialist` (invokes `skill-creator`)
  - **Recommended Skills**: `skill-creator`, `tdd`
  - **Acceptance**: Polls HuggingFace Hub API for new models in a given category since last check; returns sorted list by downloads/likes

- [ ] **5C.2** Create `model-downloader` skill (~1 hour)
  - **Target Agent**: `ai-ml-specialist` (invokes `skill-creator`)
  - **Recommended Skills**: `skill-creator`
  - **Acceptance**: Downloads model via `huggingface_hub` Python library; validates checksum; stores in `.claude/context/data/models/`

- [ ] **5C.3** Create `benchmark-harness` skill (~2 hours)
  - **Target Agent**: `ai-ml-specialist` (invokes `skill-creator`)
  - **Recommended Skills**: `skill-creator`, `ml-experiment-standards`
  - **Acceptance**: Runs standardized benchmarks (perplexity on fixed dataset, latency, VRAM usage); outputs `{ model, val_bpb, latency_ms, vram_gb }` per model; follows ML experiment standards (fixed budget, one hypothesis)

- [ ] **5C.4** Create `benchmark-report-generator` skill (~45 min)
  - **Target Agent**: `developer` (invokes `skill-creator`)
  - **Recommended Skills**: `skill-creator`, `tdd`
  - **Acceptance**: Produces comparison report with leaderboard table, improvement delta from previous winner, trend chart description

- [ ] **5C.5** Create `model-benchmarker-agent` and workflow (~1 hour)
  - **Target Agent**: `ai-ml-specialist` (invokes `research-synthesis`, `agent-creator`, `workflow-creator`)
  - **Recommended Skills**: `research-synthesis`, `agent-creator`, `workflow-creator`

### Parallelization Guardrails for Phase 5

- Features 4, 5, 6 can run in parallel (zero path overlap)
- Max 3 parallel agent spawns (one per feature)
- Skill creation within each feature runs sequentially (skills depend on each other in workflow)
- Merge gate: all three features must pass their own QA before Phase 6

**Success Criteria**: All 3 agents registered, all 3 workflows runnable, no path conflicts

- [ ] **Phase 5.final** Report token usage (`cat .claude/context/runtime/ccusage-status.txt`)

---

## Phase 6: Integration, Testing & Cron Wiring

**Purpose**: Wire all 6 features into the framework (agent registry, cron/heartbeat, settings.json hooks, documentation)
**Dependencies**: Phases 2-5 complete
**Parallel OK**: Partially

### Commit Checkpoint (MANDATORY — 30+ files modified by this point)

Before Phase 6 begins:
```bash
git add .claude/agents .claude/skills .claude/workflows .claude/hooks
git commit -m "checkpoint: Features 1-6 agent/skill/workflow creation complete"
```

### Phase 6 Tasks

- [ ] **6.1** Regenerate agent registry after all new agents created (~15 min)
  - **Target Agent**: `devops`
  - **Command**: `pnpm agents:registry && pnpm skills:index`
  - **Verify**: `pnpm validate` passes; all 6 new agents appear in agent-registry.json

- [ ] **6.2** Register all new cron jobs via heartbeat-orchestrator (~30 min)
  - **Target Agent**: `devops`
  - **Recommended Skills**: `verification-before-completion`
  - **Agents requiring cron**: `forum-monitor-agent` (daily), `competitor-monitor-agent` (every 4h), `post-analyzer-agent` (daily 06:00), `model-benchmarker-agent` (weekly)
  - **Verify**: Heartbeat session ping updated; cron entries visible in heartbeat registry

- [ ] **6.3** Write end-to-end integration tests for each feature (~3 hours)
  - **Target Agent**: `qa`
  - **Recommended Skills**: `tdd`, `verification-before-completion`
  - **Deliverable**: `tests/agents/forum-monitor-agent.test.cjs`, `tests/agents/competitor-monitor-agent.test.cjs`, `tests/agents/post-analyzer-agent.test.cjs`, `tests/agents/model-benchmarker-agent.test.cjs`
  - **Note**: Voice replicator and perpetual memory have unit tests from their phases; integration tests added here

- [ ] **6.4** Security review of all external API integrations (~1.5 hours)
  - **Target Agent**: `security-architect`
  - **Recommended Skills**: `auth-security-expert`, `verification-before-completion`
  - **Focus**: API key storage (env vars only), rate limit handling, scraped data storage, model download integrity

- [ ] **6.5** Update CHANGELOG.md and README with new capabilities (~1 hour)
  - **Target Agent**: `technical-writer`
  - **Recommended Skills**: `doc-generator`, `writing-skills`
  - **Deliverable**: CHANGELOG entry under `[Unreleased]` + README capabilities section updated

- [ ] **6.6** Run full validation suite and fix any issues (~45 min)
  - **Target Agent**: `qa`
  - **Command**: `pnpm validate:full && pnpm test && pnpm lint:fix && pnpm format`
  - **Verify**: All pass with 0 errors

- [ ] **6.7** Commit all changes and push (~15 min)
  - **Target Agent**: `devops`
  - **Recommended Skills**: `verification-before-completion`

**Success Criteria**: `pnpm validate:full` passes, all 6 agents in registry, cron jobs registered, documentation updated

- [ ] **Phase 6.final** Report token usage (`cat .claude/context/runtime/ccusage-status.txt`)

---

## Execution Topology (Full Microtask DAG Summary)

### Wave Assignment

| Wave | Tasks | Parallelism | Gate |
|------|-------|------------|------|
| 1 | Phase 0 (research + security review) | 3 parallel researchers | Constitution checkpoint |
| 2 | Phase 1 (architecture design) | Partially parallel | Arch review complete |
| 3 | Features 1+2 skills creation (early), Feature 3 pipeline design | Parallel across features | Skills exist |
| 4 | Features 1+2 skills (late), Feature 3 hook+skills, Features 4+5+6 skills (early) | Max 4 parallel | Skills complete per feature |
| 5 | All 6 agent creation tasks | Max 4 parallel (registry safe) | Agents registered |
| 6 | All 6 workflows, integration, testing, cron wiring | Sequential within features, parallel across | Full validation |

### Parallelization Guardrails

- Max active parallel microtasks: 4 (token budget constraint)
- No two tasks may own the same path
- Shared paths (`.claude/settings.json`, `agent-registry.json`, `pnpm-lock.yaml`) are wave-gated: only one task modifies at a time
- Feature 3 (Perpetual Memory) runs sequentially within its phase due to blast radius on core memory subsystem

---

## Risk Matrix

| Risk | Impact | Probability | Mitigation | Rollback |
|------|--------|------------|-----------|---------|
| Twitter/X API v2 rate limits block competitor monitor | HIGH | MEDIUM | Implement exponential backoff; cache API responses 15min | Stub with mock data; alert-only mode |
| LanceDB schema conflict (Feature 3 upgrade) | HIGH | LOW | Create new table `interaction_log` separate from `code_index` | Drop new table; existing search unaffected |
| HuggingFace model downloads fill disk | MEDIUM | MEDIUM | Configurable download path; model cleanup after benchmark | Delete `.claude/context/data/models/` safely |
| Reddit PRAW deprecation or API changes | MEDIUM | LOW | Abstract behind `forum-scraper` skill interface; swap impl only | Use HN Algolia as sole source |
| ML benchmark harness OOM on large models | HIGH | MEDIUM | Set VRAM budget cap; skip model if VRAM > threshold | Skip model, log as `skipped_vram` in results.tsv |
| creator skill chain fails mid-creation | MEDIUM | LOW | Each creation is atomic; re-run failed step | Delete partial artifacts, re-run with fresh context |

---

## must_haves

### truths

- All tests pass (`pnpm test` exits 0)
- No lint errors (`pnpm lint:fix` produces no output)
- No format changes (`pnpm format` produces no diff)
- `pnpm validate:full` passes with 0 errors
- All 6 new agents appear in `.claude/context/agent-registry.json`
- All new skills appear in skills index (`pnpm skills:index` succeeds)
- No existing `pnpm search:code` or `memory-search.cjs` functionality broken (regression)

### artifacts

- `tests/agents/forum-monitor-agent.test.cjs` — integration test
- `tests/agents/competitor-monitor-agent.test.cjs` — integration test
- `tests/agents/post-analyzer-agent.test.cjs` — integration test
- `tests/agents/model-benchmarker-agent.test.cjs` — integration test
- `tests/lib/memory/auto-embed-pipeline.test.cjs` — regression test for Feature 3
- `.claude/context/artifacts/research-reports/agentic-features-research-2026-03-21.md` — Phase 0 research
- `.claude/context/artifacts/analysis/agentic-features-arch-2026-03-21.md` — architecture decisions
- `.claude/context/artifacts/database/perpetual-memory-schema-2026-03-21.md` — Feature 3 schema
- `CHANGELOG.md` updated under `[Unreleased]`

### key_links

- All 6 agents registered in `.claude/context/agent-registry.json`
- Auto-embed hook registered in `.claude/settings.json` under `PostToolUse`
- All 4 cron agents registered in heartbeat registry
- `notification-dispatcher` skill reachable from both `competitor-monitor-agent` and future alerting agents
- Feature 3 upgrade coexists with existing `pnpm search:code` daemon (verified via `pnpm search:code "test query"` post-upgrade)

---

## Phase FINAL: Evolution & Reflection Check

**Purpose**: Quality assessment and learning extraction after EPIC pipeline completes
**Dependencies**: Phase 6 complete, all must_haves verified

**Tasks**:

1. Spawn reflection-agent to analyze completed 6-feature EPIC
2. Extract learnings about multi-feature EPIC planning patterns
3. Check for evolution opportunities (e.g., shared `external-api-client` skill used by features 1, 4, 5, 6 — candidate for extraction)
4. Update `.claude/context/memory/learnings.md` with EPIC planning patterns

**Routing Command (Router-owned)**:
Ask Router to spawn:
- `subagent_type: "reflection-agent"`
- `description: "Session reflection for 6-feature EPIC agentic AI implementation"`
- Prompt: read session-gap-log.jsonl, score all 6 feature deliveries, extract learnings about parallel feature development, recommend any evolution opportunities (shared skills, new agent types)

**Success Criteria**:
- Reflection-agent spawned and completed
- Learnings extracted to `.claude/context/memory/learnings.md`
- Evolution opportunities (especially `notification-dispatcher` reuse, shared `api-client-base`) logged if confirmed

- [ ] **Phase FINAL.final** Report cumulative token usage (`cat .claude/context/runtime/ccusage-status.txt`)

---

## Summary Table

| Feature | New Agents | New Skills | New Workflows | External APIs | Complexity | Wave |
|---------|-----------|-----------|--------------|---------------|-----------|------|
| 1. Autonomous App Generator | 2 | 4 | 1 | Reddit, HN, ProductHunt | HIGH | 2-6 |
| 2. Auto-Tuning Voice Replicator | 1 | 4 | 1 | None (Claude) | MEDIUM | 3-6 |
| 3. Perpetual Memory Architecture | 0 (upgrade) | 2 | 0 | None | HIGH | 3-6 |
| 4. Competitor Performance Monitor | 1 | 4 | 1 | Twitter/X, Twilio, Pushover | HIGH | 4-6 |
| 5. Daily Post Analyzer | 1 | 4 | 1 | Web scraping | MEDIUM | 4-6 |
| 6. Local Model Benchmarker | 1 | 4 | 1 | HuggingFace Hub | HIGH | 4-6 |
| **TOTAL** | **6** | **22** | **5** | **8 external** | **EPIC** | |

**Estimated total implementation time**: 40-60 hours (parallelized across 4 simultaneous agents → ~15-20 calendar hours)
**Token estimate (total)**: ~600K-800K tokens across all agent tasks (well within per-task budget when split per wave)
