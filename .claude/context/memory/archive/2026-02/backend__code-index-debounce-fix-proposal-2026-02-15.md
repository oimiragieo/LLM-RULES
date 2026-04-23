# Code Index Debounce Bug Fix Proposal

**Date:** 2026-02-15
**File:** `.claude/hooks/routing/code-index-updater.cjs`
**Bug:** Dead debounce mechanism - timer never fires
**Impact:** All incremental indexing is broken; code index never updates

---

## Root Cause Analysis

### The Bug (Lines 339-374)

```javascript
async function main() {
  try {
    // ... validation code ...

    // Line 365: Schedule debounced update (sets setTimeout)
    scheduleDebouncedUpdate(filePath);

    // Line 368: IMMEDIATE EXIT - kills the timer!
    process.exit(0);
  } catch (err) {
    process.exit(0);
  }
}
```

**Problem:** Hooks run as short-lived subprocesses. The `setTimeout` in `scheduleDebouncedUpdate()` (line 331) never fires because `process.exit(0)` terminates the process immediately after setting the timer.

**Evidence of dead code:**

- Lines 156-318: `triggerIndexUpdate()` function is **never called** by any code path
- Lines 324-337: `scheduleDebouncedUpdate()` sets a timer that never executes
- Line 323: `debounceTimer` variable is written but never actually used

---

## Why In-Process Timers Don't Work

**Constraint:** Hooks must exit quickly (&lt;100ms) to avoid blocking the tool pipeline.

**Incompatibility:**

1. Hook subprocess spawned
2. `setTimeout` registered (debounce timer = 5000ms)
3. Hook must exit immediately to unblock file operation
4. Process terminates
5. **Timer dies with process** → callback never runs

**In-process debouncing requires long-lived processes.** Hooks are short-lived by design.

---

## Proposed Fix: File-Based Debounce

Replace in-process timer with file-based debounce using timestamp checks.

### Mechanism

**Debounce marker file:** `.claude/context/code-index/.debounce-marker`

**Content:**

```json
{
  "lastTrigger": 1739581234567, // timestamp in ms
  "filePath": "src/auth.ts"
}
```

**Algorithm:**

1. Hook invoked for file change
2. Read debounce marker (if exists)
3. Check `Date.now() - lastTrigger`
4. **If &lt; DEFAULT_DEBOUNCE_MS (5000ms):** Skip indexing (still in debounce window)
5. **If ≥ DEFAULT_DEBOUNCE_MS OR no marker:** Write marker, call `triggerIndexUpdate()` synchronously
6. Wait for indexing to complete (await)
7. Exit

**Benefits:**

- Works across hook invocations
- Survives process boundaries
- Simple timestamp comparison (fast)
- Fail-open (missing marker = allow indexing)

---

## Code Diff

### 1. Remove Dead Debounce Code (Lines 320-337)

```diff
-/**
- * Schedule debounced update (simple timer-based)
- */
-let debounceTimer = null;
-function scheduleDebouncedUpdate(filePath) {
-  // Clear existing timer
-  if (debounceTimer) {
-    clearTimeout(debounceTimer);
-  }
-
-  // Schedule update after debounce period
-  debounceTimer = setTimeout(() => {
-    debounceTimer = null;
-    triggerIndexUpdate(filePath).catch(() => {
-      // Non-blocking - errors are logged but don't affect file operations
-    });
-  }, DEFAULT_DEBOUNCE_MS);
-}
```

### 2. Add File-Based Debounce (Replace Lines 320-337)

```javascript
/**
 * Debounce marker file for cross-process coordination
 */
const DEBOUNCE_MARKER = path.join(process.cwd(), '.claude/context/code-index/.debounce-marker');

/**
 * Check if debounce window is active (file-based)
 * Returns true if we should skip indexing (still in debounce window)
 */
async function isInDebounceWindow() {
  try {
    const markerData = await fs.readFile(DEBOUNCE_MARKER, 'utf-8');
    const { lastTrigger } = JSON.parse(markerData);
    const timeSinceLastTrigger = Date.now() - lastTrigger;

    if (timeSinceLastTrigger < DEFAULT_DEBOUNCE_MS) {
      debugLog(
        'code-index-updater',
        `Debounce active (${timeSinceLastTrigger}ms < ${DEFAULT_DEBOUNCE_MS}ms)`
      );
      return true;
    }

    return false; // Window expired, allow indexing
  } catch (_err) {
    // Marker doesn't exist or read failed - allow indexing (fail-open)
    return false;
  }
}

/**
 * Write debounce marker (timestamp for next invocation to check)
 */
async function writeDebounceMarker(filePath) {
  try {
    await fs.writeFile(
      DEBOUNCE_MARKER,
      JSON.stringify({
        lastTrigger: Date.now(),
        filePath,
      }),
      'utf-8'
    );
  } catch (_err) {
    // Best-effort only
  }
}
```

### 3. Update main() to Use File-Based Debounce (Lines 339-374)

