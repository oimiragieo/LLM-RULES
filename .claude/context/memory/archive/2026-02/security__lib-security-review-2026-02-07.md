<!-- Agent: security-architect | Task: #121 | Session: 2026-02-07 -->

# Security Assessment: `.claude/lib/` Shared Library Subsystem

**Pipeline:** #15 - Lib System Deep Dive
**Assessment Date:** 2026-02-07
**Assessor:** Security Architect Agent
**Scope:** All modules under `.claude/lib/` (~100+ files)
**Methodology:** STRIDE threat modeling, OWASP Top 10 analysis, manual code review, pattern-based vulnerability scanning

---

## Security Score: 62 / 100

**Approval Status: CONDITIONAL - Requires remediation of CRITICAL and HIGH findings before production use**

The lib subsystem demonstrates strong security practices in some areas (prototype pollution prevention in hook-input.cjs, safe expression parsing in decision-handler.mjs, optimistic concurrency in router-state.cjs) but has systemic weaknesses in command execution safety, YAML deserialization, prompt injection defense, and JSON parsing fallback paths.

---

## Executive Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 2     | Open   |
| HIGH     | 5     | Open   |
| MEDIUM   | 5     | Open   |
| LOW      | 3     | Open   |
| **Total** | **15** | |

### Key Risk Areas

1. **Command Injection** (CRITICAL): Two modules execute shell commands with insufficient input sanitization
2. **Unsafe YAML Deserialization** (HIGH): Five modules use `yaml.load()` without safe schema constraints
3. **Prompt Injection** (HIGH): Constitution/behaviour files injected into all agent spawns without integrity verification
4. **JSON Parsing Fallback** (HIGH): Safe JSON parser falls back to plain `JSON.parse` when no schema is provided

---

## Findings

### CRITICAL Findings

#### SEC-LIB-001: Command Injection via execSync in hybrid-lazy-indexer.cjs

**File:** `C:\dev\projects\agent-studio\.claude\lib\code-indexing\hybrid-lazy-indexer.cjs`
**Lines:** 225-232, 406, 422-424, 463-464, 486-487
**STRIDE:** Tampering, Elevation of Privilege
**OWASP:** A03 (Injection)

**Description:** The `ripgrepSearch()` method constructs a shell command using string interpolation with user-controllable input:

```javascript
const safeQuery = query.replace(/"/g, '\\"');
const output = execSync(
  `"${rgPath}" "${safeQuery}" ${args.join(' ')} "${this.projectRoot}"`,
  { encoding: 'utf8', timeout: options.timeout || this.config.ripgrepTimeoutMs, maxBuffer: 10 * 1024 * 1024 }
);
```

**Vulnerability:** The `safeQuery` sanitization only escapes double quotes. It does NOT escape:
- Shell metacharacters: `$()`, backticks, `|`, `&&`, `;`
- Newlines: `\n`, `\r`
- Null bytes: `\0`

An attacker who controls the `query` parameter can inject arbitrary shell commands. Example: `query = 'test$(whoami)'` would execute `whoami` on the system.

Additionally, `this.projectRoot` comes from `options.projectRoot || process.cwd()` which is externally controllable.

Additional `execSync` calls in `getFileTree()` (line 406), `manualTree()` (line 422), `getEntryPoints()` (line 463), and `getDependencies()` (line 486) also interpolate `this.projectRoot` into command strings.

**Impact:** Remote code execution on the host system. An attacker who can influence search queries (e.g., through crafted filenames, memory content, or API input) can execute arbitrary commands with the privileges of the Node.js process.

**Remediation:**
1. Use `spawnSync` with array arguments instead of `execSync` with string interpolation (as swarm-coordination.cjs already does correctly with `shell: false`)
2. Sanitize `query` against all shell metacharacters, not just double quotes
3. Validate `projectRoot` against a hardcoded allowlist or `PROJECT_ROOT` constant

**Severity Justification:** CRITICAL because it allows arbitrary code execution with no authentication barrier if query input is attacker-controllable.

---

#### SEC-LIB-002: Arbitrary Command Execution via scheduler-tick.cjs

