<!-- Agent: security-architect | Task: #79 | Session: 2026-02-09 -->

# Security Review: pro-workflow Codebase (Adoption Assessment)

**Reviewed:** `C:\dev\projects\agent-studio\.claude.archive\.tmp\pro-workflow-main`
**Date:** 2026-02-09
**Scope:** Security patterns, risks, and adoption recommendations for pulling pro-workflow features into agent-studio.

---

## Executive Summary

The pro-workflow codebase is a lightweight Claude Code plugin focused on session management, learning capture, and quality gates. It has a **minimal attack surface** (1 runtime dependency, no network calls, no auth system). Its security posture is **adequate for its scope** but **significantly weaker than ours** in input validation, path traversal protection, command injection prevention, and hook security enforcement. There are no features we should adopt for security reasons, but some patterns are useful if hardened first. Key risks center around unvalidated file path construction and lack of hook bypass protection.

**Overall Security Risk for Adoption: LOW-MEDIUM** -- No critical vulnerabilities that would propagate into our codebase, but several patterns need hardening before integration.

---

## 1. Input Validation

### Their Approach

**Hooks (stdin JSON parsing):** All hook scripts parse JSON from stdin inside try/catch blocks and fall through gracefully on error (outputting the original data). This is a safe pattern.

**FTS5 Search Query Sanitization:** The `sanitizeQuery()` function in `src/search/fts.ts` (line 140-157) strips non-word characters, adds prefix wildcards, and prevents FTS5 injection. This is a reasonable defense.

```typescript
// Their sanitization: strips special chars, adds wildcards
function sanitizeQuery(query: string): string {
  return query
    .replace(/[^\w\s*"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((word) => word.length > 0)
    .map((word) => {
      if (word.startsWith('"') && word.endsWith('"')) return word;
      if (!word.includes('*')) return `${word}*`;
      return word;
    })
    .join(' ');
}
```

**User Prompt Handling:** The `prompt-submit.js` and `drift-detector.js` scripts read `input.prompt` from stdin and apply regex pattern matching. No sanitization of the prompt content itself, but it is only used for local pattern detection (not passed to shells or SQL).

### Comparison to Ours

| Area | pro-workflow | agent-studio |
|------|-------------|--------------|
| FTS5 query sanitization | Yes, basic `sanitizeQuery()` | Our BM25 indexer handles this at the indexer level |
| Hook stdin JSON parsing | try/catch with passthrough | Same pattern, plus structured `hook-input.cjs` utility |
| Path input validation | None | `unified-pre-write-hook.cjs` validates all file paths |
| Tool input validation | None | `tool-scope-validator.cjs` enforces allowed tool sets |

**Verdict:** Their FTS5 sanitization is a good pattern (we do not currently have FTS5). Everything else is weaker than ours.

### Adoption Recommendation

- **ADOPT (if using FTS5):** Their `sanitizeQuery()` pattern for FTS5 input sanitization. Well-designed for preventing FTS5 injection.
- **DO NOT ADOPT:** Their lack of path validation or tool input validation.

---

## 2. Path Traversal Protection

### Their Approach

**No path traversal protection exists.** File paths are constructed through string concatenation without any validation or normalization.

Critical examples:

1. **`quality-gate.js` (line 88):** `const editCountFile = path.join(tempDir, 'edit-count-' + sessionId)` -- The `sessionId` comes from `process.env.CLAUDE_SESSION_ID || String(process.ppid) || 'default'`. While `process.ppid` is safe, `CLAUDE_SESSION_ID` is an environment variable that could theoretically contain path traversal characters (e.g., `../../etc/something`).

2. **`drift-detector.js` (line 36):** `const intentFile = path.join(tempDir, 'intent-' + sessionId)` -- Same issue.

3. **`session-end.js` (line 83):** `const sessionFile = path.join(sessionsDir, '${today}-${shortId}.md')` -- `shortId` is the last 6 chars of sessionId, which limits the traversal surface but does not eliminate it.

4. **`post-edit-check.js` (line 26-32):** Reads `input.tool_input.file_path` directly from stdin and uses it with `fs.readFileSync()` without any validation. While this is a PostToolUse hook (the file path comes from Claude Code itself), it still trusts the input completely.

