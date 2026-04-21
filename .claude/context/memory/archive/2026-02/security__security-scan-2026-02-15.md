<!-- Agent: security-architect | Task: security-scan | Session: 2026-02-15 -->

# Security Scan Report -- 2026-02-15

## Scope

Focused audit of four high-value attack surfaces:

1. Command injection in bash/shell hooks
2. JSON parsing safety across hook files
3. Path traversal in write/filesystem hooks
4. Prototype pollution via `safeParseJSON`

---

## Finding 1 -- MEDIUM: `ALLOW_UNREGISTERED_COMMANDS=true` bypasses all command validation

**File:** `C:\dev\projects\agent-studio\.claude\hooks\safety\validators\registry.cjs` (line 324)

**Description:**
Setting the environment variable `ALLOW_UNREGISTERED_COMMANDS=true` causes `validateCommand()` to return `{ valid: true }` for any command not in the `SAFE_COMMANDS_ALLOWLIST` or `VALIDATOR_REGISTRY`, including dangerous system administration tools (`dd`, `mkfs`, `fdisk`, `iptables`, `systemctl`, `useradd`, `passwd`, `chroot`, `mount`, `umount`).

The override logs a `security_override` JSON entry to stderr, but this is the only safeguard. If an attacker or misconfigured agent sets this env var, all deny-by-default protection is disabled.

**Severity:** MEDIUM (requires env var control; defense-in-depth gap)

**Remediation:**
- Remove this override entirely or restrict it to a hardcoded list of additional safe commands.
- If kept, log to the security audit file (not just stderr) and add a startup warning.

---

## Finding 2 -- MEDIUM: `BASH_VALIDATOR_FAIL_OPEN=true` disables fail-closed behavior

**File:** `C:\dev\projects\agent-studio\.claude\hooks\safety\bash-command-validator.cjs` (line 339)

**Description:**
The bash command validator correctly fails closed on internal errors (exit code 2). However, setting `BASH_VALIDATOR_FAIL_OPEN=true` causes it to `process.exit(0)` on any error, allowing the command through. An attacker who can set environment variables could craft input that triggers a parsing error (e.g., extremely long command, invalid UTF-8) to bypass all validation.

Similarly, `SHELL_INJECTION_VALIDATOR=off` (in `shell-injection-validator.cjs` line 64) and `HOOK_FAIL_OPEN=true` (in `unified-pre-write-hook.cjs` line 536) provide additional bypass mechanisms.

**Severity:** MEDIUM (requires env var control; documented as debug-only but no runtime guard)

**Remediation:**
- Gate these overrides behind an additional check (e.g., only allow in NODE_ENV=development or test).
- Log all fail-open activations to the persistent security audit file.

---

## Finding 3 -- HIGH: Widespread raw `JSON.parse()` without try/catch in hook files

