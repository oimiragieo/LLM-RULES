# Debugging Tools Catalog — Node.js Reference

Practical guide to Node.js debugging tools. Includes installation, basic usage,
and when to use each. Organized from simplest (no install) to most specialized.

---

## Built-in: Node.js Inspector

**No installation required.** The built-in V8 inspector connects to Chrome DevTools
or VS Code for step-by-step debugging.

**When to use**: Logical errors, understanding control flow, inspecting variable
state, debugging async code interactively.

### Usage

```bash
# Start with inspector (pauses execution until DevTools connects)
node --inspect-brk script.js

# Start and connect immediately (no pause)
node --inspect script.js

# For tests:
node --inspect-brk --test tests/my-test.cjs

# For pnpm scripts:
node --inspect-brk $(which pnpm) test
```

### Connect

1. Open Chrome → `chrome://inspect`
2. Click "Open dedicated DevTools for Node"
3. Set breakpoints, step through code, inspect scope

### VS Code Launch Config

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Script",
      "program": "${workspaceFolder}/script.js",
      "runtimeArgs": ["--inspect-brk"],
      "console": "integratedTerminal"
    },
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Tests",
      "runtimeExecutable": "pnpm",
      "runtimeArgs": ["test"],
      "console": "integratedTerminal",
      "port": 9229
    }
  ]
}
```

**Key DevTools Features**:

- Breakpoints (click gutter) + conditional breakpoints (right-click)
- Watch expressions for variable state
- Call stack panel for async frame inspection
- Memory profiler for heap snapshots
- CPU profiler for flamegraphs

---

## Built-in: util.debuglog / DEBUG env var

**No installation.** Conditional logging that activates via environment variable.

**When to use**: Adding diagnostic logging without polluting production output.

```javascript
const util = require('util');

// Enable with: DEBUG=myapp:* node script.js
// Or specific sections: DEBUG=myapp:auth,myapp:db node script.js
const debugAuth = util.debuglog('myapp:auth');
const debugDB = util.debuglog('myapp:db');

debugAuth('User %s attempting login', userId); // Only outputs if DEBUG=myapp:auth
debugDB('Query executed in %dms', elapsed);
```

---

## clinic.js — Performance Profiling Suite

**Install**: `pnpm add -g clinic` or `npx clinic`

**When to use**: CPU bottlenecks, event loop delays, memory growth over time.
The best starting point for performance investigations.

### clinic doctor — Automated Diagnosis

```bash
# Run and auto-diagnose performance issues
clinic doctor -- node server.js

# For specific workload:
clinic doctor -- node -e "require('./src/heavyFunction')()"

# Output: opens HTML report in browser
# Identifies: CPU starvation, I/O issues, memory leaks, event loop lag
```

**Reading the report**:

- Green CPU: healthy
- Yellow/Red CPU: bottleneck — use `clinic flame`
- High event loop delay: I/O blocking or synchronous code in hot path
- Memory climbing: potential leak — use `clinic heapsampler`

### clinic flame — Flamegraph CPU Profiling

```bash
# Generate flamegraph
clinic flame -- node server.js

# Apply load while running (separate terminal)
npx autocannon http://localhost:3000

# Output: interactive SVG flamegraph
```

**Reading flamegraphs**:

- X-axis = time (wider = more CPU time)
- Y-axis = call stack (top = leaf function)
- Hot frame: top-of-stack wide frame with no callers below it
- Click to zoom; hover to see function details

### clinic heapsampler — Memory Profiling

```bash
# Sample heap allocation over time
clinic heapsampler -- node script.js

# Output: allocation timeline + function attribution
```

---

## 0x — Lightweight Flamegraph Profiler

**Install**: `pnpm add -g 0x` or `npx 0x`

**When to use**: Quick CPU profiling without the full clinic.js suite.
Slightly faster to run; same flamegraph output.

```bash
# Profile a script
npx 0x script.js

# Profile with arguments
npx 0x -- node --max-old-space-size=4096 script.js

