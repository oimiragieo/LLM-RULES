---
name: template-creator
description: 'Creates and registers templates for agents, skills, workflows, hooks, and code patterns. Handles post-creation catalog updates, consuming skill integration, and README registration. Use when creating new template types or standardizing patterns.'
version: 2.2.0
category: creator
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Edit, Bash, Glob, Grep]
# Phase 1 Integration: Template tools validated against .claude/config/tool-manifest.json
# Templates should reference tools from the manifest for consistency
# Single source of truth: .claude/config/tool-manifest.json
assigned_agents: [planner, architect, developer]
triggers: ['create template', 'new template', 'template for']
dependencies: [research-synthesis]
output_paths: ['.claude/templates/']
best_practices:
  - Include all required fields with placeholders
  - Add documentation comments in templates
  - Version templates for tracking changes
  - Include validation examples
  - Use consistent placeholder format
  - Update template-catalog.md after every creation
  - Sanitize spawn template placeholders
error_handling: graceful
streaming: supported
output_location: .claude/templates/
verified: true
lastVerifiedAt: '2026-02-28'
source: builtin
trust_score: 100
provenance_sha: 2464fc762fb36f07
---

**Mode: Cognitive/Prompt-Driven** -- No standalone utility script; use via agent context.

# Template Creator Skill

Creates, validates, and registers templates for the multi-agent orchestration framework.

```
+==============================================================+
|  MANDATORY: Research-Synthesis MUST be invoked BEFORE         |
|  this skill. Invoke: Skill({ skill: "research-synthesis" })   |
|  FAILURE TO RESEARCH = UNINFORMED TEMPLATE = REJECTED         |
+==============================================================+
|                                                               |
|  DO NOT WRITE TEMPLATE FILES DIRECTLY!                        |
|                                                               |
|  This includes:                                               |
|    - Copying archived templates                               |
|    - Restoring from _archive/ backup                          |
|    - "Quick" manual creation                                  |
|                                                               |
|  WHY: Direct writes bypass MANDATORY post-creation steps:     |
|    1. Template catalog update (template NOT discoverable)     |
|    2. README.md update (template INVISIBLE to consumers)      |
|    3. Consuming skill update (template NEVER used)            |
|    4. CLAUDE.md update (if user-invocable)                    |
|                                                               |
|  RESULT: Template EXISTS in filesystem but is NEVER USED.     |
|                                                               |
|  ENFORCEMENT: unified-creator-guard.cjs blocks direct         |
|  template writes. Override: CREATOR_GUARD=off (DANGEROUS)     |
|                                                               |
|  ALWAYS invoke this skill properly:                           |
|    Skill({ skill: "template-creator" })                       |
|                                                               |
+==============================================================+
```

## ROUTER UPDATE REQUIRED (CRITICAL - DO NOT SKIP)

**After creating ANY template, you MUST update:**

1. `.claude/templates/README.md` - Add template entry
2. `.claude/context/artifacts/catalogs/template-catalog.md` - Add catalog entry
3. CLAUDE.md Section 2 or 8.5 if template is framework-significant or user-invocable
4. Consuming creator skill if template standardizes an artifact type
5. `.claude/context/memory/learnings.md` - Record creation

**Verification:**

```bash
grep "<template-name>" .claude/templates/README.md || echo "ERROR: README NOT UPDATED!"
grep "<template-name>" .claude/context/artifacts/catalogs/template-catalog.md || echo "ERROR: CATALOG NOT UPDATED!"
```

**WHY**: Templates not in the catalog are invisible to other creators and will never be used.

---

## Overview

Templates ensure consistency across the multi-agent framework. This skill creates templates for:

- **Agent definitions** - Standardized agent structures
- **Skill definitions** - Reusable capability patterns
- **Workflow definitions** - Multi-agent orchestration patterns
- **Spawn prompts** - Agent spawn prompt templates consumed by `spawn-template-resolver.cjs`
- **Reports** - Report document templates
- **Code style guides** - Language-specific coding standards
- **General documents** - ADRs, specs, checklists, and other framework documents

**Core principle:** Templates are the DNA of the system. Consistent templates produce consistent, predictable agents and skills.

## When to Use

**Always:**

- Creating a new type of artifact that will be replicated
- Standardizing an existing pattern across the codebase
- Adding a new template category
- Improving existing templates with better patterns

**Exceptions:**

- One-off files that will never be replicated
- Temporary/throwaway code

## Template Types

| Type       | Location                         | Count | Purpose                                | Key Consumers                  |
| ---------- | -------------------------------- | ----- | -------------------------------------- | ------------------------------ |
| Spawn      | `.claude/templates/spawn/`       | 4     | Agent spawn prompt templates           | router, spawn-prompt-assembler |
| Agent      | `.claude/templates/agents/`      | 2     | Agent definition boilerplate           | agent-creator                  |
| Skill      | `.claude/templates/skills/`      | 1     | Skill definition boilerplate           | skill-creator                  |
| Workflow   | `.claude/templates/workflows/`   | 1     | Workflow definition boilerplate        | workflow-creator               |
| Report     | `.claude/templates/reports/`     | 5     | Report document templates              | qa, developer, researcher      |
| Code Style | `.claude/templates/code-styles/` | 3     | Language style guides                  | developer, code-reviewer       |
| Document   | `.claude/templates/` (root)      | 8+    | General document templates (ADR, spec) | planner, architect, qa         |

**Cross-Reference:** See `.claude/context/artifacts/catalogs/template-catalog.md` for the complete inventory (28 active templates). For spawn template resolution logic, see `.claude/lib/spawn/spawn-template-resolver.cjs`.

## Template Security Compliance

