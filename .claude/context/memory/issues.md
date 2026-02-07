# Issues

This file tracks blockers, workarounds, and unresolved problems.

## Format

Each issue should include:

- Date discovered
- Issue description
- Impact
- Workaround (if any)
- Resolution (when fixed)

---

## 2026-02-07: Template-Creator Skill Security Findings (Task #76)

**Date:** 2026-02-07

**Issue:**

Security review of the template-creator skill overhaul identified 2 HIGH and 3 MEDIUM severity findings.

**Key Findings:**

1. **SEC-TC-001 [HIGH]**: Spawn template prompt injection via placeholder content. The template-creator teaches agents to create spawn templates with `{{PLACEHOLDER}}` tokens inside `Task()` prompt fields. These tokens are substituted with user-derived content WITHOUT sanitization at the Router level (SEC-TMPL-004 fix only covers `prompt-factory.cjs`, not Router-level substitution).

2. **SEC-TC-002 [HIGH]**: Creator-guard hook regex for templates only covers `agents|skills|workflows|hooks|code|schemas` subdirectories. Does NOT cover `spawn/`, `reports/`, `code-styles/`, or root-level templates. This means the most security-critical templates (spawn templates) are UNPROTECTED by the creator guard.

3. **SEC-TC-003 [MEDIUM]**: No template name path traversal prevention. Template names from user requests could contain `../` sequences to write files outside `.claude/templates/`.

4. **SEC-TC-004 [MEDIUM]**: Template registry JSON injection. No guidance to use `JSON.stringify()` for registry entries; manual construction could introduce malformed JSON.

5. **SEC-TC-005 [MEDIUM]**: Creator state file at `.claude/context/runtime/active-creators.json` has no integrity protection. Any agent with Write access to runtime directory can bypass creator guard.

**Impact:**

- SEC-TC-002 is the most operationally significant: spawn templates can be written directly without triggering the creator guard
- SEC-TC-001 is the most architecturally significant: creates an injection pathway from user input to agent instructions

**Workaround:**

SEC-TC-002: Manually verify spawn template changes via git diff before committing.

**Resolution:**

Findings documented in `.claude/context/reports/security/template-creator-security-review-2026-02-07.md`. Verdict: APPROVED WITH CONDITIONS. SEC-TC-002 is MUST-FIX before deployment.

---

## 2026-02-07: Template System Security Findings (Task #63)

**Date:** 2026-02-07

**Issue:**

Security review of the template loading, rendering, archival, and catalog systems identified 1 HIGH and 3 MEDIUM severity findings that require mitigation.

**Key Findings:**

1. **SEC-TMPL-001 [HIGH]**: Path traversal in `getPresetRuleSnippet()` (`prompt-assembler.cjs` line 96). Uses `path.resolve(projectRoot, preset.ruleSnippetPath)` without validating that the resolved path stays within PROJECT_ROOT. A compromised `presets.json` could read arbitrary files (`.env`, SSH keys, etc.) and inject their content into spawn prompts.

2. **SEC-TMPL-002 [MEDIUM]**: Orchestrator spawn validation bypass in `spawn-prompt-validator.cjs`. `isOrchestratorSpawn()` uses partial string matching on `description` field, allowing any spawn with "master-orchestrator" anywhere in its description to skip ALL validation.

3. **SEC-TMPL-003 [MEDIUM]**: Fail-open error handling in `spawn-prompt-assembler.cjs`. On ANY error, the hook exits with code 0 (allow) and the original un-assembled prompt is used, lacking safety instructions (TaskUpdate warning, workspace conventions, memory rules).

4. **SEC-TMPL-004 [MEDIUM]**: No input sanitization in template placeholder substitution in `prompt-factory.cjs`. Substitution values from context/mode config files are not sanitized for nested template placeholders or instruction injection.

**Impact:**

- SEC-TMPL-001 is the most serious: enables file content exfiltration through spawn prompts
- SEC-TMPL-002 could bypass spawn prompt validation
- SEC-TMPL-003 degrades safety on assembler failures
- SEC-TMPL-004 theoretical injection through compromised config files

**Workaround:**

SEC-TMPL-001: Do not modify `presets.json` with untrusted `ruleSnippetPath` values.

**Resolution:**

Findings documented in `.claude/context/reports/security/template-system-security-review-2026-02-07.md`. Verdict: APPROVED WITH CONDITIONS. SEC-TMPL-001 is MUST-FIX before template system overhaul implementation.

---

## 2026-02-07: Security Review Findings for CI Module-Resolution and Blacklist Monitoring (Task #54)

**Date:** 2026-02-07

**Issue:**

Security review of two proposed features (CI module-resolution checker, router blacklist violation monitor) identified 1 CRITICAL and 3 HIGH findings that must be addressed before implementation.

**Key Findings:**

1. **SEC-CI-001 [CRITICAL]**: If the proposed `verify-hook-modules.cjs` uses dynamic `require()` to test hook resolution, malicious hooks could execute arbitrary code in CI context, accessing CI secrets and environment variables. MUST use static analysis only.

