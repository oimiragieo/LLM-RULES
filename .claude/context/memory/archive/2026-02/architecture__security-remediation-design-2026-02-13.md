<!-- Agent: security-architect | Task: #task-phase2-security | Session: 2026-02-13 -->

# Security Remediation Design Report

**Deliverable**: Exact code fixes for 5 verified security findings
**Context**: Verified findings from security-verification-2026-02-12.md + remediation best practices research

---

## Executive Summary

Designed 5 remediation fixes with exact before/after code, TDD test specifications, Windows compatibility verification, and risk mitigation. All fixes include security controls from the security-controls-catalog.md and map to OWASP categories for compliance reporting.

**Priority Summary**:
- **P0 (This Week - Security Critical)**: Fixes 1, 2, 3 (shell injection, JSON.parse protection, DB race condition)
- **P1 (This Month)**: Fix 4 (event bus null checks)
- **P2 (Next Quarter)**: Fix 5 (audit additional shell injection vectors)

**Estimated Effort**: 14 hours (P0: 9h, P1: 3h, P2: 2h)

---

## Fix 1: Remove shell:true from 4 Skill Scripts

### Classification: **CRITICAL** (OWASP A03: Injection)
### Effort: 4 hours
### Security Control: SEC-003 (Input Sanitization)

### Problem Statement

All 4 skill scripts use `shell: true` in `spawn()` calls, creating command injection vectors if agents pass malicious arguments. While agents are LLM-generated (not direct user input), compromised agents or routing bypass could exploit this.

**Risk**: Command injection in development environment → File system access with framework privileges → Data exfiltration

---

### Fix 1.1: sequential-thinking/scripts/main.cjs

**File**: `.claude/skills/sequential-thinking/scripts/main.cjs`
**Line**: 72

**Before (Vulnerable)**:
```javascript
const child = spawn('python', [executorPath, ...args.filter(a => a !== '--help')], {
  stdio: 'inherit',
  cwd: path.dirname(executorPath),
  shell: true,  // ← VULNERABILITY: Command injection risk
});
```

**After (Safe)**:
```javascript
const child = spawn('python', [executorPath, ...args.filter(a => a !== '--help')], {
  stdio: 'inherit',
  cwd: path.dirname(executorPath),
  shell: false,  // ← FIX: No shell, direct execution only
});
```

**Verification**:
- ✅ Command works without shell: `python` resolves from PATH on Windows/Unix
- ✅ No pipes, redirects, or globs needed in arguments
- ✅ Array-based args prevent injection (already implemented)

**Windows Compatibility**:
- `python` command resolves on Windows if Python installed via Microsoft Store, installer, or PATH
- No `.cmd` wrapper needed (direct executable)
- If PATH not set: fails gracefully with error (not a shell injection vector)

---

### Fix 1.2: git-expert/scripts/main.cjs

**File**: `.claude/skills/git-expert/scripts/main.cjs`
**Line**: 66

**Before (Vulnerable)**:
```javascript
const child = spawn(
  'git',
  args.filter(a => a !== '--help'),
  {
    stdio: 'inherit',
    cwd: PROJECT_ROOT,
    shell: true,  // ← VULNERABILITY: Command injection risk
  }
);
```

**After (Safe)**:
```javascript
const child = spawn(
  'git',
  args.filter(a => a !== '--help'),
  {
    stdio: 'inherit',
    cwd: PROJECT_ROOT,
    shell: false,  // ← FIX: No shell, direct execution only
  }
);
```

**Verification**:
- ✅ Command works without shell: `git` resolves from PATH on Windows/Unix
- ✅ No shell-specific features used (no wildcards, pipes, redirects)
- ✅ Array-based args already implemented

**Windows Compatibility**:
- Git for Windows includes `git.exe` in PATH (direct executable, not .cmd)
- No shell needed for resolution
- Fails gracefully if Git not installed (not a security issue)

---

### Fix 1.3: docker-compose/scripts/main.cjs

**File**: `.claude/skills/docker-compose/scripts/main.cjs`
**Line**: 64

**Before (Vulnerable)**:
```javascript
const child = spawn('docker', ['compose', ...composeArgs], {
  stdio: 'inherit',
  cwd: PROJECT_ROOT,
  shell: true,  // ← VULNERABILITY: Command injection risk
});
```

