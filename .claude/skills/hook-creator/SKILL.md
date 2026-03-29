---
name: hook-creator
description: 'Creates and registers hooks for the Claude Code framework. Handles pre/post tool execution, validation, memory, and session hooks. Use when new validation, safety, or automation hooks are needed.'
version: 2.3.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Edit, Bash, Glob, Grep]
dependencies: [research-synthesis]
# Phase 1 Integration: Hook validation references .claude/config/tool-manifest.json
# Hooks can validate tool availability and use fallback tools from the manifest
# Single source of truth: .claude/config/tool-manifest.json
best_practices:
  - Always register hooks in appropriate config
  - Test hooks before deployment
  - Include error handling in all hooks
  - Document hook triggers and behavior
  - Use explicit enforcement modes (block|warn|off) with env overrides; default warn unless spec requires block
error_handling: graceful
streaming: supported
output_location: .claude/hooks/
verified: true
lastVerifiedAt: '2026-02-28'
---

# Hook Creator Skill

Creates, validates, and registers hooks for the multi-agent orchestration framework.

## ROUTER UPDATE REQUIRED (CRITICAL - DO NOT SKIP)

**After creating ANY hook, you MUST update documentation:**

```
1. Add to .claude/hooks/README.md under appropriate category
2. Register in config.yaml or settings.json if required
3. Update learnings.md with hook summary
```

**Verification:**

```bash
grep "<hook-name>" .claude/hooks/README.md || echo "ERROR: hooks/README.md NOT UPDATED!"
```

**WHY**: Hooks not documented are invisible and unmaintainable.

---

## Overview

This skill creates hooks for the Claude Code framework:

- **Pre-tool execution** - Safety validation before commands run
- **Post-tool execution** - Logging, memory updates, telemetry
- **Session lifecycle** - Initialize context, cleanup on exit
- **Memory management** - Auto-extract learnings, format memory files
- **Routing enforcement** - Ensure Router-First protocol compliance

## Hook Types

| Type    | Location                 | Purpose                                 | When Triggered         |
| ------- | ------------------------ | --------------------------------------- | ---------------------- |
| Safety  | `.claude/hooks/safety/`  | Validate commands, block dangerous ops  | Before Bash/Write/Edit |
| Memory  | `.claude/hooks/memory/`  | Auto-update learnings, extract insights | After task completion  |
| Routing | `.claude/hooks/routing/` | Enforce router-first protocol           | On UserPromptSubmit    |
| Session | `.claude/hooks/session/` | Initialize/cleanup sessions             | Session start/end      |

## Hook-Agent Archetype Reference

When creating hooks, determine which agent archetypes will be governed by the new hook. See `.claude/docs/@HOOK_AGENT_MAP.md` for:

- **Section 1**: Full hook-agent matrix
- **Section 2**: Archetype hook sets (Router, Implementer, Reviewer, Documenter, Orchestrator, Researcher)

After creating a hook, you MUST add it to both the matrix AND update affected agents' `## Enforcement Hooks` sections.

## Claude Code Hook Types

| Hook Event         | When Triggered            | Use Case                                |
| ------------------ | ------------------------- | --------------------------------------- |
| `PreToolUse`       | Before tool executes      | Validation, blocking, permission checks |
| `PostToolUse`      | After tool completes      | Logging, cleanup, notifications         |
| `UserPromptSubmit` | Before model sees message | Routing, intent analysis, filtering     |

## Workflow Steps

### Step 0: Existence Check and Updater Delegation (MANDATORY - FIRST STEP)

**BEFORE creating any hook file, check if it already exists:**

1. **Check if hook already exists:**

   ```bash
   test -f .claude/hooks/<category>/<hook-name>.cjs && echo "EXISTS" || echo "NEW"
   ```

2. **If hook EXISTS:**
   - **DO NOT proceed with creation**
   - **Invoke artifact-updater workflow instead:**

     ```javascript
     Skill({
       skill: 'artifact-updater',
       args: '--type hook --path .claude/hooks/<category>/<hook-name>.cjs --changes "<description of requested changes>"',
     });
     ```

   - **Return updater result and STOP**

3. **If hook is NEW:**
   - Continue with Step 0.5 below

---

### Step 0.1: Smart Duplicate Detection (MANDATORY)

