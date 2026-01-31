# Code Review Memory Checklist

**Last Updated:** 2026-01-30
**Version:** 1.0.0

## Overview

This checklist helps code reviewers identify memory leak risks before code is merged. Use this for all PRs that modify core libraries, add new classes, or work with long-running operations.

---

## Critical Checks (Block Merge if Missing)

### ✅ No Unbounded Array Growth

**Check for:**

```javascript
// ❌ REJECT: Unbounded array
this.history = [];
this.history.push(data);

// ✅ APPROVE: Bounded with max size
this.history = [];
this.maxHistorySize = 1000;
this.history.push(data);
if (this.history.length > this.maxHistorySize) {
  this.history.shift();
}
```

**Common locations:**

- History/metrics tracking
- Event logs
- Cache implementations
- Sync/state management
- Test result accumulation

**Questions to ask:**

- [ ] Does this array have a maximum size?
- [ ] Is there automatic trimming after push?
- [ ] Could this array grow during long operations?
- [ ] Is there a cleanup method that clears this array?

---

### ✅ Cleanup Called in Test Teardown

**Check for:**

```javascript
// ❌ REJECT: No afterEach cleanup
describe('MyClass', () => {
  let instance;

  beforeEach(() => {
    instance = new MyClass();
  });

  // Missing afterEach - state accumulates across tests
});

// ✅ APPROVE: Proper cleanup
describe('MyClass', () => {
  let instance;

  beforeEach(() => {
    instance = new MyClass();
  });

  afterEach(async () => {
    if (instance) await instance.cleanup();
  });
});
```

**Questions to ask:**

- [ ] Does the test suite have `afterEach` cleanup?
- [ ] Is cleanup called for all test instances?
- [ ] Does the class have a `cleanup()` method?
- [ ] Are all resources released (listeners, timers, handles)?

---

### ✅ Event Listeners Properly Removed

**Check for:**

```javascript
// ❌ REJECT: Listener never removed
class Workflow {
  start() {
    process.on('SIGINT', this.handler);
  }
}

// ✅ APPROVE: Listener removed on cleanup
class Workflow {
  constructor() {
    this.handler = this.cleanup.bind(this);
  }

  start() {
    process.on('SIGINT', this.handler);
  }

  cleanup() {
    process.removeListener('SIGINT', this.handler);
  }
}
```

**Common event sources:**

- `process.on()`
- `EventEmitter.on()`
- `setTimeout()` / `setInterval()`
- WebSocket/HTTP connections
- File watchers

**Questions to ask:**

- [ ] Are all event listeners removed in cleanup?
- [ ] Are bound functions stored for removal?
- [ ] Are timers/intervals cleared?
- [ ] Are connections closed?

---

### ✅ Promises and Callbacks Don't Leak

**Check for:**

```javascript
// ❌ REJECT: Promise holds reference indefinitely
class Cache {
  get(key) {
    return new Promise(resolve => {
      this.waiters[key] = resolve; // Never removed
    });
  }
}

// ✅ APPROVE: Promise resolved and cleaned
class Cache {
  get(key) {
    return new Promise(resolve => {
      const handler = value => {
        delete this.waiters[key]; // Cleanup
        resolve(value);
      };
      this.waiters[key] = handler;
    });
  }
}
```

**Questions to ask:**

- [ ] Are promises resolved/rejected in all code paths?
- [ ] Are callbacks removed after execution?
- [ ] Do error handlers clean up state?
- [ ] Are there timeout handlers for stuck promises?

---

### ✅ File Handles Closed

**Check for:**

```javascript
// ❌ REJECT: File handle not closed
async function processFile(path) {
  const handle = await fs.open(path);
  const data = await handle.readFile();
  return data; // Handle never closed
}

// ✅ APPROVE: File handle closed
async function processFile(path) {
  const handle = await fs.open(path);
  try {
    const data = await handle.readFile();
    return data;
  } finally {
    await handle.close(); // Always closed
  }
}
```

**Questions to ask:**

- [ ] Are file handles closed in all code paths?
- [ ] Is cleanup done in `finally` blocks?
- [ ] Are error cases handled?
- [ ] Are stream resources released?

---

### ✅ Large Objects Not Held Indefinitely

**Check for:**

```javascript
// ❌ REJECT: Large object cached indefinitely
class Cache {
  constructor() {
    this.cache = new Map(); // Never evicts
  }

  set(key, value) {
    this.cache.set(key, value); // Grows forever
  }
}

// ✅ APPROVE: LRU cache with size limit
class Cache {
  constructor() {
    this.cache = new Map();
    this.maxSize = 1000;
  }

  set(key, value) {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey); // Evict oldest
    }
    this.cache.set(key, value);
  }
}
```

**Questions to ask:**

