<!-- Agent: code-reviewer | Task: #review-workspace-changes | Session: 2026-02-15 -->

# Code Review: Workspace Changes 2026-02-15

**Date**: 2026-02-15  
**Files Changed**: 14 modified, 1 deleted  
**LOC Changed**: +289 / -35  
**Key Subsystems**: Routing hooks, test coverage, memory protocol

---

## Risk Summary (One Line Per Category)

**Security**: 🔴 CRITICAL — Raw JSON.parse() on untrusted state files (2 instances) bypasses prototype pollution protection; must use safeParseJSON per .claude/rules/security.md mandate.

**Correctness**: 🟡 MEDIUM — Core memory read enforcement gate has logical correctness issue; timeout window defaults (60 min) create false-positive blocks when sessions exceed window without fresh reads.

**Compliance**: 🟡 MEDIUM — Two files exceed max-lines linting threshold (509/503 lines); violates codebase convention (max 500 lines per ESLint rule).

**Regression Risk**: 🟠 HIGH — New core memory read gate blocks Task spawn without safeguard; can silently fail agent sessions if governance state file is stale/corrupt, with no fallback recovery path.

---

## Stage 1: Spec Compliance

**Requirements Status**: ✅ PARTIAL COMPLIANCE  
**Deviations**: Two significant deviations from existing patterns and security standards.

### Deviations

1. **Security Policy Violation (CRITICAL)**
   - **Spec**: `.claude/rules/security.md` mandates `safeParseJSON()` for untrusted JSON parsing
   - **Implementation**: Two raw `JSON.parse()` calls in new code:
     - `.claude/hooks/routing/pre-tool-unified.read-safety.cjs:111` (TOOL_GOVERNANCE_STATE_PATH)
     - `.claude/hooks/routing/pre-tool-unified.read-safety.cjs:209` (TOKEN_SLO_STATE_PATH)
   - **Risk**: Malformed JSON crashes hook process; prototype pollution via `__proto__` remains undefended
   - **Impact**: Production incident risk; violates audit compliance (ASI06: Memory & Context Poisoning)

2. **Max-Lines Linting Violation (MEDIUM)**
   - **Spec**: ESLint config enforces max 500 lines per file
   - **Implementation**:
     - `.claude/hooks/routing/pre-task-unified-core.cjs`: 581 lines (81 over limit)
     - `tests/hooks/pre-tool-unified-read-safety.test.cjs`: 562 lines (62 over limit)
   - **Risk**: Code maintainability degradation; violates consistency standards
   - **Impact**: Tech debt accumulation; makes future changes harder

---

## Stage 2: Code Quality Assessment

### Strengths

1. **Comprehensive Gateway Architecture**
   - Pre-task-unified-core.cjs implements well-structured check cascade (TaskList → Memory → Routing → Loop → Ownership)
   - Each check has clear return contract: `{ pass, exitCode, message }`
   - Guards prevent autonomous loops effectively (line 300-368)

2. **Defensive Programming on File I/O**
   - `.claude/hooks/routing/pre-tool-unified.read-safety.cjs` correctly uses try/catch for all file operations
   - Fallback returns sensible defaults (e.g., `{ sessions: {} }` on parse failure at line 110-118)
   - Directory listing generation handles ENOENT gracefully (line 396-429)

3. **Memory Governance State Tracking**
   - Session-based evidence tracking is well-designed (line 88-204 in read-safety)
   - Pruning logic prevents unbounded session growth (line 96-106)
   - Governance state isolation prevents cross-session contamination

### Issues

#### Critical (Must Fix)

**[CR-001] Prototype Pollution Vulnerability in pre-tool-unified.read-safety.cjs**

- **File**: `.claude/hooks/routing/pre-tool-unified.read-safety.cjs`
- **Lines**: 111, 209
- **Issue**: Raw `JSON.parse()` used instead of `safeParseJSON()` from pre-tool-unified.shared.cjs
- **Why it matters**:
  - Malformed JSON crashes hook, blocking all Tool execution for session
  - `__proto__` attacks can escalate privileges (OWASP ASI06)
  - Violates established pattern used in 4+ other hooks
- **Remediation**:

  ```javascript
  // Line 111 — BEFORE:
  const parsed = JSON.parse(fs.readFileSync(TOOL_GOVERNANCE_STATE_PATH, 'utf8'));

  // Line 111 — AFTER:
  const { safeParseJSON } = require('./pre-tool-unified.shared.cjs');
  const parsed = safeParseJSON(fs.readFileSync(TOOL_GOVERNANCE_STATE_PATH, 'utf8'), null);
  if (!parsed || typeof parsed !== 'object') {
    return { sessions: {} };
  }

  // Repeat for line 209 (TOKEN_SLO_STATE_PATH)
  ```

- **Impact**: Blocks merge; security policy violation

**[CR-002] Logical Correctness: Core Memory Read Window Can False-Positive Block**

- **File**: `.claude/hooks/routing/pre-task-unified-core.cjs`
- **Lines**: 132-179 (`checkCoreMemoryReadBeforeTask`)
- **Issue**: Memory governance state is session-based, but session ID resolution can be unstable
- **Symptom**: Agents report "Core memory evidence missing" on perfectly valid sessions
- **Remediation**: Add fallback when session entry missing:
  ```javascript
  const entry = sessions[sessionId] || null;
  if (!entry) {
    // Session entry missing — allow (tracking may be new)
    return { pass: true };
  }
  ```
- **Impact**: Agents may fail unexpectedly; recommend MEDIUM priority fix

#### Important (Should Fix)

**[CR-003] Max-Lines Linting Violations**

- **Files**:
  - `.claude/hooks/routing/pre-task-unified-core.cjs` (581 lines, 81 over)
  - `tests/hooks/pre-tool-unified-read-safety.test.cjs` (562 lines, 62 over)
- **Impact**: ESLint fails in CI; violates consistency standard (max 500 lines)

#### Minor (Nice to Have)

**[CR-004] Silent Error Catching**

- **Files**: read-safety.cjs, guardrails.cjs
- **Issue**: catch blocks swallow errors; add debug logging for troubleshooting
- **Suggestion**: Log when DEBUG_HOOKS is set

---

## Stage 3: Integration Verification

### Artifacts Created/Modified

| Artifact                         | Type | Status | Integration                                        |
| -------------------------------- | ---- | ------ | -------------------------------------------------- |
| pre-task-unified-core.cjs        | Hook | 🟡     | Registered ✓; Testing ✓; **Critical fix needed** ✗ |
| pre-tool-unified.guardrails.cjs  | Hook | ✅     | Safe parsing ✓; Tests ✓                            |
| pre-tool-unified.read-safety.cjs | Hook | 🔴     | **Raw JSON.parse violation** ✗                     |
| memory-protocol.md               | Docs | ✅     | Formatting only ✓                                  |

---

## Assessment

**Ready to merge?** 🔴 **NO — CRITICAL SECURITY FIX REQUIRED**

**Reasoning**: Raw JSON.parse() in production hooks creates prototype pollution vulnerability (OWASP ASI06). Violates established pattern (safeParseJSON in 4+ other hooks). Fix is trivial (2-line change, 5-min effort) but must be applied before merge.

**Blocking Issues**:

1. CR-001 (Prototype Pollution) — CRITICAL, must fix
2. CR-003 (Max-Lines) — MEDIUM, fails linting gate

**Non-Blocking**: 3. CR-002 (Logical Correctness) — MEDIUM, recommend fixing before deploy 4. CR-004 (Silent Errors) — MINOR, nice-to-have