5. **Database path:** `~/.pro-workflow/data.db` is hardcoded via `os.homedir()` -- safe.

### Comparison to Ours

| Area | pro-workflow | agent-studio |
|------|-------------|--------------|
| Temp file paths | No validation | `windows-null-sanitizer.cjs` + `unified-pre-write-hook.cjs` |
| Session ID sanitization | None | We normalize all IDs |
| File path validation | None | Multi-layer: Write hook, path validation, Windows reserved name check |
| Path traversal regex | None | `.replace(/\\/g, '/')` + pattern matching for `..` |

**Verdict:** Significantly weaker than ours. Their code trusts environment variables and stdin inputs for path construction without sanitization.

### Adoption Recommendation

- **DO NOT ADOPT** their path handling patterns. They would regress our security.
- **IF ADOPTING** their scripts, we MUST add session ID sanitization (strip `../`, `..\\`, null bytes, and Windows reserved names).

---

## 3. Command Injection

### Their Approach

**Shell command usage is minimal but present:**

1. **`session-start.js` (line 101-102):** `execSync('git worktree list 2>/dev/null', { encoding: 'utf8' })` -- Hardcoded command, no user input. Safe.

2. **`session-end.js` (line 114):** `execSync('git status --porcelain 2>/dev/null', { cwd: projectRoot })` -- `projectRoot` is derived from `.git` directory traversal, not user input. Generally safe but `cwd` could theoretically be influenced.

3. **`scout.md` (line 67):** Instructs the agent to run: `sqlite3 ~/.pro-workflow/data.db "SELECT category, rule, times_applied FROM learnings WHERE rule LIKE '%keyword%' ORDER BY times_applied DESC LIMIT 5"` -- This is a prompt instruction, not code. However, it suggests running shell commands with user-supplied keywords, which is a SQL injection risk through the shell layer if the keyword is not sanitized.

4. **`hooks.json` (line 52):** Inline Node.js code via `node -e "..."` -- These use hardcoded logic, not user-supplied input.

### Comparison to Ours

| Area | pro-workflow | agent-studio |
|------|-------------|--------------|
| Shell command validation | None (hardcoded commands only) | `bash-command-validator.cjs` blocks dangerous patterns |
| Shell injection prevention | None | `shell-injection-validator.cjs` detects injection patterns |
| execSync usage | `shell: true` (default) | We use `spawnSync` with `shell: false` where possible |
| Agent prompt SQL | Suggests raw shell sqlite3 | Our DB access is through parameterized `better-sqlite3` |

**Verdict:** Their shell usage is minimal and mostly safe due to hardcoded commands. However, the scout agent's suggestion to run raw sqlite3 queries with user keywords via shell is a SQL injection + command injection risk. Our approach is strictly superior.

### Adoption Recommendation

- **DO NOT ADOPT** their `execSync` pattern. If adopting their git commands, convert to `spawnSync` with array args.
- **DO NOT ADOPT** the scout agent's raw sqlite3 shell pattern. Use parameterized queries through `better-sqlite3` directly.

---

## 4. Hook Security

### Their Approach

**Hook enforcement:** Hooks are advisory only. They use `console.error()` for warnings but never block operations (all scripts `process.exit(0)` unconditionally). No hook can prevent an unsafe action.

**Hook bypass:** No protection exists. Hooks do not use the `{ allow: false }` protocol for blocking. Every hook is a logging/reminder mechanism, not an enforcement mechanism.

**Hook registration:** Via `hooks.json` with the standard Claude Code hooks schema. Uses `${CLAUDE_PLUGIN_ROOT}` variable for script paths.

**Hook matchers:**
- PreToolUse on Edit/Write: quality gate tracking (non-blocking)
- PreToolUse on Bash matching `git commit`: reminder only
- PreToolUse on Bash matching `git push`: reminder only
- PostToolUse on Edit: post-edit checks (non-blocking)
- PostToolUse on Bash matching test commands: learning suggestion (non-blocking)
- Stop: session check (non-blocking)
- SessionStart/End: session management
- UserPromptSubmit: correction/drift detection
- PreCompact: state preservation
- Notification: permission logging

### Comparison to Ours