- [ ] Do caches have size limits?
- [ ] Is there an eviction policy (LRU, TTL)?
- [ ] Are large objects released after use?
- [ ] Are buffers cleared appropriately?

---

## Advisory Checks (Recommend Improvements)

### ⚠️ Consider Adding Cleanup Method

If a class manages resources but lacks `cleanup()`:

```javascript
class MyClass {
  constructor() {
    this.connections = [];
    this.timers = [];
    this.listeners = new Map();
  }

  // ⚠️ RECOMMEND: Add cleanup method
  async cleanup() {
    // Close connections
    await Promise.all(this.connections.map(c => c.close()));
    this.connections = [];

    // Clear timers
    this.timers.forEach(t => clearTimeout(t));
    this.timers = [];

    // Remove listeners
    this.listeners.forEach((handler, emitter) => {
      emitter.removeListener('event', handler);
    });
    this.listeners.clear();
  }
}
```

---

### ⚠️ Consider Memory Budget Tests

If component handles large data:

```javascript
it('should stay within memory budget', async () => {
  const baseline = process.memoryUsage().heapUsed;
  const manager = new StateSyncManager();

  // Simulate heavy load
  for (let i = 0; i < 2000; i++) {
    manager.sync({ id: `task-${i}` });
  }

  const current = process.memoryUsage().heapUsed;
  const delta = (current - baseline) / 1024 / 1024;

  assert(delta < 1, `Exceeded 1MB budget: ${delta}MB`);
});
```

---

### ⚠️ Consider Adding Memory Monitoring

For long-running operations:

```javascript
async function loadTest() {
  const startMem = process.memoryUsage().heapUsed;

  for (let i = 0; i < 1000; i++) {
    await processItem(i);

    if (i % 100 === 0) {
      const currentMem = process.memoryUsage().heapUsed;
      const delta = (currentMem - startMem) / 1024 / 1024;
      console.log(`Memory delta: ${delta}MB`);

      // Warn if memory growing unexpectedly
      if (delta > 10) {
        console.warn('Memory usage increasing - possible leak');
      }
    }
  }
}
```

---

## Review Workflow

### Step 1: Identify Risk Areas

**High Risk** (requires thorough review):

- [ ] New class with internal state
- [ ] Array/Map/Set usage
- [ ] Event listeners
- [ ] File I/O operations
- [ ] Long-running operations
- [ ] Test classes

**Medium Risk** (spot check):

- [ ] Function refactoring
- [ ] New utility functions
- [ ] Configuration changes

**Low Risk** (minimal review):

- [ ] Documentation updates
- [ ] Type definitions
- [ ] Constant changes

---

### Step 2: Run Checklist

For **High Risk** changes:

1. Run all **Critical Checks** (block merge if any fail)
2. Run **Advisory Checks** (recommend improvements)
3. Request memory budget test if missing
4. Verify cleanup logic manually

For **Medium Risk** changes:

1. Spot check array usage
2. Verify test cleanup if applicable

---

### Step 3: Request Changes

**Template for critical issues:**

````markdown
**Memory Leak Risk**: Unbounded array growth detected

**Location**: `StateSyncManager.sync()` (line 45)

**Issue**: `this.syncHistory.push(...)` accumulates without limit

**Required Fix**:

1. Add `this.maxHistorySize = 1000` in constructor
2. Add trimming after push:
   ```javascript
   if (this.syncHistory.length > this.maxHistorySize) {
     this.syncHistory.shift();
   }
   ```
````

3. Add regression test verifying bounded growth

**Reference**: See `.claude/docs/MEMORY_MANAGEMENT.md` Pattern 1

````

**Template for advisory suggestions:**

```markdown
**Suggestion**: Add cleanup method for resource management

**Location**: `MyClass`

**Recommendation**: Add `cleanup()` method to release resources:
- Clear `this.timers` array
- Remove event listeners in `this.listeners`
- Close connections in `this.connections`

**Impact**: Prevents memory leaks in test suites

**Reference**: See `.claude/docs/CODE_REVIEW_MEMORY_CHECKLIST.md` Advisory Checks
````

---

## Related Documentation

- **Memory Management Guide**: `.claude/docs/MEMORY_MANAGEMENT.md`
- **Performance Budgets**: `.claude/docs/PERFORMANCE_BUDGETS.md`
- **Operational Runbook**: `.claude/docs/MEMORY_OPERATIONAL_RUNBOOK.md`

---

## Summary

**Critical Checks (Block Merge):**

1. No unbounded array growth
2. Cleanup called in test teardown
3. Event listeners properly removed
4. Promises/callbacks don't leak
5. File handles closed
6. Large objects not held indefinitely

**Advisory Checks (Recommend):**

1. Add cleanup method if resources managed
2. Add memory budget tests for heavy components
3. Add memory monitoring for long operations

**Review Philosophy:**

> Catch leaks in review → Prevent OOM in production