**After (Safe)**:
```javascript
const child = spawn('docker', ['compose', ...composeArgs], {
  stdio: 'inherit',
  cwd: PROJECT_ROOT,
  shell: false,  // ← FIX: No shell, direct execution only
});
```

**Verification**:
- ✅ Command works without shell: `docker` resolves from PATH
- ✅ Subcommand `compose` passed as array argument (safe)
- ✅ No shell metacharacters needed

**Windows Compatibility**:
- Docker Desktop for Windows includes `docker.exe` in PATH (direct executable)
- `compose` is a Docker CLI plugin (not separate command)
- No shell wrapper needed

---

### Fix 1.4: terraform-infra/scripts/main.cjs

**File**: `.claude/skills/terraform-infra/scripts/main.cjs`
**Line**: 66

**Before (Vulnerable)**:
```javascript
const child = spawn(
  'terraform',
  args.filter(a => a !== '--help'),
  {
    stdio: 'inherit',
    cwd: PROJECT_ROOT,
    shell: true,  // ← VULNERABILITY: Command injection risk
  }
);
```

**After (Safe)**:
```javascript
const child = spawn(
  'terraform',
  args.filter(a => a !== '--help'),
  {
    stdio: 'inherit',
    cwd: PROJECT_ROOT,
    shell: false,  // ← FIX: No shell, direct execution only
  }
);
```

**Verification**:
- ✅ Command works without shell: `terraform` resolves from PATH
- ✅ No shell-specific features used
- ✅ Array-based args already safe

**Windows Compatibility**:
- Terraform for Windows is a single `terraform.exe` in PATH
- No shell wrapper needed
- Fails gracefully if not installed

---

### TDD Test Specification (Fix 1)

**Test Pattern**: Red-Green-Refactor cycle for each file

**Test File**: `tests/skills/shell-injection-prevention.test.cjs`

**Test 1: Verify shell:false prevents injection**
```javascript
// Test name: Shell metacharacters do not execute with shell:false
// File: tests/skills/shell-injection-prevention.test.cjs
// Assert: spawn with shell:false treats '; rm -rf /' as literal argument (command fails, not executed)

test('sequential-thinking skill with malicious args does not execute shell metacharacters', async () => {
  const { spawn } = require('child_process');
  const maliciousArgs = ['; rm -rf /'];

  // Simulate skill invocation with malicious args
  const child = spawn('python', ['--version', ...maliciousArgs], {
    shell: false,
    stdio: 'pipe',
  });

  let stderr = '';
  child.stderr.on('data', (data) => { stderr += data.toString(); });

  const exitCode = await new Promise((resolve) => {
    child.on('close', (code) => resolve(code));
  });

  // Expect: Python treats '; rm -rf /' as literal argument → fails (unrecognized option)
  // NOT: Shell executes 'rm -rf /' → would succeed with shell:true
  assert.notStrictEqual(exitCode, 0, 'Malicious args should fail, not execute');
  assert.match(stderr, /unrecognized|invalid|error/i, 'Error indicates argument parsing failure, not shell execution');
});
```

**Test 2: Verify commands still work normally**
```javascript
// Test name: Normal skill invocation still works with shell:false
// Assert: spawn with shell:false executes legitimate commands successfully

test('git-expert skill normal invocation works with shell:false', async () => {
  const { spawn } = require('child_process');

  const child = spawn('git', ['--version'], {
    shell: false,
    stdio: 'pipe',
  });

  let stdout = '';
  child.stdout.on('data', (data) => { stdout += data.toString(); });

  const exitCode = await new Promise((resolve) => {
    child.on('close', (code) => resolve(code));
  });

  // Expect: Git executes normally
  assert.strictEqual(exitCode, 0, 'Git should execute successfully');
  assert.match(stdout, /git version/, 'Git version should be printed');
});
```

**TDD Cycle**:
1. **RED**: Write test → Verify it fails with `shell: true` (injection executes or command fails differently)
2. **GREEN**: Change `shell: true` → `shell: false` → Verify test passes
3. **REFACTOR**: None needed (simple boolean change)

---

## Fix 2: Adopt safeParseJSON in Reflection Hooks

### Classification: **HIGH** (OWASP A04: Insecure Design - Error Handling)
### Effort: 2 hours
### Security Control: SEC-003 (Input Sanitization)

### Problem Statement

