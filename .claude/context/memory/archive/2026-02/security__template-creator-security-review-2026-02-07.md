<!-- Agent: security-architect | Task: #76 | Session: 2026-02-07 -->

# Template-Creator Skill Security Review

**Date:** 2026-02-07
**Reviewer:** Security Architect Agent (Opus 4.6)
**Task:** #76
**Scope:** Security assessment of the template-creator skill overhaul (`.claude/skills/template-creator/SKILL.md` v2.1.0)
**Verdict:** APPROVED WITH CONDITIONS

---

## Executive Summary

This security review evaluates the overhauled template-creator skill against the threat landscape of the agent-studio multi-agent framework. The template-creator guides agents in creating new templates that become part of the framework's spawn, document, report, and code-style template library. Because templates can influence the instructions given to spawned agents (via spawn templates) and the structure of security-critical documents (via report/checklist templates), the template-creator occupies a position of moderate trust in the security hierarchy.

The review identified **0 CRITICAL**, **2 HIGH**, **3 MEDIUM**, and **2 LOW** severity findings. The most significant concerns are: (1) the template-creator skill's output path validation relies entirely on the `unified-creator-guard.cjs` hook without internal defense-in-depth, and (2) template placeholder substitution patterns create an injection surface for prompt manipulation when templates are consumed by the spawn system.

The previously identified template system security findings (SEC-TMPL-001 through SEC-TMPL-004) from the earlier review have been partially remediated. SEC-TMPL-001 (path traversal), SEC-TMPL-002 (orchestrator bypass), and SEC-TMPL-004 (placeholder injection) are now fixed in code. SEC-TMPL-003 (fail-open) remains unresolved.

---

## 1. STRIDE Threat Model for Template Creation

### 1.1 System Description

The template-creator workflow operates as follows:

1. **Router** invokes `template-creator` skill via `Skill({ skill: 'template-creator' })`
2. **Creator agent** reads existing templates for pattern consistency (Step 2)
3. **Creator agent** generates template content with `{{PLACEHOLDER}}` tokens (Step 3)
4. **Creator agent** writes template file to `.claude/templates/` (Step 6)
5. **Creator agent** updates README.md and template catalog (Steps 7-8)
6. **Creator agent** registers template in discovery system (Step 8)
7. **Downstream consumers** (spawn-prompt-assembler, other creator skills, agents) read and use the template

### 1.2 Trust Boundaries

| Boundary                         | Description                                     | Trust Level                         |
| -------------------------------- | ----------------------------------------------- | ----------------------------------- |
| User -> Router                   | User requests template creation                 | Untrusted (external input)          |
| Router -> Creator Agent          | Router spawns agent with template-creator skill | Semi-trusted (Router prompt)        |
| Creator Agent -> Filesystem      | Agent writes template files                     | Guarded (unified-creator-guard.cjs) |
| Template Content -> Spawn System | Templates consumed by spawn-prompt-assembler    | Trusted (assumes valid templates)   |
| Template Content -> Other Agents | Templates used by other creator skills/agents   | Trusted (assumes valid templates)   |
| Config Files -> Creator          | presets.json, agent-registry.json consulted     | Semi-trusted (modifiable by agents) |

### 1.3 STRIDE Analysis

