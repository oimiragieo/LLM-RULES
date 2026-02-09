- Vector-only: 100ms, 85% accuracy (semantic similarity)
- Hybrid (BM25+vector+rerank): 150ms, 95% accuracy
- Current: BM25 implemented but disabled (LANCEDB_EMBEDDING_MODE=off)

5. **Memory Decay Pattern (Mem0 approach):**
   - Formula: `relevance(t) = initial_relevance * e^(-λ * time_since_last_access)`
   - Access refreshes relevance, unaccessed entries decay over time
   - Pruning when relevance < threshold
   - Current: No decay, issues.md contains months-old resolved issues

6. **Context Window Reality (arXiv 2509.21361):**
   - Maximum Effective Context Window (MECW) << reported limits
   - Top models failed with as little as 100 tokens in complex tasks
   - Semantic compression more effective than positional encoding tricks
   - Current context-compressor: Structural reduction, should add semantic deduplication

7. **RAG Growth Explosion (2024):**
   - 1,200+ RAG papers on arXiv in 2024 (vs <100 in 2023)
   - M-RAG pattern: Multi-agent with shared memory coordination
   - DRAGIN/FLARE: Confidence-based retrieval (query memory only when uncertain)
   - Current: Agents read memory once at spawn, no in-execution retrieval

8. **Memory API Pattern (Recommended):**
   - MemorySearch(query, types, limit, mode): Top-K results with scores/sources
   - MemoryUpdate(key, value, metadata): Structured updates with tags
   - MemoryGraph(entity, relationship_type): Query relationships
   - MemoryForget(key, reason): Explicit deletion with audit trail

**Implementation Priorities:**

- **P1 (Must-Have, 2 weeks):** Memory API + Hot Cache + Enable BM25
- **P2 (Should-Have, 2 weeks):** Warm rotation (ADR-102) + Cold storage + Knowledge graph
- **P3 (Nice-to-Have, 2 weeks):** Vector search + Memory decay + Entity extraction

**Expected Impact:**

- 50-70% token reduction (via tiered memory + compression)
- 95%+ retrieval accuracy (via hybrid search)
- <150ms query latency (via caching + indexing)
- Cross-session state preservation (via Memory API)

**Cross-Reference:**

- Research report: `.claude/context/artifacts/research-reports/context-memory-deep-research-2026-02-09.md`
- ADR-102: Memory Management System Rebuild (current file-based approach)
- Current memory system: `.claude/context/memory/` (82KB active + 463KB archives)

**Memory Takeaway:** Modern agent memory is not passive file storage—it's an active, intelligent retrieval system with tiers, semantic search, and graph relationships. agent-studio's upgrade path is clear: API → Cache → Tiers → Graph → Semantic.

---

## Schema Security Hardening (2026-02-09)

**Context:** Task #1 - Schemas Modernization Phase. Hardening 27 schemas with maxLength/maxItems bounds to prevent DoS attacks.

**Learnings:**

1. **Draft-2020-12 vs Draft-07 Property Injection:**
   - Draft-07 schemas: Use `additionalProperties: false`
   - Draft-2020-12 schemas: Use `unevaluatedProperties: false`
   - Only 1 schema (evolution-state) uses draft-2020-12 in this project
   - Both prevent property injection attacks equally well

2. **Nested Object Protection (Critical):**
   - MUST add `additionalProperties: false` to EVERY nested object
   - Not just root object, but also:
     - Every object in `properties`
     - Every object in array `items`
     - Every object in `$defs`
   - Missing protection at any level leaves attack surface
   - Example: plan.schema.json has 6+ levels of nesting, all protected

3. **Realistic Bounds for Production:**
   - Test execution arrays: 10,000 items (large test suites are real)
   - Stack traces: 50,000 chars (production errors can be massive)
   - Evolution history: 1,000 items (long-running systems accumulate)
   - Error messages: 5,000 chars (detailed error context)
   - Short descriptions: 500 chars
   - Long descriptions: 2,000 chars
   - Technical content (architecture diagrams): 5,000-10,000 chars

4. **Intentional Permissiveness:**
   - Some schemas SHOULD allow `additionalProperties: true`:
     - `evolution-state.metadata` (extensibility by design)
     - `implementation-plan` (flexible task data)
     - `track-metadata` (arbitrary project metadata)
   - Document the rationale with inline comments
   - Don't blindly apply `false` everywhere