Before proceeding with creation, run the 3-layer duplicate check:

```javascript
const { checkDuplicate } = require('.claude/lib/creation/duplicate-detector.cjs');
const result = checkDuplicate({
  artifactType: 'hook',
  name: proposedName,
  description: proposedDescription,
  keywords: proposedKeywords || [],
});
```

**Handle results:**

- **`EXACT_MATCH`**: Stop creation. Route to `hook-updater` skill instead: `Skill({ skill: 'hook-updater' })`
- **`REGISTRY_MATCH`**: Warn user — artifact is registered but file may be missing. Investigate before creating. Ask user to confirm.
- **`SIMILAR_FOUND`**: Display candidates with scores. Ask user: "Similar artifact(s) exist. Continue with new creation or update existing?"
- **`NO_MATCH`**: Proceed to Step 0.5 (companion check).

**Override**: If user explicitly passes `--force`, skip this check entirely.

---

### Step 0.5: Companion Check

Before proceeding with creation, run the ecosystem companion check:

1. Use `companion-check.cjs` from `.claude/lib/creators/companion-check.cjs`
2. Call `checkCompanions("hook", "{hook-name}")` to identify companion artifacts
3. Review the companion checklist — note which required/recommended companions are missing
4. Plan to create or verify missing companions after this artifact is complete
5. Include companion findings in post-creation integration notes

This step is **informational** (does not block creation) but ensures the full artifact ecosystem is considered.

---

### Reference Hook

**Use `.claude/lib/routing/routing-table.cjs` as the canonical routing reference.**

Before finalizing any hook, compare against routing-table structure:

- [ ] Has proper CommonJS exports (module.exports)
- [ ] Exports required functions for hook type (validate, main, etc.)
- [ ] Has comprehensive test file (.test.cjs)
- [ ] Has proper error handling (try/catch, graceful fallbacks)
- [ ] Returns correct response format for hook type

### Step 1: Gather Hook Requirements

Before creating a hook, gather:

1. **Purpose**: What should this hook do?
2. **Trigger**: When should it run? (pre-tool, post-tool, session event)
3. **Target tools**: Which tools does it apply to? (Bash, Write, Edit, Read)
4. **Behavior**: Block operation or warn only?
5. **Exit codes**: What indicates success/failure?

```javascript
// Example requirements gathering
{
  purpose: "Validate git push commands to prevent force push",
  trigger: "pre-tool (Bash)",
  target_tools: ["Bash"],
  behavior: "block if force push detected",
  exit_codes: { 0: "allow", 1: "block" }
}
```

### Step 2: Determine Hook Type and Location

| If hook does...      | Type    | Location                 |
| -------------------- | ------- | ------------------------ |
| Validates commands   | Safety  | `.claude/hooks/safety/`  |
| Modifies routing     | Routing | `.claude/hooks/routing/` |
| Updates memory       | Memory  | `.claude/hooks/memory/`  |
| Session init/cleanup | Session | `.claude/hooks/session/` |

**Naming Convention:** `<action>-<target>.cjs`

Examples:

- `validate-git-force-push.cjs`
- `enforce-tdd-workflow.cjs`
- `extract-workflow-learnings.cjs`
- `memory-reminder.cjs`

### Step 3: Generate Hook Code (CJS Format)

All hooks use CommonJS format and follow this template:

