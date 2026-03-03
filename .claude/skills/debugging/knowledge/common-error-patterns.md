# Common Error Patterns — Node.js Debugging Reference

Symptoms, diagnosis commands, and fix patterns for the most common Node.js
and agent-studio errors. Use this alongside the debugging skill's 4-phase
methodology.

---

## Stack Overflow / Maximum Call Stack Size Exceeded

**Symptom**: `RangeError: Maximum call stack size exceeded`

**Common Causes**:

1. Infinite recursion (no base case)
2. Circular object references in JSON.stringify
3. Infinite event emitter loop

**Diagnosis**:

```bash
# Get stack trace with full depth
node --stack-trace-limit=50 script.js 2>&1 | head -100

# Check if circular reference exists
node -e "
const obj = {};
obj.self = obj;
try { JSON.stringify(obj); } catch (e) { console.log('Circular:', e.message); }
"
```

**Fix Patterns**:

```javascript
// FIX 1: Add base case to recursive function
// BROKEN: No termination condition
function factorial(n) {
  return n * factorial(n - 1);
}

// FIXED: Base case added
function factorial(n) {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}

// FIX 2: Circular JSON serialization — use replacer
const seen = new WeakSet();
JSON.stringify(obj, (key, value) => {
  if (typeof value === 'object' && value !== null) {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
  }
  return value;
});

// FIX 3: Convert deep recursion to iteration
// BROKEN: Deep recursion on large tree
function sumTree(node) {
  return node.val + sumTree(node.left) + sumTree(node.right);
}

// FIXED: Iterative with explicit stack
function sumTree(root) {
  const stack = [root];
  let sum = 0;
  while (stack.length) {
    const node = stack.pop();
    if (!node) continue;
    sum += node.val;
    stack.push(node.left, node.right);
  }
  return sum;
}
```

---

## Race Conditions

**Symptom**: Non-deterministic test failures; data corruption under concurrent load;
different results on repeated runs with same input.

**Common Causes**:

1. Concurrent writes to shared state (in-memory or file)
2. Multiple event handler registrations
3. Unguarded `check-then-act` patterns (TOCTOU)
4. `await` inside loops creating interleaving

**Diagnosis**:

```bash
# Reproduce with stress test: run many times quickly
for i in {1..20}; do node test.js; done | sort | uniq -c

# Enable trace_gc to detect GC pauses causing timing issues
node --trace-gc script.js

# Check for missing locks in concurrent DB operations
grep -r "findOne\|findAll\|update\|create" src/ | grep -v "await" # Missing await?
```

**Fix Patterns**:

```javascript
// FIX 1: Mutex for shared state
const { Mutex } = require('async-mutex');
const mutex = new Mutex();

async function incrementCounter() {
  const release = await mutex.acquire();
  try {
    const current = await readCounter();
    await writeCounter(current + 1);
  } finally {
    release();
  }
}

// FIX 2: Atomic operations instead of read-modify-write
// BROKEN: TOCTOU race
const current = await db.get('counter');
await db.set('counter', current + 1);

// FIXED: Atomic increment
await db.incrBy('counter', 1); // Redis: atomic

// FIX 3: Use Promise.all instead of sequential await in loop
// BROKEN: Race condition from serial writes
for (const item of items) {
  await processItem(item); // Items can interleave if processItem has side effects
}

// FIXED: Explicit serial execution when order matters
for (const item of items) {
  await processItem(item); // Actually fine if truly sequential
}
// OR: Parallel when independent
await Promise.all(items.map(item => processItem(item)));
```

---

## Memory Leaks

**Symptom**: RSS memory grows indefinitely; eventual OOM crash after hours/days;
heap snapshot shows retained objects growing over time.

**Common Causes**:

1. Event listeners not removed
2. Closures holding references longer than needed
3. Unbounded caches (Maps/Sets growing forever)
4. `setInterval` never cleared
5. Global variable accumulation

**Diagnosis**:

```bash
# Monitor RSS over time
node --expose-gc script.js &
PID=$!
while kill -0 $PID 2>/dev/null; do
  ps -o rss= -p $PID | xargs -I{} echo "$(date +%H:%M:%S) RSS: {} KB"
  sleep 5
done

# Take heap snapshots for comparison (install: pnpm add -D heapdump)
node -e "
const heapdump = require('heapdump');
setTimeout(() => heapdump.writeSnapshot('./heap-before.heapsnapshot'), 5000);
setTimeout(() => heapdump.writeSnapshot('./heap-after.heapsnapshot'), 30000);
"
# Compare in Chrome DevTools: Memory > Load snapshot > Comparison
```

**Fix Patterns**:

