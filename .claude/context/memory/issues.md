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

## 2026-02-07: CRITICAL -- Windows Reserved Filename `nul` in context/ (Pipeline #12)

**Date:** 2026-02-07

**Impact:** CRITICAL -- Violates workspace-conventions.md forbidden names, may cause NTFS issues

**Description:**

A file named `nul` (0 bytes) exists at `.claude/context/nul`. This is a Windows reserved device name. Creating or manipulating this file on Windows NTFS can cause unexpected behavior. The file was created 2026-02-07 12:55 (unknown source). workspace-conventions.md explicitly forbids creating files named `nul`, `con`, `prn`, `aux`, `com1`-`com9`, `lpt1`-`lpt9`.

**Workaround:** None needed -- file is 0 bytes and has no consumers.

**Resolution:** Delete via `git rm .claude/context/nul`. See ADR-094 P1-001.

---

## 2026-02-07: 7 Orphaned Hash-Named Plan Directories (Pipeline #12)

**Date:** 2026-02-07

**Impact:** HIGH -- 7 directories + files in plans/ with 0 consumers, violating naming conventions

**Description:**

The QA workflow skill creates working directories in `.claude/context/plans/` with random hash suffixes (e.g., `impl-plan-kHwypz/`, `qa-report-c05Ene/`, `test-plan-DCyOsO/`). These are never cleaned up after the QA workflow completes. All 7 directories have 0 consumers (confirmed by grep across entire `.claude/`). They violate workspace-conventions.md naming rules (not kebab-case, no date suffix, random hash identifiers).

**Orphaned directories:**
1. `plans/impl-plan-kHwypz/`
2. `plans/progress-WuHjJL/`
3. `plans/qa-report-c05Ene/`
4. `plans/qa-report-eiwkdm/`
5. `plans/qa-report-EjOE7P/`
6. `plans/test-plan-DCyOsO/`
7. `plans/test-plan-zHYXQi/`

**Workaround:** Delete manually.

**Resolution:**
1. Delete 7 orphaned directories (immediate, ADR-094 P1-002)
2. Add cleanup logic to QA workflow skill (ADR-094 P3-011, prevents recurrence)

---

## 2026-02-07: data/ Directory Undocumented in Governance (Pipeline #12)

**Date:** 2026-02-07

**Impact:** MEDIUM -- Code-indexing system works but governance does not cover the data/ directory

**Description:**

The `.claude/context/data/` directory contains 37 files (LanceDB vector store, SQLite memory database, BM25 search index). It is actively wired through `.claude/lib/code-indexing/` (index-manager.cjs, lancedb-client.cjs, bm25-indexer.cjs). However, neither FILE_PLACEMENT_RULES.md nor workspace-conventions.md document this directory. Agents cannot know the correct placement rules for data files.

**Workaround:** None needed for functionality (the code-indexing system works). But new data files may be placed inconsistently.

**Resolution:** Add `data/` to FILE_PLACEMENT_RULES.md and workspace-conventions.md with rules for LanceDB, SQLite, and index files. See ADR-094 P1-003.

---

## 2026-02-07: ADR-081 Consolidation Incomplete -- 15 Files in Old Locations (Pipeline #12)

**Date:** 2026-02-07

**Impact:** HIGH -- Duplicate report locations cause confusion for agents

**Description:**

ADR-081 consolidated reports from `artifacts/reports/` to `reports/{domain}/`. However, 15 files remain in the old artifact locations:
- `artifacts/reflections/` (5 files) should be in `reports/reflections/`
- `artifacts/security-reviews/` (9 files) should be in `reports/security/`
- `artifacts/qa-reports/` (1 file) should be in `reports/qa/`

At least one file (`artifacts/reports/model-selection-drift-2026-02-07.json`) was created AFTER the ADR-081 consolidation, indicating agents are still writing to old paths.

**Workaround:** None -- agents reading reports may miss files in the old location.