```javascript
'use strict';

/**
 * {Hook Name}
 *
 * Type: {pre|post}-{tool} | session-{start|end} | user-prompt
 * Purpose: {One line description}
 * Trigger: {When this hook runs}
 *
 * Exit codes:
 * - 0: Allow operation (with optional warning)
 * - 1: Block operation (when in blocking mode)
 *
 * Environment:
 *   {HOOK_NAME}_MODE=block|warn|off (default: warn unless explicitly required)
 */

const fs = require('fs');
const path = require('path');

// Find project root by looking for .claude directory
function findProjectRoot() {
  let dir = __dirname;
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, '.claude'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();
const ENFORCEMENT_MODE = process.env.HOOK_NAME_MODE || 'warn';

/**
 * Parse hook input from Claude Code
 * Claude Code passes JSON via process.argv[2] for hooks
 * @returns {Object|null} Parsed hook input or null
 */
function parseHookInput() {
  try {
    if (process.argv[2]) {
      return JSON.parse(process.argv[2]);
    }
  } catch (e) {
    // Fallback for testing or invalid input
  }
  return null;
}

/**
 * Validate hook - called by Claude Code or programmatically
 * @param {Object} context - Hook context with tool info
 * @param {string} context.tool - Tool name (Bash, Write, Edit, Read)
 * @param {Object} context.parameters - Tool parameters
 * @returns {Object} Validation result with valid (boolean), error (string), and optional warning (string)
 */
function validate(context) {
  const { tool, parameters } = context;

  // YOUR VALIDATION LOGIC HERE

  // Return validation result
  return { valid: true, error: '' };
}

/**
 * Main execution for CLI hook usage
 */
function main() {
  // Skip if enforcement is off
  if (ENFORCEMENT_MODE === 'off') {
    process.exit(0);
  }

  const hookInput = parseHookInput();
  if (!hookInput) {
    process.exit(0);
  }

  // Get tool name and input
  const toolName = hookInput.tool_name || hookInput.tool;
  const toolInput = hookInput.tool_input || hookInput.input || {};

  // Run validation
  const result = validate({ tool: toolName, parameters: toolInput });

  if (!result.valid) {
    if (ENFORCEMENT_MODE === 'block') {
      console.error(`BLOCKED: ${result.error}`);
      process.exit(1);
    } else {
      console.warn(`WARNING: ${result.error}`);
      process.exit(0);
    }
  }

  if (result.warning) {
    console.warn(`WARNING: ${result.warning}`);
  }

  process.exit(0);
}

// Run main if executed directly
if (require.main === module) {
  main();
}

// Export for programmatic use and testing
module.exports = {
  validate,
  findProjectRoot,
  PROJECT_ROOT,
};
```

### Step 4: Create Test File

Every hook MUST have a corresponding test file:

```javascript
'use strict';

const { validate } = require('./hook-name.cjs');

describe('Hook Name', () => {
  test('allows valid operations', () => {
    const result = validate({
      tool: 'Bash',
      parameters: { command: 'git status' },
    });
    expect(result.valid).toBe(true);
    expect(result.error).toBe('');
  });

  test('blocks dangerous operations', () => {
    const result = validate({
      tool: 'Bash',
      parameters: { command: 'git push --force' },
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('force push');
  });

  test('handles missing parameters gracefully', () => {
    const result = validate({
      tool: 'Bash',
      parameters: {},
    });
    expect(result.valid).toBe(true);
  });
});
```

### Step 5: Register Hook (If Needed)

Some hooks require registration in config files:

**For pre/post-tool hooks (settings.json):**

```json
{
  "hooks": {
    "pre-tool": [".claude/hooks/safety/hook-name.cjs"],
    "post-tool": [".claude/hooks/memory/hook-name.cjs"]
  }
}
```

**For event hooks (config.yaml):**

```yaml
hooks:
  UserPromptSubmit:
    - path: .claude/hooks/routing/hook-name.cjs
      type: command
  SessionStart:
    - path: .claude/hooks/session/hook-name.cjs
      type: command
```

### Step 6: Update Documentation (MANDATORY - BLOCKING)

After creating a hook, update `.claude/hooks/README.md`:

```markdown
#### {Hook Name} (`hook-name.cjs`)

{Description of what the hook does}

**When it runs:** {Trigger condition}
**What it checks/does:** {Detailed behavior}
```

Verify with:

```bash
grep "hook-name" .claude/hooks/README.md || echo "ERROR: Not documented!"
```

### Step 7: System Impact Analysis (MANDATORY)

**This analysis is MANDATORY. Hook creation is INCOMPLETE without it.**

After creating a hook:

1. **Settings Registration (BLOCKING)**
   - Add to .claude/settings.json PreToolUse/PostToolUse/etc.
   - Verify with: `grep "hook-name" .claude/settings.json`

2. **Test Coverage (BLOCKING)**
   - Create .test.cjs file with minimum 10 test cases
   - Run tests: `node .claude/hooks/<category>/<name>.test.cjs`

3. **Documentation**
   - Update .claude/docs/ if hook adds new capability
   - Add usage examples

4. **Related Hooks**
   - Check if hook affects other hooks in same trigger category
   - Document interaction patterns

**Full Checklist:**