**File:** `C:\dev\projects\agent-studio\.claude\lib\scheduler\scheduler-tick.cjs`
**Lines:** 10-24
**STRIDE:** Tampering, Elevation of Privilege
**OWASP:** A03 (Injection), A08 (Software and Data Integrity)

**Description:** The `runTaskCommand()` function executes commands from the scheduler store file with `shell: true`:

```javascript
function runTaskCommand(command, projectRoot) {
  if (!command) return { success: false, error: 'missing_command' };
  const result = spawnSync(command, {
    cwd: projectRoot,
    shell: true,
    stdio: 'inherit',
  });
  // ...
}
```

The `command` parameter comes directly from `task.payload.command` in the scheduler store JSON file. There is NO validation, sanitization, or allowlisting of the command before execution.

**Impact:** If an attacker can modify the scheduler store file (via file write, prototype pollution, or state tampering), they can execute arbitrary commands. Since the store is a JSON file on disk, any write access to the file grants code execution.

**Remediation:**
1. Implement a command allowlist (only permit known, safe commands)
2. Use `spawnSync` with array arguments and `shell: false`
3. Validate the command against a strict regex pattern
4. Add HMAC integrity verification to the scheduler store file

**Severity Justification:** CRITICAL because the scheduler store is a JSON file with no integrity protection, and any write access to it grants arbitrary command execution.

---

### HIGH Findings

#### SEC-LIB-003: Unsafe YAML Deserialization (5 modules)

**Files:**
- `C:\dev\projects\agent-studio\.claude\lib\utils\agent-config-reader.cjs` (line 113)
- `C:\dev\projects\agent-studio\.claude\lib\utils\config-loader.cjs` (line 79)
- `C:\dev\projects\agent-studio\.claude\lib\config\context-mode-loader.cjs` (line 54)
- `C:\dev\projects\agent-studio\.claude\lib\agents\agent-parser.cjs` (line 59)
- `C:\dev\projects\agent-studio\.claude\lib\tools\agent-registry-generator.cjs` (line 205)

**STRIDE:** Tampering, Elevation of Privilege
**OWASP:** A08 (Software and Data Integrity)

**Description:** All five modules use `yaml.load(content)` which is the DEFAULT (unsafe) load in js-yaml v4+. While js-yaml v4 removed the most dangerous `!!js/function` type by default, `yaml.load()` still uses `DEFAULT_SCHEMA` which includes `!!js/undefined` and custom types. The safe alternative is `yaml.load(content, { schema: yaml.CORE_SCHEMA })` or `yaml.load(content, { schema: yaml.FAILSAFE_SCHEMA })`.

**Impact:** If an attacker can modify `.claude/config.yaml`, agent `.md` files, or context-mode configs, they may be able to inject YAML-specific type coercion attacks. The agent-parser.cjs is particularly concerning as it parses frontmatter from agent files that could be user-contributed.

**Remediation:** Replace all `yaml.load(content)` with `yaml.load(content, { schema: yaml.CORE_SCHEMA })` or `yaml.load(content, { schema: yaml.FAILSAFE_SCHEMA })` depending on needs.

---

#### SEC-LIB-004: Prompt Injection via Constitution/Behaviour Files