# Output: flamegraph.html in a timestamped directory
# Open in browser for interactive exploration
```

**vs clinic flame**: 0x is faster to invoke; clinic provides automated diagnosis.
Use 0x for quick "what's hot?" investigations; clinic for thorough analysis.

---

## heapdump — Heap Snapshot for Memory Analysis

**Install**: `pnpm add -D heapdump`

**When to use**: Memory leak investigation — compare heap snapshots before/after
suspected leak trigger to identify retained objects.

```javascript
const heapdump = require('heapdump');

// Take snapshot programmatically
heapdump.writeSnapshot('./heap-before.heapsnapshot', (err, filename) => {
  console.log('Snapshot written to', filename);
});

// Or trigger via signal (useful for running servers)
process.on('SIGUSR2', () => {
  heapdump.writeSnapshot('./heap-' + Date.now() + '.heapsnapshot');
});
// Trigger: kill -USR2 <pid>
```

**Analysis in Chrome DevTools**:

1. Open Chrome → DevTools → Memory tab
2. Click "Load" → select `.heapsnapshot` file
3. Use "Comparison" view: load before + after snapshots
4. Filter by "Detached DOM nodes" or largest retained size
5. Retained size = how much memory would be freed if object were GC'd

**Heap Analysis Workflow**:

```bash
# 1. Start app
node server.js &
PID=$!

# 2. Take baseline snapshot
kill -USR2 $PID && sleep 1

# 3. Trigger suspected leak (e.g., run requests)
for i in {1..100}; do curl http://localhost:3000/api/data; done

# 4. Take comparison snapshot
kill -USR2 $PID && sleep 1

# 5. Analyze in DevTools
```

---

## wtfnode — "Why Is Node Still Running?"

**Install**: `pnpm add -D wtfnode`

**When to use**: Tests or scripts that hang after completion; process won't exit.
Prints all active handles and timers preventing process exit.

```javascript
// Add at the top of your test/script:
require('wtfnode');

// Or via CLI:
// node -r wtfnode script.js

// When the process hangs, send SIGUSR1:
// kill -USR1 <pid>

// Output example:
// [WTF Node?] open handles:
// - Timeout: 30000ms (set at test-setup.js:42)
// - TCPSocket: connected to 127.0.0.1:5432 (database connection open)
```

**Common culprits found by wtfnode**:

- Database connection pool not closed after tests
- `setInterval` not cleared in test teardown
- HTTP server `.listen()` without `.close()` after tests
- Redis/pub-sub connection staying open

**Fix pattern after identifying the handle**:

```javascript
// In test teardown (after/afterAll):
afterAll(async () => {
  await dbPool.end(); // Close DB connection pool
  clearInterval(myTimer); // Clear intervals
  server.close(); // Close HTTP server
  await redisClient.quit(); // Close Redis connection
});
```

---

## node --trace-warnings

**No installation.** Built-in Node.js flag for deprecation and warning tracing.

**When to use**: Mysterious deprecation warnings; understanding where warnings
originate (the warning message alone rarely includes a stack trace).

```bash
node --trace-warnings script.js

# Example output:
# (node:12345) DeprecationWarning: Buffer() is deprecated
#     at Object.<anonymous> (legacy-module.js:10:12)
#     at Module._compile (internal/modules/cjs/loader.js:999:30)
#     ← Now you know which file and line to fix
```

---

## async_hooks — Async Context Tracking

**No installation.** Node.js built-in for tracking async context propagation.

**When to use**: Async debugging where request context is lost; understanding
which async operations belong to which request (especially for logging/tracing).

```javascript
const { AsyncLocalStorage } = require('async_hooks');

// Create a store for request context
const requestContext = new AsyncLocalStorage();

// Middleware: attach context to all async operations in this request
app.use((req, res, next) => {
  requestContext.run({ requestId: req.id, userId: req.user?.id }, next);
});

