<!-- Last Cleaned: 2026-02-10 - Added Task #22 integration gap -->

## 2026-02-10: Integration Health Gaps in Task #22 (Wave 16B)

**Issue**: 3 CLI tools wired to package.json scripts (detect:orphans, verify:git-notes, assess:ecosystem) but not integrated per ADR-100

**Trigger**: Reflection-agent assessed Task #22 completion and detected missing artifact-graph.json entries and tool-catalog.md status updates

**Details**:
- Tools successfully wired to package.json (fully functional)
- Integration Health Score: 65% (Category: Gaps, requires integration analysis)
- Missing: artifact-graph.json registration, tool-catalog.md status update, Router keywords

**Solution**: Queue artifact-integrator task to:
1. Add 3 tool entries to artifact-graph.json
2. Update tool-catalog.md with wiring status (change from "reference-only" to "package.json wired")
3. Create Router keywords for natural language discovery (e.g., "detect orphaned skills" → detect:orphans)
4. Verify integration completeness per ADR-100 Step 4.5

**Prevention**: Include integration assessment in Wave completion checklist for all developer tasks

**Priority**: P2 (functional, not blocking, but should be addressed in next integration sweep)

**Related**: ADR-100 Cross-Artifact Integration System, Task #22 Wave 16B

---

## 2026-02-09: CRITICAL - Context Overflow From Parallel Heavy Agents

**Issue**: Router spawned 5+ heavy review agents (code-reviewer, QA, security-architect, devops, architect) simultaneously. Each returned 125k-165k token results inline. Total context exceeded 200k tokens. Autocompact failed (context already over threshold). Session crashed.

**Impact**: HIGH - 52 minutes of work lost, all review results lost, session required restart

**Workaround**:
- Max 2 heavy agents in parallel (IRON LAW)
- Agents write reports to files, return only file path + 5-line summary
- Sequential review waves, not parallel blast
- Use haiku model for straightforward reviews

**Resolution**: Permanent routing rule change. See learnings.md "Context Overflow Prevention"

**Priority**: P0 (session stability)

## 2026-02-09: Active Stub Modules (Deferred Consumer Refactoring)

**Issue:** 4 stub modules exist for archived functionality. Stubs prevent crashes but indicate deferred refactoring work.

**Stub Inventory:**

1. **`.claude/lib/ml/index.cjs` (ML Pipeline Stub)**
   - Exports: `getMLClient()` → returns `null`
   - Consumers: Pattern detection, anomaly detection (both expect null when ML disabled)
   - Refactoring path: Remove ML feature flags from consumers, delete stub
   - Effort: 2-3 hours

2. **`.claude/lib/clients/model-client.cjs` (LLM Client Stub)**
   - Exports: `extractFromResponse()` → returns `{ success: false, mode: 'mock' }`
   - Consumers: Memory extraction pipeline (falls back to mock mode)
   - Refactoring path: Rewrite memory extraction to use native LLM calls, delete stub
   - Effort: 4-6 hours

3. **`.claude/hooks/audit/git-notes-audit.cjs` (Git Notes Hook Stub)**
   - Exports: `verifyNote()` → returns `{ valid: true }` (no-op verification)
   - Consumers: Possibly audit hook chain (needs verification)
   - Refactoring path: Remove from hook chain or fully implement, delete stub
   - Effort: 1-2 hours

4. **`.claude/lib/memory/_archive/` modules (3 archived, now stubbed)**
   - memory-rotator.cjs, smart-pruner.cjs, cold-storage.cjs
   - Status: Currently archived, Task #7B will rebuild from scratch
   - No stub needed (consumers removed during archival)

**Impact:** LOW - Stubs work as intended, consumers handle disabled features gracefully

**Workaround:** None needed. Stubs are functioning correctly.

**Resolution Path:**

1. **Audit stub usage:** `grep -r "ml/index\|model-client\|git-notes-audit" --include="*.cjs"`
2. **Refactor consumers:** Rewrite to not depend on archived features
3. **Remove stubs:** After consumers no longer import them
4. **Verify:** Grep again to confirm zero references

**Priority:** P3 (technical debt, not blocking functionality)

**Cross-Reference:** ADR-110 (Stub Module Pattern), learnings.md "Stub Modules for Archived Functionality"

---

## 2026-02-09: Schema Security Audit -- 11 Schemas Missing Property Injection Protection

**Date:** 2026-02-09

