<!-- Agent: security-architect | Task: #63 | Session: 2026-02-07 -->

# Template System Security Review

**Date:** 2026-02-07
**Reviewer:** Security Architect Agent
**Task:** #63
**Scope:** Template loading, rendering, archival, and catalog security
**Verdict:** APPROVED WITH CONDITIONS

---

## Executive Summary

This security review examines the template system used by the agent-studio multi-agent orchestration framework. The review covers four areas: (1) spawn template loading security, (2) template rendering security, (3) archive cleanup security, and (4) template catalog security. The analysis identified **1 HIGH**, **3 MEDIUM**, and **2 LOW** severity findings. No CRITICAL findings were identified. The template system has adequate defenses for its threat model, but several hardening opportunities exist, particularly around path validation in the preset rule snippet loader and fail-open behavior in the spawn prompt assembler.

---

## 1. Threat Model for Template Loading

### System Description

The template loading system operates as follows:

1. **Router** invokes `Task()` tool to spawn subagents
2. **PreToolUse(Task) hook** (`spawn-prompt-assembler.cjs`) intercepts the spawn call
3. The hook calls `prompt-assembler.cjs` library to assemble the final prompt
4. The assembler loads tools, skills, memory context, behaviour rules, constitution, and optional preset configurations
5. The assembled prompt is validated by `spawn-prompt-validator.cjs`
6. The enriched prompt replaces the original and is sent to the spawned agent

### Trust Boundaries

| Boundary                          | Description                                                     | Trust Level                                            |
| --------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------ |
| Router -> Hook                    | Router constructs Task() call parameters                        | Semi-trusted (Router is a prompt, not executable code) |
| Hook -> Assembler                 | Hook passes toolInput to assembler                              | Trusted (same process)                                 |
| Assembler -> Filesystem           | Assembler reads config files, manifests, registries             | Trusted (local filesystem)                             |
| Config Files -> Assembler         | JSON parsed from disk (presets.json, agent-registry.json, etc.) | Semi-trusted (files could be modified by other agents) |
| Template Content -> Spawned Agent | Assembled prompt sent to subagent                               | Trusted (output of controlled pipeline)                |

### STRIDE Analysis

| Threat                         | Applicability                                                                       | Risk   | Existing Controls                                                               |
| ------------------------------ | ----------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------- |
| **S - Spoofing**               | A non-orchestrator agent could be spawned with orchestrator-level privileges        | MEDIUM | `ORCHESTRATOR_IDS` set in assembler, `isOrchestratorSpawn()` check in validator |
| **T - Tampering**              | Template content or config files could be modified to inject malicious instructions | MEDIUM | `unified-creator-guard.cjs` blocks direct writes to template paths              |
| **R - Repudiation**            | Template rendering operations not fully audited                                     | LOW    | Partial - spawn-log.cjs logs spawn starts, validator logs validation results    |
| **I - Information Disclosure** | Template catalog could expose internal system architecture                          | LOW    | Templates are internal to `.claude/` directory, not user-facing                 |
| **D - Denial of Service**      | Oversized prompts could exhaust context window                                      | LOW    | `MAX_PROMPT_LENGTH = 500KB` in validator                                        |
| **E - Elevation of Privilege** | Agent could gain Task tool (orchestrator capability) through prompt manipulation    | MEDIUM | `enrichAllowedTools()` resolves tools from registry, not from prompt content    |

---

## 2. Security Findings

### FINDING SEC-TMPL-001: Path Traversal in Preset Rule Snippet Loader [HIGH]

**Location:** `C:\dev\projects\agent-studio\.claude\lib\spawn\prompt-assembler.cjs`, lines 90-101

**Description:**
The `getPresetRuleSnippet()` function loads arbitrary file content from a path specified in `presets.json`:

```javascript
const snippetPath = path.resolve(projectRoot, preset.ruleSnippetPath);
if (!fs.existsSync(snippetPath)) return '';
return fs.readFileSync(snippetPath, 'utf-8').trim();
```

The `ruleSnippetPath` value comes from `presets.json` which is a JSON config file that could be modified by any agent with Write access to `.claude/config/presets.json`. If an attacker (or compromised agent) sets `ruleSnippetPath` to a path traversal value such as `../../../../../../etc/passwd` or `../../../.env`, the function will:

1. Resolve the path via `path.resolve()` (which normalizes `..` segments)
2. Read the file content
3. Inject that content directly into the spawn prompt as "Preset Rules"

There is **no validation** that the resolved path stays within `PROJECT_ROOT` or within the `.claude/` directory.

**Impact:** An attacker who can modify `presets.json` (or a compromised agent that bypasses creator-guard) could inject the content of ANY readable file into spawn prompts. This includes:

- `.env` files containing secrets
- `~/.ssh/` key files
- System configuration files
- Other project files outside `.claude/`

**Severity:** HIGH

**Required Mitigation:**
Add path containment validation after `path.resolve()`:

```javascript
const snippetPath = path.resolve(projectRoot, preset.ruleSnippetPath);
const normalizedProject = path.resolve(projectRoot);
if (!snippetPath.startsWith(normalizedProject + path.sep)) {
  // Path escapes project root
  return '';
}
```

---

### FINDING SEC-TMPL-002: Orchestrator Spawn Validation Bypass [MEDIUM]

**Location:** `C:\dev\projects\agent-studio\.claude\hooks\safety\spawn-prompt-validator.cjs`, lines 356-368

**Description:**
The `isOrchestratorSpawn()` function checks if a spawn is for an orchestrator by matching against the `description` and `subagent_type` fields:

```javascript
const description = (toolInput.description || '').toLowerCase();
const subagentType = (toolInput.subagent_type || '').toLowerCase();
return orchestratorTypes.some(orch => description.includes(orch) || subagentType.includes(orch));
```

When `isOrchestratorSpawn()` returns `true`, the validator **skips ALL validation** (exits with code 0). This means:

- No TaskUpdate warning box check
- No Task ID reference check
- No PROJECT_ROOT context check
- No Memory Protocol check

A Router prompt that sets `description` to include `"master-orchestrator"` in any position (e.g., `"developer fixing master-orchestrator bug"`) will bypass all spawn prompt validation.

**Impact:** Validation bypass for any spawn whose description mentions an orchestrator name. The actual agent being spawned could be a regular developer agent, but with an unvalidated prompt.

**Severity:** MEDIUM

**Required Mitigation:**
Change to exact `subagent_type` matching only (not partial string matching on description):

```javascript
function isOrchestratorSpawn(toolInput) {
  const subagentType = (toolInput.subagent_type || '').toLowerCase().trim();
  return orchestratorTypes.includes(subagentType);
}
```

---

### FINDING SEC-TMPL-003: Fail-Open Error Handling in Spawn Assembler [MEDIUM]

**Location:** `C:\dev\projects\agent-studio\.claude\hooks\routing\spawn-prompt-assembler.cjs`, lines 920-934

**Description:**
The spawn-prompt-assembler hook has a catch-all error handler that calls `process.exit(0)` (allow) on ANY error:

```javascript
} catch (err) {
    // ...
    stderrLog('hook_failed', { error: err?.message });
    debugLog('spawn-prompt-assembler', 'Hook error (fail open)', err);
    process.exit(0); // Fail open
}
```

This means if there is ANY error during prompt assembly (file read error, JSON parse error, module load failure, etc.), the ORIGINAL un-assembled prompt is sent to the spawned agent. The original prompt may lack:

- Tool/skill awareness sections
- Memory context
- Constitution/behaviour principles
- Config model section

While fail-open is appropriate for monitoring hooks, the spawn-prompt-assembler is a security-relevant hook that enriches prompts with safety instructions (TaskUpdate warning box, workspace conventions, memory management rules). Silently failing means these protections are absent.

**Impact:** On assembler failure, agents spawn without safety instructions, memory context, or behavioral constraints. The agent still functions but lacks the framework's safety rails.

**Severity:** MEDIUM

**Required Mitigation:**
Add a configurable fail mode (default: warn). When the assembler fails, at minimum ensure the TaskUpdate warning box and PROJECT_ROOT context are present in the prompt before allowing the spawn:

```javascript
} catch (err) {
    // Ensure minimum safety even on failure
    if (!hasRequiredWarningBox(basePrompt)) {
      // Inject minimal safety prefix
    }
    // ...
}
```