| Area | pro-workflow | agent-studio |
|------|-------------|--------------|
| Hook enforcement model | Advisory (exit 0 always) | Blocking (exit 2 for violations) |
| Hook bypass protection | None | Multi-layer (routing-guard, creator-guard, pre-write) |
| Hook protocol compliance | Non-standard (no allow/block JSON) | Standard stdin/stdout JSON protocol |
| Hook categories | 1 file, all hooks | Organized by concern (routing, safety, validation) |
| Security hooks | None | bash-command-validator, shell-injection-validator, etc. |

**Verdict:** Their hooks serve a completely different purpose (reminders/tracking, not enforcement). Our hook system is fundamentally more secure. Their hooks would not contribute to our security posture.

### Adoption Recommendation

- **ADOPT (concept only):** Their adaptive quality gate thresholds (correction-rate-based adjustment) is a useful pattern. The concept should be implemented in our existing blocking hook framework.
- **ADOPT (concept only):** Their drift detection concept (tracking original intent vs current work) is useful for session management. Not a security feature per se, but reduces wasted effort.
- **DO NOT ADOPT** their hook scripts directly. They would need complete rewrite to match our enforcement protocol.

---

## 5. Secret Management

### Their Approach

**Hardcoded secret detection in post-edit-check.js (line 55):**
```javascript
if (/(['"])?(api[_-]?key|secret|password|token)(['"])?[\s]*[:=][\s]*(['"])[^'"]{8,}/i.test(line)) {
  issues.push(`${lineNum}: Possible hardcoded secret`);
}
```
This is a post-edit advisory check. It detects common secret patterns but does not block commits or edits.

**Database path:** Uses `~/.pro-workflow/data.db` in user home directory. No encryption, no access controls beyond filesystem permissions. The database stores learning data, not secrets.

**No credential handling:** The codebase handles no API keys, tokens, or authentication credentials at all. There is no auth system.

### Comparison to Ours

| Area | pro-workflow | agent-studio |
|------|-------------|--------------|
| Secret detection | Basic regex in post-edit hook | Multiple layers (pre-write hooks, git hooks) |
| Detection scope | Post-edit advisory only | Pre-commit blocking |
| Credential storage | N/A (no credentials) | Environment variables, never in code |
| Database encryption | None (not needed for their data) | N/A (our SQLite stores non-sensitive data too) |

**Verdict:** Their secret detection regex is simpler than ours but catches the basics. Not a security enhancement for us.

### Adoption Recommendation

- **ALREADY COVERED:** We already have secret detection in multiple layers. No adoption needed.

---

## 6. Dependency Security

### Their Dependencies

**Runtime:** `better-sqlite3` ^12.6.2 (native addon, well-maintained, 4M+ weekly npm downloads)
**Dev:** `@types/better-sqlite3` ^7.6.12, `@types/node` ^20.17.14, `typescript` ^5.7.3

**Analysis:**
- **Total dependency count:** 1 runtime dependency. This is excellent for security -- minimal supply chain attack surface.
- **`better-sqlite3`:** Widely used, actively maintained, uses N-API for native bindings. The native compilation step requires build tools (node-gyp, Python, C++ compiler) which adds build-time complexity but no runtime risk.
- **No known CVEs** for `better-sqlite3` ^12.6.2 at time of review.
- **We already use `better-sqlite3`** in our codebase for BM25 indexing.

### Comparison to Ours

| Area | pro-workflow | agent-studio |
|------|-------------|--------------|
| Runtime dependencies | 1 (better-sqlite3) | Several (better-sqlite3, others) |
| Supply chain risk | Very low | Low-medium (more deps) |
| Shared dependency | better-sqlite3 | better-sqlite3 (already present) |
| Lock file | package-lock.json present | pnpm-lock.yaml |

**Verdict:** Their dependency posture is exemplary (1 runtime dep). No dependency risk from adoption since we already use `better-sqlite3`.

### Adoption Recommendation

- **SAFE TO ADOPT:** Their TypeScript source code. The single runtime dependency is already in our project.
- **NOTE:** If adopting their code, we should use our existing `better-sqlite3` installation rather than adding a second copy.

---

## 7. Additional Security Observations

### 7.1 Temp File Race Conditions