```
[HOOK-CREATOR] System Impact Analysis for: <hook-name>

1. HOOK FILE CREATED
   [ ] Created at .claude/hooks/<type>/<hook-name>.cjs
   [ ] Follows CJS format with validate() export
   [ ] Has main() function for CLI execution
   [ ] Handles graceful degradation (warn by default)

2. TEST FILE CREATED (minimum 10 test cases)
   [ ] Created at .claude/hooks/<type>/<hook-name>.test.cjs
   [ ] Tests valid operations (3+ cases)
   [ ] Tests blocked operations (3+ cases)
   [ ] Tests edge cases (3+ cases)
   [ ] Tests error handling (1+ cases)

3. DOCUMENTATION UPDATED
   [ ] Added to .claude/hooks/README.md
   [ ] Documented trigger conditions
   [ ] Documented exit codes

4. REGISTRATION (BLOCKING)
   [ ] Added to settings.json (pre/post-tool hooks)
   [ ] Added to config.yaml (event hooks)
   [ ] Verified: grep "<hook-name>" .claude/settings.json

5. MEMORY UPDATED
   [ ] Added to learnings.md with hook summary

6. HOOK-AGENT MAP UPDATED (MANDATORY)
   [ ] Added new hook to @HOOK_AGENT_MAP.md Section 1 matrix
   [ ] Determined which agent archetypes are affected (based on hook trigger/tool target)
   [ ] Updated affected agents' `## Enforcement Hooks` sections
   [ ] Verified: `grep "<hook-name>" .claude/docs/@HOOK_AGENT_MAP.md || echo "ERROR: Hook not in agent map!"`
