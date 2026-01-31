# Agent Creator Skill - Lazy-Load Rule Update

**Date**: 2026-01-31
**Status**: ✅ COMPLETE

## Summary

Updated the **agent-creator** skill to enforce the lazy-load `@` prefix rule when creating new agents. This ensures that future agents are created with proper context optimization from the start, eliminating the need to retrofit existing agents.

## Changes Made

### 1. Added LAZY-LOAD CONTEXT RULE Section

**Location**: Step 5 - Generate Agent Definition

**Content**: Comprehensive table and guidelines explaining when to use `@` prefix:

| Location               | Pattern        | Rule            |
| ---------------------- | -------------- | --------------- |
| Markdown documentation | `@.claude/...` | ✅ Add @ prefix |
| context_files array    | `@.claude/...` | ✅ Add @ prefix |
| Bash commands          | `.claude/...`  | ❌ NO @ prefix  |
| Bash examples          | `.claude/...`  | ❌ NO @ prefix  |

### 2. Updated Agent Template

**Before**:

```yaml
context_files:
  - .claude/context/memory/learnings.md
```

**After**:

```yaml
context_files:
  - @.claude/context/memory/learnings.md
```

### 3. Updated Output Locations Section

**Added guidance**:

- Deliverables: `@.claude/context/artifacts/`
- Reports: `@.claude/context/reports/`
- Temporary files: `@.claude/context/tmp/`
- Memory: `@.claude/context/memory/`

Plus note: (No `@` prefix in bash commands)

### 4. Updated Mandatory References

**Added**:

- Lazy-Load Rule: All new agents should use `@.claude/` prefix in documentation

## Examples for New Agents

When agent-creator generates new agents, they will now include:

### ✅ Correct Documentation Pattern

```markdown
Read: @.claude/skills/tdd/SKILL.md
Location: @.claude/context/memory/decisions.md
See: @.claude/docs/FILE_PLACEMENT_RULES.md
```

### ✅ Correct Frontmatter Pattern

```yaml
context_files:
  - @.claude/context/memory/learnings.md
  - @.claude/context/memory/decisions.md
```

### ✅ Correct Bash Commands (NO @ prefix)

```bash
cat .claude/context/memory/learnings.md
grep 'pattern' .claude/CLAUDE.md
Bash("node .claude/tools/validate.mjs")
```

## Benefits

1. **Preventive**: New agents automatically follow lazy-load rule
2. **No Retrofitting**: No need to fix agents after creation
3. **Consistency**: All future agents will have optimized context
4. **Education**: Skill itself documents the rule for agent creators

## Files Modified

- `.claude/skills/agent-creator/SKILL.md` - Added LAZY-LOAD CONTEXT RULE section and updated examples

## Enforcement

The agent-creator skill will now:

1. Show the LAZY-LOAD CONTEXT RULE when agent creator reads the skill
2. Include proper examples in the agent template
3. Document the rule in mandatory references

Any agent created via agent-creator from now on will automatically use correct lazy-load prefixes.

## Next: skill-creator and Other Creators

Similar updates should be applied to:

- `skill-creator` - when creating new skills
- `workflow-creator` - when creating workflows
- `hook-creator` - when creating hooks
- `template-creator` - when creating templates
- `schema-creator` - when creating schemas

These creator skills should all enforce the lazy-load `@` prefix rule for consistency.

## Related Context

- **Lazy-Load Optimization Summary**: `.claude/context/memory/lazy-load-context-fix-summary.md`
- **Phase 1 Integration**: Tool/skill awareness with context optimization
- **Agent Creation Process**: `.claude/skills/agent-creator/SKILL.md` (Mandatory Step 5)

---

**Impact**: Future agents created with agent-creator will be optimized for context from the start ✅
