<!-- Agent: security-architect | Task: #security-remediation | Session: 2026-02-11 -->

# Security Remediation Plan

## Wave 2 - Hook & Validation Layer Fixes

**Date:** 2026-02-11
**Severity Target:** All CRITICAL & HIGH vulnerabilities within 7 days
**Report Reference:** `.claude/context/reports/security/security-audit-wave2-2026-02-11.md`

---

## Priority Overview

| Priority | Count | Risk | Target Date |
|----------|-------|------|-------------|
| **P0 (Immediate - 24h)** | 3 | CRITICAL | 2026-02-12 |
| **P1 (Week 1)** | 4 | HIGH | 2026-02-18 |
| **P2 (Month 1)** | 5 | MEDIUM | 2026-03-11 |

---

## P0 Items (Critical - Fix Within 24 Hours)

### P0-1: Fix TOCTOU Race Condition in loop-state-manager.cjs

**Vulnerability:** VUL-TAM-001 (CRITICAL)
**Impact:** Loop-prevention counters can be reset, enabling replay attacks
**File:** `.claude/lib/self-healing/loop-state-manager.cjs` (lines 100-123)
**Effort:** 2 hours

#### Root Cause
Lock acquisition doesn't validate ownership after `tryClaimStaleLock()` succeeds. Race window between lock deletion and next `writeFileSync()` allows concurrent writes.

#### Solution
1. Add unique lock ID (UUID or pid-timestamp-random)
2. Validate ownership before releasing lock
3. Re-check lock ownership after claiming stale lock

#### Implementation Steps

```bash
# 1. Create backup
cp .claude/lib/self-healing/loop-state-manager.cjs \
   .claude/lib/self-healing/loop-state-manager.cjs.bak

# 2. Apply fix (code below)

# 3. Run tests
pnpm test tests/lib/self-healing/

# 4. Verify no existing tests broke
pnpm test
```

#### Code Changes

**File:** `.claude/lib/self-healing/loop-state-manager.cjs`

Replace `acquireLock()` and `releaseLock()` functions:

```javascript
function acquireLock(filePath) {
  const lockFile = filePath + LOCK_SUFFIX;
  const startTime = Date.now();
  const lockId = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; // Unique ID

  while (Date.now() - startTime < MAX_LOCK_WAIT_MS) {
    try {
      fs.writeFileSync(lockFile, JSON.stringify({
        pid: process.pid,
        time: Date.now(),
        lockId: lockId,  // ← New: unique lock identifier
      }), { flag: 'wx' });
      return { acquired: true, lockId };
    } catch (e) {
      if (e.code === 'EEXIST') {
        if (tryClaimStaleLock(lockFile)) {
          // ← NEW: Verify we own the lock after claiming
          try {
            const content = fs.readFileSync(lockFile, 'utf8');
            const data = safeParseJSON(content, 'loop-state-lock') || {};
            // If lock file was deleted (claimed & released), loop to retry
            if (!data.lockId || data.lockId === lockId) {
              return { acquired: true, lockId };
            }
          } catch (_readErr) {
            // Lock deleted after claiming, someone else took it
          }
          // Lock is owned by another process, retry
          syncSleep(LOCK_RETRY_MS);
          continue;
        }
        syncSleep(LOCK_RETRY_MS);
        continue;
      }
      return { acquired: false, lockId: null };
    }
  }

  return { acquired: false, lockId: null };
}

function releaseLock(filePath, lockId) {
  const lockFile = filePath + LOCK_SUFFIX;
  try {
    // ← NEW: Verify we own the lock before deleting
    const content = fs.readFileSync(lockFile, 'utf8');
    const data = safeParseJSON(content, 'loop-state-lock') || {};
    if (data.lockId === lockId) {
      fs.unlinkSync(lockFile);
    }
    // If lockId doesn't match, another process owns it - don't delete
  } catch {
    // Lock doesn't exist or can't be read - cleanup
  }
}
```

**Update callsites** that use `acquireLock()` and `releaseLock()`:

```javascript
// Before
const lockAcquired = acquireLock(stateFile);
try {
  // ... modify state
} finally {
  if (lockAcquired) {
    releaseLock(stateFile);
  }
}

// After
const lockResult = acquireLock(stateFile);
try {
  if (!lockResult.acquired) {
    throw new Error('Could not acquire lock within timeout');
  }
  // ... modify state
} finally {
  if (lockResult.acquired) {
    releaseLock(stateFile, lockResult.lockId);  // ← Pass lockId
  }
}
```