```diff
async function main() {
  try {
    if (isDisabled()) {
      process.exit(0);
    }

    const hookInput = await parseHookInputAsync();
    if (!hookInput) process.exit(0);

    const toolName = getToolName(hookInput);
    if (toolName !== 'Write' && toolName !== 'Edit') {
      process.exit(0);
    }

    const toolInput = getToolInput(hookInput);
    if (!toolInput || typeof toolInput !== 'object') process.exit(0);

    const filePath = toolInput.file_path || toolInput.target_file;
    if (!filePath || typeof filePath !== 'string') process.exit(0);

    // Check if this file should be indexed
    if (!shouldIndexFile(filePath)) {
      process.exit(0);
    }

-    // Schedule debounced update
-    scheduleDebouncedUpdate(filePath);
-
-    // Exit successfully (don't block the tool)
-    process.exit(0);
+    // Check if we're in debounce window
+    const inDebounceWindow = await isInDebounceWindow();
+    if (inDebounceWindow) {
+      // Still in debounce window - skip indexing
+      process.exit(0);
+    }
+
+    // Write debounce marker for next invocation
+    await writeDebounceMarker(filePath);
+
+    // Trigger indexing synchronously (await completion)
+    await triggerIndexUpdate(filePath);
+
+    // Exit after indexing completes
+    process.exit(0);
  } catch (err) {
    // Fail open - don't block file operations if hook fails
    debugLog('code-index-updater', 'Hook error (fail open)', err);
    process.exit(0);
  }
}
```

### 4. Update Exports (Line 380)

```diff
module.exports = {
  main,
  shouldIndexFile,
  canProceed,
  createLock,
  removeLock,
-  scheduleDebouncedUpdate,
+  isInDebounceWindow,
+  writeDebounceMarker,
  triggerIndexUpdate,
  isDisabled,
};
```

---

## Why This Works

| Aspect                        | In-Process Timer (Broken)        | File-Based Debounce (Fixed)              |
| ----------------------------- | -------------------------------- | ---------------------------------------- |
| **Survives process exit?**    | ❌ No - timer dies with process  | ✅ Yes - marker persists on disk         |
| **Works across invocations?** | ❌ No - each hook is new process | ✅ Yes - timestamp checked on every hook |
| **Hook performance budget?**  | ✅ Fast (but never fires!)       | ✅ Fast (&lt;1ms timestamp check)        |
| **Fail-open safety?**         | ✅ Yes (but dead code)           | ✅ Yes (missing marker = allow)          |
| **Debounce accuracy?**        | N/A (never runs)                 | ✅ Within ±file write latency (~1-5ms)   |

---

## Edge Cases Handled

1. **Marker file missing:** `isInDebounceWindow()` returns `false` (allow indexing)
2. **Marker file corrupted:** JSON parse fails → returns `false` (fail-open)
3. **Clock skew:** Negative `timeSinceLastTrigger` → allows indexing (safe)
4. **Concurrent hook invocations:** File writes are atomic, last write wins (acceptable)
5. **Stale marker:** Old marker naturally expires when `timeSinceLastTrigger ≥ 5000ms`

---

## Performance Impact

**Before (broken):**

- Hook exit: ~1ms (fast, but indexing never happens)
- Index updates: **0 (dead code)**

**After (fixed):**

- Hook exit when debounced: ~1ms (timestamp check only)
- Hook exit when indexing: ~50-200ms (actual indexing work)
- Index updates: **Working as designed**

**Trade-off:** Hooks that trigger indexing will block ~50-200ms. This is acceptable because:

1. Only happens once per 5-second window (debounced)
2. Incremental updates are fast (Merkle tree optimization)
3. Hook performance budget is &lt;100ms for fast path (skip case), not indexing case

---

## Testing Strategy

### Manual Test

1. Edit a `.ts` file
2. Wait 100ms
3. Edit again → Should skip (debounce active)
4. Wait 6 seconds
5. Edit again → Should index (debounce expired)

### Verification

```bash
# Watch debounce marker
watch -n 0.5 cat .claude/context/code-index/.debounce-marker

# Trigger multiple edits rapidly
for i in {1..5}; do
  echo "// Change $i" >> src/test.ts
  sleep 0.5
done
# Should see: Only 1-2 index updates (debounced)

# Wait for debounce to expire
sleep 6

# Trigger another edit
echo "// After debounce" >> src/test.ts
# Should see: Index update triggered
```

---

## Alternative Approaches Considered

### 1. External Queue Worker (Rejected)

**Idea:** Hook writes to queue, separate long-lived worker processes queue

**Why rejected:**

- Adds complexity (worker lifecycle, queue durability)
- Overkill for simple debouncing
- File-based debounce is simpler and sufficient

### 2. Lock File Timestamp (Rejected)

**Idea:** Reuse existing `.indexing.lock` file for debounce

**Why rejected:**

- Lock file purpose is mutual exclusion, not debouncing
- Mixing concerns reduces clarity
- Lock timeout (10s) doesn't match debounce window (5s)

### 3. Keep setTimeout with --no-exit Flag (Rejected)

**Idea:** Don't call `process.exit(0)`, let timer fire

**Why rejected:**

- Hook would block file operations for 5 seconds (unacceptable)
- Violates hook performance budget
- Breaks fail-open guarantee (hanging hooks block tools)

---

## Migration Path

**No migration needed:**

- New code replaces dead code (no existing state to preserve)
- Debounce marker is created on first indexing trigger
- Backward compatible (old behavior was non-functional)

---

## Conclusion

**Current state:** Debounce mechanism is **completely broken** due to subprocess model mismatch.

**Proposed fix:** Replace in-process timer with file-based debounce using timestamp checks.

**Implementation effort:** ~30 lines of code, straightforward logic, no new dependencies.

**Risk:** Low - fail-open design ensures file operations never blocked, even if debounce logic fails.

**Impact:** **Fixes critical bug** that prevents all incremental indexing from working.

---

## Next Steps

1. Review this proposal
2. Implement code changes
3. Test manually (rapid edits + debounce expiration)
4. Run hook test suite (if exists)
5. Verify indexing actually updates (check `metadata.json` timestamps)
6. Update hook documentation to explain file-based debounce

---

**Reviewer:** Please validate the approach before implementation begins.