5. **Large Schema Complexity:**
   - `system-architecture.schema.json`: 35+ fields, 11 nested objects
   - Requires systematic approach:
     1. Read full schema first
     2. Process top-to-bottom
     3. Track nested objects separately
     4. Verify all paths protected
   - Estimated 45 min per complex schema

6. **Validation Testing:**
   - Use `npx ajv compile` to verify schema syntax
   - Use `npx ajv validate` to test against real data
   - Critical for large schemas (catches nesting errors)

**Progress:**

- **Completed:** 6 schemas this session (4 HIGH + 2 MEDIUM)
- **Total hardened:** 9/27 schemas (33%)
- **Estimated remaining:** 2-3 sessions at current pace

**Cross-Reference:**

- Progress report: `.claude/context/reports/security/schema-hardening-session-2-2026-02-09.md`
- Previous session: `.claude/context/reports/security/schema-hardening-progress-2026-02-09.md`
- Next work: 7 MEDIUM priority + 3 verification schemas

---

## 2026-02-09: Context/Memory Modernization (Task #4) - Complete

**Pattern:** Systematic cleanup and validation prevents memory bloat and catalog drift

**Key Actions:**

1. **Research report saved:** context-memory-modernization-research-2026-02-09.md documents P0/P1/P2 recommendations for tiered memory, hybrid search, and automated maintenance.

2. **issues.md cleaned:** Added "Last cleaned" timestamp header (2026-02-09). Removed clearly resolved issues >3 months old. Current size reduced from 25KB to focus on active blockers.

3. **decisions.md validated:** All ADRs already have proper Status markers (PROPOSED/ACCEPTED/COMPLETE). No cleanup needed.

4. **agent-registry.json validated:** ✓ All 59 registry entries match filesystem. ✓ All 59 agent files on disk are in registry. Zero catalog drift detected.

5. **Runtime state checked:** All files recent (<24h old). No stale files to clean. event-bus.jsonl and integration-queue.jsonl have processed entries from today.

6. **Memory budget learning:** Keep active memory <30KB per file, 80KB total. ADR-102 tiered memory pattern (HOT 20KB / WARM archive / COLD delete) is the target architecture.

**Expected Impact:**

- Memory footprint: 87KB → ~70KB (20% reduction from cleanup)
- Catalog accuracy: Validated fresh (0 gaps)
- P1 targets: Enable BM25 search, memory rotator (section-based at 20KB), smart pruner (Jaccard dedup)
- P2 targets: Three-tier Hot/Warm/Cold architecture, knowledge graph, vector search

**Cross-Reference:**

- Research: `.claude/context/artifacts/research-reports/context-memory-modernization-research-2026-02-09.md`
- ADR-102: Memory Management System Rebuild
- ADR-108: Auto-compression infrastructure activation

**Memory Takeaway:** Memory budget discipline prevents context window exhaustion. Clean issues monthly (remove resolved), validate catalogs periodically (prevent drift), enable existing infrastructure (BM25 already built but disabled). Modern agent memory is tiered (Hot/Warm/Cold) not flat.

---

## 2026-02-09: Config Modernization (Task #2) - Complete

**Pattern:** Systematic config hygiene improves discoverability and prevents shadow configuration

**Key Achievements:**

1. **Auto-compression enabled by default (ADR-108):**
   - Changed `enabled: false` → `enabled: true` in config.yaml
   - Infrastructure was dormant (built but disabled)
   - Expected: 30-50% token reduction in long sessions (>50 turns)
   - Triggers at 90% token budget via user-prompt-unified.cjs

2. **ALL environment variables documented (156+ vars):**
   - Discovered via codebase scan: `git grep "process\.env\." | grep -o "process\.env\.[A-Z_][A-Z0-9_]*" | sort -u`
   - Added missing vars: TASKLIST_FIRST_ENFORCEMENT, STATE_STALE_THRESHOLD_MS, SPECIALIST_ROUTING_ENFORCEMENT, 140+ more
   - Organized into 19 categories (Routing, Creator, Memory, Reflection, Performance, etc.)
   - Each var documented with: purpose, options (block/warn/off), default value
   - Zero undocumented env vars = zero shadow configuration (security++)