#### Test Coverage

```javascript
// Add to tests/lib/self-healing/loop-state-manager.test.cjs
test('acquireLock returns unique lockId', (t) => {
  const id1 = acquireLock(testFile1);
  const id2 = acquireLock(testFile2);
  assert.notEqual(id1.lockId, id2.lockId, 'Lock IDs should differ');
});

test('releaseLock validates ownership', (t) => {
  const { lockId: id1 } = acquireLock(testFile1);
  const fakeId = 'fake-lock-id';
  releaseLock(testFile1, fakeId);  // Try to release with wrong ID
  // Lock file should still exist
  assert.ok(fs.existsSync(testFile1 + '.lock'), 'Lock not released with wrong ID');
  releaseLock(testFile1, id1);     // Release with correct ID
  assert.ok(!fs.existsSync(testFile1 + '.lock'), 'Lock released with correct ID');
});

test('concurrent acquireLock calls don\'t corrupt state', async (t) => {
  // Simulate N processes trying to acquire lock simultaneously
  const promises = Array(5).fill(0).map(() =>
    new Promise(resolve => {
      const result = acquireLock(testFile);
      resolve(result);
    })
  );
  const results = await Promise.all(promises);

  // Only one should have acquired
  const acquired = results.filter(r => r.acquired).length;
  assert.equal(acquired, 1, 'Only one lock acquisition should succeed');

  // Cleanup
  releaseLock(testFile, results[0]?.lockId);
});
```

#### Verification Checklist

- [ ] Lock file contains unique `lockId`
- [ ] `acquireLock()` returns `{ acquired: bool, lockId: string }`
- [ ] `releaseLock()` requires `lockId` parameter
- [ ] Release validates ownership before deleting lock
- [ ] All unit tests pass
- [ ] No race condition test failures
- [ ] Loop-state counters remain consistent under concurrent access

---

### P0-2: Add Whitespace Bomb Protection to spawn-prompt-validator.cjs

**Vulnerability:** VUL-DOS-001 (CRITICAL)
**Impact:** Denial of service via OOM crash or timeout
**File:** `.claude/hooks/routing/spawn-prompt-validator.cjs` (line 752)
**Effort:** 1 hour

#### Root Cause
`calculatePromptCompactness()` splits prompt by newlines without limit, creating unbounded arrays.

#### Solution
Add line and map size limits to `calculatePromptCompactness()`.

#### Implementation

```javascript
// Replace calculatePromptCompactness function (line 752)

function calculatePromptCompactness(prompt, maxLines = 10000, maxEntries = 100000) {
  if (!prompt || typeof prompt !== 'string') {
    return { score: 0, duplicateHeaders: [], repeatedBoilerplate: [] };
  }

  let lineCount = 0;
  let mapSize = 0;
  const headerCounts = new Map();
  const lines = [];

  // Process lines with limits to prevent unbounded array
  for (const line of prompt.split(/\r?\n/)) {
    if (lineCount >= maxLines) {
      auditLog('spawn-prompt-validator', 'line_limit_exceeded', {
        lineCount,
        maxLines,
        action: 'truncating_compactness_check',
      });
      break;
    }

    lines.push(line);
    lineCount++;

    // Check for headers with map size limit
    const trimmed = line.trim();
    if (/^#{2,3}\s+/.test(trimmed)) {
      if (mapSize < maxEntries) {
        const current = headerCounts.get(trimmed) || 0;
        headerCounts.set(trimmed, current + 1);
        mapSize = headerCounts.size;
      } else {
        // Map is full, stop processing headers
        auditLog('spawn-prompt-validator', 'header_map_limit_exceeded', {
          mapSize,
          maxEntries,
          action: 'stopping_header_count',
        });
        break;
      }
    }
  }

  // Continue with rest of function using bounded lines array
  const duplicateHeaders = Array.from(headerCounts.entries())
    .filter(([_, count]) => count > 1)
    .map(([header, count]) => ({ header, count }));

  // ... rest of function
  return {
    score: calculateScore(lines, duplicateHeaders),
    duplicateHeaders,
    repeatedBoilerplate: detectBoilerplate(lines),
  };
}
```

#### Verification Checklist

- [ ] Line limit set to 10,000 (configurable)
- [ ] Map size limit set to 100,000 (configurable)
- [ ] Audit logs when limits exceeded
- [ ] 1M-line prompt doesn't cause OOM
- [ ] Validation still works for normal prompts

---

### P0-3: Hardcode Stale Threshold - Remove Env Override