```

**BLOCKING**: If ANY item above is missing, hook creation is INCOMPLETE.

### Step 8: Post-Creation Hook Registration (Phase 1 Integration)

**This step is CRITICAL.** After creating the hook artifact, you MUST register it in the hook discovery system.

**Phase 1 Context:** Phase 1 is responsible for tool and hook validation/discovery. Hooks created without registration are invisible to the system and will not be loaded at startup.

After hook file is written and tested:

1. **Create/Update Hook Registry Entry** in appropriate location:

   If registry doesn't exist, create `.claude/context/artifacts/hook-registry.json`:

   ```json
   {
     "hooks": [
       {
         "name": "{hook-name}",
         "id": "{hook-name}",
         "description": "{Brief description from hook}",
         "category": "{safety|routing|memory|session|validation|audit}",
         "type": "{pre-tool|post-tool|user-prompt|session-start|session-end}",
         "version": "1.0.0",
         "targetTools": ["{Tool1}", "{Tool2}"],
         "enforcementMode": "{block|warn|off}",
         "defaultEnabled": true,
         "filePath": ".claude/hooks/{category}/{hook-name}.cjs",
         "testFilePath": ".claude/hooks/{category}/{hook-name}.test.cjs",
         "environmentVariable": "{HOOK_NAME}_MODE"
       }
     ]
   }
   ```

2. **Validate Hook Against Schema:**

   Ensure hook validates against `.claude/schemas/hook-schema.json` (if exists):

   ```bash
   # Validate hook structure
   node -e "
     const hook = require('./.claude/hooks/{category}/{hook-name}.cjs');
     if (hook.validate) console.log('✓ Has validate() export');
     if (hook.PROJECT_ROOT) console.log('✓ Has PROJECT_ROOT');
     if (hook.findProjectRoot) console.log('✓ Has findProjectRoot()');
   "
   ```

3. **Register Hook in Loader:**

   Update `.claude/lib/hooks/hook-loader.cjs` (if exists) to include new hook:

   ```javascript
   const HOOKS_MANIFEST = {
     '{hook-name}': {
       path: './.claude/hooks/{category}/{hook-name}.cjs',
       type: '{pre-tool|post-tool}',
       matcher: '{Bash|Write|Edit|Read}', // Optional
       enabled: true,
       enforcementMode: process.env.{HOOK_NAME}_MODE || 'warn'
     }
   };
   ```

4. **Register Hook in Configuration:**

   **For pre/post-tool hooks** - Update `.claude/settings.json`:

   ```json
   {
     "hooks": {
       "pre-tool": ["./.claude/hooks/safety/{hook-name}.cjs"],
       "post-tool": ["./.claude/hooks/memory/{hook-name}.cjs"]
     }
   }
   ```

   **For event hooks** - Update `.claude/config.yaml`:

   ```yaml
   hooks:
     UserPromptSubmit:
       - path: ./.claude/hooks/routing/{hook-name}.cjs
         type: command
     SessionStart:
       - path: ./.claude/hooks/session/{hook-name}.cjs
         type: command
   ```

5. **Document in `.claude/hooks/README.md`:**

   Add entry under appropriate category:

   ```markdown
   #### {Hook Name} (`{hook-name}.cjs`)

   {Detailed description of what the hook does.}

   **When it runs:** {Trigger condition - e.g., "Before every Bash command", "After task completion"}

   **What it checks/does:**

   - {Check/action 1}
   - {Check/action 2}
   - {Check/action 3}

   **Enforcement mode:** `process.env.{HOOK_NAME}_MODE` (default: `warn`)

   **Test file:** `.claude/hooks/{category}/{hook-name}.test.cjs`

   **Related hooks:** {List any hooks that interact with this one}
   ```

6. **Update Memory:**

   Append to `.claude/context/memory/learnings.md`:

   ```markdown
   ## Hook: {hook-name}

   - **Type:** {pre-tool|post-tool|event}
   - **Category:** {safety|routing|memory|session|validation}
   - **Purpose:** {Detailed purpose}
   - **Trigger:** {When it runs}
   - **Enforcement:** {Block/warn/off by default}
   - **Integration Notes:** {Any special considerations}
   ```

**Why this matters:** Without hook registration:

- Hooks are not loaded at startup
- Hook validation doesn't occur
- System cannot discover available hooks
- Safety validators are bypassed
- "Invisible artifact" pattern emerges

**Phase 1 Integration:** Hook registry is the discovery mechanism for Phase 1, enabling the system to validate hooks against schema, load them at startup, and enforce safety rules consistently.

### Step 9: Integration Verification (BLOCKING - DO NOT SKIP)

**This step verifies the artifact is properly integrated into the ecosystem.**

Before calling `TaskUpdate({ status: "completed" })`, you MUST run the Post-Creation Validation workflow:

1. **Run the 10-item integration checklist:**

   ```bash
   node .claude/tools/cli/validate-integration.cjs .claude/hooks/<category>/<hook-name>.cjs
   ```

2. **Verify exit code is 0** (all checks passed)

3. **If exit code is 1** (one or more checks failed):
   - Read the error output for specific failures
   - Fix each failure:
     - Missing hook registry -> Create registry entry (Step 8)
     - Missing settings.json entry -> Register hook (Step 8)
     - Missing documentation -> Add to hooks/README.md
     - Missing memory update -> Update learnings.md
     - Missing test file -> Create .test.cjs file
   - Re-run validation until exit code is 0

4. **Only proceed when validation passes**

**This step is BLOCKING.** Do NOT mark task complete until validation passes.

**Why this matters:** The Party Mode incident showed that fully-implemented artifacts can be invisible to the Router if integration steps are missed. This validation ensures no "invisible artifact" pattern.

**Reference:** `.claude/workflows/core/post-creation-validation.md`

---

## CLI Reference

```bash
# Create hook using CLI tool
node .claude/tools/hook-creator/create-hook.mjs \
  --name "hook-name" \
  --type "PreToolUse|PostToolUse|UserPromptSubmit" \
  --purpose "Description of what the hook does" \
  --category "safety|routing|memory|audit|security|validation|custom" \
  --matcher "Edit|Write|Bash"  # Optional: tool matcher regex

# List all hooks
node .claude/tools/hook-creator/create-hook.mjs --list

# Validate hook structure
node .claude/tools/hook-creator/create-hook.mjs --validate "<path>"

# Assign to agents
node .claude/tools/hook-creator/create-hook.mjs --assign "name" --agents "agent1,agent2"

# Unregister hook
node .claude/tools/hook-creator/create-hook.mjs --unregister "<path>"

# Test with sample input
echo '{"tool_name":"Edit","tool_input":{"file_path":"test.js"} }' | node .claude/hooks/<category>/<hook-name>.cjs
```

---

## Hook Patterns Reference

### Pattern 1: Safety Validator (Pre-Tool)

For validating commands before execution:

```javascript
'use strict';