```javascript
// FIX 1: Remove event listeners when done
class MyService extends EventEmitter {
  start() {
    this._onData = data => this.process(data);
    process.on('data', this._onData); // Register with reference
  }
  stop() {
    process.off('data', this._onData); // Remove by same reference
  }
}

// FIX 2: Bounded cache with LRU eviction
const { LRUCache } = require('lru-cache');
const cache = new LRUCache({ max: 500, ttl: 1000 * 60 * 5 }); // 500 items, 5min TTL

// FIX 3: Clear intervals/timeouts
const interval = setInterval(() => doWork(), 1000);
// When shutting down:
clearInterval(interval);

// FIX 4: WeakMap for object-associated state (auto-GC'd)
const metadata = new WeakMap(); // Keys are GC'd when object is GC'd
metadata.set(userObj, { loginTime: Date.now() });
```

---

## ENOENT: No Such File or Directory

**Symptom**: `Error: ENOENT: no such file or directory, open '/path/to/file'`

**Common Causes**:

1. Wrong working directory assumption
2. File path using wrong separator (Windows: `\` vs Unix: `/`)
3. File created in previous test run but not cleaned up / race condition
4. Relative path resolution differs between execution contexts

**Diagnosis**:

```bash
# Verify working directory
node -e "console.log(process.cwd())"

# Check if path exists (handle Windows paths)
node -e "
const path = require('path');
const fs = require('fs');
const target = path.resolve('./relative/path/file.txt');
console.log('Absolute path:', target);
console.log('Exists:', fs.existsSync(target));
"

# Find where the process is actually looking
strace -e openat node script.js 2>&1 | grep ENOENT  # Linux only
```

**Fix Patterns**:

```javascript
const path = require('path');
const { PROJECT_ROOT } = require('.claude/lib/utils/project-root.cjs');

// FIX 1: Always use absolute paths based on PROJECT_ROOT or __dirname
const configPath = path.join(PROJECT_ROOT, '.claude', 'config', 'settings.json');

// FIX 2: Handle missing file gracefully
function readOptionalFile(filePath) {
  try {
    return require('fs').readFileSync(filePath, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') return null; // Expected — file is optional
    throw err; // Re-throw unexpected errors
  }
}

// FIX 3: Ensure directory exists before writing
const fs = require('fs');
function writeFileSafe(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}
```

---

## EACCES: Permission Denied

**Symptom**: `Error: EACCES: permission denied, open '/path/to/file'`

**Common Causes**:

1. Writing to system directories without elevated privileges
2. File owned by different user in CI/container environment
3. File locked by another process (common on Windows)
4. Hook/script trying to write to read-only path

**Diagnosis**:

```bash
# Check file permissions
ls -la /path/to/file

# Check who owns the file
stat /path/to/file

# Find process holding file lock (Linux)
lsof /path/to/file

# Find process holding file lock (Windows — via PowerShell)
# Get-Process | ForEach-Object { $_.Modules | Where-Object {$_.FileName -like "*filename*"} }
```

**Fix Patterns**:

```javascript
// FIX 1: Write to user-writable location
// BROKEN: Writing to system directory
fs.writeFileSync('/etc/myapp.conf', config);

// FIXED: Write to project-specific path
const configDir = path.join(PROJECT_ROOT, '.claude', 'context');
fs.mkdirSync(configDir, { recursive: true });
fs.writeFileSync(path.join(configDir, 'config.json'), config);

// FIX 2: Retry on EBUSY/EACCES with backoff (Windows file locks)
async function writeWithRetry(filePath, content, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      fs.writeFileSync(filePath, content);
      return;
    } catch (err) {
      if ((err.code === 'EBUSY' || err.code === 'EACCES') && attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
      } else {
        throw err;
      }
    }
  }
}
```

---

## EBUSY: Resource Busy (Windows-Specific)

**Symptom**: `Error: EBUSY: resource busy or locked, open 'path/to/file.db'`
Most common with SQLite databases during concurrent test runs.

**Known Instance**: Windows SQLite memory.db tests — known flake, not a regression.

**Diagnosis**:

```bash
# Run tests serially to confirm race condition
pnpm test --concurrency=1

# Check if multiple test processes are running
tasklist | grep node  # Windows
ps aux | grep node    # Linux/Mac
```

**Fix Patterns**:

```javascript
// FIX 1: Use WAL mode for SQLite (allows concurrent reads)
const db = new Database('memory.db');
db.pragma('journal_mode = WAL');

// FIX 2: Proper lock-file for concurrent DB initialization
const lockfile = require('proper-lockfile');

async function initDatabase(dbPath) {
  const lockPath = dbPath + '.lock';
  let release;
  try {
    release = await lockfile.lock(dbPath, { retries: { retries: 5, minTimeout: 100 } });
    await doInitialization(dbPath);
  } finally {
    if (release) await release();
  }
}