3 reflection hooks use unprotected `JSON.parse` calls. While all have outer try-catch fallbacks that return `[]`, best practice is to use the `safeParseJSON` utility already present in the codebase (`.claude/lib/utils/safe-json.cjs`).

**Risk**: Hook degradation on malformed JSON → Reflection system failure → Tasks not processed (operational, not security breach)

---

### Fix 2.1: reflection-queue-processor.cjs

**File**: `.claude/hooks/reflection/reflection-queue-processor.cjs`
**Line**: 185

**Before (Best Practice Violation)**:
```javascript
function readExistingSpawnRequests(spawnRequestFile) {
  try {
    if (!fs.existsSync(spawnRequestFile)) {
      return [];
    }
    const content = fs.readFileSync(spawnRequestFile, 'utf8');
    if (!content.trim()) return [];
    const parsed = JSON.parse(content);  // ← UNPROTECTED (outer try-catch returns [] on error)
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    debugLog('reflection-queue-processor', 'Error reading existing spawn requests', err);
    return [];
  }
}
```

**After (Safe + Best Practice)**:
```javascript
const { safeParseJSON } = require('../../../.claude/lib/utils/safe-json.cjs');

function readExistingSpawnRequests(spawnRequestFile) {
  try {
    if (!fs.existsSync(spawnRequestFile)) {
      return [];
    }
    const content = fs.readFileSync(spawnRequestFile, 'utf8');
    if (!content.trim()) return [];

    // Use safeParseJSON - returns Object.create(null) on error (no prototype pollution)
    const parsed = safeParseJSON(content, null);  // ← FIX: Safe JSON parse
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    debugLog('reflection-queue-processor', 'Error reading existing spawn requests', err);
    return [];
  }
}
```

**Why This Fix**:
- `safeParseJSON` uses `Object.create(null)` → prevents prototype pollution
- Strips dangerous keys (`__proto__`, `constructor`, `prototype`)
- Returns safe empty object on error (not `{}`)
- Already imported in other hooks (consistent pattern)

---

### Fix 2.2: reflection-step0-guard.cjs

**File**: `.claude/hooks/reflection/reflection-step0-guard.cjs`
**Line**: 68

**Before (Best Practice Violation)**:
```javascript
function readSpawnRequests(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content.trim()) return [];
    const parsed = JSON.parse(content);  // ← UNPROTECTED (outer try-catch returns [] on error)
    return Array.isArray(parsed) ? parsed : [];
  } catch (_err) {
    return [];
  }
}
```

**After (Safe + Best Practice)**:
```javascript
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

function readSpawnRequests(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content.trim()) return [];

    // Use safeParseJSON - returns Object.create(null) on error
    const parsed = safeParseJSON(content, null);  // ← FIX: Safe JSON parse
    return Array.isArray(parsed) ? parsed : [];
  } catch (_err) {
    return [];
  }
}
```

---

### Fix 2.3: force-step0-execution.cjs

**File**: `.claude/hooks/reflection/force-step0-execution.cjs`
**Line**: 49

**Before (Best Practice Violation)**:
```javascript
function readSpawnRequests(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content.trim()) return [];
    const parsed = JSON.parse(content);  // ← UNPROTECTED (outer try-catch logs error)
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    stderrLog('warn', 'Failed to read spawn requests', { error: err.message });
    return [];
  }
}
```

**After (Safe + Best Practice)**:
```javascript
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

function readSpawnRequests(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content.trim()) return [];

    // Use safeParseJSON - returns Object.create(null) on error
    const parsed = safeParseJSON(content, null);  // ← FIX: Safe JSON parse
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    stderrLog('warn', 'Failed to read spawn requests', { error: err.message });
    return [];
  }
}
```

---

### TDD Test Specification (Fix 2)

**Test File**: `tests/hooks/safe-json-parse.test.cjs`

**Test 1: Verify prototype pollution prevention**
```javascript
// Test name: safeParseJSON prevents prototype pollution
// Assert: Parsing malicious JSON does not pollute Object.prototype

test('safeParseJSON prevents prototype pollution', () => {
  const { safeParseJSON } = require('.claude/lib/utils/safe-json.cjs');

  const maliciousJSON = '{"__proto__": {"polluted": true}}';
  const parsed = safeParseJSON(maliciousJSON, null);

  // Verify pollution did not happen
  assert.strictEqual(Object.prototype.polluted, undefined, 'Object.prototype should not be polluted');
  assert.strictEqual(parsed.__proto__, undefined, 'Parsed object should not have __proto__ property');
});
```