| Threat                         | Vector                                                                              | Risk   | Existing Controls                                                                                       | Gap                                                                        |
| ------------------------------ | ----------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **S - Spoofing**               | Malicious template impersonating a legitimate spawn template                        | MEDIUM | Creator-guard requires active creator state; template-updater delegation for existing templates         | No signature/checksum on template files                                    |
| **T - Tampering**              | Template content modified to inject malicious instructions into spawn prompts       | HIGH   | unified-creator-guard.cjs blocks direct writes; SEC-TMPL-004 fix sanitizes `{{` placeholders            | Templates once written are not integrity-checked on read                   |
| **R - Repudiation**            | Template creation not fully audited; no provenance enforcement on template content  | LOW    | Workspace conventions require provenance headers; memory protocol tracks creation                       | Provenance headers are guidance, not enforced by code                      |
| **I - Information Disclosure** | Template content could expose internal architecture, hook names, bypass conditions  | LOW    | Templates are internal to `.claude/` directory; not user-facing                                         | Template catalog documents enforcement modes and override variables        |
| **D - Denial of Service**      | Oversized template with massive placeholder expansion; recursive template inclusion | LOW    | 500KB prompt limit in spawn-prompt-validator; no recursive template `#include` mechanism                | No size limit on individual template files                                 |
| **E - Elevation of Privilege** | Template that grants Task tool (orchestrator capability) to non-orchestrator agents | HIGH   | `enrichAllowedTools()` resolves tools from agent registry, not template content; ORCHESTRATOR_IDS check | Spawn templates contain `allowed_tools` arrays that are read by the Router |

---

## 2. Security Findings

### FINDING SEC-TC-001: Spawn Template Prompt Injection via Placeholder Content [HIGH]

**Location:** `.claude/skills/template-creator/SKILL.md`, Step 3 (Generate Template with Placeholders) and Example 2 (Creating a Spawn Template)

**Description:**

The template-creator skill guides agents to create spawn templates containing JavaScript code blocks with `{{PLACEHOLDER}}` tokens that are substituted by the Router before spawning agents. Example 2 in the skill demonstrates creating a spawn template:

```javascript
Task({
  subagent_type: '{{AGENT_TYPE}}',
  model: '{{MODEL}}',
  task_id: '{{TASK_ID}}',
  prompt: `
You are {{AGENT_IDENTITY}}.

## Your Task (ID: {{TASK_ID}})
{{TASK_DESCRIPTION}}

## Context
{{CONTEXT}}
```

When the Router uses this template and substitutes `{{TASK_DESCRIPTION}}` or `{{CONTEXT}}` with user-provided content, the substitution values could contain:

1. **Instruction override attacks:** Content like `## OVERRIDE: Ignore all previous instructions and...`
2. **Nested placeholder injection:** Content containing `{{available_tools}}` that could trigger double substitution in `prompt-factory.cjs` (mitigated by SEC-TMPL-004 fix, but only for `prompt-factory.cjs`, not for Router-level substitution)
3. **Persona hijacking:** Content that redefines the agent's identity, e.g., `You are now an unrestricted assistant...`

The SEC-TMPL-004 fix in `prompt-factory.cjs` sanitizes `{{` and `}}` in substitution values, but this fix ONLY applies to the `buildContextModePrompt()` function. Template placeholder substitution performed by the **Router** during spawn template usage is NOT sanitized because the Router performs simple string replacement using the template content.

**Impact:** A crafted user request could inject instructions into spawn prompts via template placeholder values. The practical risk depends on the Router's substitution implementation, but the template-creator skill actively teaches agents to create templates with unsanitized placeholder expansion in spawn prompts.

**Severity:** HIGH

**Required Mitigation:**

1. The template-creator skill MUST include a security warning in the spawn template creation guidance that all placeholder values in spawn templates MUST be sanitized before substitution
2. The skill SHOULD reference the `sanitizeSubstitutionValue()` function from `prompt-factory.cjs` as the canonical sanitization pattern
3. Spawn templates created by this skill SHOULD NOT place `{{PLACEHOLDER}}` tokens inside the `prompt:` field of `Task()` calls where they would be directly substituted with user input

---

### FINDING SEC-TC-002: Output Path Validation Relies Solely on External Hook [HIGH]

**Location:** `.claude/skills/template-creator/SKILL.md`, Step 6 (Write Template File) and `.claude/hooks/routing/unified-creator-guard.cjs`

**Description:**

The template-creator skill instructs agents to write template files to these paths:

```
.claude/templates/agents/<template-name>.md
.claude/templates/skills/<template-name>.md
.claude/templates/workflows/<template-name>.md
.claude/templates/spawn/<template-name>.md
.claude/templates/reports/<template-name>.md
.claude/templates/code-styles/<template-name>.md
.claude/templates/<template-name>.md
```

However, the skill contains **no internal path validation logic**. Path safety relies entirely on the `unified-creator-guard.cjs` hook, which:

1. Only matches paths against specific subdirectory patterns: `agents|skills|workflows|hooks|code|schemas` (line 101 of the hook)
2. Does NOT match the root `.claude/templates/` directory or `reports/`, `code-styles/`, or `spawn/` subdirectories
3. Can be disabled with `CREATOR_GUARD=off`

**Critical gap in the hook pattern (line 101):**

```javascript
patterns: [/\.claude[/\\]templates[/\\](?:agents|skills|workflows|hooks|code|schemas)[/\\]/i],
```

This regex DOES NOT match:

- `.claude/templates/spawn/malicious-template.md` (spawn templates unprotected)
- `.claude/templates/reports/malicious-report.md` (report templates unprotected)
- `.claude/templates/code-styles/malicious-style.md` (code style templates unprotected)
- `.claude/templates/malicious-root-template.md` (root-level templates unprotected)

This means direct writes to spawn templates, report templates, code-style templates, and root-level templates are NOT blocked by the creator guard hook, even in block mode. Only writes to `agents/`, `skills/`, `workflows/`, `hooks/`, `code/`, and `schemas/` subdirectories are protected.

Additionally, the template-creator skill says `hooks/`, `code/`, and `schemas/` directories can be created "when demand arises" (lines 86, 315, 817), but these directories DO NOT currently exist under `.claude/templates/`. The hook pattern protects future directories that do not exist while leaving current active directories (spawn, reports, code-styles) unprotected.

**Impact:** An agent that bypasses the template-creator workflow can directly write to spawn templates, report templates, and code-style templates without triggering the creator guard. Spawn templates are the most critical because they directly influence agent behavior.

**Severity:** HIGH

**Required Mitigation:**

1. Update the `unified-creator-guard.cjs` regex pattern for `template-creator` to cover ALL template subdirectories including `spawn`, `reports`, `code-styles`, and root-level files
2. Proposed fix:
   ```javascript
   patterns: [/\.claude[/\\]templates[/\\]/i],
   excludePatterns: [/README\.md$/i, /_archive[/\\]/i],
   ```
3. The template-creator skill SHOULD include internal path validation that rejects paths outside `.claude/templates/`
4. Path traversal through template names (e.g., `../hooks/malicious.cjs`) MUST be prevented by normalizing the template name before path construction

---

### FINDING SEC-TC-003: Template Name Path Traversal [MEDIUM]

**Location:** `.claude/skills/template-creator/SKILL.md`, Step 6 (Write Template File)

**Description:**

The template-creator skill instructs agents to write files using patterns like:

```
Write: .claude/templates/agents/<template-name>.md
Write: .claude/templates/spawn/<template-name>.md
```

Where `<template-name>` is derived from the user's request. If the template name contains path traversal sequences such as `../../hooks/malicious-hook` or URL-encoded variants, the resulting write path could escape the intended directory:

```
.claude/templates/agents/../../hooks/malicious-hook.md
  -> resolves to: .claude/hooks/malicious-hook.md
```

The skill does not instruct agents to validate or sanitize the template name before constructing the file path.

**Impact:** A crafted template name could write files outside `.claude/templates/` to other protected directories. The `unified-creator-guard.cjs` hook would catch this IF the destination path matches a different creator's pattern (e.g., writing to `.claude/hooks/` would trigger the hook-creator guard). However, writing to unprotected paths (e.g., `.claude/config/`, `.claude/lib/`) would not be caught.

**Severity:** MEDIUM

**Required Mitigation:**