// FIX 3: Use unique DB path per test (avoid sharing)
// In test setup:
const dbPath = path.join(os.tmpdir(), `test-${process.pid}-${Date.now()}.db`);
// In test teardown:
if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
```

---

## Unhandled Promise Rejection

**Symptom**: `UnhandledPromiseRejectionWarning` / process crash with `--unhandled-rejections=throw`

**Common Causes**:

1. `async` function called without `await` and without `.catch()`
2. Promise rejection in event handler
3. Rejection in `setTimeout`/`setInterval` callback
4. Fire-and-forget async calls in loops

**Diagnosis**:

```bash
# Enable verbose rejection tracking
node --trace-warnings --unhandled-rejections=throw script.js

# Find unhandled promise patterns in code
grep -rn "\.then(" src/ | grep -v ".catch\|async"  # Potential missing .catch
grep -rn "async.*=>" src/ | grep -v "await"         # Async lambdas without await
```

**Fix Patterns**:

```javascript
// FIX 1: Always attach .catch() to fire-and-forget promises
// BROKEN (SE-04 violation):
someAsyncOperation(); // Rejection is swallowed

// FIXED:
someAsyncOperation().catch(err => logger.error('Operation failed:', err));

// FIX 2: Never await in forEach (SE-04 violation)
// BROKEN: forEach ignores returned promises
items.forEach(async item => {
  await processItem(item); // Not awaited by forEach!
});

// FIXED: Use for...of for sequential
for (const item of items) {
  await processItem(item);
}
// OR: Promise.all for parallel
await Promise.all(items.map(item => processItem(item)));

// FIX 3: Global handler for missed rejections (safety net, not a substitute)
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  // In production: alert monitoring system
  // In tests: fail the test
});
```

---

## Windows Path Separator Issues (SE-01)

**Symptom**: Glob patterns not matching; regex path checks failing on Windows;
`[^/]*` blocking `\`-separated paths.

**Known in This Codebase**: `path.relative()` returns backslash paths on Windows.

**Diagnosis**:

```javascript
// Verify path separator in current environment
const path = require('path');
console.log(path.sep); // '\' on Windows, '/' on Unix
console.log(path.relative('C:\\dev\\project', 'C:\\dev\\project\\src\\file.js'));
// Windows output: 'src\file.js'  ← backslashes
// Unix output:   'src/file.js'  ← forward slashes
```

**Fix Patterns**:

```javascript
// FIX: Always normalize paths for regex/glob use
const relativePath = path.relative(PROJECT_ROOT, absolutePath).replace(/\\/g, '/');
// Now safe for: glob patterns, regex matching, URL paths, JSON storage

// When uncertain about normalization state, use safe regex:
// FRAGILE: [^/]* won't block backslash paths on Windows
const pattern = /^src\/[^/]+\.js$/;

// ROBUST: [^/\\]* blocks both separator types
const pattern = /^src\/[^/\\]+\.js$/;

// For storing paths in JSON/config: always normalize
function toPortablePath(p) {
  return p.replace(/\\/g, '/');
}
```

---

## TypeErrors and Undefined Property Access

**Symptom**: `TypeError: Cannot read properties of undefined (reading 'foo')`
`TypeError: Cannot read properties of null (reading 'bar')`

**Common Causes**:

1. API response shape changed; old code assumes old structure
2. Optional chaining missing for deeply nested access
3. Default values not provided for missing configuration
4. Async race: accessing result before async op completes

**Fix Patterns**:

```javascript
// FIX 1: Optional chaining + nullish coalescing
// BROKEN:
const name = user.profile.name; // Throws if profile is undefined

// FIXED:
const name = user?.profile?.name ?? 'Unknown';

// FIX 2: Validate API response shape before use
const response = await fetch('/api/user');
const data = await response.json();
if (!data || typeof data.id !== 'string') {
  throw new Error(`Unexpected API response shape: ${JSON.stringify(data)}`);
}

// FIX 3: Provide defaults for configuration objects
function createConfig(overrides = {}) {
  return {
    timeout: 5000,
    retries: 3,
    ...overrides, // User overrides win
  };
}
```

---

## Quick Diagnosis Checklist

For any Node.js error, check these in order:

1. **Read the full stack trace** — the top frame is the symptom; the bottom is often the root cause
2. **Check the error code** — `ENOENT` (file), `EACCES` (permissions), `EBUSY` (lock), `ECONNREFUSED` (network)
3. **Verify working directory** — `console.log(process.cwd())` at the error site
4. **Check for async issues** — unhandled rejections, missing await, forEach+async
5. **Reproduce minimally** — strip to minimal reproducer; confirms root cause
6. **Check Windows paths** — normalize with `.replace(/\\/g, '/')` before regex/glob