3. **Model mappings for all 59 agents:**
   - Strategy: haiku (fast/cheap), sonnet (standard), opus (complex/high-stakes)
   - Grouped by category: Core (10), Specialized (18), C4 (4), Domain (22), Orchestrators (4)
   - Extended thinking enabled for: planner, master-orchestrator, evolution-orchestrator
   - Expected: consistent model selection, cost optimization (haiku where possible)

4. **Config metadata versioning:**
   - Version 2.2.2 (from 2.2.1)
   - Metadata includes: version, last_updated, updated_by, config_modernization description
   - Enables config change auditing

**Research Findings (Academic + Industry):**

- **MasRouter (ACL 2025)**: Dynamic routing achieves 30-75% cost reduction vs static
- **LaunchDarkly**: Feature flag percentage rollouts (5%→10%→25%→50%→100%)
- **SparkCo/Neomanex**: Modern YAML config + env overrides is industry standard
- **Zod validation**: Runtime env var validation (TypeScript standard)

**Files Modified:**

- `.claude/config.yaml`: metadata + auto-compression + 59 agent models
- `.env.example`: version 2.2.6, 156+ vars documented, new category added
- Research report: `.claude/context/artifacts/research-reports/config-modernization-research-2026-02-09.md`

**Quality Gates Passed:**

- ✅ `pnpm lint:fix` - 0 errors
- ✅ `pnpm format` - no changes needed
- ✅ YAML syntax validation - valid
- ✅ Env var count: 156+ documented

**Cross-Reference:**

- Research report: config-modernization-research-2026-02-09.md
- ADR-108: Auto-compression infrastructure activation
- issues.md: Missing env vars (TASKLIST_FIRST_ENFORCEMENT, STATE_STALE_THRESHOLD_MS)

**Memory Takeaway:** Config hygiene prevents shadow configuration. Document ALL env vars with categories/purposes/defaults. Enable dormant infrastructure (auto-compression was built but disabled). Use metadata versioning for auditability. Industry pattern: YAML + env overrides + dynamic routing + feature flags.

---

## Research Report Output Standardization (2026-02-09)

**Problem Solved**: Research reports had inconsistent naming, locations, and structure (some to `.claude/context/reports/`, some to `.claude/context/artifacts/research-reports/`, inconsistent naming conventions).

**Solution Implemented**:

1. **Location Clarification (workspace-conventions.md)**:
   - Operational reports (security/QA/architecture audits): `.claude/context/reports/`
   - Research reports (external research artifacts): `.claude/context/artifacts/research-reports/`

2. **Naming Convention Standardized**: `{topic}-research-{YYYY-MM-DD}.md`
   - Always includes `-research-` suffix before date
   - ISO 8601 date format with hyphens (YYYY-MM-DD)

3. **Template Enhanced** (research-report-template.md):
   - Added provenance header requirement
   - Added research methodology tables (queries + sources)
   - Added detailed findings by topic
   - Added academic references section (required even if empty)
   - Added P0/P1/P2 recommendation prioritization
   - Added risk assessment table
   - Added implementation roadmap

4. **Agent Instructions Updated**:
   - researcher.md: Added "Research Report Standards (MANDATORY)" section with naming/location/template requirements
   - research-synthesis skill: Added "Report Naming Convention (MANDATORY)" section

**Files Modified**:

- `.claude/rules/workspace-conventions.md`
- `.claude/templates/reports/research-report-template.md`
- `.claude/agents/specialized/researcher.md`
- `.claude/skills/research-synthesis/SKILL.md`

**Why This Matters**:

- 48+ existing research reports in `.claude/context/artifacts/research-reports/`
- Prevents confusion between operational reports (agent execution) and research artifacts (reference material)
- Ensures discoverability via consistent naming
- Academic citation support for evidence-based research

## 2026-02-09: Foundation Layer Complexity Analysis - Batch 1 (Code Simplifier)

**Pattern:** Systematic foundation layer analysis reveals duplication hotspots and quick wins

**Key Findings:**

1. **Schema duplication (HIGH PRIORITY):**
   - 3 agent schemas (definition, identity, capability-card) overlap 20-30%
   - 557 total lines → consolidate to ~350 lines (37% reduction via $ref composition)
   - 59% of schemas marked "DOCS ONLY" (16/27) — clarify active vs reference status
   - Action: Consolidate 3 agent schemas, wire 6 schemas, archive 10 unused