---

### FINDING SEC-TMPL-004: No Input Sanitization in Template Placeholder Substitution [MEDIUM]

**Location:** `C:\dev\projects\agent-studio\.claude\lib\spawn\prompt-factory.cjs`, lines 51-57

**Description:**
The `buildContextModePrompt()` function in `prompt-factory.cjs` performs placeholder substitution on context/mode prompts:

```javascript
fragmentBody = fragmentBody.replace(/\{\{\s*available_tools\s*\}\}/gi, activeToolNames.join(', '));
fragmentBody = fragmentBody.replace(/\{\{\s*context_system_prompt\s*\}\}/gi, contextPrompt);
fragmentBody = fragmentBody.replace(/\{\{\s*mode_system_prompts\s*\}\}/gi, modePrompts);
```

The substituted values (`activeToolNames`, `contextPrompt`, `modePrompts`) come from context/mode configuration files loaded from disk. While these files are within the `.claude/config/` directory and protected by `unified-creator-guard.cjs`, the substitution values are NOT sanitized for:

- Nested template placeholders (e.g., `{{available_tools}}` in a value would cause recursive substitution)
- Markdown injection (headings, code blocks that could override template structure)
- Instruction injection (values that contain "## Instructions" or "IGNORE PREVIOUS INSTRUCTIONS")

The `template-renderer` skill (SKILL.md) documents token sanitization controls (SEC-SPEC-003, SEC-SPEC-004) but these controls exist only in the skill documentation as guidance -- they are NOT implemented as executable code in the prompt-factory or prompt-assembler modules.

**Impact:** A compromised context or mode configuration file could inject instructions into spawn prompts. The practical risk is reduced because these config files are protected by creator-guard, but the defense-in-depth principle is violated.

**Severity:** MEDIUM

**Required Mitigation:**
Implement the sanitization controls described in the template-renderer skill as actual code in prompt-factory.cjs:

```javascript
function sanitizeSubstitutionValue(value) {
  return String(value)
    .replace(/\{\{/g, '{ {') // Prevent nested template injection
    .replace(/\}\}/g, '} }');
}
```

---

### FINDING SEC-TMPL-005: Agent Prompt Overrides Directory Traversal [LOW]

**Location:** `C:\dev\projects\agent-studio\.claude\lib\spawn\prompt-assembler.cjs`, lines 319-336

**Description:**
The `loadAgentPromptOverrides()` function constructs a prompts directory path from the agent file path:

```javascript
const agentDir = path.join(path.dirname(agentPath), path.basename(agentPath, '.md'));
const promptsDir = path.join(agentDir, 'prompts');
```

If the agent registry returns a `filePath` that contains `..` segments, the prompts directory could resolve outside `.claude/agents/`. However, the risk is mitigated because:

1. The agent registry is a JSON file in `.claude/context/` protected by normal filesystem permissions
2. The `findAgentFilePath()` fallback searches only within `.claude/agents/`
3. Only `.md` files in the prompts directory are loaded

**Impact:** Low. Requires compromised agent-registry.json to exploit.

**Severity:** LOW

**Recommended Mitigation:**
Add path containment check:

```javascript
const resolved = path.resolve(promptsDir);
if (!resolved.startsWith(path.resolve(projectRoot, '.claude', 'agents'))) return '';
```

---

### FINDING SEC-TMPL-006: Template Catalog Exposes Internal Architecture [LOW]