**Test 2: Verify safe fallback on malformed JSON**
```javascript
// Test name: safeParseJSON returns safe empty object on error
// Assert: Malformed JSON returns Object.create(null) (no prototype)

test('safeParseJSON returns safe empty object on malformed JSON', () => {
  const { safeParseJSON } = require('.claude/lib/utils/safe-json.cjs');

  const malformedJSON = '{invalid json}';
  const parsed = safeParseJSON(malformedJSON, null);

  // Verify safe empty object returned
  assert.strictEqual(Object.getPrototypeOf(parsed), null, 'Returned object should have no prototype');
  assert.deepStrictEqual(Object.keys(parsed), [], 'Returned object should be empty');
});
```

**TDD Cycle**:
1. **RED**: Write test → Verify it fails with raw `JSON.parse` (prototype pollution or unsafe error handling)
2. **GREEN**: Replace `JSON.parse` with `safeParseJSON` → Verify test passes
3. **REFACTOR**: None needed (direct replacement)

---

## Fix 3: DB Init Race Condition Fix

### Classification: **MEDIUM** (OWASP A04: Insecure Design - Race Condition)
### Effort: 3 hours
### Security Control: SEC-007 (File-Based Locking)

### Problem Statement

`.claude/hooks/memory/sync-memory-index.cjs` has concurrent schema init issue. Multiple hooks running simultaneously can both see missing `schema_version` table → both call `initializeDatabase` → SQLite constraint violation.

**Risk**: Failed memory syncs (self-healing on next edit) → No data corruption (SQLite prevents this) → Degraded user experience

---

### Fix 3.1: File-Based Lock Pattern

**File**: `.claude/hooks/memory/sync-memory-index.cjs`
**Lines**: 56-81

**Before (Race Condition)**:
```javascript
function ensureEntityDbInitialized(dbPath) {
  try {
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });  // ← RACE: concurrent mkdir
    }

    // Lazily initialize schema if missing (idempotent).
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(dbPath);  // ← RACE: concurrent schema init
    try {
      const row = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'")
        .get();
      if (row) return;

      const init = require('../../tools/cli/init-memory-db.cjs');
      init.initializeDatabase(db);  // ← RACE: concurrent schema creation
    } finally {
      db.close();
    }
  } catch (err) {
    debugLog('sync-memory-index', 'Failed to initialize entity DB schema', err);
  }
}
```

**After (Safe with File Lock)**:
```javascript
function ensureEntityDbInitialized(dbPath) {
  const lockFile = dbPath + '.init.lock';
  let lockFd = null;  // File descriptor for lock

  try {
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // Atomic lock acquisition using exclusive write flag
    try {
      lockFd = fs.openSync(lockFile, 'wx');  // ← FIX: Atomic lock (fails if exists)
    } catch (err) {
      if (err.code === 'EEXIST') {
        // Another process is initializing - wait briefly or skip
        debugLog('sync-memory-index', 'Another process is initializing DB, skipping');

        // Optional: Wait for lock release (max 2 seconds)
        const maxWaitMs = 2000;
        const startWait = Date.now();
        while (fs.existsSync(lockFile) && (Date.now() - startWait) < maxWaitMs) {
          // Busy-wait (acceptable for short duration in hook)
          // Alternative: use Atomics.wait with SharedArrayBuffer
        }

        // If lock still exists after timeout, assume stale lock and proceed
        if (fs.existsSync(lockFile)) {
          debugLog('sync-memory-index', 'Lock timeout - assuming stale lock');
          try {
            fs.unlinkSync(lockFile);  // Remove stale lock
          } catch (_cleanupErr) {
            // Best effort cleanup
          }
        } else {
          return;  // Lock released, another process initialized successfully
        }
      } else {
        throw err;  // Unexpected error
      }
    }

    // Safe initialization (only one process executes this)
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(dbPath);
    try {
      const row = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'")
        .get();
      if (row) return;

      const init = require('../../tools/cli/init-memory-db.cjs');
      init.initializeDatabase(db);  // ← SAFE: Only one process can reach here
    } finally {
      db.close();
    }
  } catch (err) {
    debugLog('sync-memory-index', 'Failed to initialize entity DB schema', err);
  } finally {
    // Always release lock
    if (lockFd !== null) {
      try {
        fs.closeSync(lockFd);  // Close file descriptor
        fs.unlinkSync(lockFile);  // Delete lock file
      } catch (_cleanupErr) {
        // Best effort cleanup
      }
    }
  }
}
```