// In any async function — access context without passing it explicitly
async function fetchData() {
  const ctx = requestContext.getStore(); // Works even in nested callbacks
  logger.info({ requestId: ctx?.requestId }, 'Fetching data');
}
```

---

## v8-profiler-next — CPU Profiling API

**Install**: `pnpm add -D v8-profiler-next`

**When to use**: Programmatic CPU profiling within specific code sections (not
whole-process profiling); integration with CI for performance regression tests.

```javascript
const profiler = require('v8-profiler-next');
profiler.setGenerateType(1); // 1 = TypeScript source mapping support

// Profile a specific section
profiler.startProfiling('myFunction', true);
await heavyOperation();
const profile = profiler.stopProfiling('myFunction');

// Save to file for analysis in Chrome DevTools
const { writeFileSync } = require('fs');
writeFileSync('profile.cpuprofile', JSON.stringify(profile));

profile.delete();
```

---

## autocannon — HTTP Load Testing

**Install**: `pnpm add -g autocannon` or `npx autocannon`

**When to use**: Generating load while profiling; benchmarking API endpoints;
regression testing response time after changes.

```bash
# Basic load test
npx autocannon http://localhost:3000/api/endpoint

# Custom parameters
npx autocannon \
  --connections 10 \
  --duration 30 \
  --method POST \
  --headers "Content-Type=application/json" \
  --body '{"key":"value"}' \
  http://localhost:3000/api/endpoint

# Output:
# Stat     2.5% 50%  97.5% 99%  Avg    Stdev Max
# Latency  2ms  5ms  12ms  20ms 5.2ms  2.1ms 150ms
# Req/Sec  800  950  1000  1000 940    45    1000
```

**Combining with clinic**:

```bash
# Terminal 1: Start clinic profiler
clinic flame -- node server.js

# Terminal 2: Apply load
npx autocannon -d 30 http://localhost:3000/api/heavy-endpoint

# Then Ctrl+C clinic to generate flamegraph
```

---

## Quick Tool Selection Guide

| Problem                            | Tool               | Command                                     |
| ---------------------------------- | ------------------ | ------------------------------------------- |
| Logic error, wrong values          | Node Inspector     | `node --inspect-brk script.js`              |
| High CPU usage                     | clinic flame / 0x  | `npx 0x script.js`                          |
| Memory growing over time           | clinic heapsampler | `clinic heapsampler -- node script.js`      |
| Memory leak (retained objects)     | heapdump           | `kill -USR2 <pid>` then compare in DevTools |
| Process won't exit                 | wtfnode            | `node -r wtfnode script.js`                 |
| Mysterious deprecation warnings    | trace-warnings     | `node --trace-warnings script.js`           |
| "What's causing this performance?" | clinic doctor      | `clinic doctor -- node server.js`           |
| Request context lost in async      | async_hooks        | `AsyncLocalStorage` API                     |
| HTTP throughput benchmark          | autocannon         | `npx autocannon http://localhost:3000`      |
| Programmatic CPU profile           | v8-profiler-next   | Profile specific sections in code           |

---

## Diagnostic Commands Reference

```bash
# Check Node.js version and flags
node --version && node --v8-options | grep -i "heap\|memory\|gc"

# Monitor heap size in real-time
node --expose-gc -e "
setInterval(() => {
  global.gc();
  const used = process.memoryUsage();
  console.log('heap:', Math.round(used.heapUsed/1024/1024) + 'MB',
              'rss:', Math.round(used.rss/1024/1024) + 'MB');
}, 2000);
require('./your-script');
"

# Find all active handles (without wtfnode)
node -e "
const { getActiveHandles, getActiveRequests } = require('process');
setInterval(() => {
  console.log('handles:', getActiveHandles().length, 'requests:', getActiveRequests().length);
}, 1000);
"

# Check for slow synchronous operations (>1ms in event loop)
node --trace-sync-io script.js

# Profile startup time
node --prof script.js  # Creates isolate-*.log
node --prof-process isolate-*.log > profiled.txt
```