**File:** Multiple hooks under `C:\dev\projects\agent-studio\.claude\hooks\`

**Description:**
Despite the project having `safeParseJSON` in `.claude/lib/utils/safe-json.cjs` and the `hook-input.cjs` utility with sanitization, at least 50+ call sites across active (non-archived) hook files use raw `JSON.parse()`. While many are wrapped in try/catch, several are NOT, creating crash vectors:

Unprotected calls (no surrounding try/catch -- will crash the hook process on malformed input):

- `sync-memory-index.cjs:171` -- `JSON.parse(raw)` on file content
- `reflection-step0-guard.cjs:151` -- `JSON.parse(fs.readFileSync(...))`
- `pre-tool-unified.execution.cjs:62` -- `JSON.parse(fs.readFileSync(claimingFile, ...))`
- `post-completion-chain.cjs:104` -- `JSON.parse(fs.readFileSync(WORKFLOW_STATE_FILE, ...))`
- `routing-guard-core.shared.cjs:45` -- `JSON.parse(raw)`
- `spawn-prompt-assembler.core.cjs:119,210` -- `JSON.parse(...)` on cache/log files
- `spawn-prompt-assembler.runtime-support.cjs:258,283` -- `JSON.parse(...)` on preset/state files
- `user-prompt-unified.core.cjs:147,394,415,704,1268,1453,1541` -- multiple `JSON.parse()` on state files

Additionally, none of these call sites strip `__proto__`, `constructor`, or `prototype` keys. Only `hook-input.cjs` and `safe-json.cjs` perform prototype pollution sanitization.

If a corrupted or maliciously crafted JSON state file is read by any of these hooks, the hook process crashes. Since many hooks fail-closed on crash (exit != 0), this becomes a denial-of-service vector that blocks all tool usage until the corrupted file is fixed.

**Severity:** HIGH (crash = denial of service; prototype pollution = potential privilege escalation via state file poisoning)

**Remediation:**
- Replace all `JSON.parse()` calls in hook files with `safeParseJSON()` or `safeReadJSON()` from `.claude/lib/utils/safe-json.cjs`.
- Add an ESLint rule to ban raw `JSON.parse()` in `.claude/hooks/` files.
- Ensure all state file reads use schema-validated parsing.

---

## Finding 4 -- MEDIUM: No path traversal or project-boundary validation for Write/Edit tools

**File:** `C:\dev\projects\agent-studio\.claude\hooks\safety\unified-pre-write-hook.cjs`

**Description:**
The unified pre-write hook validates:
- Protected directories (.git, node_modules, code-index)
- Project root writes (allowlisted filenames only)
- Creator guard paths (.claude/skills, .claude/agents, etc.)

However, it does NOT validate that the write target is within the project directory. There is no check using `path.resolve()` + `startsWith(PROJECT_ROOT)` to prevent writes to arbitrary absolute paths outside the project. For example, writing to `C:\Users\<user>\AppData\...` or `/etc/cron.d/...` would pass all checks.

The `filesystem-validators.cjs` has `containsPathTraversal()` but it only checks for `../` patterns in `rm` commands -- not in Write/Edit tool paths.

The `file-placement-guard` (Check 2) only checks against a few regex patterns for protected directories, not against the project boundary.

**Severity:** MEDIUM (Claude Code likely has its own sandboxing, but the hook layer provides no defense-in-depth)

**Remediation:**
- Add a project boundary check to `unified-pre-write-hook.cjs`:
  ```javascript
  const resolved = path.resolve(filePath);
  const normalizedResolved = resolved.replace(/\\/g, '/');
  if (!normalizedResolved.startsWith(normalizedRoot)) {
    return { pass: false, result: 'block',
      message: `Write target outside project boundary: ${filePath}` };
  }
  ```
- Add symlink resolution (`fs.realpathSync`) to prevent symlink-based escapes.

---

## Finding 5 -- LOW: `safeParseJSON` prototype pollution protection has gaps in no-schema fallback path

**File:** `C:\dev\projects\agent-studio\.claude\lib\utils\safe-json.cjs` (lines 186-201)

**Description:**
The `safeParseJSON` function correctly strips `__proto__`, `constructor`, and `prototype` keys at the top level in the no-schema fallback path (lines 191-196). However, this stripping is only one level deep. Nested objects are assigned by reference without recursive sanitization:

```javascript
for (const key of Object.keys(parsed)) {
  if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
    continue; // Only top-level keys stripped
  }
  safe[key] = parsed[key]; // Nested objects NOT sanitized
}
```

A payload like `{"data": {"__proto__": {"isAdmin": true}}}` would pass the top-level check and the nested `__proto__` key would be preserved in the `safe.data` object. While `Object.create(null)` on the top-level object prevents direct prototype pollution of `Object.prototype`, the nested object retains the dangerous key and could be spread or assigned elsewhere.

The schema-validated path (lines 230-253) uses `JSON.parse(JSON.stringify(value))` for deep copy, which inherently strips `__proto__` during serialization -- this path is safe.

**Severity:** LOW (exploitation requires the nested polluted object to be later spread onto a prototyped object; `Object.create(null)` at the top level is a strong mitigation)

**Remediation:**
- Add recursive `__proto__`/`constructor`/`prototype` stripping in the no-schema fallback path.
- Consider using `JSON.parse(JSON.stringify(parsed))` as an intermediate step (strips `__proto__` during round-trip).

---

## Finding 6 -- LOW: SAFE_COMMANDS_ALLOWLIST includes `source` and `.` (dot command)

**File:** `C:\dev\projects\agent-studio\.claude\hooks\safety\validators\registry.cjs` (lines 143-144)

**Description:**
The `SAFE_COMMANDS_ALLOWLIST` includes `source` and `.` (dot notation) as "shell built-in commands." While these cannot execute arbitrary binaries, they can source arbitrary shell scripts, potentially executing any code within the current shell context. The `shell-validators.cjs` DANGEROUS_BUILTINS list blocks `source` and `.` when they appear inside `bash -c` commands, but when used as the primary command (e.g., `source /tmp/evil.sh`), they pass the allowlist check in `registry.cjs` without any further validation.

Note: `eval` and `exec` were correctly removed from the allowlist (line 144 comment), but `source` and `.` remain.

**Severity:** LOW (the shell-validators catch these in `-c` nested contexts, and Claude Code sandboxing limits file access; however, the allowlist is inconsistent with the security intent)

**Remediation:**
- Remove `source` and `.` from `SAFE_COMMANDS_ALLOWLIST`.
- Add them to `VALIDATOR_REGISTRY` with a validator that checks the script path is within the project.

---

## Summary

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| 1 | `ALLOW_UNREGISTERED_COMMANDS` env var bypass | MEDIUM | Open |
| 2 | `BASH_VALIDATOR_FAIL_OPEN` + similar env var bypasses | MEDIUM | Open |
| 3 | 50+ raw `JSON.parse()` calls in hooks without try/catch or sanitization | HIGH | Open |
| 4 | No project-boundary validation for Write/Edit paths | MEDIUM | Open |
| 5 | `safeParseJSON` no-schema path only strips dangerous keys at top level | LOW | Open |
| 6 | `source` and `.` on safe commands allowlist despite being code-execution vectors | LOW | Open |

**Overall Risk Assessment:** The hook system provides substantial defense-in-depth but has three systemic gaps: (1) environment variable overrides that can silently disable all security checks, (2) widespread use of raw `JSON.parse()` creating crash/DoS vectors, and (3) missing project-boundary enforcement for file writes. The most impactful fix would be migrating all hook JSON parsing to `safeParseJSON`/`safeReadJSON`.