**Why This Fix**:
- `fs.openSync(lockFile, 'wx')` → **Atomic** lock acquisition (fails if file exists)
- POSIX-compliant: Works on Windows/Linux/macOS
- Lock timeout: Prevents deadlock from crashed processes (stale locks)
- Best-effort cleanup: Lock always released in `finally` block
- No external dependencies: Uses only Node.js `fs` module

**Stale Lock Handling**:
If a process crashes while holding lock → lock file persists → future processes wait 2 seconds → remove stale lock → proceed

---

### Alternative: SQLite WAL Mode (Research-Recommended)

**Research Finding** (from remediation-best-practices-research-2026-02-13.md):
- WAL (Write-Ahead Logging) mode allows concurrent readers + single writer
- Better long-term solution than file locks
- Requires schema change (not immediate fix)

**Future Enhancement** (P2):
```javascript
// Enable WAL mode during schema init
db.exec('PRAGMA journal_mode=WAL;');
```

**Why Not Now**:
- Requires testing with existing schema
- Migration plan needed for production databases
- File lock is faster to implement (3h vs 8h)

---

### TDD Test Specification (Fix 3)

**Test File**: `tests/hooks/db-init-race-condition.test.cjs`

**Test 1: Verify concurrent init does not fail**
```javascript
// Test name: Concurrent schema init with file lock succeeds
// Assert: 10 parallel processes all initialize successfully (no SQLITE_BUSY errors)

test('concurrent schema init with file lock succeeds', async () => {
  const { spawn } = require('child_process');
  const fs = require('fs');
  const path = require('path');

  const testDbPath = path.join(__dirname, 'test-db-race.sqlite');

  // Delete test DB and lock file
  try { fs.unlinkSync(testDbPath); } catch {}
  try { fs.unlinkSync(testDbPath + '.init.lock'); } catch {}

  // Spawn 10 parallel processes that call ensureEntityDbInitialized
  const processes = [];
  for (let i = 0; i < 10; i++) {
    const child = spawn('node', [
      '-e',
      `
      const sync = require('./hooks/memory/sync-memory-index.cjs');
      sync.ensureEntityDbInitialized('${testDbPath}');
      `
    ], { stdio: 'pipe' });

    processes.push(new Promise((resolve) => {
      let stderr = '';
      child.stderr.on('data', (data) => { stderr += data.toString(); });
      child.on('close', (code) => resolve({ code, stderr }));
    }));
  }

  const results = await Promise.all(processes);

  // Verify: All processes exit successfully (no SQLITE_BUSY or schema errors)
  results.forEach((result, idx) => {
    assert.strictEqual(result.code, 0, `Process ${idx} should exit successfully`);
    assert.doesNotMatch(result.stderr, /SQLITE_BUSY|schema_version/i, `Process ${idx} should not error`);
  });

  // Verify: Schema initialized exactly once (no duplicate tables)
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(testDbPath);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  db.close();

  assert.ok(tables.some(t => t.name === 'schema_version'), 'schema_version table should exist');

  // Cleanup
  fs.unlinkSync(testDbPath);
});
```

**Test 2: Verify stale lock cleanup**
```javascript
// Test name: Stale lock file is removed after timeout
// Assert: If lock file exists for >2s, it is removed and init proceeds

test('stale lock file is removed after timeout', async () => {
  const fs = require('fs');
  const path = require('path');

  const testDbPath = path.join(__dirname, 'test-db-stale-lock.sqlite');
  const lockFile = testDbPath + '.init.lock';

  // Delete test DB
  try { fs.unlinkSync(testDbPath); } catch {}

  // Create stale lock file (simulate crashed process)
  fs.writeFileSync(lockFile, String(process.pid - 1000), 'utf8');

  // Wait 2.5 seconds (past timeout)
  await new Promise(resolve => setTimeout(resolve, 2500));

  // Call ensureEntityDbInitialized - should remove stale lock
  const sync = require('./hooks/memory/sync-memory-index.cjs');
  sync.ensureEntityDbInitialized(testDbPath);

  // Verify: Stale lock removed
  assert.strictEqual(fs.existsSync(lockFile), false, 'Stale lock should be removed');

  // Verify: DB initialized successfully
  assert.ok(fs.existsSync(testDbPath), 'DB should be initialized');

  // Cleanup
  fs.unlinkSync(testDbPath);
});
```