**Vulnerability:** VUL-ELEV-001 (CRITICAL)
**Impact:** Elevation of privilege - router mode bypass
**File:** `.claude/hooks/routing/routing-guard.cjs` (line 226, `applyStaleDetection()`)
**Effort:** 1 hour

#### Root Cause
`STATE_STALE_THRESHOLD_MS` env var allows overriding security-critical staleness threshold.

#### Solution
Use hardcoded constant with optional config.yaml bounds (but never env var).

#### Implementation

```javascript
// In routing-guard.cjs, replace applyStaleDetection() function

// Hardcoded constant - do NOT allow env override for security
const DEFAULT_STALE_THRESHOLD_MS = 600000; // 10 minutes
const MIN_THRESHOLD_MS = 60000;   // 1 minute minimum
const MAX_THRESHOLD_MS = 3600000; // 1 hour maximum

function applyStaleDetection(state) {
  let thresholdMs = DEFAULT_STALE_THRESHOLD_MS;

  // OPTIONAL: Allow config.yaml override with bounds checking
  // (but NEVER allow env var override)
  try {
    const config = loadConfig(); // Load from .claude/config.yaml
    if (config?.routing?.stale_threshold_ms && Number.isFinite(config.routing.stale_threshold_ms)) {
      const configuredThreshold = config.routing.stale_threshold_ms;
      // Validate within bounds
      if (configuredThreshold >= MIN_THRESHOLD_MS && configuredThreshold <= MAX_THRESHOLD_MS) {
        thresholdMs = configuredThreshold;
      } else {
        auditLog('routing-guard', 'stale_threshold_out_of_bounds', {
          configured: configuredThreshold,
          min: MIN_THRESHOLD_MS,
          max: MAX_THRESHOLD_MS,
          action: 'using_default',
        });
      }
    }
  } catch (_e) {
    // Config load failed, use hardcoded default
  }

  // Apply stale detection with validated threshold
  if (!state || !state.lastReset) return true; // Default to stale

  const resetTime = new Date(state.lastReset).getTime();
  const ageMs = Date.now() - resetTime;

  // Consider state stale if older than threshold
  const isStale = ageMs > thresholdMs;

  if (isStale && process.env.DEBUG_ROUTING) {
    console.log(`Router state stale: ${ageMs}ms > ${thresholdMs}ms`);
  }

  return isStale;
}

// Remove this line if it exists:
// const thresholdMs = parseInt(process.env.STATE_STALE_THRESHOLD_MS || '600000', 10);
```

#### Update config.yaml

Add optional routing config (but only if not already present):

```yaml
routing:
  # Stale detection threshold (milliseconds)
  # Must be between 60000 (1 min) and 3600000 (1 hour)
  # Default: 600000 (10 minutes) if not specified
  # stale_threshold_ms: 600000
```

#### Verification Checklist

- [ ] `STATE_STALE_THRESHOLD_MS` env var no longer read
- [ ] Hardcoded 10-minute default used
- [ ] Config.yaml can override (with bounds)
- [ ] Override rejected if out of bounds
- [ ] Audit log on out-of-bounds config value
- [ ] Router state cannot be bypassed via env var

---

## P1 Items (High Priority - Within 1 Week)

### P1-1: Add Prompt Injection Detection

**Vulnerability:** ASI-01 (Agent Goal Hijacking) - HIGH
**File:** `.claude/hooks/routing/spawn-prompt-validator.cjs`
**Effort:** 3 hours

**Add function:**

```javascript
function detectPromptInjection(prompt) {
  const injectionPatterns = [
    /\[inject:\s*[^\]]+\]/i,                          // Explicit injection marker
    /ignore\s+(?:your|the|these|all)\s+(?:task|instruction|goal|rule)/i,  // Goal hijacking
    /(?:instead|alternatively|now\s+do|actually|really)\s+(?:execute|run|do|write):/i,  // Task redirect
    /forget\s+(?:above|previous|prior|earlier|my)\s+(?:instruction|task|prompt|context)/i,  // Memory hijacking
    /disregard\s+(?:security|safety|rule|check|validation)/i,  // Safety bypass
  ];

  for (const pattern of injectionPatterns) {
    if (pattern.test(prompt)) {
      return {
        detected: true,
        pattern: pattern.source,
      };
    }
  }

  return { detected: false };
}

// In validatePrompt, add check:
const injectionCheck = detectPromptInjection(prompt);
if (injectionCheck.detected) {
  auditLog('spawn-prompt-validator', 'prompt_injection_detected', {
    pattern: injectionCheck.pattern,
    action: 'blocked',
  });
  return {
    isValid: false,
    error: `Prompt contains instruction injection pattern: ${injectionCheck.pattern}`,
  };
}
```