**Resolution:** Move all 16 files to canonical `reports/{domain}/` locations. See ADR-094 P2-001 through P2-004.

---

## 2026-02-07: 10 Artifact Subdirectories Not in FILE_PLACEMENT_RULES (Pipeline #12)

**Date:** 2026-02-07

**Impact:** MEDIUM -- Governance gap: 10 directories exist without placement rules

**Description:**

The following artifact subdirectories are NOT documented in FILE_PLACEMENT_RULES.md:
`audit-logs/`, `audits/`, `code-styleguides/`, `deployment-docs/`, `error-reports/`, `error-summaries/`, `qa-reports/`, `reflections/`, `risk-assessments/`, `security-reviews/`, `tasks/`

Of these, `error-reports/` and `error-summaries/` are actively wired (written by error-writer.cjs and error-summary-extractor). The rest have 0-4 consumers and are candidates for archiving.

**Workaround:** None -- agents creating new files in these directories are operating outside governance.

**Resolution:** Either document in FILE_PLACEMENT_RULES.md (for actively wired dirs) or archive (for dead dirs). See ADR-094 P2-005.

---

## 2026-02-07: FILE_PLACEMENT_RULES.md Stale Paths Conflict with workspace-conventions.md (Pipeline #9)

**Date:** 2026-02-07

**Impact:** HIGH -- Agents reading FILE_PLACEMENT_RULES.md will write plans and reports to incorrect locations.

**Description:**

Two authoritative documents disagree on artifact paths:

| Artifact | `workspace-conventions.md` (correct) | `FILE_PLACEMENT_RULES.md` (stale) |
|----------|--------------------------------------|-----------------------------------|
| Plans | `.claude/context/plans/` | `.claude/context/artifacts/plans/` |
| Reports | `.claude/context/reports/{domain}/` | `.claude/context/artifacts/reports/` |

`workspace-conventions.md` was established by ADR-078 (2026-02-06) and is the canonical source. ADR-081 consolidated reports to `context/reports/{domain}/`. `FILE_PLACEMENT_RULES.md` (v2.0, last updated 2026-01-31) predates both ADRs and was not updated.

The `file-placement-guard.cjs` hook enforces paths from `FILE_PLACEMENT_RULES.md` (line 545-546 reference `context/artifacts/reports/` and `context/plans/`). This means the hook may incorrectly reject writes to the canonical paths.

**Workaround:** None needed for rules files themselves (auto-loaded). But agents following FILE_PLACEMENT_RULES.md will write to stale paths.

**Resolution:** Update FILE_PLACEMENT_RULES.md to match workspace-conventions.md paths. Update file-placement-guard.cjs if it references stale paths. See ADR-091 Phase A.

---

## 2026-02-07: rule-index.json Missing workspace-conventions.md (Pipeline #9)

**Date:** 2026-02-07

**Impact:** MEDIUM -- Programmatic rule discovery misses the most-referenced rule file.

**Description:**

`rule-index.json` at `.claude/context/config/rule-index.json` has `total_rules: 8` but 9 rule files exist in `.claude/rules/`. The missing entry is `workspace-conventions.md` -- which is referenced by 46+ agent definitions, all 6 creator skills, and the universal spawn template.

Any system that discovers rules via rule-index.json (e.g., rule-selector skill, project-analyzer) will not see workspace-conventions. The `rule-index-cache.json` file also lacks this entry.

**Workaround:** Systems that glob `.claude/rules/*.md` directly are unaffected.

**Resolution:** Add workspace-conventions.md entry to rule-index.json and rule-index-cache.json. See ADR-091 Phase A, FIX-1.

---

## 2026-02-07: validate:full CI Chain Broken (Pipeline #8, ADR-090)

**Date:** 2026-02-07

**Impact:** CRITICAL -- `pnpm validate:full` crashes at step 5 (`pnpm validate:index`)