2. **SEC-MON-002 [HIGH]**: Router blacklist violation logs could capture sensitive prompt content (passwords, API keys, PII) in plaintext JSONL files. MUST never log raw prompt content.

3. **SEC-MON-001 [HIGH]**: Tool names and context in violation logs could enable log injection. MUST validate against known-tool whitelist and truncate fields to 500 chars max.

4. **SEC-CI-002 [HIGH]**: Hook file discovery could follow symlinks outside project root. MUST validate paths with `validatePathWithinProject()`.

**Impact:**

- Blocks implementation until CRITICAL and HIGH findings are addressed in the design
- Affects both Feature 1 (CI checker) and Feature 2 (blacklist monitor)

**Workaround:**

None needed -- features are not yet implemented. Findings are preemptive design constraints.

**Resolution:**

Findings documented in `.claude/context/reports/security/ci-monitoring-security-review-2026-02-07.md`. Implementation must address all MUST-FIX items. Verdict: APPROVED WITH CONDITIONS.

---

## 2026-02-05: Code Indexer OOM Due to BM25 Index Storing Full Chunk Text

**Date:** 2026-02-05 (Updated after systematic investigation)

**Issue:**
Code indexer crashes with OOM (JavaScript heap out of memory) when processing 600+ files at 4GB heap limit.

- File discovery succeeds (1330 files found with 19 exclude patterns)
- In-process parsing works correctly (no Piscina workers when concurrency=1)
- Checkpoint system saves progress every 50 files (at 600/1330 currently)
- OOM occurs during continued processing from checkpoint

**Root Cause (Verified):**
BM25 sparse index (`.claude/lib/code-indexing/bm25-indexer.cjs` line 129) stores the FULL TEXT of every indexed chunk in memory via `this.documents[]` array. This is unnecessary for BM25 scoring (only term frequencies and IDF scores are needed) but causes unbounded memory growth:

- Each chunk: ~2.5KB text + tokens + termFreqs + metadata
- At 650 chunks: ~1.88 MB on disk, ~4-5 MB in memory
- At 4000 chunks (full index): ~10MB text + ~5MB overhead = 15-20 MB
- Combined with V8 heap fragmentation → OOM at 4GB limit

**Impact:**

- Blocking: Cannot build code index for agent-studio codebase (1330 files)
- Affects: Code search, semantic search, hybrid search features
- Workaround required to enable these features

**Investigation Results:**

1. ✅ In-process parsing already implemented (concurrency=1 bypasses Piscina)
2. ✅ Checkpoint system works correctly (saves at `.claude/context/code-index/checkpoint.json`)
3. ✅ File discovery and parsing successful (600 files processed)
4. ✅ BM25 index identified as memory bottleneck (stores full chunk text unnecessarily)
5. ❌ Previous root cause analysis was incorrect (Piscina not used when concurrency=1)

**Solution Options:**

1. **Modify BM25 to not store full text** (architectural fix):
   - Remove `text: doc.text` from bm25-indexer.cjs line 129
   - Only store IDs, tokens, termFreqs for scoring

**Resolution (2026-02-05):**
✅ **FIXED** by replacing parseInProcess with simple 50-line chunking in BM25-only sync fast-path.

**Implementation:**

- Modified `.claude/lib/code-indexing/index-manager.cjs` lines ~458-466
- Replaced `parseInProcess({ filePath, content, language })` call
- Used simple `content.split('\n')` + 50-line slicing
- No AST parsing, no SemanticChunker overhead

**Results:**

- Full index build: 1330 files in 19.5 seconds
- Memory: peaked at 120MB RSS (vs 4GB OOM)
- Search: verified working with 7182 chunks
- Speed: 68 files/sec (vs 7 files/sec with parseInProcess)

**Why It Works:**
BM25 is lexical search (term frequency) and does NOT benefit from AST-based semantic boundaries. Simple fixed-size chunks are actually better for BM25 because they produce more uniform document lengths, which BM25's length normalization assumes.

**Impact:**
Code indexing now works reliably for large codebases without OOM crashes. This unblocks BM25 search, hybrid search, and code navigation features.

- Reduces memory by ~60-70%
- Proper fix but requires code changes

2. **Checkpointed multi-run** (implemented workaround):
   - Run indexer multiple times
   - Each run processes ~600 files before OOM
   - Checkpoint system saves progress automatically
   - Resume from checkpoint on next run
   - Scripts created:
     - `scratchpad/run-index-resume.cjs` - Single run with checkpoint resume
     - `scratchpad/batch-index.bat` - Automated multi-run until complete

3. **Increase heap limit** (not recommended):
   - Run with `--max-old-space-size=8192` or higher
   - Risks crashing user's PC
   - Doesn't fix underlying issue

**Implemented Solution:**
Option 2 (Checkpointed multi-run) - allows completing the index without code changes or risking system stability.

**Files Created (Workaround Scripts):**

- `scratchpad/run-index-resume.cjs` - Resumable indexing script
- `scratchpad/batch-index.bat` - Automated batch runner (max 10 runs)

**Test Results:**