2. **Rules duplication (25-30% overall):**
   - testing.md ↔ code-standards.md: 40% overlap (pre-commit requirements duplicated)
   - git-workflow.md ↔ testing.md: 30% overlap (quality gates duplicated)
   - hooks.md ↔ @ENFORCEMENT_HOOKS.md: 60% overlap (protocol documented twice)
   - Action: Add cross-references, reduce to quick-ref format (not full merge)

3. **Config dead fields (~10%):**
   - `integrations.superpowers.*` (tdd_enforcement, plan_execution) — no grep matches
   - `integrations.claude_flow.*` (swarm_topology, consensus) — no grep matches
   - Token threshold duplication (3 places define budget/limits)
   - Action: Verify usage with git grep, remove if unused

4. **Memory file duplication (15-20%):**
   - learnings.md ↔ decisions.md: 15% overlap (ADR summaries appear in both)
   - issues.md ↔ learnings.md: 10% overlap (resolved issues documented twice)
   - Size after recent rotation: learnings 39KB, decisions 43KB, issues 20KB (healthy)
   - Action: Deduplicate ADR summaries (keep in decisions.md only)

**Quick Win Recommendations (7-11h total, high impact):**

| Priority | Action                                                                     | Effort | Savings                    |
| -------- | -------------------------------------------------------------------------- | ------ | -------------------------- |
| **P1**   | Consolidate 3 agent schemas via $ref                                       | 3-4h   | 207 lines (37% reduction)  |
| **P1**   | Archive 10 unused schemas                                                  | 1-2h   | 37% schema count reduction |
| **P1**   | Wire 6 DOCS ONLY schemas                                                   | 2-3h   | 22% clarity improvement    |
| **P1**   | Cross-reference rules (testing ↔ git-workflow, hooks → @ENFORCEMENT_HOOKS) | 1h     | 15% size reduction         |
| **P1**   | Remove dead config fields                                                  | 30min  | 10% config reduction       |

**Complexity Ratings (by file):**

- config.yaml: ⭐⭐⭐⭐⭐ Excellent (low complexity, well-structured)
- agent schemas: ⭐⭐⭐ Good (post-consolidation: ⭐⭐⭐⭐)
- rules: ⭐⭐⭐⭐ Very Good (post-xref: ⭐⭐⭐⭐⭐)
- memory files: ⭐⭐⭐⭐ Very Good (healthy sizes post-rotation)

**Cross-Reference:**

- Full report: `.claude/context/reports/architecture/batch1-complexity-analysis-2026-02-09.md`
- Schema catalog: `.claude/context/artifacts/catalogs/schema-catalog.md`

**Memory Takeaway:** Foundation layer has 25-30% duplication but is well-structured. Quick wins available via schema consolidation (37% reduction), schema archival (37% count reduction), and rule cross-referencing (15% size reduction). Total effort: 7-11 hours for high-impact improvements.

## 2026-02-09: Schema Modernization - P0 Fixes Complete (Task #1)

**Pattern:** Systematic schema repair following security-first approach

**Key Fixes:**

1. **agent-config.schema.json missing `model` field (CRITICAL):**
   - Schema had `additionalProperties: false` but actual config data uses `model` field on every agent
   - Added `model: { type: "string" }` property to schema
   - Validation now matches actual data structure

2. **Security-critical schemas lack property injection defense (CRITICAL):**
   - 4 schemas (agent-definition, skill-definition, hook-definition, workflow-definition) missing `unevaluatedProperties: false`
   - All use draft-2020-12 so used `unevaluatedProperties` not `additionalProperties`
   - Added to root objects and nested objects to prevent property injection
   - skill-definition.schema.json had explicit `"additionalProperties": true` (line 97) - removed this permissiveness

3. **Naming inconsistencies - underscore schemas (CRITICAL):**
   - Renamed 6 schemas using `git mv` to preserve history:
     - test_plan.schema.json → test-plan.schema.json
     - product_requirements.schema.json → product-requirements.schema.json
     - project_brief.schema.json → project-brief.schema.json
     - system_architecture.schema.json → system-architecture.schema.json
     - artifact_manifest.schema.json → artifact-manifest.schema.json
     - ux_spec.schema.json → ux-spec.schema.json
   - Updated all references in:
     - schema-catalog.md (6 section headers + 6 path entries + removed "documented naming inconsistency" notes)
     - schemas/README.md (4 category lists + naming exceptions section)
   - All schemas now follow standard `{name}.schema.json` pattern

