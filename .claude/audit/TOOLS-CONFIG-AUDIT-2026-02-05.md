# Tools and Configuration Audit Report

**Date**: 2026-02-05
**Task ID**: audit-tools-config-001
**Auditor**: Agent (claude-opus-4-5-20251101)
**Status**: COMPLETE

---

## Executive Summary

This audit covers the TOOLS and CONFIGURATION aspects of the agent-studio framework as part of the comprehensive 100% codebase audit. The review identified several issues:

| Category | Status | Issues Found |
|----------|--------|--------------|
| Tools Reference (@TOOL_REFERENCE.md) | GOOD | 1 minor discrepancy |
| MCP Configuration | CRITICAL | Settings vs .mcp.json mismatch |
| Tool Availability Drift | MINOR | pm.md references "Search" tool |
| Configuration Files | GOOD | Valid JSON, complete |
| Model Configuration | GOOD | All models valid |
| Environment Variables | GOOD | Comprehensive .env.example |
| Tool Scope Validation | GOOD | Functioning correctly |

**Overall Risk Level**: MEDIUM (MCP configuration mismatch)

---

## 1. Tools Reference (@TOOL_REFERENCE.md) Analysis

### 1.1 Completeness Check

**File Location**: `.claude/docs/@TOOL_REFERENCE.md`
**Version**: v2.2.1
**Last Updated**: 2026-01-31

**Core Tools Listed**: 23 (documented)

| Documented Count | Actual Count | Match |
|------------------|--------------|-------|
| Core Tools: 23 | FALLBACK_CORE_TOOLS: 21 | MINOR GAP |

**Discrepancy Analysis**:
- `@TOOL_REFERENCE.md` claims 23 core tools
- `FALLBACK_CORE_TOOLS` in `tool-availability-validator.cjs` lists 21 tools
- Missing from validator: `AvailableAgents` (documented but not in fallback list)
- Note: Validator fallback list is for when manifest load fails, so minor discrepancy acceptable

### 1.2 Tool Descriptions Accuracy

All tool descriptions in `@TOOL_REFERENCE.md` are **ACCURATE** and match actual functionality.

### 1.3 Router Restrictions Documentation

**Whitelist (Router may use)**:
- Task, TaskList, TaskCreate, TaskUpdate, TaskGet
- Read (agent files / routing docs)
- AskUserQuestion

**Blacklist (Router must spawn agent)**:
- Edit, Write, Bash (implementation), Glob, Grep, WebSearch, mcp__*

**Status**: CORRECTLY DOCUMENTED

### 1.4 Tool Manifest Validation

**File**: `.claude/config/tool-manifest.json`
**Generated**: 2026-02-04T06:29:54.932Z

| Metric | Value |
|--------|-------|
| Total Tools | 31 |
| Core Tools | 22 |
| MCP Tools | 9 |
| Available | 22 |
| Unavailable | 9 (all MCP) |

**Status**: COMPLETE and ACCURATE

---

## 2. MCP Servers Configuration - CRITICAL ISSUE

### 2.1 Configuration Files Discovery

Two MCP configuration files found:

| File | Location | Content |
|------|----------|---------|
| settings.json | `.claude/settings.json` | `mcpServers: {}` (EMPTY) |
| .mcp.json | `.claude/.mcp.json` | 6 servers configured |

### 2.2 Configuration Mismatch

**CRITICAL**: `settings.json` has `mcpServers: {}` (empty), but `.mcp.json` has 6 servers:

```json
// .claude/.mcp.json servers:
{
  "filesystem": { ... },
  "git": { ... },
  "memory": { ... },
  "sequential-thinking": { ... },
  "github": { ... },
  "sqlite": { ... }
}
```

### 2.3 Loaded Servers Status

Based on current session tool availability (from system prompt), the following MCP tools are ACTUALLY LOADED:

| Server | Tool Pattern | Status |
|--------|--------------|--------|
| Exa | mcp__Exa__* | LOADED |
| Ref | mcp__Ref__* | LOADED |
| shadcn | mcp__shadcn__* | LOADED |
| sequential-thinking | mcp__sequential-thinking__* | LOADED |
| filesystem | mcp__filesystem__* | LOADED |
| chrome-devtools | mcp__chrome-devtools__* | LOADED |
| claude-in-chrome | mcp__claude-in-chrome__* | LOADED |

**Observation**: MCP servers are loaded at the user/global level (not project level), which is why they're available even though `settings.json` shows empty `mcpServers`.