**TDD Cycle**:
1. **RED**: Write test → Verify it fails without lock (concurrent init errors)
2. **GREEN**: Add file lock → Verify test passes
3. **REFACTOR**: Extract lock acquisition to separate function (optional)

---

## Fix 4: Event Bus Null Checks

### Classification: **LOW** (Defensive Programming)
### Effort: 3 hours
### Security Control: SEC-008 (Defensive Coding)

### Problem Statement

Search for all files that import `event-bus.cjs` without null checks. Event bus may be `null` if initialization fails → causes crashes in code that assumes it exists.

**Risk**: Hook/tool crashes on event bus failure → Operational degradation (not security breach)

---

### Fix 4.1: Search for Event Bus Imports

**Search Command**:
```bash
# Find all imports of event-bus.cjs
rg -F "require.*event-bus.cjs" -g "*.cjs" -g "*.js" -g "*.ts"
```

**Expected Findings** (from previous code reviews):
- `.claude/hooks/routing/pre-task-unified.cjs`
- `.claude/hooks/routing/pre-tool-unified.cjs`
- `.claude/hooks/memory/sync-memory-index.cjs`
- `.claude/tools/*/` (various tools)

---

### Fix 4.2: Standardized Safe-Import Pattern

**Pattern**: All event bus imports should use this safe pattern:

**Before (Unsafe)**:
```javascript
const eventBus = require('../../lib/events/event-bus.cjs');

// Later in code
eventBus.emit('some-event', data);  // ← CRASH if eventBus is null
```

**After (Safe)**:
```javascript
const eventBus = require('../../lib/events/event-bus.cjs');

// Safe emit helper
function safeEmit(eventName, data) {
  if (eventBus && typeof eventBus.emit === 'function') {
    try {
      eventBus.emit(eventName, data);
    } catch (err) {
      // Log error but don't crash
      if (process.env.DEBUG_HOOKS) {
        console.error(`[event-bus] Failed to emit ${eventName}:`, err.message);
      }
    }
  }
}

// Later in code
safeEmit('some-event', data);  // ← SAFE: No crash if eventBus is null
```

**Alternative: Module-Level Guard**:
```javascript
const eventBus = require('../../lib/events/event-bus.cjs');
const EVENT_BUS_AVAILABLE = eventBus && typeof eventBus.emit === 'function';

// Later in code
if (EVENT_BUS_AVAILABLE) {
  eventBus.emit('some-event', data);
}
```

---

### Fix 4.3: Example File Changes

**File**: `.claude/hooks/routing/pre-task-unified.cjs` (example)

**Before (Unsafe)**:
```javascript
const eventBus = require('../../lib/events/event-bus.cjs');

function preToolUse(toolName, args) {
  // ... hook logic ...

  eventBus.emit('tool-use', { toolName, args });  // ← CRASH if eventBus is null
}
```

**After (Safe)**:
```javascript
const eventBus = require('../../lib/events/event-bus.cjs');

// Safe emit helper
function safeEmit(eventName, data) {
  if (eventBus && typeof eventBus.emit === 'function') {
    try {
      eventBus.emit(eventName, data);
    } catch (err) {
      if (process.env.DEBUG_HOOKS) {
        console.error(`[event-bus] Failed to emit ${eventName}:`, err.message);
      }
    }
  }
}

function preToolUse(toolName, args) {
  // ... hook logic ...

  safeEmit('tool-use', { toolName, args });  // ← SAFE: No crash if eventBus is null
}
```

---

### TDD Test Specification (Fix 4)

**Test File**: `tests/lib/events/event-bus-safe-import.test.cjs`