**Location:** All template files in `C:\dev\projects\agent-studio\.claude\templates\`

**Description:**
The template catalog (43 templates across 10 directories) contains detailed information about:

- Internal directory structure (`.claude/agents/`, `.claude/hooks/`, etc.)
- Hook names and enforcement modes
- Agent types and orchestrator identifiers
- Validation rules and bypass conditions
- Error recovery patterns and security controls

This information is already embedded in spawn prompts sent to every agent, so it is not a new exposure. However, expanding the template catalog with more detailed entries could increase the information available to a compromised agent.

**Impact:** Low. Information is already available to spawned agents through existing spawn prompts and CLAUDE.md. No new attack surface.

**Severity:** LOW

**Recommended Mitigation:**
No action needed. The information is required for agents to function. Ensure the template catalog does not include secrets, credentials, or external API endpoints.

---

## 3. Archive Cleanup Security Assessment

### Templates That MUST NOT Be Archived

The following templates contain security-relevant content and MUST be retained:

| Template                                | Path                                                    | Reason                                                                                                                                                                                                                                                                        |
| --------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **security-design-checklist.md**        | `.claude/templates/security-design-checklist.md`        | Contains the STRIDE threat model checklist used during EVOLVE Phase E. Removing this would eliminate the "security as afterthought" prevention mechanism. It is the only template that provides structured security assessment guidance for artifact creation. **MUST KEEP.** |
| **error-recovery-template.md**          | `.claude/templates/error-recovery-template.md`          | Contains standardized error recovery patterns (fail-closed, fail-open, retry) with SecurityError, TransientError, and PermanentError classes. Used as reference for hook development. Removing would weaken incident response patterns. **MUST KEEP.**                        |
| **spawn/universal-agent-spawn.md**      | `.claude/templates/spawn/universal-agent-spawn.md`      | Core spawn template. Obviously must keep.                                                                                                                                                                                                                                     |
| **spawn/orchestrator-spawn.md**         | `.claude/templates/spawn/orchestrator-spawn.md`         | Core orchestrator spawn template. Obviously must keep.                                                                                                                                                                                                                        |
| **spawn/bash-safe-background.md**       | `.claude/templates/spawn/bash-safe-background.md`       | Contains shell security validators reference. Must keep.                                                                                                                                                                                                                      |
| **spawn/subordinate-once.md**           | `.claude/templates/spawn/subordinate-once.md`           | One-shot agent pattern. Must keep.                                                                                                                                                                                                                                            |
| **spawn/agent-identity-integration.md** | `.claude/templates/spawn/agent-identity-integration.md` | Identity integration template. Must keep.                                                                                                                                                                                                                                     |

### Templates Safe to Archive (No Security Concerns)

The following template categories can be safely archived if unused:

- **code-styles/** (8 files) - Language-specific style guides. No security content.
- **examples/** (2 files) - Example specifications. No security content.
- **planning/** (3 files) - Planning templates (findings, progress, task_plan). No security content.
- **reports/plan-template.md** - Duplicate of root-level plan-template.md. No security content.
- **ui-spec.md** - UI specification template. No security content.
- **prd.md** - Product requirements document template. No security content.
- **project-brief.md** - Project brief template. No security content.
- **continuation.md** - Continuation template. No security content.
- **architecture.md** - Architecture template. No security content.
- **test-plan.md** - Test plan template. No security content.

### Archival Recommendations

1. **DO NOT archive** `security-design-checklist.md` -- it is actively referenced by the EVOLVE workflow and security-architect skill
2. **DO NOT archive** `error-recovery-template.md` -- it defines standardized error handling patterns used across the hook system
3. **Archive safely** code-styles, examples, planning templates, and specification templates if they are confirmed unused
4. **Verify references** before archiving: search for `require()` or `Read` references to each template before moving to `_archive/`

---

## 4. Template Catalog Security

### Catalog Path Validation

The template catalog itself does not present a significant security risk because:

1. Template paths in the catalog are relative to `PROJECT_ROOT/.claude/templates/`
2. The `unified-creator-guard.cjs` hook blocks direct writes to template paths (requires `template-creator` workflow)
3. Template content is Markdown (documentation), not executable code
4. The catalog is read-only from the perspective of spawned agents

### Risk: Catalog Expansion

If the template catalog is expanded to include:

- Template content previews or summaries
- Cross-references to other templates
- Metadata about template usage patterns

Then the catalog becomes a richer information source. The risk is LOW because this information is documentation, not executable, and is already available to agents through the filesystem.

### Recommendation

Validate that any expanded template catalog:

- Contains only relative paths (no absolute paths)
- Does not include file content or sensitive metadata
- Is generated from a trusted source (not user-editable)

---

## 5. Security Controls Verification

### Existing Controls Assessment

| Control                             | Status          | Effectiveness                                                |
| ----------------------------------- | --------------- | ------------------------------------------------------------ |
| SEC-SPEC-002 (Path validation)      | DOCUMENTED ONLY | Not implemented as executable code in prompt-assembler       |
| SEC-SPEC-003 (Token whitelist)      | DOCUMENTED ONLY | Not implemented as executable code in prompt-factory         |
| SEC-SPEC-004 (Input sanitization)   | DOCUMENTED ONLY | Not implemented as executable code                           |
| ROUTING-001 (Tool whitelist)        | IMPLEMENTED     | Effective - `enrichAllowedTools()` uses registry, not prompt |
| CREATOR-001 (Artifact output paths) | IMPLEMENTED     | Effective - `unified-creator-guard.cjs` blocks direct writes |
| VULN-001 (Unicode normalization)    | IMPLEMENTED     | Effective - `normalizeUnicode()` in validator                |
| VULN-002 (ReDoS-safe regex)         | IMPLEMENTED     | Effective - `safeRegexTest()` with timeout                   |
| VULN-003 (Prompt length limit)      | IMPLEMENTED     | Effective - 500KB limit                                      |
| VULN-006 (Required tool flags)      | IMPLEMENTED     | Effective - mandatory tools always included                  |

### Gap: SEC-SPEC-002/003/004 Documentation vs Implementation

The template-renderer skill documents security controls (path validation, token whitelist, input sanitization) but these exist ONLY as documentation/guidance in the SKILL.md file. They are NOT implemented as executable validation in the `prompt-assembler.cjs` or `prompt-factory.cjs` modules.

**Recommendation:** Either implement these controls as executable code or clearly document that they are aspirational guidance, not active enforcement.

---

## 6. Verdict

**APPROVED WITH CONDITIONS**

The template system is approved for the proposed changes (overhaul, cleanup, catalog expansion) provided the following conditions are met:

### MUST-FIX (Before Implementation)

1. **SEC-TMPL-001**: Add path containment validation to `getPresetRuleSnippet()` in `prompt-assembler.cjs` to prevent path traversal through `presets.json`

### SHOULD-FIX (During Implementation)

2. **SEC-TMPL-002**: Tighten `isOrchestratorSpawn()` to match `subagent_type` exactly, not partial string match on `description`
3. **SEC-TMPL-004**: Implement actual sanitization for template placeholder substitution values in `prompt-factory.cjs`

### RECOMMENDED (Post-Implementation)

4. **SEC-TMPL-003**: Add configurable fail mode to spawn-prompt-assembler with minimum safety prefix on failure
5. **SEC-TMPL-005**: Add path containment check to `loadAgentPromptOverrides()`
6. **security-design-checklist.md** and **error-recovery-template.md**: MUST NOT be archived
7. Implement SEC-SPEC-002/003/004 controls as executable code, not just documentation

---

## Appendix: Files Reviewed

| File                           | Path                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------- |
| Spawn Prompt Assembler (hook)  | `C:\dev\projects\agent-studio\.claude\hooks\routing\spawn-prompt-assembler.cjs` |
| Prompt Assembler (library)     | `C:\dev\projects\agent-studio\.claude\lib\spawn\prompt-assembler.cjs`           |
| Prompt Factory                 | `C:\dev\projects\agent-studio\.claude\lib\spawn\prompt-factory.cjs`             |
| Spawn Prompt Validator         | `C:\dev\projects\agent-studio\.claude\hooks\safety\spawn-prompt-validator.cjs`  |
| Unified Creator Guard          | `C:\dev\projects\agent-studio\.claude\hooks\routing\unified-creator-guard.cjs`  |
| Universal Agent Spawn Template | `C:\dev\projects\agent-studio\.claude\templates\spawn\universal-agent-spawn.md` |
| Orchestrator Spawn Template    | `C:\dev\projects\agent-studio\.claude\templates\spawn\orchestrator-spawn.md`    |
| Security Design Checklist      | `C:\dev\projects\agent-studio\.claude\templates\security-design-checklist.md`   |
| Error Recovery Template        | `C:\dev\projects\agent-studio\.claude\templates\error-recovery-template.md`     |
| Template Renderer Skill        | `C:\dev\projects\agent-studio\.claude\skills\template-renderer\SKILL.md`        |
| Template directory listing     | `C:\dev\projects\agent-studio\.claude\templates\` (43 files)                    |