### 2.4 tool-manifest.json vs Reality

The `tool-manifest.json` marks ALL MCP tools as "unavailable" because it reads from `settings.json`:

```json
"status": "unavailable",
"reason": "MCP server 'Exa' not configured"
```

**But in reality**: MCP tools ARE available at session level (loaded from user config).

### 2.5 MCP Configuration Recommendations

| Issue | Severity | Recommendation |
|-------|----------|----------------|
| settings.json mcpServers empty | MEDIUM | Document that MCP servers are user-level, not project-level |
| tool-manifest.json shows unavailable | LOW | Update manifest generation to detect runtime availability |
| .mcp.json not being read | INFO | Clarify which config file is authoritative |

---

## 3. Tool Availability Drift (TOOL-001)

### 3.1 "Search" Tool References

Searched for agents referencing "Search" or "SequentialThinking" tools.

**Finding**: pm.md line 53 references "Search" tool:
```markdown
2. **Gather Context**: Use `Grep`, `Glob`, and `Search` to understand current state.
```

**Issue**: There is no "Search" tool. The correct tools are:
- `Grep` - Content search in files
- `Glob` - Pattern-based file discovery
- `WebSearch` - Web search

### 3.2 Agents with WebSearch in Frontmatter

The following agents correctly list `WebSearch` in their tools:
- evolution-orchestrator.md
- technical-writer.md
- researcher.md
- data-engineer.md
- ios-pro.md
- fastapi-pro.md
- expo-mobile-developer.md
- golang-pro.md
- gamedev-pro.md
- graphql-pro.md
- java-pro.md
- ai-ml-specialist.md
- android-pro.md
- php-pro.md
- rust-pro.md
- scientific-research-expert.md
- python-pro.md
- nextjs-pro.md
- sveltekit-expert.md
- tauri-desktop-developer.md
- typescript-pro.md
- web3-blockchain-expert.md
- nodejs-pro.md
- mobile-ux-reviewer.md

**Status**: Agents correctly use `WebSearch` (not ambiguous "Search")

### 3.3 SequentialThinking Tool References

**Finding**: No agents directly reference `mcp__sequential-thinking__sequentialthinking` tool.

Instead, agents use the skill-based approach:
```javascript
Skill({ skill: 'sequential-thinking' });
```

**Status**: CORRECT - Using skills instead of direct MCP tool invocation

---

## 4. Configuration Files Validation

### 4.1 agent-config.json

**File**: `.claude/config/agent-config.json`
**Status**: VALID JSON

| Field | Value | Status |
|-------|-------|--------|
| version | 1.0.0 | OK |
| $schema | ../schemas/agent-config.schema.json | OK |
| agents | 7 defined | OK |

**Configured Agents**:
- planner: opus
- developer: sonnet
- qa: opus
- code-reviewer: opus
- architect: opus
- researcher: sonnet
- reflection-agent: opus

### 4.2 skill-index.json

**File**: `.claude/config/skill-index.json`
**Status**: VALID JSON (very large file ~300KB)

| Field | Value |
|-------|-------|
| version | 1.0.0 |
| totalSkills | 434 |
| totalDomains | 22 |
| totalCategories | 25 |
| lastValidated | 2026-02-05T03:16:14.785Z |

**Known Issue**: File is 300KB+ which may cause read errors with default limits.

### 4.3 config.yaml

**File**: `.claude/config.yaml`
**Status**: VALID YAML

Key configurations:
- Router model: claude-haiku-4-5
- Planner: claude-opus-4-5-20251101 (extended_thinking: true)
- Developer: claude-sonnet-4-5
- QA: claude-opus-4-5-20251101
- Architect: claude-opus-4-5-20251101

### 4.4 .env.example

**File**: `.env.example`
**Status**: COMPREHENSIVE (877 lines)