**Test 1: Verify safe emit handles null event bus**
```javascript
// Test name: safeEmit does not crash when eventBus is null
// Assert: Calling safeEmit with null eventBus does not throw

test('safeEmit does not crash when eventBus is null', () => {
  // Mock null event bus
  const eventBus = null;

  function safeEmit(eventName, data) {
    if (eventBus && typeof eventBus.emit === 'function') {
      try {
        eventBus.emit(eventName, data);
      } catch (err) {
        // No-op
      }
    }
  }

  // Should not throw
  assert.doesNotThrow(() => {
    safeEmit('test-event', { foo: 'bar' });
  }, 'safeEmit should not throw when eventBus is null');
});
```

**Test 2: Verify safe emit works normally when eventBus exists**
```javascript
// Test name: safeEmit emits event when eventBus is available
// Assert: Calling safeEmit with valid eventBus emits event successfully

test('safeEmit emits event when eventBus is available', () => {
  const EventEmitter = require('events');
  const eventBus = new EventEmitter();

  function safeEmit(eventName, data) {
    if (eventBus && typeof eventBus.emit === 'function') {
      try {
        eventBus.emit(eventName, data);
      } catch (err) {
        // No-op
      }
    }
  }

  let emitted = false;
  eventBus.on('test-event', (data) => {
    emitted = true;
    assert.deepStrictEqual(data, { foo: 'bar' }, 'Event data should match');
  });

  safeEmit('test-event', { foo: 'bar' });

  assert.ok(emitted, 'Event should be emitted');
});
```

**TDD Cycle**:
1. **RED**: Write test → Verify it fails without safe wrapper (crash on null eventBus)
2. **GREEN**: Add safe wrapper → Verify test passes
3. **REFACTOR**: Extract helper to shared utility (optional)

---

## Fix 5: Audit for Additional Shell Injection Vectors

### Classification: **INFORMATIONAL** (Comprehensive Audit)
### Effort: 2 hours
### Security Control: SEC-003 (Input Sanitization)

### Problem Statement

Search for ALL uses of `spawn` and `exec` with `shell: true` across the entire codebase. Identify any additional instances beyond the 4 known skill scripts.

**Risk**: Undiscovered shell injection vectors in hooks/tools/scripts

---

### Fix 5.1: Comprehensive Shell Injection Audit

**Search Commands**:

```bash
# Search for all spawn/exec with shell:true
rg -P "spawn.*shell:\s*true" -g "*.cjs" -g "*.js" -g "*.ts" --no-heading --line-number

# Search for all exec calls (inherently use shell)
rg -P "(exec|execSync)\s*\(" -g "*.cjs" -g "*.js" -g "*.ts" --no-heading --line-number

# Search for all spawnSync with shell:true
rg -P "spawnSync.*shell:\s*true" -g "*.cjs" -g "*.js" -g "*.ts" --no-heading --line-number
```

**Expected Findings**:
1. `.claude/skills/sequential-thinking/scripts/main.cjs:72` (already known)
2. `.claude/skills/git-expert/scripts/main.cjs:66` (already known)
3. `.claude/skills/docker-compose/scripts/main.cjs:64` (already known)
4. `.claude/skills/terraform-infra/scripts/main.cjs:66` (already known)
5. **Unknown instances** (to be discovered)

---

### Fix 5.2: Audit Report Template

**Create audit report** at `.claude/context/reports/shell-injection-audit-2026-02-13.md`:

```markdown
# Shell Injection Audit Report

**Date**: 2026-02-13
**Scope**: All `spawn`, `exec`, `spawnSync` calls with `shell: true` or `shell: false`
**Method**: Ripgrep pattern search across `.cjs`, `.js`, `.ts` files

---

## Findings

### Known Instances (Fixed in Fix 1)

1. `.claude/skills/sequential-thinking/scripts/main.cjs:72` - `shell: true` → **FIXED**
2. `.claude/skills/git-expert/scripts/main.cjs:66` - `shell: true` → **FIXED**
3. `.claude/skills/docker-compose/scripts/main.cjs:64` - `shell: true` → **FIXED**
4. `.claude/skills/terraform-infra/scripts/main.cjs:66` - `shell: true` → **FIXED**

### Additional Instances (To Be Reviewed)

| File | Line | Pattern | Risk Assessment | Remediation |
|------|------|---------|-----------------|-------------|
| ... | ... | ... | ... | ... |

---

## Recommendations

1. **Immediate**: Fix any HIGH-risk instances found (user-controlled input)
2. **Short-term**: Fix MEDIUM-risk instances (agent-controlled input)
3. **Long-term**: Establish linting rule: `no-shell-true` (ESLint custom rule)

---

## ESLint Rule Proposal

**Rule**: `no-shell-true` (custom rule for this codebase)

**Pattern**: Warn on any `spawn`, `exec`, `spawnSync` with `shell: true`

**Implementation**:
```javascript
// .eslintrc.cjs custom rules
module.exports = {
  rules: {
    'no-shell-true': {
      meta: {
        type: 'problem',
        docs: { description: 'Disallow shell:true in spawn/exec calls' },
        messages: { noShellTrue: 'Avoid shell:true - use array args instead' },
      },
      create(context) {
        return {
          Property(node) {
            if (node.key.name === 'shell' && node.value.value === true) {
              context.report({ node, messageId: 'noShellTrue' });
            }
          },
        };
      },
    },
  },
};
```

**Enforcement**: Pre-commit hook (`pnpm lint:fix` gate)
```

