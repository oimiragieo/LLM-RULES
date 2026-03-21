# Context/Memory Modernization Research

<!-- Agent: researcher | Task: #4 | Session: 2026-02-09 -->

**Date**: 2026-02-09
**Agent**: researcher
**Project**: agent-studio context management upgrade
**Related**: Deep-Dive Research (context-memory-deep-research-2026-02-09.md)

## Executive Summary

This research consolidates findings from deep-dive research into practical P0 improvements for context/memory management. Focus: address unbounded growth (87KB active memory) and enable disabled infrastructure (BM25 hybrid search).

**Current State**: 3 memory files (learnings 19KB, decisions 44KB, issues 25KB), no tiered management, BM25 disabled.

**P0 Recommendations**: (1) Clean stale memory entries, (2) Enable BM25 search, (3) Validate catalog freshness, (4) Clean stale runtime state.

**Impact**: Immediate 20-30% memory reduction, hybrid search operational, catalog accuracy restored.

---

## Topic 1: AI Agent Memory Architecture

### Research Sources

- **MemGPT/Letta** ([arXiv 2310.08560](https://arxiv.org/abs/2310.08560)): Two-tier memory (in-context + external)
- **Memory in AI Agents** ([arXiv 2512.13564](https://arxiv.org/abs/2512.13564)): 6 memory types (episodic, semantic, procedural)
- **LangChain Memory**: 6 patterns (buffer, window, summary, entity, KG, vector)

### Key Findings

**Pattern**: Shift from monolithic buffers to tiered, hierarchical memory:

1. **Tier 1 (Hot/In-Context)**: <20KB, direct access, session-scoped
2. **Tier 2 (Warm/Recent)**: 20-100KB, frequent access, 30-day retention
3. **Tier 3 (Cold/Archive)**: Unlimited, infrequent access, compressed

**agent-studio Current**: Single-tier (all files treated as Hot), no rotation, no decay.

**Gap**: Memory files grow unbounded (learnings 19KB, decisions 44KB = 63KB combined).

### Recommendations

**P0 (Immediate)**:
- Clean stale entries (remove resolved issues, deduplicate learnings)
- Add "Last cleaned" timestamps to track maintenance

**P1 (This Sprint)**:
- Implement ADR-102 memory rotator (section-based rotation at 20KB threshold)
- Add `[PERMANENT]` markers for critical entries

**P2 (Future)**:
- Three-tier architecture (Hot/Warm/Cold)
- Memory decay with temporal relevance scoring

---

## Topic 2: Context Compression

### Research Sources

- **Semantic Compression** ([arXiv 2312.09571](https://arxiv.org/html/2312.09571v1)): 6-8x longer texts
- **Context Window Limits** ([arXiv 2509.21361](https://arxiv.org/abs/2509.21361)): Effective context << reported limits
- **LongLLMLingua** (Microsoft): 20x compression, 5-10% cost savings

### Key Findings

**Pattern**: Semantic deduplication + structural reduction > simple truncation:

- **Redundancy removal**: Identify duplicate concepts (not just strings)
- **Hierarchical summarization**: Preserve structure (section titles, key points)
- **Citation-based**: Link summaries to original sources

**agent-studio Current**: context-compressor skill (structural reduction only), no semantic dedup.

**Gap**: Auto-compression disabled (config.yaml `enabled: false`), compression-reminder.txt mechanism dormant.

### Recommendations

**P0 (Immediate)**:
- Enable auto-compression in config.yaml (`enabled: true`)
- Document expected 30-50% token reduction in long sessions

**P1 (This Sprint)**:
- Add semantic deduplication to context-compressor (identify similar ADRs, learnings)
- Set compression trigger at 90% token budget

**P2 (Future)**:
- Compression quality metrics (track token reduction, content preservation)
- Multi-level compression (light/medium/aggressive modes)

---

## Topic 3: Memory Maintenance

### Research Sources

- **Mem0 Temporal Decay**: `relevance(t) = initial * e^(-λ * time_since_access)`
- **A-MEM** ([arXiv 2502.12110](https://arxiv.org/abs/2502.12110)): LLM-generated keywords + embedding links
- **Smart Pruning**: Jaccard similarity deduplication + age-based archival

### Key Findings

**Pattern**: Active maintenance prevents memory bloat:

1. **Deduplication**: Jaccard similarity (>0.5 threshold) or embedding cosine (>0.9)
2. **Decay scoring**: Access-based relevance (refresh on read, decay over time)
3. **Rotation**: Move old entries to archives (preserve history, reduce active footprint)

**agent-studio Current**: Manual cleaning only, no automated pruning/dedup/rotation.

**Gap**: issues.md has months-old resolved issues, learnings.md has potential duplicates.

### Recommendations

**P0 (Immediate)**:
- Clean issues.md (remove resolved entries >3 months old)
- Add status markers to decisions.md (`Status: Active/Superseded`)

**P1 (This Sprint)**:
- Implement smart-pruner (Jaccard dedup + 30-day age filter)
- Memory rotator (section-based rotation at 20KB threshold)

**P2 (Future)**:
- Temporal decay scoring (access refreshes relevance)
- Automated monthly cleanup via memory-scheduler

---

## Topic 4: Catalog Management

### Research Sources

- **Registry Patterns**: agent-registry.json (59 agents), skill-catalog.md (140+ skills)
- **Freshness Enforcement**: CI validation of catalog-to-filesystem consistency
- **Lifecycle Policies**: AUTO_ARCHIVE flag for deprecated artifacts

### Key Findings

**Pattern**: Automated catalog maintenance prevents drift:

1. **Freshness validation**: CI check that registry matches filesystem
2. **Lifecycle tracking**: Mark deprecated artifacts (not deleted) with AUTO_ARCHIVE
3. **Bidirectional sync**: Filesystem changes update catalogs, catalogs guide creation

**agent-studio Current**: agent-registry.json has `lastFullScan` timestamp, manual catalog updates.

**Gap**: No automated validation that registry entries match disk, no dead-entry detection.

### Recommendations

**P0 (Immediate)**:
- Validate agent-registry.json against `.claude/agents/` filesystem
- Report missing-from-disk and missing-from-registry gaps

**P1 (This Sprint)**:
- Add CI check: `pnpm validate:catalog` (blocks merge if drift detected)
- Document freshness SLA (registry <24h stale)

**P2 (Future)**:
- Automated catalog sync on artifact creation (post-creation-integration hook)
- Deprecation workflow (AUTO_ARCHIVE flag + archive script)

---

## Topic 5: Runtime State Management

### Research Sources

- **Session-Centric State**: `router-state.json`, `session-metrics.json`, `workflow-state.json`
- **Event Sourcing Patterns**: Append-only logs (spawn-log.jsonl, error-metrics.jsonl)
- **State File Locking**: atomic-write-async with proper-lockfile

### Key Findings

**Pattern**: Session-scoped state with lifecycle management:

1. **Session boundaries**: Reset state on UserPromptSubmit (user-prompt-unified.cjs)
2. **State staleness**: Detect >10min inactive state, force router mode
3. **Cleanup policies**: Delete session-metrics on session end, archive spawn-log weekly

**agent-studio Current**: 5+ state files in `.claude/context/runtime/`, no automated cleanup.

**Gap**: Stale drift-state.json, old pre-compact-snapshot.json from previous sessions.

### Recommendations

**P0 (Immediate)**:
- Clean stale runtime files (>24h old: drift-state, pre-compact-snapshot)
- Keep active state (router-state.json, session-metrics.json, workflow-state.json)

**P1 (This Sprint)**:
- Add state file expiration metadata (createdAt timestamp)
- Automated cleanup hook on session start (delete expired state)

**P2 (Future)**:
- State file schemas with validation (prevent malformed state)
- State integrity verification (SHA-256 checksums per ADR-FND-003)

---

## Gap Analysis

| Component | Current | P0 Target | P1 Target | P2 Target |
|-----------|---------|-----------|-----------|-----------|
| **Memory Size** | 87KB | <70KB | <60KB | <50KB |
| **Memory Tiers** | 1 (flat) | 1 (cleaned) | 2 (Hot/Warm) | 3 (Hot/Warm/Cold) |
| **Deduplication** | 0% | 0% | 10-30% | 30-50% |
| **Search Mode** | Grep | Grep | BM25 | BM25+Vector |
| **Search Latency** | 200ms | 200ms | <150ms | <100ms |
| **Catalog Drift** | Unknown | Validated | CI-enforced | Auto-synced |
| **Runtime Cleanup** | Manual | Manual | Session-scoped | Automated |

---

## Implementation Roadmap

### P0: Immediate Cleanup (This Session, 2-3h)

1. **Save this research report** (`.claude/context/artifacts/research-reports/`)
2. **Clean issues.md** (remove resolved entries >3mo, add "Last cleaned" date)
3. **Clean decisions.md** (add Status markers to ADRs, don't delete)
4. **Validate agent-registry.json** (check disk vs registry, report gaps)
5. **Clean stale runtime state** (delete old drift-state.json, pre-compact-snapshot.json)
6. **Update learnings.md** (add memory modernization findings)
7. **Lint and format** (pnpm lint:fix, pnpm format)

### P1: Enable Infrastructure (1-2 sessions, 4-6h)

8. **Enable BM25 search** (config.yaml adjustment if not already done)
9. **Enable auto-compression** (config.yaml `auto_compression.enabled: true`)
10. **Memory rotator** (implement ADR-102 section-based rotation)
11. **Smart pruner** (Jaccard dedup + 30-day age filter)
12. **Catalog validation** (CI script: validate agent-registry vs filesystem)

### P2: Advanced Features (2-3 weeks, 20-30h)

13. **Three-tier memory** (Hot/Warm/Cold with rotator + cold-storage)
14. **Knowledge graph** (ADR relationships, skill usage tracking)
15. **Vector search** (enable LANCEDB_EMBEDDING_MODE=hybrid)
16. **Memory decay** (temporal relevance scoring)
17. **State integrity** (SHA-256 checksums on critical state files)

---

## Success Metrics

**After P0 (Immediate)**:
- Memory size: 87KB → ~70KB (20% reduction)
- issues.md: 389 lines → ~200 lines (resolve

d entries removed)
- Catalog drift: Unknown → 0 gaps (validated)
- Runtime state: 5+ stale files → 0 stale files

**After P1 (This Sprint)**:
- Memory size: ~70KB → <60KB (dedup + rotation)
- Search latency: 200ms → <150ms (BM25 enabled)
- Compression: Disabled → Active (30-50% token reduction)
- Catalog freshness: Manual → CI-enforced (<24h stale)

**After P2 (Future)**:
- Memory size: <60KB → <50KB (three-tier architecture)
- Search accuracy: ~70% → >95% (hybrid BM25+vector)
- Maintenance: Manual → Automated (memory-scheduler)

---

## Conclusion

agent-studio's memory system is functional but suffers from unbounded growth and disabled infrastructure. P0 recommendations focus on immediate cleanup and enabling existing infrastructure (BM25, auto-compression). P1/P2 recommendations align with modern agent memory patterns (tiered architecture, hybrid search, knowledge graphs).

**Immediate Action**: Implement P0 tasks (2-3h) to achieve 20% memory reduction and restore catalog accuracy.

**Next Steps**: Enable BM25 search and auto-compression (P1), then plan three-tier memory architecture (P2).

---

## Cross-References

- **Deep-Dive Research**: context-memory-deep-research-2026-02-09.md
- **ADR-102**: Memory Management System Rebuild (tiered architecture)
- **ADR-108**: Auto-compression infrastructure activation
- **Memory Files**: `.claude/context/memory/` (learnings, decisions, issues)
- **Catalogs**: `.claude/context/artifacts/catalogs/` (agent-registry, skill-catalog)
- **Runtime State**: `.claude/context/runtime/` (router-state, session-metrics, workflow-state)

---

**Memory Takeaway**: Modern agent memory is not passive file storage—it's an active, intelligent retrieval system with tiers, semantic search, and graph relationships. agent-studio's upgrade path: Cleanup → Enable → Tier → Graph → Semantic.