4. **agent-spawn-params.json missing .schema suffix:**
   - File does not exist (verified via ls) - likely already renamed or never created
   - Removed from documentation inconsistencies list

**Impact:**

- Security: Property injection defense now active on 4 security-critical schemas
- Validation: agent-config.schema.json now validates actual data structure
- Consistency: All 27 active schemas use hyphenated names
- Discoverability: Removed confusing "naming inconsistency" notes from docs

**Cross-Reference:**

- issues.md: SEC-FND-001 (Schema Permissiveness - addressed 4/6 schemas)
- Schema catalog: `.claude/context/artifacts/catalogs/schema-catalog.md`
- Task #1: Schemas Modernization

**Memory Takeaway:** Schema validation isn't just documentation - it's a security boundary. Missing `unevaluatedProperties: false` enables property injection attacks that bypass downstream validation. Always add property constraints to security-critical schemas.

## 2026-02-09: Schema Security Hardening - Remaining Bounds (Task #1 Continuation)

**Pattern:** Systematic addition of maxLength and maxItems constraints prevents DoS via memory exhaustion

**Work Completed:**

1. **Property injection protection (11 schemas):**
   - Added `additionalProperties: false` to all draft-07 schemas missing it
   - plan, product-requirements, project-brief, system-architecture, artifact-manifest, test-results, test-plan, tool-manifest, ux-spec (9 total)
   - Note: 4 draft-2020-12 schemas already had `unevaluatedProperties: false` from P0 work

2. **Hook enum fix:**
   - Added `"Stop"` to hook-definition.schema.json type enum (aligns with agent-definition usage)

3. **Required fields:**
   - implementation-plan.schema.json: Added `required: ["feature", "status"]`

4. **Complete maxLength/maxItems coverage (3 schemas):**
   - hook-definition.schema.json: All strings and arrays bounded
   - agent-definition.schema.json: All strings and arrays bounded
   - plan.schema.json: All strings and arrays bounded + all nested objects have `additionalProperties: false`

**Key Implementation Patterns:**

1. **Nested object protection (critical):**

   ```json
   "timeline": {
     "type": "object",
     "additionalProperties": false,  // <-- Must add to nested objects too
     "properties": {
       "milestones": {
         "type": "array",
         "items": {
           "type": "object",
           "additionalProperties": false",  // <-- And to items in arrays
           "properties": { ... }
         }
       }
     }
   }
   ```

2. **oneOf with bounds (both branches):**

   ```json
   "tools": {
     "oneOf": [
       {
         "type": "array",
         "items": { "type": "string" },
         "maxItems": 100  // <-- Bound array branch
       },
       {
         "type": "string",
         "maxLength": 1000,  // <-- Bound string branch
         "description": "Comma-separated list"
       }
     ]
   }
   ```

3. **Recommended maxLength values:**
   - Names/IDs: 100-200
   - Short descriptions: 500
   - Long descriptions: 2000
   - Content bodies: 10000-50000
   - File paths: 500
   - Versions: 50
   - Error messages: 5000
   - Stack traces: 50000

4. **Recommended maxItems values:**
   - Tags/labels: 50
   - Tools/skills: 100
   - Requirements/criteria: 200
   - Components/files: 500
   - Test results: 10000
   - History: 1000

**Remaining Work:** ~75% of maxLength/maxItems bounds still needed across 13 schemas. See progress report at `.claude/context/reports/security/schema-hardening-progress-2026-02-09.md`.

**Cross-Reference:**

- Security audit: `.claude/context/reports/security/schema-security-audit-2026-02-09.md`
- Progress report: `.claude/context/reports/security/schema-hardening-progress-2026-02-09.md`
- Schema catalog: `.claude/context/artifacts/catalogs/schema-catalog.md`

**Memory Takeaway:** Schema security hardening requires systematic field-by-field review. Three levels of protection: (1) `additionalProperties: false` on ALL objects (root + nested), (2) `maxLength` on ALL strings, (3) `maxItems` on ALL arrays. Draft-07 uses `additionalProperties`, draft-2020-12 uses `unevaluatedProperties`. Nested objects are the most commonly forgotten protection point.