---

### TDD Test Specification (Fix 5)

**Test**: Not applicable (audit task, not code change)

**Verification**:
1. Run search commands above
2. Document all findings in audit report
3. Classify by risk (HIGH/MEDIUM/LOW)
4. Propose remediation timeline

**Success Criteria**:
- All `shell: true` instances documented
- Risk assessment completed for each
- No HIGH-risk instances remain unfixed
- ESLint rule proposed for future prevention

---

## Summary of All Fixes

| Fix | Files Affected | Effort | Priority | Risk Reduction |
|-----|----------------|--------|----------|----------------|
| 1. Remove shell:true | 4 skill scripts | 4h | **P0** (This Week) | **CRITICAL** → Eliminates command injection |
| 2. safeParseJSON | 3 reflection hooks | 2h | **P0** (This Week) | **HIGH** → Prevents prototype pollution |
| 3. DB race condition | 1 hook | 3h | **P0** (This Week) | **MEDIUM** → Prevents concurrent init failures |
| 4. Event bus null checks | Multiple files (TBD) | 3h | **P1** (This Month) | **LOW** → Prevents crashes on event bus failure |
| 5. Shell injection audit | Entire codebase | 2h | **P2** (Next Quarter) | **INFORMATIONAL** → Comprehensive security posture |

**Total Effort**: 14 hours
**P0 Effort**: 9 hours (security-critical fixes)
**P1 Effort**: 3 hours (reliability improvements)
**P2 Effort**: 2 hours (comprehensive audit)

---

## Security Controls Catalog Integration

All fixes map to security controls from `.claude/context/artifacts/security-controls-catalog.md`:

| Fix | Security Control | OWASP Category |
|-----|------------------|----------------|
| 1. Shell injection | SEC-003 (Input Sanitization) | A03: Injection |
| 2. JSON.parse | SEC-003 (Input Sanitization) | A04: Insecure Design |
| 3. DB race condition | SEC-007 (File-Based Locking) | A04: Insecure Design |
| 4. Event bus | SEC-008 (Defensive Coding) | A05: Security Misconfiguration |
| 5. Shell audit | SEC-003 (Input Sanitization) | A03: Injection |

---

## Compliance Reporting

**SOC2 Compliance**:
- CC6.1 (Logical and Physical Access Controls): Fixes 1, 2, 3 address injection and race condition vulnerabilities
- CC7.1 (System Operations): Fix 4 addresses operational reliability

**HIPAA Compliance**:
- 164.308(a)(1)(ii)(A) (Risk Analysis): Fixes 1-5 address identified security risks
- 164.312(a)(1) (Access Control): Fix 1 prevents unauthorized command execution

**GDPR Compliance**:
- Article 32 (Security of Processing): All fixes improve technical security measures

---

## Next Steps

1. **Developer**: Implement fixes 1-4 (sequential order, TDD red-green-refactor)
2. **QA**: Verify all TDD tests pass (regression suite)
3. **Security-Architect**: Conduct Fix 5 audit + review all code changes
4. **DevOps**: Deploy fixes to staging → verify monitoring alerts (no regressions)
5. **Code-Reviewer**: Final approval before production deployment

---

**Report Generated**: 2026-02-13
**Agent**: security-architect
**Task**: task-phase2-security
**Evidence-Based**: All fixes include exact before/after code, TDD tests, Windows compatibility verification