**Issue:** Security audit of 28 active schemas found 11 schemas missing `additionalProperties: false`, enabling property injection. Additionally, 16 schemas have unbounded string fields and 19 have unbounded array fields, creating potential memory exhaustion vectors from misbehaving agents.

**Impact:** MEDIUM -- Internal schemas only, not public API. Risk limited to framework contributors and spawned agents.

**Key Findings:**

- 11 schemas need `additionalProperties: false` (HIGH priority)
- 47 unbounded string fields across 16 schemas need `maxLength` (MEDIUM)
- 38 unbounded array fields across 19 schemas need `maxItems` (MEDIUM)
- 2 schemas have explicit `additionalProperties: true` (deliberate but should be documented)
- `hook-definition` missing `Stop` in type enum
- `implementation-plan` has no required fields at all
- 0 ReDoS-vulnerable patterns found (all safe)
- 0 external $ref references (all local)

**Report:** `.claude/context/reports/security/schema-security-audit-2026-02-09.md`

**Workaround:** None needed immediately -- these are internal schemas. Fix during Schema Modernization task.

---

## 2026-02-08: 277 Pre-Existing Test Failures (Task #6, Framework Test Suite)

**Date:** 2026-02-08

**Issue:** Full test suite shows 277 failing tests out of 1914 total (14.5% failure rate). All failures are pre-existing (confirmed by comparing against Task #5 baseline).

**Impact:** MEDIUM -- Failures indicate pre-existing bugs/dead code in test suite that should be categorized and remediated systematically.

**Categories (from system-diagnostics-2026-02-08.md):**

1. **Module Not Found** (28 failures) -- Test imports of archived/relocated modules
2. **Assertion Failures** (164 failures) -- Actual test logic failures
3. **Hook Execution Errors** (45 failures) -- Errors in hook test execution
4. **Timeout Failures** (32 failures) -- Tests exceeding timeout limits
5. **Unknown/Other** (8 failures) -- Categorization incomplete

**Root Causes:**

- **Dead module imports** (Phase #15): Tests importing archived modules (party-mode, integration, agents-runtime, etc.) fail with MODULE_NOT_FOUND. Partial fix in Task #3 (test archival) but some stragglers remain.
- **Hook consolidation breakage**: 6→2 unified hooks in Task #4 may have changed behavior in ways that break some tests
- **Complex fixture dependencies**: Some tests have deep fixture setup chains that fail partway through
- **Timeout issues**: Long-running tests without clear completion signals

**Workaround:** None needed for core functionality (dead code does not affect active features).

**Resolution Path:**

1. **P0 (Immediate)**: Continue archival validation -- ensure no orphaned test imports from Phase #15 remain
2. **P1 (This Sprint)**: Categorize 277 failures by root cause and prioritize by impact
3. **P2 (Next Sprint)**: Fix top 20 failures (likely quick wins: archived imports, timeout adjustments)
4. **P3 (Backlog)**: Systematic remediation of remaining failures (estimated 4-6 hours for 50% reduction)

**Related Tasks:**

- Task #3: Dead code archival (moved tests to \_archive/)
- Task #4: Hook consolidation (unified 6→2)
- Task #6: Test suite regression validation (established baseline)

**Measurement:** Baseline: 1574/1914 pass (82.2%). Target: 1700+/1914 pass (88%+) after remediation.

---

## 2026-02-08: .env.example Missing Enforcement Variables (Task #36 Reflection, P1)

**Date:** 2026-02-08

**Issue:** New enforcement environment variables (TASKLIST_FIRST_ENFORCEMENT, STATE_STALE_THRESHOLD_MS) added by Tasks #27-35 are not documented in `.env.example`. Developers cannot discover these tunables without reading source code.

**Impact:** MEDIUM -- Reduces discoverability of enforcement configuration. Teams may not appropriately tune enforcement strictness for their environment.

**Workaround:** Read routing-guard.cjs or @ENFORCEMENT_HOOKS.md for variable definitions.

**Resolution:** Add to `.env.example`:

```bash
# Router Enforcement Configuration (Task #36)
TASKLIST_FIRST_ENFORCEMENT=warn       # Options: block, warn, off (default: warn)
STATE_STALE_THRESHOLD_MS=600000       # 10 minutes in milliseconds (default: 600000)
```

**Priority:** P1 -- Quick fix, high developer experience value.

**Status:** Open (pending Task #35 or dedicated docs update task)

---

## 2026-02-08: SEC-ROUTER-003 Audit Logging Incomplete for 3 Env Vars (Task #28 Deferred, P1)

**Date:** 2026-02-08

**Issue:** Three environment variable kill switches (SECURITY_REVIEW_ENFORCEMENT, MEMORY_SPAWN_THROTTLING, SPECIALIST_ROUTING_ENFORCEMENT) plus HOOK_FAIL_OPEN lack `auditSecurityOverride()` logging. Security checks can be disabled without audit trail.

**Impact:** HIGH -- Violates defense-in-depth. Silent security bypass without trace.

**Workaround:** Monitor `.claude/context/runtime/audit-log.jsonl` for gaps. Missing entries indicate override usage.

**Resolution:**

1. Add `auditSecurityOverride()` calls to routing-guard.cjs checks:
   - Check 4: SECURITY_REVIEW_ENFORCEMENT (line ~350)
   - Check 6: MEMORY_SPAWN_THROTTLING (line ~450)
   - Check 7: SPECIALIST_ROUTING_ENFORCEMENT (line ~500)

2. Add audit logging for HOOK_FAIL_OPEN activation (line 1368)

**Priority:** P1 -- Audit trail completeness is security-critical.

**Status:** Open (documented in router-enforcement-security-review-2026-02-08.md)

---

## 2026-02-08: Memory Management Rebuild Security Findings (Task #7B)

**Date:** 2026-02-08

**Impact:** HIGH -- 3 HIGH, 4 MEDIUM, 3 LOW findings in memory management rebuild components

**Description:**

Security review of the three memory management components being rebuilt from archived modules (Memory Rotator, Smart Pruner, Cold Storage) identified systemic vulnerabilities that must be addressed during implementation.

**Key Findings (HIGH):**

1. **T-MEM-001 (HIGH)**: Archive path injection in Memory Rotator. Constructed archive paths could be manipulated if date values contain path separators. Mitigation: validate all archive paths with `validatePathWithinProject()`.

2. **T-MEM-002 (HIGH)**: JSON prototype pollution across all memory modules. 38 instances of raw `JSON.parse()` without prototype pollution protection in the active memory subsystem (memory-manager.cjs, memory-tiers.cjs, memory-scheduler.cjs, contextual-memory.cjs, memory-dashboard.cjs). Cross-references: SEC-CTX-001, SEC-LIB-005, SEC-LIB-006.

3. **I-MEM-001 (HIGH)**: Sensitive data persists in cold storage archives. Entries containing API keys, tokens, JWTs, or PII are compressed and archived indefinitely without scrubbing.

**Must-Fix Mitigations (Blocking for Implementation):**

- **MF-001**: Create shared `safeJSONParse()` in `.claude/lib/utils/safe-json-parse.cjs`. Use reviver to strip `__proto__`, `constructor`, `prototype` keys.
- **MF-002**: Use `atomicWriteSync()` for ALL file writes. Create backup via `createBackup()` before any truncation.
- **MF-003**: Implement `scrubSensitiveContent()` utility to redact API keys, JWTs, emails before cold storage compression.

**Additional Findings (MEDIUM):**

- T-MEM-004: No integrity verification (HMAC/checksum) on compressed cold archives
- T-MEM-005: Race condition in read-modify-write (concurrent scheduler + agent writes)
- R-MEM-001: No audit trail for pruned/rotated/archived entries
- D-MEM-001: Archive files grow without bound (no size limits)

**Recommended Mitigations:**

- RF-001: Archive path validation with `validatePathWithinProject()`
- RF-002: File locking via `atomicWriteAsync()` with `proper-lockfile`
- RF-003: Pruning audit manifest (`.claude/context/memory/archive/prune-manifest-YYYY-MM-DD.json`)
- RF-004: Configurable archive size bounds (default 50MB, FIFO deletion)

**Cross-References:**

- SEC-CTX-001 (Inconsistent safeJSONParse) -- MF-001 addresses this systemically
- SEC-LIB-005 (safe-json.cjs fallback) -- MF-001 provides proper alternative
- SEC-CTX-003 (Memory file integrity) -- extends to archive files
- SEC-LIB-002 (scheduler shell:true) -- E-MEM-002 related finding
- D-WF-001 (State file locking gap) -- RF-002 addresses for memory files

**Full Report:** `.claude/context/reports/security/memory-management-security-review-2026-02-08.md`

**Verdict:** APPROVED WITH CONDITIONS -- Must-fix items MF-001, MF-002, MF-003 block implementation.

---

## 2026-02-08: Unit Test Isolation Can Hide Integration Bugs (Systemic Pattern - Tasks #9-13)

**Date:** 2026-02-08

**Issue:**

Test-Driven Development uses module isolation (mocking external dependencies) to validate internal logic. This is excellent for unit testing but can create a blind spot for integration contract mismatches. Task #9 implemented 4 memory management modules with 41 passing unit tests, but Task #13 discovered 2 integration bugs that NO unit test caught:

1. Memory-scheduler assumed `pruneResult.entriesRemoved` but smart-pruner returns `pruneResult.removed`
2. Memory-scheduler passed `{ similarityThreshold: 0.6 }` but smart-pruner expects `{ threshold: 0.6 }`

**Why Tests Missed It:**

- Smart-pruner unit tests: verified `{ removed: count }` is returned ✓ PASS
- Memory-scheduler unit tests: mocked pruner to return `{ entriesRemoved: count }` ✓ PASS
- Integration test: missing (no test exercised real pruner + real scheduler together)
- Result: 41/41 tests pass, but integration fails when code runs

**Root Cause:**

Unit tests validate **internal module logic** by mocking external dependencies based on **test assumptions**. If test assumptions don't match actual implementation, the mismatch only appears during real integration, where mocks are bypassed.

**Impact:**

- FALSE CONFIDENCE: "41 tests pass" suggests integration is validated, but it isn't
- DELAYED DETECTION: bugs found in code review (Task #13), not development (Task #9)
- HUMAN BURDEN: code review must catch integration bugs that tests should catch
- RISK: if code review is skipped, integration bugs ship to production

**Workaround:**

Always include human code review of integration boundaries, checking:

- Parameter names match actual function signatures
- Return field names match actual returned objects
- Error handling is bidirectional (caller + callee)

**Resolution (Medium-term):**

Add explicit "Integration Verification" phase to TDD workflow:

1. **Unit Test Phase:** Validate internal module logic (continue current practice)
2. **Integration Verification Phase (NEW):** Test real modules together without mocks
   - Load actual Module B (not mock)
   - Call with production-like parameters
   - Verify return values have expected field names
   - Verify error paths work bidirectionally
3. **Contract Documentation:** Define expected parameters/fields explicitly
   ```javascript
   const PRUNER_CONTRACT = {
     deduplicate: {
       params: { entries: 'array', threshold: 'number' },
       returns: { removed: 'number', timestamp: 'string' },
     },
   };
   ```

**Prevention:**

1. Create integration test template for multi-module systems
2. Update TDD skill: "Integration Verification Phase" section
3. Add integration contract patterns to patterns.json
4. Include "verify integration contracts" in code review checklist

**Related ADRs:** ADR-102 (memory management rebuild), decisions.md entry "Test-Driven Integration Boundary Verification"

**Systemic Scope:** This pattern affects ALL multi-module features in the framework (memory, workflow, routing, config). Any feature with >1 module should include integration verification tests.

---

## 2026-02-08: Code Simplification Analysis -- Framework Complexity (Task #2)

**Date:** 2026-02-08

**Impact:** HIGH -- Framework has accumulated 11,830 lines of dead code and significant structural complexity

**Description:**

Comprehensive code simplification analysis identified:

1. **22 dead workflow modules** (~5,258 lines) in `.claude/lib/workflow/` -- never imported by any active code
2. **7 dead memory modules** (~2,648 lines) in `.claude/lib/memory/` -- zero active consumers
3. **ML subsystem** (1,652 lines) always disabled by feature flag
4. **3 dead self-healing modules** (~1,372 lines) unreferenced
5. **Triple keyword-to-agent mapping** -- 6 overlapping routing structures across 3 files
6. **Triple agent registry** -- same 49 agents described in 3 JSON files (6,522 lines)
7. **14 hooks fire per Write operation** -- each spawning a Node.js process
8. **13 configuration sources** with 5-level model resolution precedence

**Workaround:** None needed for functionality -- dead code does not affect behavior. But it increases cognitive load and maintenance burden.

**Resolution:** See full report at `.claude/context/reports/architecture/code-simplification-analysis-2026-02-08.md` with prioritized 5-phase action plan.

**Priority:** P1 for dead code archival (zero risk), P2 for consolidation work.

---

### SEC-ROUTER-001: routing-guard.cjs Not Registered for Edit|Write|NotebookEdit (CRITICAL)

**Date:** 2026-02-08 | **Task:** #28 | **Agent:** security-architect

**Description:**

`routing-guard.cjs` contains logic to block Router from using blacklisted tools (Check 1: Router Self-Check) including Edit, Write, and NotebookEdit. However, in `settings.json`, the `Edit|Write|NotebookEdit` matcher (line 68) does NOT include `routing-guard.cjs` in its hook list. The hook is only registered for `Bash`, `Glob|Grep|WebSearch`, and `TaskCreate` matchers. This means:

- Check 1 (Router Self-Check / BLACKLISTED_TOOLS) never fires for write operations
- Check 5 (Router Write Guard / checkRouterWrite) never fires for write operations
- The code at lines 156 and 440-444 of routing-guard.cjs is dead for write tools

**STRIDE Classification:** Elevation of Privilege -- Router can bypass its own tool restrictions for write operations.

**Mitigating Factors:**

- `unified-creator-guard.cjs` blocks writes to creator artifact paths (skills, agents, hooks, workflows)
- `unified-pre-write-hook.cjs` enforces file placement rules
- Router behavioral compliance (CLAUDE.md instructions) provides soft enforcement
- Write operations to `.claude/context/runtime/` and `.claude/context/memory/` are allowed by design via `ALWAYS_ALLOWED_WRITE_PATTERNS`

**Workaround:** None currently. Relies on behavioral compliance and partial coverage from other hooks.

**Resolution:** Add `routing-guard.cjs` to the `Edit|Write|NotebookEdit` matcher in `settings.json`. The code in routing-guard.cjs already handles these tools via `ALL_WATCHED_TOOLS` -- only the registration is missing.

**Priority:** P0 -- CRITICAL. Registration fix is a single line change with zero risk.

---

### SEC-ROUTER-002: TaskList-First Flag Tracked But Never Enforced (MEDIUM)

**Date:** 2026-02-08 | **Task:** #28 | **Agent:** security-architect

**Description:**

The `taskListCalledSincePrompt` flag has full infrastructure:

- Setter: `task-list-tracker.cjs` (PostToolUse TaskList) calls `routerState.setTaskListCalled()`
- Getter: `router-state.cjs` has `isTaskListCalledSincePrompt()`
- Reset: `state-reset.cjs` resets to `false` on each UserPromptSubmit

However, NO enforcement hook checks this flag before allowing `Task()` spawns. The `pre-task-unified.cjs` hook (PreToolUse Task) does NOT call `isTaskListCalledSincePrompt()`. Router can spawn agents without calling TaskList() first, violating the CLAUDE.md protocol ("FIRST ROUTING TOOL CALL MUST BE TaskList()").

**STRIDE Classification:** Tampering -- Router can skip mandatory state synchronization step, potentially spawning duplicate agents or missing completed tasks.

**Workaround:** Behavioral compliance via CLAUDE.md instructions. The flag infrastructure exists and works correctly -- only the enforcement gate is missing.

**Resolution:** Add a check in `pre-task-unified.cjs` that reads `isTaskListCalledSincePrompt()` before allowing Task() calls. Use `TASKLIST_FIRST_ENFORCEMENT` env var with default `warn` mode.

**Priority:** P2 -- MEDIUM. The behavioral protocol is generally followed; enforcement would prevent edge-case violations.

---

### SEC-ROUTER-003: Environment Variable Kill Switches Lack Audit Logging (HIGH)

**Date:** 2026-02-08 | **Task:** #28 | **Agent:** security-architect

**Description:**

12 environment variable kill switches can individually disable security enforcement checks. While most use `auditSecurityOverride()` from `hook-input.cjs` (line 409) for logging, three lack audit calls:

- `SECURITY_REVIEW_ENFORCEMENT` (routing-guard.cjs Check 4)
- `MEMORY_SPAWN_THROTTLING` (routing-guard.cjs Check 6)
- `SPECIALIST_ROUTING_ENFORCEMENT` (routing-guard.cjs Check 7)

Additionally, `HOOK_FAIL_OPEN=true` (routing-guard.cjs line 1368) converts the entire hook from fail-closed to fail-open, with no audit logging when activated.

**STRIDE Classification:** Repudiation -- Security checks can be silently disabled without trace.

**Workaround:** Monitor `.claude/context/runtime/audit-log.jsonl` for gaps in enforcement events. Missing entries for known checks indicate override usage.

**Resolution:** Add `auditSecurityOverride()` calls to the three missing checks. Add audit logging for `HOOK_FAIL_OPEN` activation. Consider a "canary" mechanism that detects when all enforcement is disabled simultaneously.

**Priority:** P1 -- HIGH. Silent security bypass without audit trail violates defense-in-depth.

---

### SEC-ROUTER-004: router-state.json Version Field Uses Non-Monotonic Reset (LOW)

**Date:** 2026-02-08 | **Task:** #28 | **Agent:** security-architect

**Description:**

`state-reset.cjs` (line 85) sets `version: Date.now() % 10000` during UserPromptSubmit reset. This modulo operation means:

- Version is not monotonically increasing (can decrease across resets)
- Collision probability: ~0.01% per reset (10000 possible values)
- `saveStateWithRetry()` in router-state.cjs uses version for optimistic concurrency

However, since state is fully reset on each prompt and only one agent writes at a time during router mode, the practical impact is negligible. The version field primarily guards against concurrent writes during agent execution, where `enterAgentMode()` increments the version properly.

**STRIDE Classification:** Tampering -- Theoretical version collision could allow stale write to succeed.

**Workaround:** Not needed. The double-reset pattern (state-reset.cjs + user-prompt-unified.cjs) and single-writer-during-routing constraint make this a theoretical rather than practical risk.

**Resolution:** Consider using `Date.now()` without modulo, or a monotonic counter persisted across resets.

**Priority:** P3 -- LOW. Theoretical risk only; no practical exploit path identified.

**Full Report:** See `.claude/context/reports/security/router-enforcement-security-review-2026-02-08.md` for complete STRIDE analysis, race condition analysis, and 6 detailed recommendations (R-1 through R-6).

---

### PENTEST-2026-02-09: 14 Findings from Auth/AuthZ Penetration Test (2 CRITICAL, 5 HIGH)

**Date:** 2026-02-09 | **Agent:** penetration-tester

**Description:**

Authorized internal penetration test identified 14 vulnerabilities in the hook enforcement, state management, memory, and command validation layers. Full report: `.claude/context/reports/security/auth-pentest-assessment-2026-02-09.md`

**P0 (CRITICAL - Fix Immediately):**

- **CRIT-001**: Remove `HOOK_FAIL_OPEN` env var from all hooks (routing-guard.cjs:2027, unified-pre-write-hook.cjs:511, unified-creator-guard.cjs:644)
- **CRIT-002**: Restrict env var `=off` overrides -- consider removing `off` mode for ROUTER_BASH_GUARD, SHELL_INJECTION_VALIDATOR, ROUTER_SELF_CHECK

**P1 (HIGH - Fix This Sprint):**

- **HIGH-001**: Protect router-state.json from agent writes (add to write-protected paths)
- **HIGH-002**: Enforce TTL bounds in `isCreatorActive()`, sign active-creators.json entries
- **HIGH-003**: Implement memory entry sanitization (strip instruction-like content from learnings.md)
- **HIGH-004**: Expand shell-injection-validator patterns (add dd, mkfs, find -delete, python -c, node -e)
- **HIGH-005**: Remove `source` and `.` from SAFE_COMMANDS_ALLOWLIST in registry.cjs:143-144

**P2 (MEDIUM - Fix Next Sprint):**

- **MED-001**: Add edit-level protection for security-critical artifacts
- **MED-002**: Sanitize array elements in hook-input.cjs sanitizeObject()
- **MED-003**: Fix NaN handling in staleness threshold, enforce max threshold
- **MED-004**: Expand write content scanner with dynamic require/import detection
- **MED-005**: Reduce git log max count from 99 to single digit

**P3 (LOW - Backlog):**

- **LOW-001**: Change ROUTER_DEBUG default to disabled
- **LOW-002**: Add fallback logging when violation tracker unavailable

**Impact:** HIGH overall risk rating. File-based state management is the systemic vulnerability -- all state files writable by any agent.

**Cross-References:** SEC-ROUTER-001 (routing-guard registration gap - related), SEC-ROUTER-003 (audit logging gaps - related), SEC-FND-003 (runtime state file integrity - overlapping)

---

### SEC-LOG-001: Debug Log Information Disclosure via Verbose Hook Payloads (CRITICAL)

**Date:** 2026-02-09 | **Agent:** security-architect

**Description:**

Claude Code debug logs in `.tmp/*.txt` contain verbose hook payloads that expose:

1. **Full file contents** via `originalFile` field in PostToolUse Edit/Write payloads (98 instances)
2. **Configuration templates** including `.env.example` with secret placeholder names (ANTHROPIC_API_KEY, WEBHOOK_SECRET)
3. **Session permission mode** (`bypassPermissions: true/false`) in 383 log entries
4. **User identity/paths** (`C:\Users\oimir\`) in transcript and config file paths (383+ entries)
5. **Internal enforcement architecture** -- ADR numbers, whitelisted commands, hook names in 896 BLOCKED/VIOLATION messages

**STRIDE Classification:** Information Disclosure (HIGH) + Repudiation (MEDIUM for permission changes)

**Positive Findings:** Enforcement hooks are working correctly (896 blocks), no actual credentials leaked, loop prevention functional (54 blocks), permission denied events minimal (4 total).

**Impact:** HIGH -- If debug logs are committed to VCS, shared in issue reports, or stored in accessible locations, attackers gain complete map of security architecture, configuration variables, file contents, and session metadata.

**Resolution:**

- P0: Implement hook payload content redaction (strip `originalFile`, truncate `tool_input`)
- P0: Add `.tmp/*.txt` to `.gitignore`
- P1: Add log sanitizer for secret patterns
- P1: Implement `LOG_REDACTION_LEVEL` config variable

**Full Report:** `.claude/context/reports/security/debug-log-security-assessment-2026-02-09.md`

---

### SEC-LOG-002: Agent YAML Frontmatter Parse Failures (LOW)

**Date:** 2026-02-09 | **Agent:** security-architect

**Description:**

Two agent definition files have duplicate YAML keys causing parse failures at every session startup:

- `prompt-engineer.md` (line 56): Map keys must be unique
- `mcp-developer.md` (line 57): Map keys must be unique

**Impact:** LOW -- Malformed frontmatter could cause incorrect model selection or missing capability assignments if duplicate keys have conflicting values.

**Resolution:** Fix duplicate YAML keys in both agent files. Add YAML schema validation to CI pipeline.

---

### SEC-FND-001: Schema Permissiveness Allows Property Injection (CRITICAL)

**Date:** 2026-02-09 | **Agent:** security-architect

**Description:**

6 of 14 active schemas (43%) lack `additionalProperties: false`, including the most security-critical ones: agent-definition, hook-definition, skill-definition, workflow-definition, plan, and implementation-plan. The skill-definition schema explicitly sets `"additionalProperties": true`. This means injected properties (including `__proto__`, `bypassEnforcement`, or `systemPromptOverride`) pass schema validation and could be trusted by downstream consumers.

**Impact:** CRITICAL -- Property injection through schema-validated data could alter agent behavior or grant unintended capabilities.

**Resolution:**

1. Add `"additionalProperties": false` to root and nested objects in all security-critical schemas
2. Exception: Keep `additionalProperties: true` only on explicit `metadata` objects
3. Audit existing data for extra properties before enforcing

**Priority:** P0

**Full Report:** `.claude/context/reports/security/batch1-foundations-security-review-2026-02-09.md`

---

### SEC-FND-002: No Prompt Injection Defense in Rules or Schemas (HIGH)

**Date:** 2026-02-09 | **Agent:** security-architect

**Description:**

`rules/security.md` covers traditional injection vectors (SQL injection, XSS, eval()) but has zero coverage for prompt injection -- the primary attack vector in LLM multi-agent systems. Memory files (learnings.md, decisions.md) are read by all agents before starting work. An adversarial entry could instruct agents to disable enforcement, exfiltrate data, or execute arbitrary commands. No sanitization is performed on memory writes.

**Impact:** HIGH -- Memory poisoning could compromise all subsequent agent operations.

**Resolution:**

1. Add "Prompt Injection Defense" section to rules/security.md
2. Implement memory content sanitization utility
3. Add provenance markers to memory entries
4. Treat memory entries as untrusted input in agent instructions

**Priority:** P1

**Full Report:** `.claude/context/reports/security/batch1-foundations-security-review-2026-02-09.md`

---

### ARCH-EXP-001: Skill Expansion Context Overload -- 105 Rules Files Auto-Loaded (CRITICAL)

**Date:** 2026-02-09 | **Agent:** architect | **Task:** #17

**Description:**

The skill-centric universal expansion created 94 new rules files in `.claude/rules/`, bringing the total to 105. Claude Code auto-loads ALL `.claude/rules/*.md` files into context on every prompt. At ~7,337 lines total, this approaches or exceeds the reliable attention window (32K tokens). Context quality degrades as the model must process 105 rules files per interaction.

**Impact:** CRITICAL -- More rules paradoxically means less compliance. Attention degradation causes rules to be ignored.

**Resolution:** Move skill-specific rules out of `.claude/rules/` into `.claude/skills/{name}/rules.md`. Keep `.claude/rules/` for the 11 framework-level rules that apply universally.

**Priority:** P0 -- Most urgent finding from architecture review.

**Full Report:** `.claude/context/reports/architecture-review-skill-expansion-2026-02-09.md`

---

### ARCH-EXP-002: 55 Hollow Schema Stubs (61% of Skill Output Schemas) (HIGH)

**Date:** 2026-02-09 | **Agent:** architect | **Task:** #17

**Description:**

55 of 90 skill output schemas contain only `{status, output}` with no output constraints. They validate nothing meaningful. They are structurally incompatible with the 35 meaningful schemas that use `{skillName, version, timestamp, output}`. Zero runtime consumers validate against any of these schemas (88/90 have no consumers).

**Impact:** HIGH -- False sense of validation coverage. Two incompatible schema archetypes create confusion. Maintenance burden without value.

**Resolution:** (a) Standardize on single envelope schema, (b) Create base schema with `$ref`, (c) Delete or consolidate hollow stubs into a single generic schema.

**Priority:** P1

**Full Report:** `.claude/context/reports/architecture-review-skill-expansion-2026-02-09.md`

---

### ARCH-EXP-003: No Governance Automation for 299 New Files (HIGH)

**Date:** 2026-02-09 | **Agent:** architect | **Task:** #17

**Description:**

299 new files (90 schemas, 105 rules, 104 commands) have no automated ownership, freshness checks, consistency validation, or lifecycle management. Manual governance has already produced two incompatible schema archetypes. At this scale, manual governance will fail and files will drift from skill implementations.

**Impact:** HIGH -- Technical debt compounds over time as schemas drift from actual skill output.

**Resolution:** Create automated validation: schema consistency checker, rules quality scorer, lifecycle tracker.

**Priority:** P1

---

### SEC-SCHEMA-003: Four Schema Envelope Variants Discovered (MEDIUM)

**Date:** 2026-02-09 | **Agent:** security-architect | **Task:** #5

**Description:**

Planning documents for schema standardization describe only 2 envelope structures, but examination of actual schemas reveals 4 variants:

1. **Structure A** (14 schemas): `{skillName, version, timestamp, output}` -- pre-existing Tier 1 schemas (tdd, debugging, code-analyzer)
2. **Structure B** (55+ schemas): `{status, output}` -- new batch expansion stubs
3. **Structure C** (5 schemas): Flat domain-specific (no wrapper) -- Trail of Bits security schemas (differential-review, insecure-defaults, static-analysis, variant-analysis, semgrep-rule-creator)
4. **Structure A-variant** (3 schemas): `{skillName, version, timestamp, result}` -- uses `result` instead of `output` (frontend-expert)

Additionally, `skill-plan-generator-output.schema.json` (210 lines, Tier 1 gold standard) is missing `$id` entirely.

**Impact:** MEDIUM -- Envelope migration that only accounts for 2 variants will break or mishandle the other 2. Trail of Bits security schemas (Structure C, highest quality) could lose validation depth if force-migrated to Structure B.

**Resolution:** ADR for schema envelope MUST document all 4 variants. Trail of Bits schemas may need explicit exemption or careful preservation during migration.

**Priority:** P1 -- Must be addressed in ADR before envelope migration begins.

**Full Report:** `.claude/context/reports/security/schema-standardization-security-review-2026-02-09.md`

---

### SEC-FND-003: Runtime State Files Lack Integrity Verification (CRITICAL)

**Date:** 2026-02-09 | **Agent:** security-architect

**Description:**

10 runtime state files in `.claude/context/runtime/` (including router-state.json, reflection-spawn-request.json, session-metrics.json) have no integrity verification (HMAC, checksum, or digital signature). Any agent with Write tool access can modify these files to manipulate framework behavior. The reflection-spawn-request.json is particularly dangerous as it can trigger arbitrary agent spawns via the Router Step 0 mechanism.

**Impact:** CRITICAL -- Compromised agent can manipulate routing enforcement, trigger mass spawns, or suppress compliance validation.

**Resolution:**

1. Add SHA-256 checksum field to critical state files (router-state.json, reflection-spawn-request.json)
2. Validate checksum before trusting state file content
3. Add max-entry limits and timestamp validation for reflection-spawn-request.json
4. Create JSON schemas for all runtime state files

**Priority:** P1

**Full Report:** `.claude/context/reports/security/batch1-foundations-security-review-2026-02-09.md`
