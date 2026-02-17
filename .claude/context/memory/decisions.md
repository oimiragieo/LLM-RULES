## ADR-134: Dead Hook Cleanup and Settings.json Sync (2026-02-16)

**Status:** ACCEPTED
**Decision:** Remove all dead hook references from `.claude/settings.json` and implement automated validation to prevent future registry drift.

**Context:**

- Architecture report (2026-02-16) identified 20+ hook commands in settings.json referencing archived files that no longer execute
- Dead references cause:
  - Wasted execution time (~15-20ms per session from failed hook invocations)
  - stderr pollution with "file not found" errors
  - Cognitive load (developers can't distinguish active hooks from dead references)
  - Maintenance confusion (which hooks are actually running?)
- Root cause: 2026-02-08 hook consolidation archived 25+ hooks without updating settings.json registrations

**Decision:**

1. **Immediate (1 hour):** Remove all dead hook references from `.claude/settings.json`
   - Remove references to files in `.claude/hooks/_archive/`
   - Verify settings.json is valid JSON after cleanup
   - Document removed hooks in `.claude/hooks/_archive/README.md`

2. **Short-term (1 week):** Implement automated validation hook (`settings-hook-sync-validator.cjs`)
   - Runs on postinstall
   - Validates all hook command paths exist
   - Warns/blocks if orphaned registrations detected

3. **Long-term (backlog):** Add pre-hook-execution validation in hook runner
   - Skip non-existent files with warning (fail-open)
   - Prevents runtime errors from dead references

**Consequences:**

**Positive:**

- Faster session startup (eliminate 15-20ms overhead)
- Cleaner error logs (no more "file not found" noise)
- Lower maintenance burden (clear active hook inventory)
- Prevents future registry drift (automated validation)

**Negative:**

- One-time cleanup effort (1 hour)
- Risk of removing hooks still referenced elsewhere (mitigated by thorough search)

**Implementation:**

- Architect report provides evidence: `.claude/settings.json` lines 10-150+
- Examples of dead references:
  - `.claude/hooks/_archive/safety/bash-cwd-validator.cjs`
  - `.claude/hooks/_archive/safety/security-trigger.cjs`
  - `.claude/hooks/_archive/validation/agent-tools-validator.cjs`

**Related:**

- Architecture Report 2026-02-16: Critical Issue #1 (P0)
- ADR-132: Sequential remediation (dead hooks block other work)

---

## ADR-135: Memory Input Validation Layer (2026-02-16)

**Status:** ACCEPTED
**Decision:** Implement `MemoryInputValidator` to sanitize all writes to memory files and prevent agent memory poisoning attacks.

**Context:**

- Security report (2026-02-16) identified H-01: Agent Memory Poisoning via Unconstrained User Input
- User input flows directly into agent memory files (`learnings.md`, `decisions.md`, `issues.md`) without sanitization
- Attack scenario:
  1. Attacker submits prompt with embedded instructions disguised as learnings
  2. Agent writes to `memory/learnings.md` without sanitization
  3. Future agents read poisoned memory and follow malicious instructions
  4. Attacker gains persistent control over agent behavior
- CVSS: 7.5 (HIGH)
- OWASP Agentic AI: ASI06 (Memory & Context Poisoning)

**Decision:**

Implement pre-write validation for all memory file writes with three layers:

1. **Instruction pattern detection:**
   - Detect instruction markers: `always|never|ignore|bypass|override|disable`
   - Detect shell injection patterns: `shell\s*:\s*true`, `process\.env\[`
   - Flag for manual review instead of auto-writing

2. **Code block sanitization:**
   - Strip markdown code blocks to prevent code injection: `\`\`\`[\s\S]\*?\`\`\``→`[code block removed]`
   - Preserve narrative content while removing executable code

3. **Source attribution:**
   - Track source of memory writes: `user|agent|system`
   - User-provided learnings flagged for review
   - Agent-generated learnings auto-approved

**Implementation:**

````javascript
// New utility: .claude/lib/memory/memory-input-validator.cjs
async function recordLearning(text, source = 'user') {
  const instructionPatterns = [
    /always|never|ignore|bypass|override|disable/i,
    /\bshell\s*:\s*true\b/i,
    /process\.env\[/i,
  ];

  const isInstruction = instructionPatterns.some(p => p.test(text));

  if (isInstruction && source === 'user') {
    await fs.appendFile(FLAGGED_FILE, `[REVIEW REQUIRED] ${text}\n`);
    return;
  }

  const sanitized = text.replace(/```[\s\S]*?```/g, '[code block removed]');
  await fs.appendFile(LEARNINGS_FILE, `- ${sanitized}\n`);
}
````

**Detection:**

- Monitor `memory/*.md` for suspicious patterns
- Implement pre-write validation hook for memory files
- Flag user-provided "learnings" for manual review

**Timeline:**

- P1 priority: 2 weeks
- Remediation priority: High (CVSS 7.5)

**Consequences:**

**Positive:**

- Blocks memory poisoning attacks (OWASP ASI06)
- Preserves memory integrity
- Maintains audit trail of flagged entries
- Graceful degradation (flags instead of blocking)

**Negative:**

- Additional validation overhead (~10ms per memory write)
- May flag legitimate technical instructions (false positives)
- Requires manual review queue management

**Related:**

- Security Report 2026-02-16: Finding H-01
- OWASP Agentic AI Top 10: ASI06
- `.claude/rules/security.md`: Memory Poisoning Prevention section

---

## ADR-136: Runtime State Unification (2026-02-16)

**Status:** PROPOSED
**Decision:** Unify 14 runtime state JSON files into a single `runtime-state.json` with namespaced sections, managed by a `RuntimeStateManager` class that uses `proper-lockfile` for all writes.

**Context:**

- Architecture audit (2026-02-16) identified C3: 14 concurrent-writable runtime state files without unified locking.
- `proper-lockfile` is already a production dependency but used only in LanceDB initialization.
- Hook processes can execute concurrently (multiple hooks registered for same event), creating race conditions.
- Files affected: router-state.json, task-status.json, spawn-assembly-cache.json, routing-block-dedupe.json, agent-guardrails-state.json, drift-state.json, edit-counter.json, tool-governance-state.json, reflection-step0-state.json, token-slo-state.json, and 4 more.

**Decision:**

1. Create `.claude/lib/runtime/runtime-state-manager.cjs` — single class for all runtime state reads/writes
2. Uses `proper-lockfile` for write operations (lock timeout: 5s, stale: 10s)
3. Single `runtime-state.json` with namespaced sections: `{ routing: {}, tasks: {}, reflection: {}, workflow: {}, telemetry: {} }`
4. Migrate hooks incrementally (start with highest-frequency hooks: routing-guard, post-task-unified)
5. Backward-compatible: old file paths remain as shims that delegate to RuntimeStateManager during migration

**Consequences:**

**Positive:** Eliminates concurrency bugs; reduces file I/O from 14 reads to 1; enables atomic multi-property updates; single debugging point for session state.

**Negative:** Migration effort (~1 week); transient period where some hooks use old files and some use new manager.

**Related:**

- Architecture Audit 2026-02-16: Finding C3
- Architecture Audit 2026-02-16: BACKWARD_PROPAGATION (schema:runtime-state-unified)

---

## ADR-136: safeParseJSON Migration and ESLint Enforcement (2026-02-16)

**Status:** ACCEPTED
**Decision:** Migrate all `JSON.parse()` calls in hook files to `safeParseJSON()` utility and add ESLint rule to prevent future unsafe usage.

**Context:**

- Security report (2026-02-16) documented JSON parsing safety as existing control (SEC-LIB-001 standard)
- Code reviewer (Wave 1) identified 68+ JSON.parse issues in codebase
- Risk:
  - Invalid JSON in hook input crashes entire hook process
  - Prototype pollution attacks via `__proto__`, `constructor`, `prototype` keys
  - Malicious JSON: `{ "__proto__": { isAdmin: true } }` could escalate privileges
- `safeParseJSON` provides:
  - Try-catch wrapping (prevents crash)
  - Prototype pollution protection
  - Structured return `{ success, data, error }`
  - Optional fallback value

**Decision:**

1. **Immediate (included in security hardening):**
   - Audit all hook files for `JSON.parse()` calls
   - Migrate to `safeParseJSON()` from `.claude/lib/utils/safe-json.cjs`
   - Test error handling paths

2. **Short-term (1 week):**
   - Add ESLint rule: `no-restricted-syntax` to block `JSON.parse()` in hook files
   - Configure rule in `.eslintrc.cjs`:
     ```javascript
     'no-restricted-syntax': [
       'error',
       {
         selector: 'CallExpression[callee.object.name="JSON"][callee.property.name="parse"]',
         message: 'Use safeParseJSON() instead of JSON.parse() in hook files for safety'
       }
     ]
     ```

3. **Documentation:**
   - Update `.claude/rules/security.md` with safeParseJSON usage
   - Add examples to security documentation

**Implementation:**

```javascript
// BEFORE (unsafe):
const data = JSON.parse(hookInput);

// AFTER (safe):
const { safeParseJSON } = require('.claude/lib/utils/safe-json.cjs');
const { success, data, error } = safeParseJSON(hookInput, {});
if (!success) {
  console.error('Parse error:', error);
  return {};
}
```

**Consequences:**

**Positive:**

- Hook reliability improved (no crashes on malformed JSON)
- Prototype pollution attacks blocked
- Audit trail for parse errors
- ESLint enforcement prevents regressions

**Negative:**

- Slightly more verbose code (~3 lines vs 1)
- Existing code requires migration (68+ sites)

**Related:**

- Security Report 2026-02-16: JSON Parsing Safety (existing control validated)
- Code Review Wave 1: 68+ JSON.parse findings
- `.claude/lib/utils/safe-json.cjs`: Implementation
- `.claude/rules/security.md`: JSON Parsing Safety section

---

## ADR-132: Sequential Remediation for Convergent Audit Findings (2026-02-16 REFLECTION DECISION)

**Status:** ACCEPTED (Phase 0 Reflection, Task #5)
**Decision:** When multiple independent audits converge on the same issue, remediate sequentially (not parallel) to avoid merge conflicts in shared files.

**Rationale:**

- Evidence: Dead hooks (P0.1) blocks other work; must clean settings.json registry before adding tests
- Parallel work causes merge conflicts in central config files (settings.json, agent-registry.json)
- Sequential ordering enables dependency resolution (e.g., clean hooks → add hook tests → validate)
- Trade-off: Slower timeline but lower risk of rework

**Implementation:**

- Week 1: Clean dead hooks from settings.json (1 hour)
- Week 2: Add integration tests for routing/state/cycle (3.5 days)
- Week 3: Harden security (memory validation + JSON.parse migration, 3 weeks)

**Pattern:** Convergent audit findings signal systemic issues → prioritize P0 cleanup before adding tests/features.

**Evidence:** 4-wave analysis (architect, security, qa, qa) identified 17 findings with 3-way convergence on dead hooks, JSON.parse, and routing gaps.

---

## ADR-133: Integration Tests Before Feature Work (2026-02-16 REFLECTION DECISION)

**Status:** ACCEPTED (Phase 0 Reflection, Task #5)
**Decision:** Block all feature work until 6 P0 integration test gaps are closed (routing Check 7, task state machine, cycle detection).

**Rationale:**

- Evidence: 100% test pass rate (211/211) masks critical coverage gaps in routing logic, state machine, cycle detection
- Impact: Gaps could corrupt workflows under load (tasks stuck, infinite loops, specialist misrouting)
- "Test later" approach failed (memory shows 3 late-discovered bugs in previous pipeline)
- Deployment blockers take precedence over feature velocity

**Implementation:**

- Block all feature PRs until P0 tests pass
- QA must validate routing-guard Check 7 (20 tests), task-lifecycle-state (15 tests), cycle-detector (10 tests)
- Timeline: 3.5 days to close all P0 gaps

**Pattern:** High test pass rate ≠ comprehensive coverage → use audit findings as coverage proxy, not just pass rate.

**Evidence:** QA report documented 6 critical gaps despite 100% test pass rate; architect and security independently flagged routing-guard untested.

---

## ADR-137: Structured Repository Reconnaissance Pattern (2026-02-17)

**Status:** ACCEPTED
**Decision:** Mandate a tiered reconnaissance pattern (`Map -> Identify -> Fetch`) for all repository ingestion and onboarding tasks, implemented via the `github-ops` skill.

**Context:**

- Repository onboarding tasks often enter "failure loops" where agents guess file paths or attempt to fetch large files blindly.
- Log analysis (session `d8c6d343`) showed 60+ tool uses wasted on "File does not exist" errors and streaming stalls due to blind fetching.
- Agents frequently use Linux-style paths (`/c/dev/...`) on Windows, triggering security blocks or tool crashes.
- High token waste: fetching a 26KB `CHANGELOG.md` when only the version string was needed.

**Decision:**

1. **Mandatory Reconnaissance Phase:** Agents MUST list directory contents using `gh api` before reading specific files.
2. **Tiered Ingestion:** 
   - Tier 1: List root and core directories (metadata only).
   - Tier 2: Identify and read entrypoints (`README.md`, `package.json`, `gemini-extension.json`).
   - Tier 3: Targeted deep dive into logic files based on Tier 2 findings.
3. **Filtering**: Use `--jq` to filter API responses to minimize context bloat.
4. **Platform Safety**: Enforce native Windows paths and block Linux-specific constructs in `gh` commands via `github-ops` hooks.

**Consequences:**

**Positive:**
- Eliminates "failure loops" from incorrect file path guesses.
- Significantly reduces token usage during discovery phase.
- Improves stability on Windows by enforcing native path patterns.
- Higher success rate for `artifact-integrator` agent.

**Negative:**
- Requires one extra tool call (`gh api`) before reading files.
- Agents must be trained/prompted to use the new `github-ops` skill.

**Related:**
- `github-ops` skill bundle
- `artifact-integrator` specialized agent
- `user-prompt-unified` Platform Awareness Rule

---

## ADR-131: Enforce TaskUpdate via Hook Rather Than Developer Training (2026-02-16 REFLECTION DECISION)