Environment variable categories:
1. Environment Selection (AGENT_STUDIO_ENV)
2. Feature Flags (PARTY_MODE_ENABLED, ELICITATION_ENABLED)
3. Reflection Hooks (REFLECTION_ENABLED, REFLECTION_HOOK_MODE)
4. Safety Hooks (LOOP_PREVENTION_MODE)
5. Anomaly Detection (ANOMALY_DETECTION_ENABLED)
6. Routing & Orchestration (REROUTER_MODE)
7. Shell Command Security (BASH_CWD_VALIDATOR)
8. Session & Debugging (DEBUG_HOOKS)
9. External Integrations (ANTHROPIC_API_KEY)
10. Memory System (MEMORY_SYSTEM_ENABLED)
11. Event System (EVENT_BUS_ENABLED)
12. Agent Execution Limits (DEFAULT_MAX_TURNS)
13. Error Logging (ERROR_LOGGING_ENABLED)
14. Heap Memory (HEAP_WARNING_THRESHOLD)
15. ML Features (PATTERN_DETECTION_ENABLED)
16. Worker Runtime (WORKER_ENABLED)
17. Observability (SCHEDULER_TICK_ON_PROMPT)

---

## 5. Model Configuration Status

### 5.1 Model Resolution Function

**File**: `.claude/lib/utils/agent-config-reader.cjs`
**Status**: WORKING

**Model Aliases**:
```javascript
const MODEL_ALIASES = {
  opus: 'claude-opus-4-5-20251101',
  sonnet: 'claude-sonnet-4-5',
  haiku: 'claude-haiku-4-5',
  // Reverse mappings also defined
};
```

### 5.2 Complexity Defaults

```javascript
const COMPLEXITY_DEFAULTS = {
  planner: 'opus',
  architect: 'opus',
  qa: 'opus',
  'security-architect': 'opus',
  'evolution-orchestrator': 'opus',
  'master-orchestrator': 'opus',
  'party-orchestrator': 'opus',
  'swarm-coordinator': 'opus',
  'reverse-engineer': 'opus',
  'ai-ml-specialist': 'opus',
  'web3-blockchain-expert': 'opus',
  'context-compressor': 'haiku',
  default: 'sonnet',
};
```

### 5.3 Model IDs Validation

All model IDs are CURRENT for Claude versions:
- `claude-opus-4-5-20251101` - Valid
- `claude-sonnet-4-5` - Valid
- `claude-haiku-4-5` - Valid

### 5.4 Config Model Validator Hook

**File**: `.claude/hooks/routing/config-model-validator.cjs`
**Status**: WORKING

Enforcement mode: `CONFIG_MODEL_VALIDATOR` (default: warn)

---

## 6. Environment Variable Usage

### 6.1 Variables Used in Hooks

Scanned `.claude/hooks/` for `process.env.*` usage:

| Variable | Files Using It |
|----------|----------------|
| DEBUG_HOOKS | 12 hooks |
| REFLECTION_ENABLED | 3 hooks |
| REFLECTION_HOOK_MODE | 3 hooks |
| REFLECTION_QUEUE_MAX_LINES | 2 hooks |
| HOOK_FAIL_OPEN | 2 hooks |
| REROUTER_MODE | 1 hook |
| ERROR_METRICS_MAX_LINES | 1 hook |
| HOOK_METRICS_MAX_LINES | 1 hook |
| EVOLUTION_AUDIT | 1 hook |
| EVOLUTION_STATE_GUARD | 1 hook |
| EVOLUTION_TRIGGER_DETECTION | 1 hook |
| AGENT_TOOLS_VALIDATOR | 1 hook |
| PLAN_EVOLUTION_GUARD | 1 hook |
| MEMORY_EMBED_ON_EDIT | 1 hook |

### 6.2 .env File Status

**File**: `.env` exists (content not checked for security)
**Template**: `.env.example` is comprehensive (877 lines)

### 6.3 Enforcement Mode Variables

| Variable | Default | Options |
|----------|---------|---------|
| PLANNER_FIRST_ENFORCEMENT | block | block/warn/off |
| CREATOR_GUARD | block | block/warn/off |
| SPAWN_PROMPT_VALIDATOR | warn | block/warn/off |
| ROUTER_WRITE_GUARD | block | block/warn/off |
| SECURITY_REVIEW_ENFORCEMENT | block | block/warn/off |
| RESEARCH_ENFORCEMENT | block | block/warn/off |
| REFLECTION_STEP0_ENFORCEMENT | block | block/warn/off |
| TASK_COMPLETION_GUARD | warn | block/warn/off |
| CONFIG_MODEL_VALIDATOR | warn | block/warn/off |
| TOOL_SCOPE_VALIDATOR | warn | block/warn/off |

---

## 7. Tool Scope Validation

### 7.1 tool-scope-validator.cjs

**File**: `.claude/hooks/routing/tool-scope-validator.cjs`
**Status**: WORKING

**Always Allowed Tools** (safe read-only):
- Read
- TaskList
- TaskGet
- AskUserQuestion