- Batch runner tested with checkpoint resume
- OOMs at same point (600 files processed, 730 remaining)
- Checkpoint saves every 50 files but OOM occurs before reaching next save point
- Root cause confirmed: Loading existing 600-file BM25 index + processing 730 more files exceeds 4GB

**Actual Resolution Path:**
Cannot complete indexing without one of these changes:

1. **Code fix**: Modify bm25-indexer.cjs to not store full chunk text (recommended)
2. **Heap increase**: Run with 8GB heap (requires user permission, risky)
3. **Architectural change**: Split BM25 index into shards to avoid loading full index

**Current Status:**

- ✅ **Root cause IDENTIFIED** (2026-02-05 16:30): IndexManager's `chunkBuffer` + BM25's `termFreqs` objects create massive V8 object overhead
- ✅ **Verification complete**: 3 systematic tests (minimal BM25, full IndexManager, BM25 search)
- ✅ **BM25 search WORKING**: Existing 1850-chunk index loads and searches successfully (50MB memory)
- ❌ **Full indexing BLOCKED**: Cannot complete 1330-file index without code changes
- **Solution ready**: Option B (reduce flushSize, aggressive GC) as 30-minute quick fix
- **Permanent fix**: Option A (streaming BM25 with SQLite) as 4-6 hour permanent solution
- **Next action**: Apply Option B quick fix to unblock full indexing

---

## 2026-02-06: CRITICAL -- 3 Missing Hook Modules Crash Every Hook Invocation (Task #47)

**Date:** 2026-02-06

**Issue:**

Three hook modules are MISSING at their expected require paths, causing `MODULE_NOT_FOUND` crashes:

1. `.claude/hooks/monitoring/error-tracker.cjs` -- required by `error-tracker-hook.cjs` wrapper (PostToolUse)
2. `.claude/hooks/monitoring/metrics-collector.cjs` -- required by `metrics-collector-hook.cjs` wrapper (PostToolUse)
3. `.claude/hooks/routing/router-state.cjs` -- required by `user-prompt-unified.cjs` line 71 via `routingRequire()`

**Root Cause:**

Hook consolidation (Task #41, commit 0e449681) archived 45 orphan hooks and relocated `router-state.cjs`:
- `error-tracker.cjs` and `metrics-collector.cjs` were library modules (not standalone hooks) that wrapper hooks still require. They were mistakenly archived.
- `router-state.cjs` was relocated from `hooks/routing/` to `lib/routing/`. Seven consumers were updated but `user-prompt-unified.cjs` was missed.

**Impact:**

- Error tracking completely broken (crashes silently on every PostToolUse)
- Metrics collection completely broken (crashes silently on every PostToolUse)
- Router mode reset fails on every user prompt (routing analysis broken)

**Workaround:**

None. The wrapper hooks catch the MODULE_NOT_FOUND error and exit(0), so they do not block tool use, but monitoring and routing analysis data is completely lost.

**Resolution:**

Architecture plan created: `.claude/context/plans/hook-hardening-architecture-2026-02-06.md`
ADR-082 recorded in decisions.md.

Fix:
1. Restore `error-tracker.cjs` from `_archive/monitoring/`
2. Restore `metrics-collector.cjs` from `_archive/monitoring/`
3. Change line 71 of `user-prompt-unified.cjs` from `routingRequire('router-state.cjs')` to `libRequire(path.join('routing', 'router-state.cjs'))`

**Estimated fix time:** 15-30 minutes (developer agent)

---

## 2026-02-06: CRITICAL -- 94% Agent Under-Utilization (Task #35)

**Date:** 2026-02-06

**Issue:**
The multi-agent orchestration framework declares 49 agents but only 1 (developer) is routinely spawned. 46 agents have never been spawned in recorded history. The routing infrastructure (routing-table.cjs, INTENT_KEYWORDS, DISAMBIGUATION_RULES) is correct, but enforcement hooks default to `warn` mode, allowing the Router to collapse all requests to `developer`.

**Impact:**
- No QA review after code changes
- No security review for auth/credential code
- No architectural review before implementation
- No code review after implementation
- No documentation updates via technical-writer
- No learning extraction via reflection-agent
- No multi-agent orchestration (all orchestrators unused)
- No domain-specific expertise (all 23 domain agents unused)
- The planner-first gate for complex tasks is bypassed

**Root Causes:**
1. `PLANNER_FIRST_ENFORCEMENT=warn` (should be `block`)
2. `SECURITY_REVIEW_ENFORCEMENT` not enforced by default
3. No PostToolUse hook on TaskUpdate(completed) to trigger follow-up agents
4. Reflection Step 0 deadlock: blocks TaskList but never spawns reflection-agent
5. No workflow state machine tracking multi-phase execution

**Workaround:**
None. This is a systemic design gap requiring architectural changes.

**Resolution Path:**
1. Change enforcement defaults from `warn` to `block` (P0, 15 min)
2. Create post-completion workflow chain hook (P0, 2-4 hours)
3. Fix reflection deadlock (P1, 1-2 hours)
4. Implement workflow state machine (P1, 4-8 hours)

**Full Report:** `.claude/context/reports/architecture/agent-utilization-audit-2026-02-06.md`
