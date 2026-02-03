# Memory System Enhancement Plan (OpenViking-Inspired)

Implement all OpenViking-inspired memory enhancements. All changes are self-contained (no Docker or cloud).

---

## Plan Review & Implementation Outline (with gates and tests)

### Phase 1 — Low effort, high value (no new files)

**1.1 Category-scoped dedup**

- **Edit:** [.claude/lib/memory/memory-deduplicator.cjs](.claude/lib/memory/memory-deduplicator.cjs) — Add `category` to `searchMemory` options when candidate category is valid.
- **Tests:** [tests/lib/memory/memory-deduplicator.test.cjs](tests/lib/memory/memory-deduplicator.test.cjs) (add case for category filter).
- **Gate:** format → lint → targeted test.

**1.2 Extraction stats (created/updated/merged/skippedByDedup)**

- **Edit:** [.claude/lib/memory/memory-extraction-writer.cjs](.claude/lib/memory/memory-extraction-writer.cjs) — Add counters and increment per decision.
- **Tests:** [tests/lib/memory/memory-extraction-writer.test.cjs](tests/lib/memory/memory-extraction-writer.test.cjs) (assert counters).
- **Gate:** format → lint → targeted test.

**1.3 Structured summary prompt “Context References” wording**

- **Edit:** [.claude/lib/memory/prompts/session-structured-summary.cjs](.claude/lib/memory/prompts/session-structured-summary.cjs).
- **Tests:** [tests/lib/memory/session-summary.test.cjs](tests/lib/memory/session-summary.test.cjs) (assert prompt contains new wording).
- **Gate:** format → lint → targeted test.

**1.4 Intent analysis prompt example output alignment**

- **Edit:** [.claude/lib/memory/prompts/intent-analysis.cjs](.claude/lib/memory/prompts/intent-analysis.cjs) — Ensure example includes `category` for memory queries.
- **Tests:** [tests/lib/memory/intent-analyzer.test.cjs](tests/lib/memory/intent-analyzer.test.cjs) (assert parse includes category).
- **Gate:** format → lint → targeted test.

### Phase 2 — New module + integration

**2.1 Session context for search helper**

- **Add:** [.claude/lib/memory/session-context-for-search.cjs](.claude/lib/memory/session-context-for-search.cjs).
- **Optional integration:** [.claude/hooks/routing/spawn-prompt-assembler.cjs](.claude/hooks/routing/spawn-prompt-assembler.cjs) (intent analysis path).
- **Tests:** [tests/lib/memory/session-context-for-search.test.cjs](tests/lib/memory/session-context-for-search.test.cjs).
- **Gate:** format → lint → targeted test.

**2.2 Bidirectional memory–tool relations**

- **Edit:** [.claude/lib/memory/memory-entity-links.cjs](.claude/lib/memory/memory-entity-links.cjs) (add reverse links + `getMemoriesForTool`).
- **Tests:** Extend [tests/lib/memory/memory-entity-links.test.cjs](tests/lib/memory/memory-entity-links.test.cjs).
- **Gate:** format → lint → targeted test.

### Phase 3 — Update/merge overwrite + optional archive layout

**3.1 UPDATE/MERGE overwrite**

- **Edit:** [.claude/lib/memory/memory-extraction-writer.cjs](.claude/lib/memory/memory-extraction-writer.cjs) — Use `decisionResult.similarMemories` to overwrite existing file and re-index by id.
- **Tests:** New unit test covering update/merge path (in memory-extraction-writer.test.cjs).
- **Gate:** format → lint → targeted test.

**3.2 Archive layout**

- **Edit:** [.claude/lib/memory/memory-tiers.cjs](.claude/lib/memory/memory-tiers.cjs) — Add archive dir + `.overview.md` and `.abstract.md`.
- **Edit:** [.claude/lib/memory/session-context-for-search.cjs](.claude/lib/memory/session-context-for-search.cjs) (prefer archive overviews).
- **Tests:** New archive layout test.
- **Gate:** format → lint → targeted test.

### Phase 4 — Prompt alignment

**4.1 Align memory extraction prompt with OpenViking YAML**

- **Edit:** [.claude/lib/memory/prompts/memory-extraction.cjs](.claude/lib/memory/prompts/memory-extraction.cjs).
- **Tests:** Update [tests/lib/memory/memory-extractor.test.cjs](tests/lib/memory/memory-extractor.test.cjs) (assert phrases/sections exist).
- **Gate:** format → lint → targeted test.

---

## Lint/format/testing strategy

- **After each phase:** `node scripts/format-tracked.mjs --write <changed files>`, `pnpm lint`, then the phase’s targeted tests.
- **After major phase boundaries (end of Phase 2 and Phase 3):** `pnpm test:framework`.

---

## File and dependency summary

| #   | Action        | Source / destination                                                 |
| --- | ------------- | -------------------------------------------------------------------- |
| 1.1 | Edit          | memory-deduplicator.cjs → pass `category` into searchMemory          |
| 1.2 | Edit          | memory-extraction-writer.cjs → created/updated/merged/skippedByDedup |
| 1.3 | Edit          | prompts/session-structured-summary.cjs → Context References wording  |
| 1.4 | Edit          | prompts/intent-analysis.cjs → example includes category              |
| 2.1 | Create + opt. | session-context-for-search.cjs, spawn-prompt-assembler.cjs           |
| 2.2 | Edit          | memory-entity-links.cjs → reverse links + getMemoriesForTool         |
| 3.1 | Edit          | memory-extraction-writer.cjs → update/merge overwrite + reindex      |
| 3.2 | Edit          | memory-tiers.cjs, session-context-for-search.cjs → archive layout    |
| 4.1 | Edit          | prompts/memory-extraction.cjs → align with OpenViking YAML           |

**Dependencies:** No new npm packages. Existing: path, fs, node:sqlite, memory-tiers, session-summary, project-root, atomic-write, lancedb-client, memory-manager, init-memory-db.
