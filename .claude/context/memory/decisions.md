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