/**
 * Validate Git Force Push
 * Prevents accidental force pushes to protected branches
 */

const PROTECTED_BRANCHES = ['main', 'master', 'production'];

function validate(context) {
  const { tool, parameters } = context;

  if (tool !== 'Bash') {
    return { valid: true, error: '' };
  }

  const command = parameters?.command || '';

  // Check for force push
  if (command.includes('git push') && (command.includes('--force') || command.includes('-f'))) {
    // Check if pushing to protected branch
    for (const branch of PROTECTED_BRANCHES) {
      if (command.includes(branch)) {
        return {
          valid: false,
          error: `Force push to ${branch} blocked. Use --force-with-lease instead.`,
        };
      }
    }

    return {
      valid: true,
      error: '',
      warning: 'Force push detected. Ensure you know what you are doing.',
    };
  }

  return { valid: true, error: '' };
}

module.exports = { validate };
```

### Pattern 2: Memory Extractor (Post-Tool)

For extracting learnings after task completion:

```javascript
'use strict';

/**
 * Extract Workflow Learnings
 * Automatically captures patterns from completed workflows
 */

const fs = require('fs');
const path = require('path');

function findProjectRoot() {
  let dir = __dirname;
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, '.claude'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const LEARNINGS_PATH = path.join(findProjectRoot(), '.claude/context/memory/learnings.md');

function extractLearnings(context) {
  const { tool, parameters, result } = context;

  // Only process completed tasks
  if (!result || result.status !== 'completed') {
    return { extracted: false };
  }

  // Extract patterns from result
  const learnings = [];

  if (result.patterns) {
    learnings.push(...result.patterns);
  }

  if (result.decisions) {
    learnings.push(...result.decisions);
  }

  if (learnings.length === 0) {
    return { extracted: false };
  }

  // Append to learnings file
  const entry = `\n## [${new Date().toISOString().split('T')[0]}] ${context.taskName || 'Task'}\n\n`;
  const content = learnings.map(l => `- ${l}`).join('\n');

  fs.appendFileSync(LEARNINGS_PATH, entry + content + '\n');

  return { extracted: true, count: learnings.length };
}

module.exports = { extractLearnings };
```

### Pattern 3: Routing Enforcer (User Prompt)

For enforcing routing protocols:

```javascript
'use strict';

/**
 * Router First Enforcer
 * Ensures all requests go through the Router agent
 */

function validate(context) {
  const { prompt, currentAgent } = context;

  // Skip if already routed
  if (currentAgent === 'router') {
    return { valid: true, error: '' };
  }

  // Skip slash commands (handled by skill system)
  if (prompt && prompt.trim().startsWith('/')) {
    return { valid: true, error: '' };
  }

  // Suggest routing
  return {
    valid: true,
    error: '',
    warning: 'Consider using Router to spawn appropriate agent via Task tool.',
  };
}

module.exports = { validate };
```

### Pattern 4: Session Initializer

For session lifecycle management:

```javascript
'use strict';

/**
 * Session Memory Initializer
 * Reminds agents to read memory files at session start
 */

const fs = require('fs');
const path = require('path');

function findProjectRoot() {
  let dir = __dirname;
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, '.claude'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const MEMORY_FILES = [
  '.claude/context/memory/learnings.md',
  '.claude/context/memory/issues.md',
  '.claude/context/memory/decisions.md',
];

function initialize() {
  const root = findProjectRoot();

  console.log('\n' + '='.repeat(50));
  console.log(' SESSION MEMORY REMINDER');
  console.log('='.repeat(50));
  console.log('\n  Before starting work, read these memory files:');

  for (const file of MEMORY_FILES) {
    const fullPath = path.join(root, file);
    if (fs.existsSync(fullPath)) {
      const stats = fs.statSync(fullPath);
      const modified = stats.mtime.toISOString().split('T')[0];
      console.log(`  - ${file} (updated: ${modified})`);
    }
  }

  console.log('\n' + '='.repeat(50) + '\n');

  return { initialized: true };
}

// Run on direct execution
if (require.main === module) {
  initialize();
}

module.exports = { initialize };
```

---

## Examples

### Security Validation Hook

```bash
node .claude/tools/hook-creator/create-hook.mjs \
  --name "secret-detector" \
  --type "PreToolUse" \
  --purpose "Blocks commits containing secrets or credentials" \
  --category "security" \
  --matcher "Bash"
```

### Audit Logging Hook

```bash
node .claude/tools/hook-creator/create-hook.mjs \
  --name "operation-logger" \
  --type "PostToolUse" \
  --purpose "Logs all file modifications to audit trail" \
  --category "audit"
```

### Intent Analysis Hook

```bash
node .claude/tools/hook-creator/create-hook.mjs \
  --name "intent-classifier" \
  --type "UserPromptSubmit" \
  --purpose "Classifies user intent for intelligent routing" \
  --category "routing"
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

---

## Cross-Reference: Creator Ecosystem

This skill is part of the **Creator Ecosystem**. After creating a hook, consider if companion artifacts are needed:

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

After creating a hook that needs additional capabilities:

```javascript
// 1. Hook created but needs dedicated skill
Skill({ skill: 'skill-creator' });
// Create skill that encapsulates hook logic

// 2. Hook needs to be assigned to agent
// Update agent's workflow to include hook awareness

// 3. Hook needs workflow for testing
// Create workflow in .claude/workflows/<hook-name>-test-workflow.md
```

### Post-Creation Checklist for Ecosystem Integration

After hook is fully created and validated:

```
[ ] Does hook need a skill wrapper? -> Use skill-creator
[ ] Does hook need dedicated agent? -> Use agent-creator
[ ] Does hook need testing workflow? -> Create workflow
[ ] Should hook be enabled by default? -> Update config.yaml
[ ] Does hook interact with other hooks? -> Document in README.md
[ ] Run post-creation validation -> node .claude/tools/cli/validate-integration.cjs .claude/hooks/<category>/<hook-name>.cjs
```

---

## Iron Laws of Hook Creation

These rules are INVIOLABLE. Breaking them causes silent failures.

```
1. NO HOOK WITHOUT validate() EXPORT
   - Every hook MUST export validate() function
   - Hooks without validate() cannot be called programmatically

2. NO HOOK WITHOUT main() FOR CLI
   - Every hook MUST have main() for CLI execution
   - Run only when require.main === module

3. NO HOOK WITHOUT ENFORCEMENT CONTROLS
   - Support 'block|warn|off' via environment variable
   - Default to 'warn' unless explicitly required to block
   - Never crash on malformed input

4. NO HOOK WITHOUT ERROR HANDLING
   - Wrap JSON.parse in try/catch
   - Handle missing parameters gracefully
   - Return valid: true when unsure (fail open, not closed)

5. NO HOOK WITHOUT TEST FILE
   - Every hook needs <hook-name>.test.cjs
   - Test valid, invalid, and edge cases

6. NO HOOK WITHOUT DOCUMENTATION
   - Add to .claude/hooks/README.md
   - Document trigger, behavior, exit codes

7. CROSS-PLATFORM PATHS
   - Use path.join() not string concatenation
   - Handle both / and \ path separators
   - Use path.normalize() for comparison

8. NO CREATION WITHOUT SYSTEM IMPACT ANALYSIS
   - Check if hook requires settings.json registration
   - Check if hook requires config.yaml registration
   - Update @HOOK_AGENT_MAP.md with new hook row (MANDATORY)
   - Update affected agents' Enforcement Hooks sections (MANDATORY)
   - Check if related hooks need updating
   - Document all system changes made

9. IRON LAW I: PRE-TOOL HOOKS MUST VALIDATE AGAINST JSON SCHEMA
   - PreToolUse hooks MUST compile and validate input against the companion
     schemas/input.schema.json using AJV or equivalent before allowing execution
   - Pattern: compile(schema) → validate(input) → exit 2 on schema failure
   - Never block (exit 2) on schema-load errors — fail open, not closed
   - Search: site:github.com "preToolUse" "ajv" "validate" filetype:cjs

10. IRON LAW III: POST-TOOL HOOKS MUST EMIT OBSERVABILITY EVENTS
    - PostToolUse hooks MUST append a structured JSON line to
      .claude/context/runtime/tool-events.jsonl via the centralized emitter:
      const { sendEvent } = require('.claude/tools/observability/send-event.cjs')
    - Required fields: tool_name, agent_id, session_id, outcome, timestamp
    - Never crash on emit failure (try/catch, fail open)
    - Inspect events: node .claude/tools/observability/send-event.cjs --tail 20
```

---

## Integration Points

- **Ecosystem Assessor**: Hook creator integrates with ecosystem assessment for reverse lookups
- **Agent Creator**: Agents can reference hooks in their frontmatter
- **Skill Creator**: Skills can define hooks in their hooks/ directory
- **Settings.json**: Hooks are auto-registered with proper triggers and matchers
- **Config.yaml**: Event hooks registered for UserPromptSubmit, SessionStart, etc.

---

## Architecture Compliance

### File Placement (ADR-076)

- Hooks: `.claude/hooks/{category}/` (safety, routing, memory, session, validation, audit)
- Hook tests: `.claude/hooks/{category}/{name}.test.cjs` (co-located with hooks)
- Tests: `tests/` (integration tests for hooks)
- Related docs: `.claude/docs/`
- Hook registry: `.claude/hooks/README.md`

### Documentation References (CLAUDE.md v3.1.0)

- Reference files use @notation: @ENFORCEMENT_HOOKS.md, @TOOL_REFERENCE.md
- Located in: `.claude/docs/@*.md`
- See: CLAUDE.md Section 1.3 (ENFORCEMENT HOOKS reference)

### Shell Security (ADR-077)

- **NEW SAFETY HOOKS:** bash-cwd-validator.cjs, shell-injection-validator.cjs, variable-quoting-validator.cjs (ADR-077 Phase 2)
- **PHASE 3 HOOKS:** shellcheck-validator.cjs, command-allowlist-validator.cjs (reference implementations)
- Hook tests MUST validate shell security patterns
- See: .claude/docs/SHELL-SECURITY-GUIDE.md
- Apply to: all safety hooks, pre-tool hooks, validation hooks

### Recent ADRs

- ADR-075: Router Config-Aware Model Selection
- ADR-076: File Placement Architecture Redesign
- ADR-077: Shell Command Security Architecture

---

## File Placement & Standards

### Output Location Rules

This skill outputs to: `.claude/hooks/<category>/`

Categories:

- `safety/` - Safety validators (command validation, security checks, **shell security**)
- `routing/` - Router enforcement hooks
- `memory/` - Memory management hooks
- `session/` - Session lifecycle hooks
- `validation/` - Input/output validation hooks

### Mandatory References

- **File Placement**: See `.claude/docs/FILE_PLACEMENT_RULES.md`
- **Developer Workflow**: See `.claude/docs/DEVELOPER_WORKFLOW.md`
- **Artifact Naming**: See `.claude/docs/ARTIFACT_NAMING.md`

### Enforcement

File placement is enforced by `file-placement-guard.cjs` hook.
Invalid placements will be blocked in production mode.

---

## Memory Protocol (MANDATORY)

**Before creating a hook:**

```bash
cat .claude/context/memory/learnings.md
```

Check for:

- Previously created hooks
- Known hook patterns
- User preferences for hook behavior

**After completing:**

- New hook created -> Append to `.claude/context/memory/learnings.md`
- Issue with hook -> Append to `.claude/context/memory/issues.md`
- Hook design decision -> Append to `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: Your context may reset. If it's not in memory, it didn't happen.

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

Run the shared evaluation framework to verify hook quality:

```bash
node .claude/skills/skill-creator/scripts/eval-runner.cjs --skill hook-creator
```

Grader assertions for hook artifacts:

- **Exit codes correct**: Hook exits `0` (allow) or `2` (block) only; exit `1` is never used (treated as error, not block per SE-03)
- **100ms performance budget**: Hook body completes in under 100ms; no network calls, no blocking I/O, no long computation in the hot path
- **Fail-open vs fail-closed policy**: Security hooks (routing, creator, write) are fail-closed (`process.exit(2)` on errors); advisory and PostToolUse hooks are fail-open (`process.exit(0)` on errors)
- **Graceful error handling**: Hook body is wrapped in `try/catch`; unexpected errors exit `0` (non-critical) or `2` (security-critical) — never crash without an exit code
- **Registration complete**: Hook is registered in `.claude/settings.json` and documented in `@ENFORCEMENT_HOOKS.md`

See `.claude/skills/skill-creator/EVAL_WORKFLOW.md` for full evaluation protocol and grader/analyzer agent usage.