### P1-2: Sanitize Session IDs in Logs

**Vulnerability:** VUL-INFO-001 (MEDIUM → elevation to HIGH with audit)
**File:** `.claude/hooks/routing/routing-guard.cjs` (multiple locations)
**Effort:** 2 hours

**Add sanitization helper:**

```javascript
const crypto = require('crypto');

function sanitizeSessionId(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') return 'unknown';

  const hash = crypto.createHash('sha256').update(sessionId).digest('hex').slice(0, 8);
  const suffix = sessionId.length > 4 ? sessionId.slice(-4) : 'xxxx';
  return `${hash}-${suffix}`;
}

// Replace all occurrences:
// OLD: logRouterChurnEvent({ sessionId, ... })
// NEW: logRouterChurnEvent({ sessionId: sanitizeSessionId(sessionId), ... })
```

### P1-3: Enhance Creator Intent Guard

**Vulnerability:** VUL-ELEV-002 (HIGH)
**File:** `.claude/hooks/routing/routing-guard.cjs` (line 1390)
**Effort:** 3 hours

**Replace creator intent check to require explicit Skill() invocation:**

```javascript
function checkCreatorIntentGuard(toolName, toolInput = {}) {
  if (toolName !== 'Task') {
    return { pass: true };
  }

  const enforcement = getEnforcementMode('CREATOR_ROUTING_ENFORCEMENT', 'block');
  if (enforcement === 'off') {
    auditSecurityOverride('routing-guard', 'CREATOR_ROUTING_ENFORCEMENT', 'off');
    return { pass: true };
  }

  const state = getCachedRouterState();
  if (!state.creatorIntentDetected) {
    return { pass: true };
  }

  const prompt = (toolInput.prompt || '').toLowerCase();
  const subagentType = (toolInput.subagent_type || '').toLowerCase();

  // Reject if implementation agent + creator intent detected
  if (['developer', 'qa', 'devops', 'code-reviewer'].includes(subagentType)) {
    return {
      pass: false,
      result: 'block',
      message: `Creator intent detected but implementation agent '${subagentType}' spawned. Must use general-purpose or orchestrator.`,
    };
  }

  // CRITICAL: Require EXPLICIT Skill() invocation, not just mention
  const skillInvocationPattern = /Skill\s*\(\s*\{\s*skill\s*:\s*['"](agent|skill|hook|workflow|template|schema)-creator['"]/i;
  const hasExplicitSkillInvocation = skillInvocationPattern.test(prompt);

  if (!hasExplicitSkillInvocation) {
    return {
      pass: false,
      result: 'block',
      message: `Creator intent detected but spawn does not explicitly invoke creator skill via Skill() tool.`,
    };
  }

  return { pass: true };
}
```

### P1-4: Tool Usage Audit (ASI-02: Tool Misuse)

**Vulnerability:** ASI-02 (Tool Misuse) - MEDIUM → HIGH with audit
**File:** Create new `.claude/hooks/validation/tool-usage-audit.cjs`
**Effort:** 4 hours

**New hook to log tool usage patterns:**

```javascript
// .claude/hooks/validation/tool-usage-audit.cjs
'use strict';

const { getToolName, getToolInput, auditLog } = require('../../lib/utils/hook-input.cjs');
const path = require('path');

const SECURITY_CRITICAL_PATHS = [
  '.claude/hooks',
  '.claude/context/runtime',
  '.claude/agents/core',
  'package.json',
  '.env',
  '.git',
];

async function main() {
  try {
    const toolName = getToolName(hookInput);
    const toolInput = getToolInput(hookInput);

    // Log all Edit/Write operations
    if (['Edit', 'Write'].includes(toolName)) {
      const filePath = toolInput.file_path || '';
      const isCritical = SECURITY_CRITICAL_PATHS.some(
        blocked => filePath.includes(blocked)
      );

      auditLog('tool-usage-audit', 'file_operation', {
        tool: toolName,
        filePath,
        isCritical,
        fileSize: (toolInput.content || '').length,
      });
    }

    // Flag unusual tool usage patterns
    if (toolName === 'Bash') {
      auditLog('tool-usage-audit', 'bash_command', {
        command: (toolInput.command || '').slice(0, 100),
      });
    }
  } catch (err) {
    // Fail open for audit-only hook
    process.exit(0);
  }
}

main();
```