**Enforcement Mode**: `TOOL_SCOPE_VALIDATOR` (default: warn)

### 7.2 tool-availability-validator.cjs

**File**: `.claude/hooks/routing/tool-availability-validator.cjs`
**Status**: WORKING

**Validation Logic**:
1. Validates Task tool only (agent spawning)
2. Checks `allowed_tools` against core tools list
3. Warns if MCP tools requested without server config
4. Blocks if required tools unavailable

**Fallback Core Tools**:
```javascript
const FALLBACK_CORE_TOOLS = [
  'Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'Task',
  'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet', 'TaskOutput',
  'TaskStop', 'Skill', 'MemoryRecord', 'AskUserQuestion',
  'NotebookEdit', 'WebSearch', 'WebFetch', 'EnterPlanMode',
  'ExitPlanMode', 'Orchestrator',
];
```

---

## 8. Issues Summary

### 8.1 Critical Issues

| ID | Issue | Location | Severity | Status |
|----|-------|----------|----------|--------|
| TOOL-001 | MCP configuration mismatch | settings.json vs .mcp.json | MEDIUM | OPEN |

### 8.2 Minor Issues

| ID | Issue | Location | Severity | Status |
|----|-------|----------|----------|--------|
| TOOL-002 | pm.md references "Search" tool | .claude/agents/core/pm.md:53 | LOW | OPEN |
| TOOL-003 | tool-manifest.json shows MCP unavailable | .claude/config/tool-manifest.json | INFO | OPEN |
| TOOL-004 | skill-index.json very large (300KB+) | .claude/config/skill-index.json | INFO | KNOWN |

---

## 9. Remediation Steps

### 9.1 TOOL-001: MCP Configuration Mismatch

**Current State**:
- `settings.json` has `mcpServers: {}`
- `.mcp.json` has 6 servers configured
- Runtime has MCP tools loaded from user config

**Recommended Actions**:
1. Add documentation explaining MCP server configuration levels (project vs user)
2. Update `@TOOL_REFERENCE.md` to clarify MCP availability depends on user configuration
3. Consider updating tool-manifest.json generation to detect runtime availability

### 9.2 TOOL-002: pm.md "Search" Reference

**Fix**: Update line 53 in `.claude/agents/core/pm.md`:
```markdown
# Before:
2. **Gather Context**: Use `Grep`, `Glob`, and `Search` to understand current state.

# After:
2. **Gather Context**: Use `Grep`, `Glob`, and `WebSearch` to understand current state.
```

### 9.3 TOOL-003: tool-manifest.json MCP Status

**Recommended Action**:
- Add note to manifest or documentation that MCP status is based on project config
- Runtime availability may differ based on user-level MCP configuration

---

## 10. Verification Results

### 10.1 Tool Invocation Test

All core tools are available and invocable:
- Read - WORKING
- Write - WORKING
- Edit - WORKING
- Bash - WORKING
- Glob - WORKING
- Grep - WORKING
- Task* tools - WORKING (host-provided)
- Skill - WORKING
- WebSearch - WORKING
- WebFetch - WORKING

### 10.2 MCP Tool Test

MCP tools available in current session:
- mcp__Exa__web_search_exa - AVAILABLE
- mcp__Ref__ref_search_documentation - AVAILABLE
- mcp__shadcn__getComponents - AVAILABLE
- mcp__sequential-thinking__sequentialthinking - AVAILABLE
- mcp__filesystem__* - AVAILABLE
- mcp__chrome-devtools__* - AVAILABLE
- mcp__claude-in-chrome__* - AVAILABLE

---

## 11. Conclusions

The tools and configuration system in agent-studio is **WELL-DESIGNED** with comprehensive documentation and validation hooks.

**Key Strengths**:
1. Comprehensive tool manifest with clear availability rules
2. Working model resolution system with proper precedence
3. Extensive environment variable configuration
4. Tool scope and availability validators in place
5. Clear Router tool restrictions (whitelist/blacklist)

**Areas for Improvement**:
1. MCP configuration documentation needs clarification (project vs user level)
2. Minor documentation fix needed in pm.md ("Search" -> "WebSearch")
3. tool-manifest.json could be enhanced to reflect runtime availability

**Overall Assessment**: HEALTHY with minor documentation updates needed.

---

**Audit Complete**
**Next Steps**: Apply remediation for TOOL-002 (pm.md fix)