**File:** `C:\dev\projects\agent-studio\.claude\hooks\routing\spawn-prompt-assembler.cjs`
**STRIDE:** Spoofing, Tampering, Elevation of Privilege
**OWASP:** A03 (Injection)
**Prior Reference:** SEC-CTX-003 (Pipeline #12)

**Description:** The `loadConstitutionContext()` function reads `constitution.md` and `behaviour.md` from `.claude/context/memory/` and injects their raw content into ALL agent spawn prompts via `appendConstitutionSection()`. There is:
- NO integrity verification (no HMAC, no checksum)
- NO content sanitization
- NO validation of file contents

**Impact:** An attacker who can modify these files (e.g., through a compromised agent writing to memory files, or through file system access) can inject arbitrary instructions into every spawned agent. This is a persistent prompt injection vector affecting ALL agents in the system.

**Remediation:**
1. Implement HMAC integrity verification for constitution.md and behaviour.md
2. Add content sanitization to strip potentially harmful directives
3. Implement file modification detection (hash comparison on load)
4. Consider moving these files to a read-only, integrity-protected location

---

#### SEC-LIB-005: JSON Parsing Fallback Without Prototype Pollution Protection

**File:** `C:\dev\projects\agent-studio\.claude\lib\utils\safe-json.cjs`
**Line:** ~168 (fallback path)
**STRIDE:** Tampering
**OWASP:** A03 (Injection)

**Description:** The `safeJSONParse()` function has excellent prototype pollution protection when a schema is provided (uses `Object.create(null)` and property allowlisting). However, when `schemaName` is null or matches no known schema, it falls back to plain `JSON.parse(content)` with NO prototype pollution protection.

```javascript
// When no schema matches:
return JSON.parse(content);  // No Object.create(null), no key filtering
```

**Impact:** Any caller that uses `safeJSONParse()` without specifying a valid schema name gets zero protection. This creates a false sense of security - callers believe they are using "safe" JSON parsing but receive none of the safety guarantees.

**Remediation:**
1. Default to `Object.create(null)` + deep copy even when no schema is provided
2. Log a warning when fallback path is used
3. Consider requiring a schema for all calls (throw error if no schema)

---

#### SEC-LIB-006: Unprotected JSON.parse in spawn-prompt-assembler.cjs

**File:** `C:\dev\projects\agent-studio\.claude\hooks\routing\spawn-prompt-assembler.cjs`
**STRIDE:** Tampering
**OWASP:** A03 (Injection)

**Description:** `loadAgentRegistry()` and `loadToolManifest()` use plain `JSON.parse()` without prototype pollution protection. These parse `agent-registry.json` and `tool-manifest.json` which could be modified by compromised agents or file system access.

**Impact:** Prototype pollution via `__proto__` or `constructor` keys in these JSON files could affect all downstream consumers of the registry/manifest data.

**Remediation:** Use `safe-json.cjs` (with appropriate schema) or apply `Object.create(null)` + dangerous key filtering as done in `hook-input.cjs`.

---

#### SEC-LIB-007: Path Traversal in getFileContent (hybrid-lazy-indexer.cjs)

**File:** `C:\dev\projects\agent-studio\.claude\lib\code-indexing\hybrid-lazy-indexer.cjs`
**Lines:** 150-154
**STRIDE:** Information Disclosure
**OWASP:** A01 (Broken Access Control)

**Description:** The `getFileContent()` method accepts a `filePath` parameter and reads the file without any path traversal validation:

```javascript
async getFileContent(filePath, lineStart = 0, lineEnd = 50) {
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.projectRoot, filePath);
  const content = await fs.readFile(fullPath, 'utf8').catch(() => null);
  // ...
}
```

An absolute path bypasses the `projectRoot` containment entirely. A relative path with `../` traversal sequences can escape the project root.

**Impact:** An attacker who can control the `filePath` parameter can read arbitrary files on the system, including sensitive files like `/etc/passwd`, environment files, or credential stores.

**Remediation:**
1. Use `path-validator.cjs` to validate the resolved path stays within `projectRoot`
2. Reject absolute paths or validate they are within `projectRoot`
3. Normalize the path and check for traversal sequences

---

### MEDIUM Findings

#### SEC-LIB-008: Context Variable Injection in evaluateComplexCondition

**File:** `C:\dev\projects\agent-studio\.claude\lib\workflow\decision-handler.mjs`
**Lines:** 282-297
**STRIDE:** Tampering
**OWASP:** A03 (Injection)

**Description:** The `evaluateComplexCondition()` method performs string substitution of `context.*` variables into the expression string BEFORE passing to the SafeExpressionParser:

```javascript
const safeValue = typeof value === 'string' ? `'${value.replace(/'/g, "\\\\'")}'` : value;
processedCondition = processedCondition.replace(match, safeValue);
```

For non-string values (numbers, booleans), the raw value is substituted directly. A context value of `true || true` would alter the boolean logic of the expression.

**Impact:** If workflow context values are attacker-controllable, they can manipulate conditional routing decisions by injecting boolean operators or comparison expressions into the condition string.

**Remediation:**
1. Coerce all context values to string literals before substitution
2. Or pass context values as a parameter map to the parser (avoid string substitution entirely)
3. Validate context values against a strict type schema

---

#### SEC-LIB-009: Arbitrary File Existence Probing via decision-handler.mjs

**File:** `C:\dev\projects\agent-studio\.claude\lib\workflow\decision-handler.mjs`
**Lines:** 248-258, 348-355
**STRIDE:** Information Disclosure
**OWASP:** A01 (Broken Access Control)

**Description:** The `file.exists:` condition type and `checkFileExists()` method use `fs.access(filePath)` with NO path validation. An attacker who can craft workflow conditions can probe the existence of arbitrary files on the system.

**Remediation:** Validate filePath against projectRoot before checking existence.

---

#### SEC-LIB-010: Environment Variable Manipulation of PROJECT_ROOT

**File:** `C:\dev\projects\agent-studio\.claude\lib\utils\path-validator.cjs`
**STRIDE:** Tampering, Elevation of Privilege
**OWASP:** A05 (Security Misconfiguration)

**Description:** `getProjectRoot()` reads `process.env.PROJECT_ROOT || process.cwd()`. If an attacker can set the `PROJECT_ROOT` environment variable, all path validation can be bypassed by pointing it at a directory they control.

**Impact:** Path containment checks become ineffective when the "container" directory is attacker-controlled.

**Remediation:** Derive project root from `__dirname` traversal (as `findProjectRoot()` does in swarm-coordination.cjs) rather than environment variables. Or validate that `PROJECT_ROOT` is a real project root by checking for `.claude/` directory.

---

#### SEC-LIB-011: Checkpoint State Deserialization Without Integrity Verification

**File:** `C:\dev\projects\agent-studio\.claude\lib\workflow\checkpoint-manager.cjs`
**Lines:** 92-96, 158-164
**STRIDE:** Tampering
**OWASP:** A08 (Software and Data Integrity)

**Description:** Checkpoint state is serialized to gzipped JSON files and deserialized with `JSON.parse()` without:
- HMAC integrity verification
- Schema validation
- Prototype pollution protection

```javascript
function decompressState(compressed) {
  const buffer = zlib.gunzipSync(compressed);
  const json = buffer.toString('utf-8');
  return JSON.parse(json);  // No integrity check, no safe parsing
}
```

**Impact:** If an attacker can modify checkpoint files, they can inject malicious state that will be loaded when a workflow resumes, potentially altering workflow behavior or injecting prototype pollution.

**Remediation:** Add HMAC signature to checkpoint files and verify before deserialization. Use `Object.create(null)` for parsed state.

---

#### SEC-LIB-012: Memory Manager Uses spawnSync for Embedding Generation

**File:** `C:\dev\projects\agent-studio\.claude\lib\memory\memory-manager.cjs`
**Lines:** 184-188
**STRIDE:** Elevation of Privilege
**OWASP:** A03 (Injection)

**Description:** The `maybeSyncMemoryJson()` function constructs a path to `generate-embeddings.cjs` and passes `filePath` as an argument to `spawnSync`. While it uses array-style arguments (safe from shell injection), the `filePath` parameter comes from external input and is validated only by `validatePathWithinProject`.

**Impact:** Low risk due to array-style spawn and path validation, but the `filePath` argument could potentially be crafted to trigger unexpected behavior in the embedding generator if path validation is insufficient.

**Remediation:** This is adequately mitigated by the existing path validation. No immediate action required, but ensure `validatePathWithinProject` remains robust.

---

### LOW Findings

#### SEC-LIB-013: Deprecated evolution-state-sync.cjs Uses Unsafe JSON.parse

**File:** `C:\dev\projects\agent-studio\.claude\lib\evolution-state-sync.cjs`
**STRIDE:** Tampering
**OWASP:** A08 (Software and Data Integrity)

**Description:** Uses plain `JSON.parse` for state files without prototype pollution protection. Marked as `@deprecated` with no active consumers.

**Remediation:** Remove deprecated module entirely, or add safe parsing if retention is needed.

---

#### SEC-LIB-014: Regex-Based Agent Detection is Spoofable

**File:** `C:\dev\projects\agent-studio\.claude\hooks\routing\spawn-prompt-assembler.cjs`
**STRIDE:** Spoofing
**OWASP:** A07 (Identification and Authentication Failures)

**Description:** `inferAgentFromPrompt()` uses regex to detect agent type from prompt text. A crafted prompt could fool the regex into returning a different agent type, potentially resulting in wrong tool/permission assignment.

**Remediation:** Prefer explicit agent type parameters over regex inference.

---

#### SEC-LIB-015: Anomaly Detector Threshold Controllable via Environment Variable

**File:** `C:\dev\projects\agent-studio\.claude\lib\ml\anomaly-detector.cjs`
**Line:** 33
**STRIDE:** Tampering
**OWASP:** A05 (Security Misconfiguration)

**Description:** `ANOMALY_DISTANCE_THRESHOLD` is configurable via environment variable. An attacker who can set environment variables could raise the threshold to prevent anomaly detection.

**Remediation:** Set a maximum allowed threshold value regardless of environment variable input.

---

## STRIDE Threat Model Summary

| Threat | Findings | Severity Range |
|--------|----------|---------------|
| **Spoofing** | SEC-LIB-004, SEC-LIB-014 | HIGH-LOW |
| **Tampering** | SEC-LIB-001, SEC-LIB-002, SEC-LIB-003, SEC-LIB-005, SEC-LIB-006, SEC-LIB-008, SEC-LIB-011 | CRITICAL-MEDIUM |
| **Repudiation** | No findings (logging is adequate) | N/A |
| **Information Disclosure** | SEC-LIB-007, SEC-LIB-009 | HIGH-MEDIUM |
| **Denial of Service** | No specific findings | N/A |
| **Elevation of Privilege** | SEC-LIB-001, SEC-LIB-002, SEC-LIB-003, SEC-LIB-010 | CRITICAL-MEDIUM |

---

## OWASP Top 10 Coverage

| OWASP Category | Findings | Status |
|----------------|----------|--------|
| A01: Broken Access Control | SEC-LIB-007, SEC-LIB-009 | Gaps found |
| A02: Cryptographic Failures | None | No crypto in scope |
| A03: Injection | SEC-LIB-001, SEC-LIB-002, SEC-LIB-004, SEC-LIB-005, SEC-LIB-006, SEC-LIB-008 | Major gaps |
| A04: Insecure Design | None | Adequate |
| A05: Security Misconfiguration | SEC-LIB-010, SEC-LIB-015 | Minor gaps |
| A06: Vulnerable Components | Not assessed (dependency audit out of scope) | N/A |
| A07: Identification and Authentication Failures | SEC-LIB-014 | Minor gap |
| A08: Software and Data Integrity | SEC-LIB-003, SEC-LIB-011, SEC-LIB-013 | Gaps found |
| A09: Logging Failures | None | Adequate |
| A10: SSRF | None | Not applicable |

---

## Security Controls Assessment

### Effective Controls (Commendations)

1. **hook-input.cjs** - Excellent prototype pollution prevention with `Object.create(null)`, `DANGEROUS_KEYS` filtering, `ALLOWED_HOOK_INPUT_KEYS` allowlist, and `sanitizeObject()`. This is the gold standard in the codebase.

2. **SafeExpressionParser (decision-handler.mjs)** - Well-designed recursive descent parser that replaced `eval`/`new Function`. Only allows literals, comparisons, and logical operators. Properly rejects identifiers and function calls. (SEC-TOOL-001 fix is solid.)

3. **router-state.cjs** - Robust `safeJSONParse()` with `Object.create(null)` and dangerous key filtering. Optimistic concurrency with MAX_RETRIES=5 and exponential backoff. Uses `atomicWriteJSONSync`.

4. **swarm-coordination.cjs** - Correct use of `spawnSync` with array arguments and `shell: false` (SEC-009 fix). Has `isPathSafe()` validator for shell metacharacters. This is the pattern other modules should follow.

5. **memory-manager.cjs** - Has `validateProjectRoot()` that checks paths against `PROJECT_ROOT`. Uses `normalizeMemoryName()` to sanitize filenames. Uses `atomicWriteJSONSync` for safe writes.

6. **prompt-factory.cjs** - `sanitizeSubstitutionValue()` (SEC-TMPL-004 fix) prevents nested placeholder injection with infinite-loop protection.

### Controls Needing Improvement

1. **safe-json.cjs fallback path** - Needs protection when no schema is provided
2. **YAML loading** - All 5 modules need schema-constrained loading
3. **execSync usage** - hybrid-lazy-indexer.cjs must migrate to spawnSync with arrays
4. **File integrity** - Constitution/behaviour files and checkpoint files need HMAC verification

---

## Cross-Pipeline Pattern Analysis

This review confirms findings from prior pipeline security assessments:

| Prior Finding | Status in lib/ | This Review |
|---------------|---------------|-------------|
| SEC-TOOL-001 (eval in decision-handler) | FIXED (SafeExpressionParser) | SEC-LIB-008 (residual context injection) |
| SEC-CTX-003 (memory file integrity) | OPEN | SEC-LIB-004 (confirmed, expanded scope) |
| SEC-TMPL-001 (path traversal in prompts) | FIXED | SEC-LIB-007 (new path traversal in indexer) |
| I-WF-001 (prompt injection via spawn) | OPEN | SEC-LIB-004, SEC-LIB-006 (confirmed) |
| SEC-009 (command injection) | FIXED in swarm-coordination | SEC-LIB-001 (still open in hybrid-lazy-indexer) |

**Systemic Pattern:** Injection vulnerabilities (command injection, prompt injection, YAML deserialization) appear across multiple modules. The codebase lacks a centralized input sanitization utility that all modules can use consistently.

---

## Recommendations

### Priority 1 (Immediate - within 1 sprint)

1. **R-001:** Migrate all `execSync` string interpolation in `hybrid-lazy-indexer.cjs` to `spawnSync` with array arguments and `shell: false`, following the pattern established in `swarm-coordination.cjs`.

2. **R-002:** Add command allowlisting or remove `shell: true` from `scheduler-tick.cjs`. If arbitrary commands are needed, implement a signed command manifest.

3. **R-003:** Replace all 5 `yaml.load(content)` calls with `yaml.load(content, { schema: yaml.CORE_SCHEMA })`.

### Priority 2 (Short-term - within 2 sprints)

4. **R-004:** Add HMAC integrity verification to `constitution.md`, `behaviour.md`, and checkpoint files.

5. **R-005:** Fix `safe-json.cjs` fallback to use `Object.create(null)` even when no schema is provided.

6. **R-006:** Add path traversal validation to `getFileContent()` in `hybrid-lazy-indexer.cjs` and `checkFileExists()` in `decision-handler.mjs`.

### Priority 3 (Medium-term - within 1 quarter)

7. **R-007:** Create a centralized `sanitizePromptContent()` utility for use by all prompt assembly modules.

8. **R-008:** Replace all unprotected `JSON.parse()` calls in spawn-prompt-assembler with `safe-json.cjs` or equivalent protection.

9. **R-009:** Implement file modification detection (hash comparison) for all configuration files loaded at runtime.

10. **R-010:** Remove deprecated `evolution-state-sync.cjs` entirely.

---

## Verification Checklist (IEEE 1028 Security Base + Contextual Items)

### IEEE 1028 Security Base

- [x] Input validation on user inputs - Partial (hook-input.cjs excellent, others lacking)
- [ ] No SQL injection vulnerabilities - N/A (no SQL in scope)
- [ ] No command injection vulnerabilities - FAIL (SEC-LIB-001, SEC-LIB-002)
- [x] No XSS vulnerabilities - N/A (no web UI in scope)
- [ ] Sensitive data encrypted at rest/transit - Not assessed
- [x] Authentication and authorization checks present - Adequate for tool scope
- [ ] No hardcoded secrets or credentials - PASS (no secrets found)
- [ ] OWASP Top 10 considered - Gaps found (see table above)

### [AI-GENERATED] Contextual Security Items

- [ ] [AI-GENERATED] All execSync/spawnSync calls use array arguments with shell: false
- [ ] [AI-GENERATED] All YAML parsing uses safe schema constraints
- [ ] [AI-GENERATED] All JSON.parse calls in security-sensitive paths use prototype pollution protection
- [ ] [AI-GENERATED] All file path inputs validated against project root containment
- [ ] [AI-GENERATED] Prompt assembly modules sanitize injected content
- [ ] [AI-GENERATED] State files (scheduler, checkpoint, workflow) have integrity verification
- [x] [AI-GENERATED] Expression evaluation uses safe parser (no eval/Function)
- [x] [AI-GENERATED] Hook input parsing has prototype pollution prevention

**Total Items:** 16 | **IEEE Base:** 8 (50%) | **Contextual:** 8 (50%) | **Passing:** 5 (31%)

---

## Appendix A: Files Reviewed

| File | Lines | Risk Level | Finding(s) |
|------|-------|------------|------------|
| `lib/utils/hook-input.cjs` | 494 | LOW | None (exemplary) |
| `lib/utils/safe-json.cjs` | 282 | MEDIUM | SEC-LIB-005 |
| `lib/utils/agent-config-reader.cjs` | 330 | HIGH | SEC-LIB-003 |
| `lib/utils/path-validator.cjs` | 159 | MEDIUM | SEC-LIB-010 |
| `lib/utils/config-loader.cjs` | ~100 | HIGH | SEC-LIB-003 |
| `lib/workflow/decision-handler.mjs` | 428 | MEDIUM | SEC-LIB-008, SEC-LIB-009 |
| `lib/workflow/checkpoint-manager.cjs` | ~220 | MEDIUM | SEC-LIB-011 |
| `lib/routing/routing-table.cjs` | 2025 | LOW | None |
| `lib/routing/router-state.cjs` | ~120 | LOW | None (exemplary) |
| `lib/code-indexing/hybrid-lazy-indexer.cjs` | ~500 | CRITICAL | SEC-LIB-001, SEC-LIB-007 |
| `lib/scheduler/scheduler-tick.cjs` | 69 | CRITICAL | SEC-LIB-002 |
| `lib/coordination/swarm-coordination.cjs` | 296 | LOW | None (exemplary) |
| `lib/memory/memory-manager.cjs` | ~500 | LOW | SEC-LIB-012 |
| `lib/memory/memory-search.cjs` | 51 | LOW | None |
| `lib/memory/run-extraction-pipeline.cjs` | ~80 | LOW | None |
| `lib/config/context-mode-loader.cjs` | ~100 | HIGH | SEC-LIB-003 |
| `lib/agents/agent-parser.cjs` | ~100 | HIGH | SEC-LIB-003 |
| `lib/tools/agent-registry-generator.cjs` | ~250 | HIGH | SEC-LIB-003 |
| `lib/ml/anomaly-detector.cjs` | ~120 | LOW | SEC-LIB-015 |
| `lib/evolution-state-sync.cjs` | ~100 | LOW | SEC-LIB-013 |
| `hooks/routing/spawn-prompt-assembler.cjs` | ~500 | HIGH | SEC-LIB-004, SEC-LIB-006, SEC-LIB-014 |
| `lib/spawn/prompt-factory.cjs` | 102 | LOW | None (exemplary) |
| `lib/spawn/prompt-assembler.cjs` | ~150 | LOW | None |

## Appendix B: Grep Scan Results

| Pattern | Matches | Concern |
|---------|---------|---------|
| `eval\|new Function\|vm.run` | 0 real | No dynamic code execution (good) |
| `execSync\|child_process` | 4 modules | SEC-LIB-001, SEC-LIB-002 |
| `__proto__\|prototype\[\|constructor\[` | 3 modules | All protective (good) |
| `yaml.load` (without safe schema) | 5 modules | SEC-LIB-003 |
| `JSON.parse` (without safe wrapper) | Multiple | SEC-LIB-005, SEC-LIB-006 |

---

**End of Security Assessment**