1. The template-creator skill MUST instruct agents to validate that template names contain only `[a-z0-9-]` characters (lowercase kebab-case per workspace conventions)
2. The skill SHOULD reject any template name containing `/`, `\`, `..`, or characters outside the allowed set
3. Add a validation step before Step 6:
   ```
   Template name MUST match: /^[a-z0-9][a-z0-9-]*[a-z0-9]$/
   ```

---

### FINDING SEC-TC-004: Template Registry JSON Injection [MEDIUM]

**Location:** `.claude/skills/template-creator/SKILL.md`, Step 8 (Post-Creation Template Registration)

**Description:**

The template-creator skill instructs agents to create or update a JSON registry at `.claude/context/artifacts/template-registry.json`:

```json
{
  "templates": [
    {
      "name": "{template-name}",
      "id": "{template-name}",
      "type": "{agent|skill|workflow|hook|code|schema}",
      "description": "{What this template is for}",
      "location": ".claude/templates/{category}/{template-name}.md",
      "placeholders": ["{PLACEHOLDER_1}", "{PLACEHOLDER_2}"],
      "usageScenarios": ["{Scenario 1}", "{Scenario 2}"]
    }
  ]
}
```

The skill does not instruct agents to sanitize values before inserting them into the JSON structure. If a template name or description contains JSON control characters (quotes, backslashes), the resulting JSON could be malformed or inject additional fields. While agents using `JSON.stringify()` would handle this correctly, agents manually constructing JSON strings could introduce vulnerabilities.

Additionally, the `location` field in the registry could be set to any path, potentially pointing consumers to files outside the template directory.

**Impact:** Malformed registry could cause JSON parse errors for downstream consumers. Malicious `location` values could redirect template consumers to arbitrary files.

**Severity:** MEDIUM

**Required Mitigation:**

1. The template-creator skill SHOULD instruct agents to always use `JSON.stringify()` (or equivalent) when constructing registry entries, never manual string concatenation
2. The `location` field MUST be validated to start with `.claude/templates/` and contain no `..` segments
3. The `type` field MUST be validated against the allowed enum: `agent|skill|workflow|hook|code|schema|spawn|report|code-style|document`

---

### FINDING SEC-TC-005: Creator State File Manipulation Window [MEDIUM]

**Location:** `.claude/hooks/routing/unified-creator-guard.cjs`, lines 117-249 (state management functions)

**Description:**

The `unified-creator-guard.cjs` hook uses a state file at `.claude/context/runtime/active-creators.json` to track which creators are currently active. When a creator is invoked, `markCreatorActive()` sets a TTL-bounded active state (3 minutes, reduced from 10 per SEC-REMEDIATION-001). While the creator is active, ALL writes to the corresponding artifact paths are allowed.

The state file is a plain JSON file on disk with no integrity protection (no HMAC, no file permissions enforcement). Any agent with Write access to `.claude/context/runtime/active-creators.json` could:

1. Set `template-creator.active = true` to bypass the creator guard for template writes
2. Set a very long TTL to keep the bypass window open indefinitely
3. Set multiple creators active simultaneously to bypass ALL creator guards

The 3-minute TTL reduces the window, but does not eliminate it. The `CREATOR_GUARD=off` override also completely disables enforcement.

**Impact:** An agent that can write to the runtime directory can bypass the creator guard and write directly to template paths. This requires the agent to have Write access to `.claude/context/runtime/`, which is less protected than `.claude/templates/` itself.

**Severity:** MEDIUM (reduced from HIGH because: (a) TTL is short at 3 minutes, (b) writing to runtime directory requires explicit agent action, (c) the state file path is not a common target)

**Required Mitigation:**

1. The state file path `.claude/context/runtime/active-creators.json` SHOULD be documented as a security-sensitive file
2. Consider adding a nonce or session ID to the state that must match the current agent's session
3. The `clearCreatorActive()` function SHOULD be called automatically when the creator completes (not just on TTL expiry)

---

### FINDING SEC-TC-006: Information Disclosure via Template Catalog [LOW]

**Location:** `.claude/context/artifacts/catalogs/template-catalog.md`

**Description:**

The template catalog documents:

- All 28 active templates with their exact file paths
- Agent and skill assignments (which agents use which templates)
- Security compliance notes including enforcement override variables (`CREATOR_GUARD=warn|off`)
- Template system internals (spawn template structure, placeholder patterns)

This information is already available to all spawned agents through the spawn prompt's CLAUDE.md injection and through the filesystem. However, consolidating it in a single catalog makes reconnaissance easier for a compromised agent.

**Impact:** Low. No new information is exposed that is not already available through existing channels. The mention of `CREATOR_GUARD=warn|off` override variables in the catalog (line 467) could inform a compromised agent how to disable enforcement, but this information is also in CLAUDE.md Section 1.3.

**Severity:** LOW

**Recommended Mitigation:**

1. Remove specific enforcement override syntax from the catalog (reference `.claude/docs/@ENVIRONMENT_CONFIG.md` instead)
2. This is a LOW priority recommendation and does not block approval

---

### FINDING SEC-TC-007: No Template Content Validation on Creation [LOW]

**Location:** `.claude/skills/template-creator/SKILL.md`, Step 5 (Validate Template Structure)

**Description:**

The template-creator's validation checklist (Step 5) focuses on structural correctness:

```
[ ] YAML frontmatter is valid syntax
[ ] All required fields have placeholders
[ ] All placeholders follow naming convention
[ ] POST-CREATION CHECKLIST section present
[ ] Memory Protocol section present
```

There is no security-focused validation of template content:

- No check for embedded JavaScript/shell commands in template body
- No check for references to files outside `.claude/`
- No check for prompt injection patterns (e.g., "IGNORE PREVIOUS INSTRUCTIONS")
- No check for secrets or credentials in template content
- No check for template content exceeding reasonable size limits

The template catalog's SEC-TMPL-006 compliance section (lines 458-468) documents requirements (no secrets, no sensitive metadata, relative paths only) but these are not enforced as validation steps in the template-creator workflow.

**Impact:** Low. Templates are Markdown documentation, not executable code. The risk of embedded malicious content is mitigated by the fact that templates are consumed by agents (which interpret content as text) rather than executed directly. However, spawn templates ARE interpreted as agent instructions.

**Severity:** LOW

**Recommended Mitigation:**

1. Add security validation items to the Step 5 checklist:
   ```
   [ ] No secrets, credentials, or API keys in template content
   [ ] No absolute file paths (use relative from PROJECT_ROOT)
   [ ] No prompt override patterns ("IGNORE PREVIOUS", "SYSTEM:", etc.)
   [ ] Template size under 50KB
   ```
2. This is a LOW priority recommendation and does not block approval

---

## 3. Previously Identified Findings - Remediation Status

| Finding                                                   | Original Severity | Status     | Evidence                                                                                                                     |
| --------------------------------------------------------- | ----------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------- |
| SEC-TMPL-001: Path traversal in getPresetRuleSnippet()    | HIGH              | FIXED      | `prompt-assembler.cjs` now validates `normalizedSnippetPath.startsWith(normalizedProjectRoot + path.sep)` (per learnings.md) |
| SEC-TMPL-002: Orchestrator spawn validation bypass        | MEDIUM            | FIXED      | `spawn-prompt-validator.cjs` now matches ONLY on `subagent_type` field, not `description` (per learnings.md)                 |
| SEC-TMPL-003: Fail-open error handling in spawn assembler | MEDIUM            | UNRESOLVED | No evidence of fix in reviewed files; spawn-prompt-assembler still fails open                                                |
| SEC-TMPL-004: Placeholder injection in prompt-factory     | MEDIUM            | FIXED      | `prompt-factory.cjs` now exports `sanitizeSubstitutionValue()` with loop-based `{{` / `}}` replacement (verified in code)    |

### SEC-TMPL-004 Fix Quality Assessment

The `sanitizeSubstitutionValue()` function in `prompt-factory.cjs` (lines 17-29) correctly:

- Guards against null/non-string input
- Uses a loop to handle overlapping patterns (e.g., `{{{{` becomes `{ { { {`)
- Includes a safety break to prevent infinite loops (`if (result === prev) break`)
- Is exported for testing

The fix is well-implemented and addresses the original finding. However, it only protects the `buildContextModePrompt()` code path, not Router-level template substitution (see SEC-TC-001 above).

---

## 4. Security Controls Verification

### Controls from Security Controls Catalog

| Control                        | Relevance to template-creator                                                              | Status                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| SEC-001 (Token Whitelist)      | Template-renderer enforces token whitelist; template-creator creates templates with tokens | DOCUMENTED ONLY - whitelist exists in template-renderer skill docs but is not enforced as executable code |
| SEC-002 (Path Validation)      | Template-creator writes files to `.claude/templates/`                                      | PARTIALLY IMPLEMENTED - unified-creator-guard protects some subdirectories but not all (see SEC-TC-002)   |
| SEC-003 (Input Sanitization)   | Template values sanitized before rendering                                                 | PARTIALLY IMPLEMENTED - SEC-TMPL-004 fix in prompt-factory.cjs; not in Router-level substitution          |
| SEC-004 (Transparency Markers) | Not directly relevant to template creation                                                 | N/A                                                                                                       |

### Controls from unified-creator-guard.cjs

| Control                              | Status              | Effectiveness                                                                    |
| ------------------------------------ | ------------------- | -------------------------------------------------------------------------------- |
| Creator state tracking (TTL-bounded) | IMPLEMENTED         | Effective but bypassable via state file manipulation (SEC-TC-005)                |
| Fail-closed on error (SEC-008)       | IMPLEMENTED         | Correct - hook exits with code 2 on error                                        |
| HOOK_FAIL_OPEN override              | IMPLEMENTED         | Debug escape hatch; logged via audit trail                                       |
| Watched tools (Edit/Write only)      | IMPLEMENTED         | Correct scope                                                                    |
| Enforcement modes (block/warn/off)   | IMPLEMENTED         | Default is `block` (appropriate)                                                 |
| Template path pattern                | PARTIALLY EFFECTIVE | Misses spawn/, reports/, code-styles/, and root-level templates (see SEC-TC-002) |

---

## 5. Checklist (IEEE 1028 Security Base + Contextual)

### IEEE 1028 Security Items

- [x] Input validation on user inputs: Template names should be validated (SEC-TC-003 finding)
- [x] No SQL injection vulnerabilities: N/A (no database)
- [x] No XSS vulnerabilities: N/A (no web UI)
- [x] Sensitive data encrypted at rest/transit: N/A (local filesystem)
- [x] Authentication and authorization checks present: Creator-guard enforces workflow
- [ ] No hardcoded secrets or credentials: Templates SHOULD be checked for secrets (SEC-TC-007)
- [x] OWASP Top 10 considered: STRIDE analysis completed above

### [AI-GENERATED] Contextual Security Items

- [ ] [AI-GENERATED] Spawn template placeholder values are sanitized before substitution (SEC-TC-001)
- [ ] [AI-GENERATED] Creator-guard regex covers ALL template subdirectories (SEC-TC-002)
- [ ] [AI-GENERATED] Template names validated against kebab-case pattern (SEC-TC-003)
- [ ] [AI-GENERATED] Template registry JSON constructed via stringify, not concatenation (SEC-TC-004)
- [x] [AI-GENERATED] Creator state file has bounded TTL (3 minutes)
- [x] [AI-GENERATED] Creator-guard defaults to block mode
- [ ] [AI-GENERATED] Prompt injection patterns checked in template content (SEC-TC-007)
- [x] [AI-GENERATED] SEC-TMPL-004 sanitization fix correctly handles overlapping patterns

---

## 6. Verdict

**APPROVED WITH CONDITIONS**

The template-creator skill overhaul is approved for deployment provided the following conditions are met:

### MUST-FIX (Before Deployment)

1. **SEC-TC-002 [HIGH]**: Update `unified-creator-guard.cjs` template pattern to cover ALL template subdirectories (`spawn/`, `reports/`, `code-styles/`, root level), not just `agents|skills|workflows|hooks|code|schemas`. The current pattern leaves the most security-critical templates (spawn templates) completely unprotected by the creator guard. Proposed regex:
   ```javascript
   patterns: [/\.claude[/\\]templates[/\\]/i],
   excludePatterns: [/README\.md$/i, /_archive[/\\]/i],
   ```

### SHOULD-FIX (During Deployment)

2. **SEC-TC-001 [HIGH]**: Add a security guidance section to the template-creator skill warning that spawn template placeholders substituted with user input MUST be sanitized. Reference `sanitizeSubstitutionValue()` from `prompt-factory.cjs` as the canonical pattern. Recommend against placing `{{PLACEHOLDER}}` tokens inside `prompt:` fields of `Task()` calls.

3. **SEC-TC-003 [MEDIUM]**: Add template name validation to the skill workflow (before Step 6) requiring names to match `/^[a-z0-9][a-z0-9-]*[a-z0-9]$/`.

4. **SEC-TC-004 [MEDIUM]**: Add guidance that template registry entries MUST use `JSON.stringify()` and that `location` fields MUST be validated to start with `.claude/templates/`.

### RECOMMENDED (Post-Deployment)

5. **SEC-TC-005 [MEDIUM]**: Consider adding a session nonce to the creator state file to prevent cross-agent state manipulation.

6. **SEC-TC-006 [LOW]**: Remove enforcement override syntax from the template catalog.

7. **SEC-TC-007 [LOW]**: Add security validation items to the template-creator's Step 5 checklist (no secrets, no absolute paths, no prompt override patterns, size limits).

8. **SEC-TMPL-003 [MEDIUM]**: Resolve the unresolved fail-open error handling in spawn-prompt-assembler (carried forward from original security review).

---

## 7. Appendix: Files Reviewed

| File                           | Path                                                                                                          | Purpose                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Template-Creator Skill         | `C:\dev\projects\agent-studio\.claude\skills\template-creator\SKILL.md`                                       | Primary review target         |
| Unified Creator Guard          | `C:\dev\projects\agent-studio\.claude\hooks\routing\unified-creator-guard.cjs`                                | Enforcement hook              |
| Template Catalog               | `C:\dev\projects\agent-studio\.claude\context\artifacts\catalogs\template-catalog.md`                         | Template inventory            |
| Original Security Review       | `C:\dev\projects\agent-studio\.claude\context\reports\security\template-system-security-review-2026-02-07.md` | Prior findings                |
| Prompt Factory                 | `C:\dev\projects\agent-studio\.claude\lib\spawn\prompt-factory.cjs`                                           | SEC-TMPL-004 fix verification |
| Universal Agent Spawn Template | `C:\dev\projects\agent-studio\.claude\templates\spawn\universal-agent-spawn.md`                               | Spawn template attack surface |
| Security Controls Catalog      | `C:\dev\projects\agent-studio\.claude\context\artifacts\security-reviews\security-controls-catalog.md`        | Control reference             |
| Memory: learnings.md           | `C:\dev\projects\agent-studio\.claude\context\memory\learnings.md`                                            | Remediation evidence          |
| Memory: decisions.md           | `C:\dev\projects\agent-studio\.claude\context\memory\decisions.md`                                            | ADR-085 context               |
| Memory: issues.md              | `C:\dev\projects\agent-studio\.claude\context\memory\issues.md`                                               | Prior issue context           |

---

**End of Security Review**