**Critical Security Requirements:**

1. **No Secrets (SEC-TC-007):** Templates MUST NOT include secrets, credentials, tokens, or API keys
2. **Path Safety:** All template references MUST use relative paths (`.claude/templates/...`), never absolute paths
3. **No Sensitive Metadata:** Templates MUST NOT expose internal system paths or user directories
4. **No Windows Reserved Names:** Template names MUST NOT use `nul`, `con`, `prn`, `aux`, `com1`-`com9`, `lpt1`-`lpt9`
5. **Retention Mandates (SEC-TMPL-006):** Templates flagged by SEC-TMPL-006 MUST remain at designated locations
6. **Spawn Template Placeholder Safety (SEC-TC-001):** Spawn templates with `{{PLACEHOLDER}}` tokens in `prompt:` fields MUST reference `sanitizeSubstitutionValue()` from `prompt-factory.cjs` for value sanitization. Unsanitized placeholders in spawn prompts create a prompt injection surface. Do NOT place `{{PLACEHOLDER}}` tokens where user-provided input is directly substituted without sanitization.
7. **No Eval/Exec:** Templates MUST NOT contain `eval()`, `exec()`, `Function()`, or other code execution patterns

**Enforcement:** `unified-creator-guard.cjs` hook blocks direct template writes (default: block mode).

## The Iron Law

```
NO TEMPLATE WITHOUT PLACEHOLDER DOCUMENTATION
```

Every `{{PLACEHOLDER}}` must have a corresponding comment explaining:

1. What value should replace it
2. Valid options/formats
3. Example value

**No exceptions:**

- Every placeholder is documented
- Every required field is marked
- Every optional field has a default

---

## Workflow Steps

### Step 0: Research-Synthesis (MANDATORY - BLOCKING)

Per CLAUDE.md Section 3 requirement, invoke `research-synthesis` BEFORE template creation:

```javascript
Skill({ skill: 'research-synthesis' });
```

**Research focuses for templates:**

- Search existing templates: `Glob: .claude/templates/**/*.md`
- Review template catalog: Read `.claude/context/artifacts/catalogs/template-catalog.md`
- Check if similar template already exists in the ecosystem
- **Research domain-specific template structures** (minimum 2 queries required):

  ```javascript
  WebSearch({ query: 'best <domain/topic name> template report or files 2026' });
  WebSearch({ query: 'industry standard <template type> format <domain/tool> 2026' });
  ```

**BLOCKING**: Template creation CANNOT proceed without research-synthesis invocation.

### Step 0.1: Smart Duplicate Detection (MANDATORY)

Before proceeding with creation, run the 3-layer duplicate check:

```javascript
const { checkDuplicate } = require('.claude/lib/creation/duplicate-detector.cjs');
const result = checkDuplicate({
  artifactType: 'template',
  name: proposedName,
  description: proposedDescription,
  keywords: proposedKeywords || [],
});
```

**Handle results:**

- **`EXACT_MATCH`**: Stop creation. Route to `template-updater` skill instead: `Skill({ skill: 'template-updater' })`
- **`REGISTRY_MATCH`**: Warn user — artifact is registered but file may be missing. Investigate before creating. Ask user to confirm.
- **`SIMILAR_FOUND`**: Display candidates with scores. Ask user: "Similar artifact(s) exist. Continue with new creation or update existing?"
- **`NO_MATCH`**: Proceed to next step.

**Override**: If user explicitly passes `--force`, skip this check entirely.

---

### Step 0.5: Companion Check

Before proceeding with creation, run the ecosystem companion check:

1. Use `companion-check.cjs` from `.claude/lib/creators/companion-check.cjs`
2. Call `checkCompanions("template", "{template-name}")` to identify companion artifacts
3. Review the companion checklist — note which required/recommended companions are missing
4. Plan to create or verify missing companions after this artifact is complete
5. Include companion findings in post-creation integration notes

This step is **informational** (does not block creation) but ensures the full artifact ecosystem is considered.

### Step 1: Gather Requirements

**Analyze the request:**

1. **Template Type**: Which category (spawn, agent, skill, workflow, report, code-style, document)?
2. **Purpose**: What will this template be used for?
3. **Required Fields**: What fields are mandatory?
4. **Optional Fields**: What fields are optional with defaults?
5. **Validation Rules**: What constraints apply?
6. **Consumers**: Which creators/agents will use this template?

**Example analysis:**

```
Template Request: "Create a template for security audit reports"
- Type: Report
- Purpose: Standardize security audit report structure
- Required: findings, severity_levels, recommendations
- Optional: compliance_framework, remediation_timeline
- Rules: severity must be CRITICAL|HIGH|MEDIUM|LOW
- Consumers: security-architect, qa
```

### Step 2: Template Type Classification

Classify the template to determine output path and validation rules:

| Type       | Output Path                      | Key Fields                                                 | Validation Focus                             |
| ---------- | -------------------------------- | ---------------------------------------------------------- | -------------------------------------------- |
| Spawn      | `.claude/templates/spawn/`       | subagent_type, prompt, model, task_id                      | TaskUpdate protocol, allowed_tools, model    |
| Agent      | `.claude/templates/agents/`      | name, description, tools, skills, model, enforcement_hooks | Frontmatter completeness, alignment sections |
| Skill      | `.claude/templates/skills/`      | name, version, tools, invoked_by                           | SKILL.md structure, memory protocol          |
| Workflow   | `.claude/templates/workflows/`   | phases, agents, dependencies                               | Phase ordering, agent references             |
| Report     | `.claude/templates/reports/`     | type, findings, recommendations                            | Finding severity, evidence requirements      |
| Code Style | `.claude/templates/code-styles/` | language, conventions, examples                            | Convention clarity, example quality          |
| Document   | `.claude/templates/` (root)      | varies by template type                                    | Section completeness                         |

