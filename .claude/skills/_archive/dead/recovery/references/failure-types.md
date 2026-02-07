# Failure Type Classification

This document defines the failure types recognized by the recovery system.

## Failure Types

### BROKEN_BUILD

**Definition**: Code does not compile, run, or pass syntax validation.

**Indicators**:

- `syntax error`
- `compilation error`
- `module not found`
- `import error`
- `cannot find module`
- `unexpected token`
- `indentation error`
- `parse error`

**Recovery Action**: ROLLBACK to last known good state, then fix.

**Example**:

```
Error: Cannot find module './utils' from 'src/index.js'
```

---

### VERIFICATION_FAILED

**Definition**: Code runs but fails tests or validation checks.

**Indicators**:

- `verification failed`
- `expected` (assertion mismatch)
- `assertion`
- `test failed`
- `status code` (unexpected HTTP response)

**Recovery Action**: RETRY with a different approach (up to 3 attempts).

**Example**:

```
AssertionError: Expected 200 but got 404
```

---

### CIRCULAR_FIX

**Definition**: Same approach has been tried multiple times without success.

**Indicators**:

- 3+ recent attempts with similar approaches
- Jaccard similarity > 30% between current approach and previous 3 attempts
- Stop words excluded from similarity calculation (with, using, the, a, an, and, or, but, in, on, at, to, for, trying)

**Detection Algorithm**:

```
1. Extract keywords from current approach (excluding stop words)
2. For each of last 3 attempts:
   - Extract keywords from attempt approach
   - Calculate Jaccard similarity: |intersection| / |union|
   - If similarity > 0.3, count as similar
3. If 2+ attempts were similar, classify as CIRCULAR_FIX
```

**Recovery Action**: SKIP and ESCALATE to human intervention.

**Example**:

```
Attempt 1: "Using async await for fetch"
Attempt 2: "Using async/await with try-catch"
Attempt 3: "Using async await pattern"
=> CIRCULAR_FIX detected
```

---

### CONTEXT_EXHAUSTED

**Definition**: Agent ran out of context window mid-task.

**Indicators**:

- `context`
- `token limit`
- `maximum length`

**Recovery Action**: Commit current progress and continue in a new session.

**Example**:

```
Error: Maximum context length (128k tokens) exceeded
```

---

### UNKNOWN

**Definition**: Error that does not match any known pattern.

**Indicators**:

- None of the above indicators match

**Recovery Action**: RETRY once, then ESCALATE if still failing.

**Example**:

```
Error: Connection refused to database server
```

## Classification Priority

When classifying failures, check in this order:

1. **BROKEN_BUILD** - Check for build/syntax error keywords first
2. **VERIFICATION_FAILED** - Check for test/assertion failures
3. **CONTEXT_EXHAUSTED** - Check for token limit errors
4. **CIRCULAR_FIX** - Check attempt history for repetition
5. **UNKNOWN** - Default if nothing else matches

## Integration with Recovery Manager

The `classify_failure()` function in the recovery manager:

```python
def classify_failure(error: str, subtask_id: str) -> FailureType:
    error_lower = error.lower()

    # 1. Check BROKEN_BUILD
    if any(indicator in error_lower for indicator in build_errors):
        return FailureType.BROKEN_BUILD

    # 2. Check VERIFICATION_FAILED
    if any(indicator in error_lower for indicator in verification_errors):
        return FailureType.VERIFICATION_FAILED

    # 3. Check CONTEXT_EXHAUSTED
    if any(indicator in error_lower for indicator in context_errors):
        return FailureType.CONTEXT_EXHAUSTED

    # 4. Check CIRCULAR_FIX (requires history analysis)
    if is_circular_fix(subtask_id, error):
        return FailureType.CIRCULAR_FIX

    # 5. Default to UNKNOWN
    return FailureType.UNKNOWN
```