All scripts use `os.tmpdir() + '/pro-workflow/'` for temporary state (edit counts, prompt counts, session data). The directory creation uses `mkdirSync({ recursive: true })` which is fine, but file reads and writes are not atomic:

```javascript
// Potential TOCTOU race (theoretical)
if (fs.existsSync(editCountFile)) {
  count = parseInt(fs.readFileSync(editCountFile, 'utf8').trim(), 10) + 1;
}
fs.writeFileSync(editCountFile, String(count));
```

This is a minor issue since these files are per-session and single-writer, but it is worth noting that our `atomic-write.cjs` utility would be more robust.

### 7.2 Unvalidated parseInt

Several scripts use `parseInt(content, 10)` on file contents without `isNaN()` checks. If a temp file is corrupted, `NaN + 1 = NaN` would propagate silently. Not a security issue but a reliability concern.

### 7.3 Session ID as Filename Component

Session IDs are used directly in filenames (`edit-count-${sessionId}`, `intent-${sessionId}`). If `CLAUDE_SESSION_ID` contains filesystem-special characters (e.g., `:` on Windows, `/` anywhere), file operations would fail unpredictably or create files in unexpected locations.

### 7.4 execSync Error Handling

Git commands use `execSync` wrapped in try/catch. The error messages are swallowed, which prevents information disclosure but also hides operational issues. Acceptable for this use case.

### 7.5 No Input Length Limits

`drift-detector.js` stores `prompt.slice(0, 500)` (line 43) which shows awareness of input size. However, other scripts process the full prompt content without size limits, and the full stdin data is accumulated in memory (line 23: `data += chunk`). A malicious or extremely large input could cause memory exhaustion, though this is theoretical since Claude Code controls the hook inputs.

---

## Risk Matrix for Adoption

| Finding | Severity | Risk if Adopted | Mitigation Required |
|---------|----------|----------------|---------------------|
| No path traversal protection | MEDIUM | LOW (our hooks catch it) | Add sessionId sanitization to any adopted scripts |
| Advisory-only hooks | LOW | NONE (we would not replace our blocking hooks) | N/A -- adopt concepts, not code |
| Scout agent raw SQL shell | MEDIUM | MEDIUM (if adopted as-is) | Rewrite to use parameterized queries |
| Temp file race conditions | LOW | LOW | Use our atomic-write utility |
| Session ID in filenames | LOW | LOW on Linux, MEDIUM on Windows | Sanitize before use in filenames |
| No input length limits | LOW | NONE (Claude Code controls inputs) | N/A |

---

## Summary of Recommendations

### Patterns Worth Adopting (with hardening)

1. **FTS5 query sanitization** -- Their `sanitizeQuery()` is well-designed. Adopt if we implement FTS5 search.
2. **Adaptive quality gate thresholds** -- Adjusting enforcement frequency based on correction history is a novel pattern. Implement in our blocking hook framework.
3. **Drift detection concept** -- Tracking original intent vs. current work direction. Useful for session management.
4. **Post-edit secret detection regex** -- Simple but effective pattern. We already have this covered.

### Patterns to Avoid

1. **Advisory-only hooks** -- Would weaken our enforcement model.
2. **Raw shell sqlite3 queries** -- SQL injection + command injection risk.
3. **Unsanitized session IDs in file paths** -- Path traversal risk.
4. **execSync with default shell: true** -- Use spawnSync with shell: false.

### Integration Risks

1. **LOW:** Their code does not handle auth, credentials, or sensitive data, so there is no risk of introducing credential-handling vulnerabilities.
2. **LOW:** Their single dependency (better-sqlite3) is already in our project.
3. **MEDIUM:** If their scripts are adopted without adding path validation, they would create a gap in our file safety layer (but our hooks would likely catch it at the Write/Edit level).

---

## Conclusion

The pro-workflow codebase is not a security-focused project. It is a productivity toolkit that handles non-sensitive data (edit counts, learning patterns, session metadata). Its security posture is adequate for its limited scope but would not meet our standards without significant hardening. The main adoption value is in workflow concepts (adaptive gates, drift detection, FTS5 search), not in code-level security patterns. All adopted code must pass through our existing hook enforcement layers.

**No blocking security issues** prevent adoption of their concepts and ideas. Their actual code should be rewritten to match our security standards rather than copied directly.