### Step 3: Name Validation (SEC-TC-003)

**BEFORE constructing the output path, validate the template name.**

Template name MUST match this regex:

```
/^[a-z0-9][a-z0-9-]*[a-z0-9]$/
```

**Validation rules:**

- Lowercase letters, digits, and hyphens only
- Must start and end with a letter or digit (not a hyphen)
- No path separators (`/`, `\`), no `..`, no special characters
- No Windows reserved names (`nul`, `con`, `prn`, `aux`, `com1`-`com9`, `lpt1`-`lpt9`)

**Rejection examples:**

```
REJECTED: "../hooks/malicious-hook"  (path traversal)
REJECTED: "My Template"             (spaces, uppercase)
REJECTED: "-leading-hyphen"         (starts with hyphen)
REJECTED: "template_with_underscores" (underscores not allowed)
ACCEPTED: "security-audit-report"   (valid kebab-case)
ACCEPTED: "agent-template-v2"       (valid with version)
```

### Step 4: Determine Output Path

Based on the template type classification from Step 2, construct the output path:

```
.claude/templates/<category>/<validated-template-name>.md
```

Where `<category>` is one of: `spawn/`, `agents/`, `skills/`, `workflows/`, `reports/`, `code-styles/`, or root level (no category subdirectory).

**Validate the resolved path:**

- Path MUST start with `.claude/templates/`
- Path MUST NOT contain `..` segments after normalization
- Path MUST end with `.md`

### Step 5: Content Design

**Design the template content following these standards:**

#### Placeholder Format Standard

| Placeholder Type | Format                   | Example                    |
| ---------------- | ------------------------ | -------------------------- |
| Required field   | `{{FIELD_NAME}}`         | `{{AGENT_NAME}}`           |
| Optional field   | `{{FIELD_NAME:default}}` | `{{MODEL:sonnet}}`         |
| Multi-line       | `{{FIELD_NAME_BLOCK}}`   | `{{DESCRIPTION_BLOCK}}`    |
| List item        | `{{ITEM_N}}`             | `{{TOOL_1}}`, `{{TOOL_2}}` |

#### Template Structure

```markdown
---
# YAML Frontmatter with all required fields
name: { { NAME } }
description: { { DESCRIPTION } }
# ... other fields with documentation comments
---

# {{DISPLAY_NAME}}

## POST-CREATION CHECKLIST (BLOCKING - DO NOT SKIP)

<!-- Always include blocking checklist -->

## Overview

{{OVERVIEW_DESCRIPTION}}

## Sections

<!-- Domain-specific sections -->

## Memory Protocol (MANDATORY)

<!-- Always include memory protocol -->
```

#### Security Checklist for Spawn Templates (SEC-TC-001)

**If creating a SPAWN template, you MUST also verify:**

- [ ] No `{{PLACEHOLDER}}` tokens inside `prompt:` fields that accept unsanitized user input
- [ ] Reference to `sanitizeSubstitutionValue()` from `prompt-factory.cjs` included in documentation
- [ ] TaskUpdate protocol is present in the spawn prompt body
- [ ] `allowed_tools` array does not grant `Task` tool to non-orchestrator agents
- [ ] No prompt override patterns (`IGNORE PREVIOUS`, `SYSTEM:`, etc.) in template body
- [ ] Template size under 50KB

#### Documentation Comments

Add inline documentation for each placeholder:

```markdown
---
# [REQUIRED] Unique identifier, lowercase-with-hyphens
name: { { AGENT_NAME } }

# [REQUIRED] Single line, describes what it does AND when to use it
# Example: "Reviews mobile app UX against Apple HIG. Use for iOS UX audits."
description: { { DESCRIPTION } }

# [OPTIONAL] Default: sonnet. Options: haiku, sonnet, opus
model: { { MODEL:sonnet } }
---
```

### Step 6: Write Template File

Write to the validated output path determined in Step 4:

```bash
Write: .claude/templates/<category>/<template-name>.md
```

### Step 7: Validate Template Structure (BLOCKING)

**Before proceeding to registration, verify ALL requirements:**

**Structural Validation:**

```
[ ] YAML frontmatter is valid syntax
[ ] All required fields have placeholders
[ ] All placeholders follow {{UPPER_CASE}} naming convention
[ ] All placeholders have documentation comments
[ ] POST-CREATION CHECKLIST section present
[ ] Memory Protocol section present
[ ] Verification commands included
[ ] Example values provided where helpful
```

**Security Validation (SEC-TC-007):**

```
[ ] No secrets, credentials, or API keys in template content
[ ] No absolute file paths (use relative from PROJECT_ROOT)
[ ] No eval(), exec(), Function() or code execution patterns
[ ] No prompt override patterns ("IGNORE PREVIOUS", "SYSTEM:", etc.)
[ ] Template size under 50KB
```

**Verification Commands:**

```bash
# Check no unresolved placeholders from template-creator itself
grep "{{" <created-file> | head -5  # Should show only intended placeholders

# Check YAML frontmatter is present
head -50 <file> | grep -E "^---$" | wc -l  # Should be 2

# Check required sections present
grep -E "^## Memory Protocol" <file> || echo "ERROR: Missing Memory Protocol!"
```

**BLOCKING**: Template must pass ALL validation checks before proceeding.

### Step 8: Update Template Catalog (MANDATORY - BLOCKING)

Update the template catalog to ensure the new template is discoverable.

1. **Read current catalog:**

   ```bash
   cat .claude/context/artifacts/catalogs/template-catalog.md
   ```

2. **Determine template category** based on type:
   - Spawn (`spawn/`), Creator (`agents/`, `skills/`, `workflows/`), Document (root), Report (`reports/`), Code Style (`code-styles/`)

3. **Add template entry in correct category section:**

   ```markdown
   ### <template-name>.md

   | Field              | Value                                             |
   | ------------------ | ------------------------------------------------- |
   | **Path**           | `.claude/templates/<category>/<template-name>.md` |
   | **Category**       | <Category> Templates                              |
   | **Status**         | active                                            |
   | **Used By Agents** | <agent-list>                                      |
   | **Used By Skills** | <skill-list>                                      |

   **Purpose:** <Purpose description>
   ```

4. **Update Template Categories Summary table** (totals row)

5. **Verify update:**

   ```bash
   grep "<template-name>" .claude/context/artifacts/catalogs/template-catalog.md || echo "ERROR: CATALOG NOT UPDATED!"
   ```

**Important:** Use `JSON.stringify()` when constructing any JSON registry entries (SEC-TC-004). Never manually concatenate strings to build JSON. The `location` field MUST be validated to start with `.claude/templates/` and contain no `..` segments.

**BLOCKING**: Template must appear in catalog. Uncataloged templates are invisible.

### Step 9: Update Templates README (MANDATORY - BLOCKING)

After updating the catalog, update `.claude/templates/README.md`:

1. **Add to appropriate section** (or create new section)
2. **Document usage instructions**
3. **Add to Quick Reference table**

**Entry format:**

```markdown
### {{Template Type}} Templates (`{{directory}}/`)

Use when {{use case}}.

**File:** `{{directory}}/{{template-name}}.md`

**Usage:**

1. Copy template to `{{target-path}}`
2. Replace all `{{PLACEHOLDER}}` values
3. {{Additional steps}}
```

**Verification:**

```bash
grep "<template-name>" .claude/templates/README.md || echo "ERROR: README NOT UPDATED - BLOCKING!"
```

**BLOCKING**: README must contain the template entry.

### Step 10: Update CLAUDE.md (CONDITIONAL - BLOCKING)

If the template is framework-significant or user-invocable:

1. **Check if template needs CLAUDE.md entry:**
   - Is it a new spawn template? -> Update Section 2 (Spawn Templates)
   - Is it a new creator template? -> Update relevant creator section
   - Is it a user-invocable template? -> Update Section 8.5

2. **If YES, add entry:**

   ```markdown
   **{Template Name}:** `.claude/templates/{category}/{name}.md`
   ```

3. **Verify:**

   ```bash
   grep "<template-name>" .claude/CLAUDE.md || echo "WARNING: Template not in CLAUDE.md (may be OK if internal-only)"
   ```

**Note:** Not all templates need CLAUDE.md entries. Only framework-significant ones (spawn templates, creator templates) require this step.

### Step 11: Assign Consumer Agents

Templates exist to be consumed by creators and agents. After creation:

1. **Identify consumers** based on template type:
   - Agent templates -> agent-creator skill should reference
   - Skill templates -> skill-creator skill should reference
   - Workflow templates -> workflow-creator skill should reference
   - Report templates -> relevant agents (qa, developer, etc.)
   - Spawn templates -> router documentation, spawn-template-resolver
   - Code style templates -> developer, code-reviewer

2. **Update consuming skill/agent to reference the template:**

   ```markdown
   **Available Templates:**

   - See `.claude/templates/<category>/<template-name>.md` for standardized <type> template
   ```

3. **Verify at least one consumer references the template:**

   ```bash
   grep -r "<template-name>" .claude/skills/ .claude/agents/ || echo "WARNING: No consumer references template"
   ```

**WHY:** Templates without consumers are dead on arrival. Every template MUST have at least one consuming skill or agent.

### Step 12: Integration Verification (BLOCKING - DO NOT SKIP)

**This step verifies the artifact is properly integrated into the ecosystem.**

Before calling `TaskUpdate({ status: "completed" })`, run the post-creation validation:

1. **Run the integration checklist:**

   ```bash
   node .claude/tools/cli/validate-integration.cjs .claude/templates/<category>/<template-name>.md
   ```

2. **Verify exit code is 0** (all checks passed)

3. **If exit code is 1** (one or more checks failed):
   - Read the error output for specific failures
   - Fix each failure:
     - Missing README entry -> Add to `.claude/templates/README.md`
     - Missing catalog entry -> Add to `template-catalog.md`
     - Missing memory update -> Update `learnings.md`
   - Re-run validation until exit code is 0

4. **Only proceed when validation passes**

**This step is BLOCKING.** Do NOT mark task complete until validation passes.

**Why this matters:** The Party Mode incident showed that fully-implemented artifacts can be invisible to the Router if integration steps are missed. This validation ensures no "invisible artifact" pattern.

**Reference:** `.claude/workflows/core/post-creation-validation.md`

### Step 13: Completion Checklist (BLOCKING)

**All items MUST pass before template creation is complete:**

```
[ ] Research-synthesis skill invoked (Step 0)
[ ] Existence check passed (no duplicate template)
[ ] Template name validates against /^[a-z0-9][a-z0-9-]*[a-z0-9]$/ (Step 3)
[ ] Template file created at .claude/templates/<category>/<name>.md
[ ] All placeholders use {{PLACEHOLDER_NAME}} format
[ ] All placeholders have documentation comments
[ ] POST-CREATION CHECKLIST section present in template
[ ] Memory Protocol section present in template
[ ] No hardcoded values (all configurable via placeholders)
[ ] No secrets, credentials, or absolute paths in template (SEC-TC-007)
[ ] No eval() or code execution patterns in template
[ ] template-catalog.md updated with structured entry (Step 8)
[ ] .claude/templates/README.md updated with template entry (Step 9)
[ ] CLAUDE.md updated if template is framework-significant (Step 10)
[ ] At least one consuming skill/agent references the template (Step 11)
[ ] Integration verification passed (Step 12)
[ ] Template tested with at least one real usage
[ ] Memory files updated (learnings.md)
```

**BLOCKING**: If ANY item fails, template creation is INCOMPLETE. Fix all issues before proceeding.

---

## Architecture Compliance

### File Placement (ADR-076)

- Templates: `.claude/templates/{category}/` (spawn, agents, skills, workflows, reports, code-styles)
- Archived templates: `.claude/templates/_archive/`
- Template catalog: `.claude/context/artifacts/catalogs/template-catalog.md`
- Tests: `tests/` (NOT in `.claude/`)

### Documentation References (CLAUDE.md v3.1.0)

- Reference files use @notation: @TOOL_REFERENCE.md, @SKILL_CATALOG_TABLE.md
- Located in: `.claude/docs/@*.md`
- See: CLAUDE.md Section 2 (Spawn Templates)

### Shell Security (ADR-077)

- Spawn templates MUST include: `cd "$PROJECT_ROOT" || exit 1` for background tasks
- Environment variables control validators (block/warn/off mode)
- See: `.claude/docs/SHELL-SECURITY-GUIDE.md`
- Apply to: all spawn templates, background task templates

### Security Compliance (ADR-085, ADR-086, SEC-TMPL-006)

- Templates MUST NOT include hardcoded secrets, credentials, or API keys
- Templates MUST use relative paths (`.claude/templates/...`), never absolute paths
- Templates MUST NOT expose internal system paths or user directories
- Retention mandates: security-design-checklist.md and error-recovery-template.md must remain at designated locations
- Spawn template placeholder sanitization: reference `sanitizeSubstitutionValue()` in `prompt-factory.cjs`

### Recent ADRs

- ADR-075: Router Config-Aware Model Selection
- ADR-076: File Placement Architecture Redesign
- ADR-077: Shell Command Security Architecture
- ADR-085: Template System Overhaul (spawn resolver + dead template cleanup)
- ADR-086: Template-Creator Overhaul to v2.1 Creator Standard

---

## Iron Laws of Template Creation

These rules are INVIOLABLE. Breaking them causes inconsistency across the framework.

```
1. NO TEMPLATE WITHOUT PLACEHOLDER DOCUMENTATION
   - Every {{PLACEHOLDER}} must have an inline comment
   - Comments explain valid values and examples

2. NO TEMPLATE WITHOUT POST-CREATION CHECKLIST
   - Users must know what to do after using template
   - Blocking steps prevent incomplete artifacts

3. NO TEMPLATE WITHOUT MEMORY PROTOCOL
   - All templates must include Memory Protocol section
   - Ensures artifacts created from template follow memory rules

4. NO TEMPLATE WITHOUT README UPDATE
   - Templates README must document new template
   - Undocumented templates are invisible

5. NO PLACEHOLDER WITHOUT NAMING CONVENTION
   - Use {{UPPER_CASE_WITH_UNDERSCORES}}
   - Never use lowercase or mixed case

6. NO OPTIONAL FIELD WITHOUT DEFAULT
   - Format: {{FIELD:default_value}}
   - Makes templates usable without full customization

7. NO TEMPLATE WITHOUT VERIFICATION COMMANDS
   - Include commands to validate created artifacts
   - Users can verify their work is correct

8. NO AGENT TEMPLATE WITHOUT ALIGNMENT SECTIONS
   - Agent templates MUST include {{ENFORCEMENT_HOOKS}} placeholder section
   - Agent templates MUST include {{RELATED_WORKFLOWS}} placeholder section
   - Agent templates MUST include Output Standards block referencing workspace-conventions
   - Reference: @HOOK_AGENT_MAP.md and @WORKFLOW_AGENT_MAP.md for archetype sets

9. NO TEMPLATE WITHOUT CATALOG ENTRY
   - Every template MUST be registered in template-catalog.md
   - Uncataloged templates are invisible to the system
   - Verify: grep "<template-name>" .claude/context/artifacts/catalogs/template-catalog.md

10. NO TEMPLATE WITHOUT CONSUMING SKILL/AGENT
    - Every template MUST be referenced by at least one consuming skill or agent
    - Templates without consumers are dead on arrival
    - Verify: grep -r "<template-name>" .claude/skills/ .claude/agents/

11. NO CREATION WITHOUT RESEARCH-SYNTHESIS
    - Per CLAUDE.md Section 3, research-synthesis MUST be invoked before any creator
    - Template creation is no exception
    - Invoke: Skill({ skill: 'research-synthesis' })
```

---

## Reference Template

**Use `.claude/templates/spawn/universal-agent-spawn.md` as the canonical reference template.**

Before finalizing any template, compare:

- [ ] Has clear placeholder documentation
- [ ] Placeholders are UPPERCASE with underscores
- [ ] Has usage examples section
- [ ] Has integration notes
- [ ] Has POST-CREATION CHECKLIST
- [ ] Has Memory Protocol

---

## Template Best Practices

### Placeholder Standards

| Practice        | Good                | Bad                        |
| --------------- | ------------------- | -------------------------- |
| Naming          | `{{AGENT_NAME}}`    | `{{name}}`, `{AGENT_NAME}` |
| Required fields | Always present      | Sometimes omitted          |
| Optional fields | `{{FIELD:default}}` | No default indicator       |
| Documentation   | Inline comments     | Separate docs file         |
| Examples        | In comments         | None provided              |

### Structure Standards

1. **YAML Frontmatter First**
   - All machine-readable metadata
   - Comments explaining each field

2. **POST-CREATION CHECKLIST Second**
   - Blocking steps after using template
   - Verification commands

3. **Content Sections**
   - Follow existing pattern for type
   - Include all required sections

4. **Memory Protocol Last**
   - Standard format across all templates
   - Always present

### Validation Examples

Include validation examples in templates:

````markdown
## Validation

After replacing placeholders, validate:

```bash
# Check YAML is valid
head -50 <file> | grep -E "^---$" | wc -l  # Should be 2

# Check no unresolved placeholders
grep "{{" <file> && echo "ERROR: Unresolved placeholders!"

# Check required sections present
grep -E "^## Memory Protocol" <file> || echo "ERROR: Missing Memory Protocol!"
```
````

---

## System Impact Analysis (MANDATORY)

After creating a template, complete this 7-point analysis:

```
[TEMPLATE-CREATOR] System Impact Analysis for: <template-name>

1. README UPDATE (MANDATORY - Step 9)
   - Added to .claude/templates/README.md
   - Usage instructions documented
   - Quick Reference table updated

2. CATALOG UPDATE (MANDATORY - Step 8)
   - Added to .claude/context/artifacts/catalogs/template-catalog.md
   - Category, status, agents, skills documented
   - Purpose clearly stated

3. CLAUDE.MD UPDATE (CONDITIONAL - Step 10)
   - Is template framework-significant? If yes, add to CLAUDE.md
   - Spawn templates -> Section 2
   - Creator templates -> relevant creator section
   - User-invocable -> Section 8.5

4. CONSUMER ASSIGNMENT (MANDATORY - Step 11)
   - Which skills/agents consume this template?
   - Is template reference added to consuming creator skill?
   - Verify with grep across skills/ and agents/

5. RELATED TEMPLATES CHECK
   - Does this template supersede an existing one?
   - Are there related templates that need cross-references?
   - Should archived templates be updated or removed?

6. SECURITY COMPLIANCE (SEC-TMPL-006, SEC-TC-001, SEC-TC-007)
   - No secrets, credentials, or absolute paths
   - Relative paths only
   - Retention mandates respected
   - Spawn template placeholders sanitized

7. MEMORY UPDATE
   - Record creation in learnings.md
   - Document any decisions in decisions.md
```

---

## Workflow Integration

This skill is part of the unified artifact lifecycle. For complete multi-agent orchestration:

**Router Decision:** `.claude/workflows/core/router-decision.md`

- How the Router discovers and invokes this skill's artifacts

**Artifact Lifecycle:** `.claude/workflows/core/skill-lifecycle.md`

- Discovery, creation, update, deprecation phases
- Version management and registry updates
- CLAUDE.md integration requirements

**External Integration:** `.claude/workflows/core/external-integration.md`

- Safe integration of external artifacts
- Security review and validation phases

**Spawn Template Resolver:** `.claude/lib/spawn/spawn-template-resolver.cjs`

- Programmatic template selection for spawn operations
- Template scoring and fallback logic

---

## Cross-Reference: Creator Ecosystem

This skill is part of the **Creator Ecosystem**. Use companion creators when needed:

| Gap Discovered                           | Required Artifact | Creator to Invoke                      | When                              |
| ---------------------------------------- | ----------------- | -------------------------------------- | --------------------------------- |
| Domain knowledge needs a reusable skill  | skill             | `Skill({ skill: 'skill-creator' })`    | Gap is a full skill domain        |
| Existing skill has incomplete coverage   | skill update      | `Skill({ skill: 'skill-updater' })`    | Close skill exists but incomplete |
| Capability needs a dedicated agent       | agent             | `Skill({ skill: 'agent-creator' })`    | Agent to own the capability       |
| Existing agent needs capability update   | agent update      | `Skill({ skill: 'agent-updater' })`    | Close agent exists but incomplete |
| Domain needs code/project scaffolding    | template          | `Skill({ skill: 'template-creator' })` | Reusable code patterns needed     |
| Behavior needs pre/post execution guards | hook              | `Skill({ skill: 'hook-creator' })`     | Enforcement behavior required     |
| Process needs multi-phase orchestration  | workflow          | `Skill({ skill: 'workflow-creator' })` | Multi-step coordination needed    |
| Artifact needs structured I/O validation | schema            | `Skill({ skill: 'schema-creator' })`   | JSON schema for artifact I/O      |
| User interaction needs a slash command   | command           | `Skill({ skill: 'command-creator' })`  | User-facing shortcut needed       |
| Repeated logic needs a reusable CLI tool | tool              | `Skill({ skill: 'tool-creator' })`     | CLI utility needed                |
| Narrow/single-artifact capability only   | inline            | Document within this artifact only     | Too specific to generalize        |

### Integration Workflow

After creating a template that needs additional artifacts:

```javascript
// 1. Template created for new hook type
// 2. Need to create example hook using template
Skill({ skill: 'hook-creator' });

// 3. Template created for new agent category
// 4. Need to update agent-creator to recognize new category
// Edit .claude/skills/agent-creator/SKILL.md to add category
```

### Post-Creation Checklist for Ecosystem Integration

After template is fully created and validated:

```
[ ] Does template need a companion skill? -> Use skill-creator
[ ] Does template need a companion workflow? -> Use workflow-creator
[ ] Does template supersede an existing template? -> Archive old one
[ ] Should template be part of enterprise workflows? -> Update Section 8.6
[ ] Does template interact with spawn-template-resolver? -> Update resolver config
```

---

## File Placement & Standards

### Output Location Rules

This skill outputs to: `.claude/templates/`

Subdirectories by type:

- `spawn/` - Agent spawn prompt templates (4 templates)
- `agents/` - Agent definition templates (2 templates)
- `skills/` - Skill definition templates (1 template)
- `workflows/` - Workflow definition templates (1 template)
- `reports/` - Report document templates (5 templates)
- `code-styles/` - Language style guides (3 templates)
- Root level - General document templates (8+ templates)
- `_archive/` - Archived/deprecated templates (14 templates)

### Mandatory References

- **File Placement**: See `.claude/docs/FILE_PLACEMENT_RULES.md`
- **Developer Workflow**: See `.claude/docs/DEVELOPER_WORKFLOW.md`
- **Artifact Naming**: See `.claude/docs/ARTIFACT_NAMING.md`
- **Workspace Conventions**: See `.claude/rules/workspace-conventions.md` (output placement, naming, provenance)

### Enforcement

File placement is enforced by `file-placement-guard.cjs` hook.
Invalid placements will be blocked in production mode.

---

## Assigned Agents

This skill is typically invoked by:

| Agent     | Role                     | Assignment Reason                             |
| --------- | ------------------------ | --------------------------------------------- |
| planner   | Planning standardization | Creates templates for new patterns            |
| architect | Architecture patterns    | Creates templates for architectural artifacts |
| developer | Code patterns            | Creates code scaffolding templates            |

**To invoke this skill:**

```javascript
Skill({ skill: 'template-creator' });
```

---

## Examples

### Example 1: Creating a Report Template

**Request:** "Create a template for security audit reports"

**Process:**

1. **Research**: Invoke `research-synthesis`, review existing report templates in `.claude/templates/reports/`
2. **Gather**: Analyze report type, security focus, audit findings structure
3. **Validate name**: `security-audit-report-template` matches `/^[a-z0-9][a-z0-9-]*[a-z0-9]$/`
4. **Design**: Structure for security audit reports
5. **Create**: `.claude/templates/reports/security-audit-report-template.md`

```markdown
---
# [REQUIRED] Report identifier, lowercase-with-hyphens
name: { { REPORT_NAME } }

# [REQUIRED] What this report documents
description: { { REPORT_DESCRIPTION } }

# [REQUIRED] Report type: audit, implementation, research, reflection, plan
type: audit

# [REQUIRED] Severity levels for findings
severity_levels: [CRITICAL, HIGH, MEDIUM, LOW]
---

# {{REPORT_DISPLAY_NAME}} Report

## POST-CREATION CHECKLIST (BLOCKING)

After creating this report:

- [ ] All findings categorized by severity
- [ ] Recommendations actionable and specific
- [ ] Evidence provided for all claims

## Findings

### CRITICAL

{{CRITICAL_FINDINGS}}

### HIGH

{{HIGH_FINDINGS}}

## Recommendations

{{RECOMMENDATIONS}}

## Memory Protocol (MANDATORY)

**Before starting:** Read `.claude/context/memory/learnings.md`
**After completing:** Record patterns to learnings.md
```

1. **Update catalog**: Add to template-catalog.md under Report Templates
2. **Update README**: Add to reports section in templates README
3. **Assign consumers**: Update security-architect and qa agent references
4. **Update memory**: Record in learnings.md

### Example 2: Creating a Spawn Template

**Request:** "Create a template for specialized agent spawn prompts"

**Process:**

1. **Research**: Invoke `research-synthesis`, review `.claude/templates/spawn/universal-agent-spawn.md`
2. **Gather**: Analyze spawn pattern, specialized vs general-purpose
3. **Validate name**: Template name matches name regex
4. **Design**: Structure for spawn prompts with security considerations (SEC-TC-001)
5. **Create**: `.claude/templates/spawn/{template-name}.md`

```markdown
---
# [REQUIRED] Template identifier
name: { { TEMPLATE_NAME } }

# [REQUIRED] Agent type this template spawns
agent_type: { { AGENT_TYPE } }

# [REQUIRED] Recommended model: haiku, sonnet, opus
model: { { MODEL:sonnet } }

# [OPTIONAL] Task complexity level
complexity: { { COMPLEXITY:medium } }
---

# {{AGENT_DISPLAY_NAME}} Spawn Template

## Security Notice (SEC-TC-001)

Placeholder values substituted into the `prompt:` field MUST be sanitized using
`sanitizeSubstitutionValue()` from `prompt-factory.cjs` before substitution.
This prevents prompt injection via user-provided task descriptions.

## Usage

Use this template when spawning {{AGENT_TYPE}} agents.

## Spawn Pattern

Task({
subagent_type: '{{AGENT_TYPE}}',
model: '{{MODEL}}',
task_id: '{{TASK_ID}}',
prompt: 'You are {{AGENT_IDENTITY}}. ... TaskUpdate protocol ...'
});

## Validation

After using this template:

- [ ] task_id is unique and matches prompt
- [ ] Model matches agent complexity requirements
- [ ] TaskUpdate protocol included in prompt
- [ ] Success criteria clearly defined
- [ ] No unsanitized user input in prompt field
```

1. **Update catalog**: Add to template-catalog.md under Spawn Templates
2. **Update README**: Add to spawn section in templates README
3. **Update CLAUDE.md**: Add to Section 2 (Spawn Templates) if framework-standard
4. **Assign consumers**: Update router and spawn-template-resolver references
5. **Update memory**: Record in learnings.md

---

## Troubleshooting

### Issue: Placeholders Not Rendering

**Symptoms:** `{{PLACEHOLDER}}` appears in final file

**Solution:**

- Check placeholder format (double braces, UPPER_CASE)
- Ensure user replaced all placeholders
- Add validation command to catch unreplaced

### Issue: Template Not Discoverable

**Symptoms:** Template exists but not found by creators

**Solution:**

- Verify template-catalog.md is updated (Step 8)
- Verify README.md is updated (Step 9)
- Check file is in correct directory
- Run: `grep "<template-name>" .claude/context/artifacts/catalogs/template-catalog.md`

### Issue: Inconsistent Template Structure

**Symptoms:** Different templates have different formats

**Solution:**

- Review existing templates before creating
- Use this skill's patterns
- Compare against reference template (universal-agent-spawn.md)
- Run consistency check across templates

### Issue: Spawn Template Injection Risk

**Symptoms:** User-provided content in spawn template placeholder could manipulate agent behavior

**Solution:**

- Review SEC-TC-001 guidance in this skill
- Ensure `sanitizeSubstitutionValue()` is referenced
- Do not place `{{PLACEHOLDER}}` tokens directly in `prompt:` fields for user input
- Use structured task descriptions that separate user content from system instructions

### Issue: Creator Guard Blocking Template Write

**Symptoms:** `unified-creator-guard.cjs` blocks your template write

**Solution:**

- Ensure you invoked this skill properly: `Skill({ skill: 'template-creator' })`
- Check that the creator state is active (3-minute TTL)
- If debugging: `CREATOR_GUARD=warn` (temporary, restore to `block` after)
- Never use `CREATOR_GUARD=off` in production

---

## Memory Protocol (MANDATORY)

**Before starting:**

```bash
cat .claude/context/memory/learnings.md
```

Check for:

- Previously created templates
- Known template patterns
- User preferences for template behavior

**After completing:**

- New template pattern -> `.claude/context/memory/learnings.md`
- Issue found -> `.claude/context/memory/issues.md`
- Decision made -> `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.

---

## Post-Creation Integration

After creation completes, run the ecosystem integration checklist:

1. Call `runIntegrationChecklist(artifactType, artifactPath)` from `.claude/lib/creators/creator-commons.cjs`
2. Call `queueCrossCreatorReview(artifactType, artifactPath)` from `.claude/lib/creators/creator-commons.cjs`
3. Review the impact report — address all `mustHave` items before marking task complete
4. Log any `shouldHave` items as follow-up tasks

**Integration verification:**

- [ ] Template added to template-catalog.md
- [ ] Template README exists at template location
- [ ] Template assigned to consuming skill(s)
- [ ] Template examples provided

## Ecosystem Alignment Contract (MANDATORY)

This creator skill is part of a coordinated creator ecosystem. Any artifact created here must align with and validate against related creators:

- `agent-creator` for ownership and execution paths
- `skill-creator` for capability packaging and assignment
- `tool-creator` for executable automation surfaces
- `hook-creator` for enforcement and guardrails
- `rule-creator` and `semgrep-rule-creator` for policy and static checks
- `template-creator` for standardized scaffolds
- `workflow-creator` for orchestration and phase gating
- `command-creator` for user/operator command UX

### Cross-Creator Handshake (Required)

Before completion, verify all relevant handshakes:

1. Artifact route exists in `.claude/CLAUDE.md` and related routing docs.
2. Discovery/registry entries are updated (catalog/index/registry as applicable).
3. Companion artifacts are created or explicitly waived with reason.
4. `validate-integration.cjs` passes for the created artifact.
5. Skill index is regenerated when skill metadata changes.

### Research Gate (Exa + arXiv — BOTH MANDATORY)

For new patterns, templates, or workflows, research is mandatory:

1. Use Exa for implementation and ecosystem patterns:
   - `mcp__Exa__web_search_exa({ query: '<topic> 2025 best practices' })`
   - `mcp__Exa__get_code_context_exa({ query: '<topic> implementation examples' })`
2. Search arXiv for academic research (mandatory for AI/ML, agents, evaluation, orchestration, memory/RAG, security):
   - Via Exa: `mcp__Exa__web_search_exa({ query: 'site:arxiv.org <topic> 2024 2025' })`
   - Direct API: `WebFetch({ url: 'https://arxiv.org/search/?query=<topic>&searchtype=all&start=0' })`
3. Record decisions, constraints, and non-goals in artifact references/docs.
4. Keep updates minimal and avoid overengineering.

**arXiv is mandatory (not fallback) when topic involves:** AI agents, LLM evaluation, orchestration, memory/RAG, security, static analysis, or any emerging methodology.

### Regression-Safe Delivery

- Follow strict RED -> GREEN -> REFACTOR for behavior changes.
- Run targeted tests for changed modules.
- Run lint/format on changed files.
- Keep commits scoped by concern (logic/docs/generated artifacts).

## Optional: Evaluation Quality Gate

Run the shared evaluation framework to verify template quality:

```bash
node .claude/skills/skill-creator/scripts/eval-runner.cjs --skill template-creator
```

Grader assertions for template artifacts:

- **Placeholder tokens documented**: All `<PLACEHOLDER>` tokens are listed with descriptions; no undocumented substitution points remain after rendering
- **Output structure matches pattern**: Rendered template output matches the documented structure for its type (spawn, artifact, code)
- **Spawn budget size limit**: Spawn templates render under 50KB (PROMPT_LENGTH_WARNING threshold); templates exceeding this trigger a size audit
- **Catalog entry present**: Template is registered in `.claude/context/artifacts/catalogs/template-catalog.md` with type, purpose, and placeholder inventory
- **Consuming skill documented**: At least one skill or agent references this template in its workflow

See `.claude/skills/skill-creator/EVAL_WORKFLOW.md` for full evaluation protocol and grader/analyzer agent usage.
