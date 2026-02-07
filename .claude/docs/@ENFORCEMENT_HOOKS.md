# Enforcement Hooks Reference

> **See also:** @HOOK_AGENT_MAP.md for complete hook-agent mapping matrix
> **NOTE**: `routing-guard.cjs` has grown large and complex. It is a candidate for future refactoring into smaller, more focused modules (e.g. `complexity-guard.cjs`, `security-guard.cjs`).
> **Source:** CLAUDE.md Section 1.3
> **Version:** v2.2.1
> **Last Updated:** 2026-02-06

---

## PURPOSE

Detailed enforcement hook specifications for router-first protocol, including hook names, triggers, enforcement modes, and override environment variables.

---

## CONTENT

Router-first protocol is enforced by blocking hooks:

| Hook                | Location                 | Trigger          | Default | Env Variables                                              |
| ------------------- | ------------------------ | ---------------- | ------- | ---------------------------------------------------------- |
| `routing-guard.cjs` | `.claude/hooks/routing/` | PreToolUse(Task) | block   | `PLANNER_FIRST_ENFORCEMENT`, `SECURITY_REVIEW_ENFORCEMENT` |

### routing-guard.cjs

Consolidates multiple enforcement checks:

1. **Planner-first enforcement** (`PLANNER_FIRST_ENFORCEMENT`)
   - Blocks TaskCreate for HIGH/EPIC complexity unless PLANNER spawned first
   - Default: `block`
   - Override: `PLANNER_FIRST_ENFORCEMENT=warn|off`

2. **Task-create complexity guard** (`PLANNER_FIRST_ENFORCEMENT`)
   - Prevents router from creating complex tasks directly
   - Requires spawning PLANNER for multi-step, multi-file, or architecture tasks

3. **Security review guard** (`SECURITY_REVIEW_ENFORCEMENT`)
   - Enforces security-architect inclusion for auth/authz/credentials changes
   - Default: `block`
   - Override: `SECURITY_REVIEW_ENFORCEMENT=warn|off`

4. **Router self-check**
   - Validates router passed Gates 1-4 before spawning
   - Cannot be disabled

5. **Documentation routing guard**
   - Ensures documentation requests route to technical-writer
   - Part of routing-guard.cjs enforcement

### unified-creator-guard.cjs

Enforces Gate 4 (Creator Workflow) for all artifact types:

**Location:** `.claude/hooks/routing/unified-creator-guard.cjs`
**Trigger:** PreToolUse(Write), PreToolUse(Edit)
**Default:** `block`
**Override:** `CREATOR_GUARD=warn|off`

**Blocked Paths:**

- `.claude/skills/**/SKILL.md` → skill-creator required
- `.claude/agents/**/*.md` → agent-creator required
- `.claude/hooks/**/*.cjs` → hook-creator required
- `.claude/workflows/**/*.md` → workflow-creator required
- `.claude/templates/**/*` → template-creator required
- `.claude/schemas/**/*.json` → schema-creator required

**Why Enforcement Matters:**
Direct writes bypass post-creation steps:

- CLAUDE.md routing updates
- Catalog/registry updates
- Agent assignments
- Schema validation
- Memory recording

**Override Example:**

```bash
# Disable for emergency fixes (dangerous)
CREATOR_GUARD=off claude

# Warn-only mode for development
CREATOR_GUARD=warn claude
```

### Enforcement Modes

| Mode    | Behavior                        | Use Case                         |
| ------- | ------------------------------- | -------------------------------- |
| `block` | Prevents action, throws error   | Production (default)             |
| `warn`  | Logs warning but allows action  | Development, debugging           |
| `off`   | Disables enforcement completely | Emergency fixes only (dangerous) |

### Override Environment Variables

```bash
# Planner-first enforcement
PLANNER_FIRST_ENFORCEMENT=block|warn|off

# Security review enforcement
SECURITY_REVIEW_ENFORCEMENT=block|warn|off

# Creator workflow enforcement (Gate 4)
CREATOR_GUARD=block|warn|off

# Spawn prompt validation
SPAWN_PROMPT_VALIDATOR=block|warn|off

# Router write guard
ROUTER_WRITE_GUARD=block|warn|off

# Research enforcement (EVOLVE Phase O)
RESEARCH_ENFORCEMENT=block|warn|off
```

### Hook Registration

Hooks are registered in `.claude/settings.json`:

```json
{
  "hooks": {
    "routing-guard.cjs": {
      "trigger": "PreToolUse",
      "tool": "Task",
      "enabled": true
    },
    "unified-creator-guard.cjs": {
      "trigger": "PreToolUse",
      "tool": ["Write", "Edit"],
      "enabled": true
    }
  }
}
```

---

## RELATED REFERENCES

- **@ENVIRONMENT_CONFIG.md** - Environment variable configuration
- **@EVOLUTION_WORKFLOW.md** - research-enforcement.cjs (Phase O)
- **CLAUDE.md Section 1.2** - Self-check gates enforced by routing-guard.cjs

---

## BACK TO MAIN

See **CLAUDE.md** Section 1.3 for inline summary.