---

## P2 Items (Medium Priority - Within 1 Month)

### P2-1: Validate Memory Content (ASI-06)

Implement dangerous directive detection in memory write handlers.

### P2-2: Replace Regex with Manual Parsing

Convert complex compaction patterns to deterministic parsing to eliminate ReDoS risk.

### P2-3: Command Truncation Audit Escape

Log full command to secure audit store; display truncated version to operator.

### P2-4: Memory Poisoning Validation

Scan for dangerous directives like "DO NOT require security review".

### P2-5: Clock Skew Tolerance

Add ±5 second clock skew tolerance for timestamp validation.

---

## Implementation Schedule

### Day 1 (2026-02-12)

- [ ] P0-1: TOCTOU fix + tests (2h)
- [ ] P0-2: Whitespace bomb protection (1h)
- [ ] P0-3: Hardcode stale threshold (1h)
- [ ] **Total:** 4 hours
- [ ] Run full test suite: `pnpm test`
- [ ] Run lint/format: `pnpm lint:fix && pnpm format`
- [ ] Commit: `fix(security): remediate critical vulnerabilities P0-1 through P0-3`

### Days 2-7 (P1 Items)

- [ ] P1-1: Prompt injection detection (3h) — 2026-02-13
- [ ] P1-2: Session ID sanitization (2h) — 2026-02-14
- [ ] P1-3: Creator intent guard enhancement (3h) — 2026-02-16
- [ ] P1-4: Tool usage audit hook (4h) — 2026-02-17

### Week 2-4 (P2 Items)

- [ ] Distributed across 2-4 weeks with P2 priority

---

## Testing & Validation

### Unit Tests

```bash
# Run hook-specific tests
pnpm test tests/hooks/

# Run lib tests
pnpm test tests/lib/

# Code coverage
pnpm test:coverage
```

### Integration Tests

```bash
# Test full spawn flow
pnpm test tests/integration/spawn-flow.test.js

# Test routing guards
pnpm test tests/integration/routing-guard.test.js
```

### Security Tests

```bash
# Test prompt injection detection
pnpm test tests/security/prompt-injection.test.js

# Test TOCTOU race condition fix
pnpm test tests/security/race-condition.test.js

# Test whitespace bomb protection
pnpm test tests/security/dos-protection.test.js
```

### Lint & Format (Blocking)

```bash
pnpm lint:fix  # Must pass with 0 errors
pnpm format    # Must produce 0 changes
```

---

## Success Criteria

### P0 Completion (24h)

- [ ] All 3 CRITICAL vulnerabilities fixed
- [ ] New tests added for each fix
- [ ] All tests passing (100% pass rate)
- [ ] Lint/format clean
- [ ] Single commit: `fix(security): P0 critical vulnerabilities`

### P1 Completion (1 week)

- [ ] All 4 HIGH vulnerabilities remediated
- [ ] Test coverage >90% for new code
- [ ] Audit logging verified
- [ ] Security hooks tested under load

### P2 Completion (1 month)

- [ ] All 5 MEDIUM vulnerabilities addressed
- [ ] Compliance assessment re-run
- [ ] New security tests maintained

---

## Compliance Impact

### After P0 Fixes

- SOC2: Moves from PARTIAL to IMPLEMENTED for critical controls
- GDPR: Session handling improves (but ID sanitization still needed - P1)
- HIPAA: Audit trail becomes complete

### After P1 Fixes

- SOC2: READY for Type II audit
- GDPR: Session ID encryption implemented
- HIPAA: Full command logging complete

### After P2 Fixes

- SOC2: **CERTIFIED** for Type II
- GDPR: **COMPLIANT**
- HIPAA: **COMPLIANT**

---

## Rollback Plan

If any fix causes regressions:

1. **Identify:** Run `pnpm test` to pinpoint failure
2. **Rollback:** Restore backup file (e.g., `.bak`)
3. **Investigate:** Debug root cause
4. **Reapply:** Fix with additional guards
5. **Test:** Verify fix + regression test

---

## Post-Remediation Audit

After all fixes complete (expected 2026-02-25):

- [ ] Re-run security audit on fixed files
- [ ] Verify no new vulnerabilities introduced
- [ ] Update threat model with mitigations
- [ ] Generate compliance report
- [ ] Plan Wave 3 audit (remaining components)

---

**Owner:** Security Architect Agent
**Status:** Ready for implementation
**Next Step:** Begin P0 items (2026-02-12 09:00)