**Description:**
`scripts/validation/validate-index.mjs` line 19 imports from `../../.claude/tools/context/context-path-resolver.mjs` -- a path that no longer exists. The module was moved to `../../.claude/lib/utils/context-path-resolver.mjs` during Phase C of the Tools Overhaul (ADR-089, Task #95, commit 789f849c). This script was missed in the consumer update pass.

The `validate:full` npm script chains multiple validators, and `pnpm validate:index` is step 5 in that chain. When it fails with MODULE_NOT_FOUND, the chain aborts.

**Workaround:** Run individual validators manually (skip `validate:index`), or use `pnpm validate:index-paths` instead (which uses the correct import path and is a superset of validate-index.mjs functionality).

**Resolution:** Merge validate-index.mjs into validate-rule-index-paths.mjs and update the `validate:index` npm script to point to the latter. See ADR-090 Phase A.

---

## 2026-02-07: Tools System Security Findings (Task #92)

**Date:** 2026-02-07

**Issue:**

Security review of the `.claude/tools/` system (77 executable files, 15,203 LOC) identified 1 HIGH and 3 MEDIUM severity findings requiring mitigation.

**Key Findings:**

1. **SEC-TOOL-001 [HIGH]**: Arbitrary code execution in `decision-handler.mjs` via `new Function()` expression evaluator. User-controlled workflow conditions can inject arbitrary JavaScript code.

2. **SEC-TOOL-002 [MEDIUM]**: Command injection risk in `eslint-batch-fix.cjs` via `execSync` with string interpolation. Current instance is low-risk but pattern is dangerous.

3. **SEC-TOOL-003 [MEDIUM]**: Path traversal in `document-query.cjs` allows reading arbitrary files outside PROJECT_ROOT via `../../` sequences. High exploitability.

4. **SEC-TOOL-004 [MEDIUM]**: GitHub token exposure in `github/executor.py` passes credentials as Docker environment variables (visible in process list and logs).

**Additional Findings (LOW):**
- SEC-TOOL-005: Secrets logged by security-lint.cjs
- SEC-TOOL-006: No confirmation prompts for file deletion
- SEC-TOOL-007: Unbounded resource consumption in project analyzer
- SEC-TOOL-008: Missing timeouts in MCP analyzer

**Impact:**

- SEC-TOOL-001 blocks workflow execution feature (arbitrary code execution)
- SEC-TOOL-003 blocks document-query with untrusted paths (information disclosure)
- Other findings are medium/low priority improvements

**Workaround:**

SEC-TOOL-001: Do not enable workflow execution until fixed.
SEC-TOOL-003: Only use document-query.cjs with trusted paths.

**Resolution:**

Findings documented in `.claude/context/reports/security/tools-system-security-review-2026-02-07.md`. Verdict: APPROVED WITH CONDITIONS. SEC-TOOL-001 and SEC-TOOL-003 are MUST-FIX before enabling respective features.

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

## 2026-02-07: No Automated Cache Staleness Validation (Pipeline #10)

**Date:** 2026-02-07

**Impact:** MEDIUM -- Aggregate metadata (totalAgents, total_rules) can silently become stale without detection

**Description:**

Config files with aggregate counts (tool-manifest.json, rule-index-cache.json) derive their values from dynamic sources:
- `totalAgents` in tool-manifest.json should equal agent count in agent-registry.json
- `total_rules` in rule-index-cache.json should equal rule files in .claude/rules/

When the source changes (agents added, rules merged), the aggregate can become stale if the regeneration script is not run. Example: tool-manifest.json had `totalAgents: 16` while agent-registry.json documented 49 agents (stale for unknown duration).

No CI validation exists to detect this staleness. The regeneration scripts exist (`pnpm manifest:generate`, `pnpm generate-rule-index`) but are run manually on-demand.

**Workaround:**

Before making source changes (adding agents, merging rules), manually run the regeneration script:
```bash
pnpm manifest:generate
pnpm generate-rule-index
```

**Resolution:**

Add `pnpm validate:config-aggregates` script that validates all aggregate counts match their sources. Include in CI pipeline (GitHub Actions) to catch staleness before merge.

Pattern: Compare aggregate value against actual source count. Fail if mismatch.

**Prevention:**

1. Create `validate-config-aggregates.cjs` that reads each config, checks aggregates against sources, reports mismatches
2. Add to package.json as `validate:config-aggregates` npm script
3. Include in CI pipeline (add to `validate:full` chain)
4. When aggregate becomes stale, CI fails immediately
5. Document in config file headers: "Auto-generated from X. Run `pnpm regenerate:X` if stale."

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

---

## 2026-02-07: Agents System Security Findings (Pipeline #11)

**Date:** 2026-02-07

**Issue:**

Security review of the agents system (49 agents, routing infrastructure, model selection, tool access control) identified 5 HIGH and 3 MEDIUM severity findings requiring remediation before production deployment in security-sensitive environments.

**Key Findings:**

1. **HIGH-001**: Prompt injection via Task() description/prompt (no sanitization)
2. **HIGH-002**: Model downgrade attack via explicit model: parameter (config-model-validator enforcement=warn)
3. **HIGH-003**: Orchestrators bypass routing-guard.cjs enforcement (have Task tool without gates)
4. **HIGH-004**: Agent registry tampering (no integrity check on agent-registry.json)
5. **HIGH-005**: Bash whitelist bypassable via shell encoding ($IFS, backticks, quotes)

**Impact:**

- **HIGH**: Prompt injection can override agent instructions, exfiltrate secrets, bypass security checks
- **HIGH**: Model downgrade reduces security review quality (opus → haiku skips extended thinking)
- **HIGH**: Orchestrators can spawn implementation agents without planner-first or security-review gates
- **HIGH**: Registry tampering enables privilege escalation (modify requiredTools to grant WebSearch)
- **HIGH**: Bash encoding bypasses Router command whitelist

**Workaround:**

- Do NOT deploy in security-sensitive production until P1 findings fixed
- Manually review all orchestrator spawns
- Monitor spawn-log.jsonl for model downgrades
- Validate agent-registry.json integrity before use
- Restrict Router Bash access (consider removing entirely)

**Resolution:**

Findings documented in `.claude/context/reports/security/agents-system-security-review-2026-02-07.md`.

**Remediation Plan**:
- P1 (Security Critical): 11-17 hours (2-3 days) - FIX BEFORE PRODUCTION
- P2 (Defense in Depth): 6-13 hours (1-2 days) - FIX BEFORE WIDER ROLLOUT
- P3 (Hardening): 16-24 hours (2-3 days) - FIX FOR LONG-TERM SECURITY

**Verdict**: APPROVED WITH CONDITIONS

**Next Steps**:
1. Create P1 mitigation tasks (5 HIGH findings)
2. Implement prompt injection detection in routing-guard.cjs
3. Change CONFIG_MODEL_VALIDATOR to block mode
4. Extend routing-guard to orchestrators
5. Add agent-registry.json integrity validation
6. Block shell metacharacters in Bash validation

---

## 2026-02-07: Stale Agent References in Documentation (Task #109)

**Date:** 2026-02-07

**Impact:** MEDIUM -- Auto-loaded rules file contained incorrect agent names causing confusion

**Description:**

The file `.claude/rules/agents.md` (auto-loaded into every conversation's system prompt) contained 3 stale agent name references discovered during Agent System Deep Dive (Pipeline #11):

1. `python-backend-expert` → should be `python-pro`
2. `typescript-expert` → should be `typescript-pro`
3. `database-specialist` → should be `database-architect`

These agent names are outdated references from an earlier iteration. The actual agent registry documents 49 agents with the correct names (python-pro, typescript-pro, database-architect). Because rules/agents.md is auto-loaded, these stale references reach every conversation.

**Workaround:**

None needed for new conversations (Task #109 fixed the source). Agents that read the rules file will see corrected agent names.

**Resolution:**

✅ **FIXED** in Task #109:
1. Updated rules/agents.md with 3 corrected agent names
2. Updated ADR-093 status to "Accepted"
3. Recorded learnings in decisions.md

**Pattern Discovered:**

After large system changes (e.g., agent count from 16 to 49), documentation files that manually reference those systems need update as part of the same task. Similar references may exist in other documentation files (check @DIRECTORY_STRUCTURE.md, agent-registry.json references in READMEs, etc.).

---

## 2026-02-07: Context Data Layer Security Findings (Pipeline #12)

**Date:** 2026-02-07

**Impact:** HIGH -- 3 HIGH, 5 MEDIUM, 5 LOW findings in context system security

**Description:**

Security review of `.claude/context/` data layer (memory, runtime, artifacts, config, reports, plans, tmp, metrics, data, self-healing, sessions, teams, workflows) identified security gaps primarily in state integrity, prompt injection via persistent context, and inconsistent security controls.

**Key Findings:**

1. **SEC-CTX-001 (HIGH)**: Inconsistent `safeJSONParse()` usage -- `task-status-enforcement.cjs` uses plain `JSON.parse()` while `router-state.cjs` has prototype pollution protection. File: `.claude/hooks/routing/task-status-enforcement.cjs` line 69.

2. **SEC-CTX-002 (HIGH)**: Reflection spawn prompt injection -- `reflection-queue-processor.cjs` `generateSpawnRequest()` builds agent prompts from queue entries without content sanitization. File: `.claude/hooks/reflection/reflection-queue-processor.cjs` lines 130-175.

3. **SEC-CTX-003 (HIGH)**: Memory file integrity not verified -- `constitution.md` and `behaviour.md` are injected into all agent spawn prompts via `spawn-prompt-assembler.cjs` without hash verification. Any agent with Write access could modify behavioral directives for all future agents.

4. **SEC-CTX-004 (MEDIUM)**: No JSON Schema validation on runtime state file reads (`router-state.json`, `task-status.json`, `workflow-state.json`, `reflection-spawn-request.json`).

5. **SEC-CTX-005 (MEDIUM)**: `nul` file (Windows reserved name, 0 bytes) at `.claude/context/nul` violates workspace-conventions.md.

6. **SEC-CTX-006 (MEDIUM)**: Executable `.cjs` file in `tmp/` directory. `.gitignore` only covers `*.txt` in tmp/.

7. **SEC-CTX-007 (MEDIUM)**: No JSONL rotation configured for `event-bus.jsonl` (unbounded growth risk).

8. **SEC-CTX-008 (MEDIUM)**: `gotchas.json` and `patterns.json` lack provenance tracking (no author/timestamp per entry).

**Positive Findings:**

- Zero secrets or credentials found in any context file (comprehensive regex scan)
- `spawn-log.jsonl` has good traceability (task_id, agent_type, session_id, timestamps)
- `.gitignore` correctly excludes runtime/, metrics/, self-healing, sessions from version control
- `router-state.cjs` has robust prototype pollution prevention and optimistic concurrency

**Workaround:**

- Do NOT deploy in adversarial environments until SEC-CTX-001 through SEC-CTX-003 are fixed
- Monitor `reflection-spawn-request.json` for unexpected content
- Manually verify `constitution.md` and `behaviour.md` integrity periodically

**Resolution Path:**

- P1 (3 HIGH findings): Extract shared `safeJSONParse`, add prompt sanitization, add memory integrity checks
- P2 (5 MEDIUM findings): Schema validation, delete `nul` file, relocate tmp executables, JSONL rotation, provenance tracking
- P3 (5 LOW findings): Metrics HMAC, session encryption, backup integrity, documentation gaps

**Full Report:** `.claude/context/reports/security/context-security-review-2026-02-07.md`

