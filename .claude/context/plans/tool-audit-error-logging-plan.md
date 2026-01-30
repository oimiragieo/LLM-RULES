# Plan: Tools Audit and Error Logging Initiative

## Overview

Comprehensive audit of all tools used across agent-studio, establishment of an error logging infrastructure, agent tool awareness improvements, and integration of error review into the daily reflection workflow.

**Created**: 2026-01-29
**Status**: Phase 0 - Planning
**Author**: Planner Agent
**Total Tasks**: 38 atomic tasks
**Estimated Duration**: 28-40 hours

## Executive Summary

This initiative addresses four interconnected goals:
1. **Tools Inventory Audit** - Deep dive into all tools used in the codebase, verify against approved list
2. **Error Logging System Design** - Infrastructure to capture, log, and report agent errors
3. **Agent Tool Assignment Review** - Ensure all agents know which tools apply to them
4. **Reflection Workflow Integration** - Integrate error review into daily reflection cycle

## Key Questions Addressed

| Question | Answer (from research) |
|----------|----------------------|
| What tools are currently used but not in approved list? | TOOL-001 identified MCP tools referenced but not configured; SequentialThinking in 11 agents without MCP server |
| How should errors be captured? | Hook-based error interceptors at PreToolUse/PostToolUse boundaries with wrapper functions for try/catch |
| What metadata is needed for error reports? | Agent name, timestamp, stack trace, context snapshot, tool name, recovery attempt status, session ID |
| How to prevent sensitive data leaks? | Sanitization patterns, credential detection, environment variable redaction |
| Which agents need which tools? | See Phase 3 tool assignment matrix |
| How should reflection incorporate error review? | Daily error digest in reflection-queue.jsonl, weekly pattern analysis |

---

## Phases

### Phase 0: Research and Planning (FOUNDATION)

**Purpose**: Research unknowns, validate technical approach, assess security implications
**Duration**: 4-6 hours
**Parallel OK**: No (blocking for subsequent phases)

#### Research Requirements (MANDATORY)

Before creating ANY artifact:

- [x] Review existing TOOL-001 issue and tool-availability-validator.cjs
- [x] Analyze current hook error handling patterns
- [x] Review existing reflection workflow (unified-reflection-handler.cjs)
- [x] Identify security implications of error logging

**Research Output**: This plan document

#### Constitution Checkpoint

**CRITICAL VALIDATION**: Before proceeding to Phase 1, ALL of the following MUST pass:

1. **Research Completeness**
   - [x] Existing tool documentation reviewed (CLAUDE.md Section 2, agent frontmatter)
   - [x] Current error handling patterns documented (hooks fail-open/fail-closed)
   - [x] Reflection workflow capabilities understood

2. **Technical Feasibility**
   - [x] Hook-based error capture is viable (existing hook infrastructure)
   - [x] Error log storage location identified (.claude/context/artifacts/error-logs/)
   - [x] No blocking technical issues discovered

3. **Security Review**
   - [x] Sensitive data sanitization approach defined
   - [x] Environment variable redaction required
   - [x] Stack trace depth limits needed

4. **Specification Quality**
   - [x] Success criteria are measurable (see each phase)
   - [x] Edge cases considered (hook failures, large error volumes)
   - [x] Rollback plans identified

**Constitution Checkpoint: PASSED** - Proceeding to Phase 1

---

### Phase 1: Tools Inventory Audit

**Purpose**: Deep dive into all tools used across the codebase, identify gaps and mismatches
**Dependencies**: Phase 0 complete
**Duration**: 6-8 hours
**Parallel OK**: Yes (tasks 1.1-1.4 can run in parallel)

#### Tasks

- [ ] **1.1** Extract tool definitions from all 53 agent frontmatter files (~1 hour)
  - **Command**: `Grep({ pattern: "^tools:", path: ".claude/agents", output_mode: "content", "-A": 20 })`
  - **Output**: `.claude/context/artifacts/reports/agent-tools-inventory.md`
  - **Verify**: Report contains tool list for all 53 agents

- [ ] **1.2** Extract allowed_tools from spawn templates and CLAUDE.md (~30 min) [PARALLEL OK]
  - **Command**: `Grep({ pattern: "allowed_tools", path: ".claude/templates/spawn", output_mode: "content" })`
  - **Output**: Append to agent-tools-inventory.md
  - **Verify**: Spawn template tools documented

- [ ] **1.3** Compare agent tools against settings.json mcpServers configuration (~30 min) [PARALLEL OK]
  - **Command**: `Read({ file_path: ".claude/settings.json" })` and cross-reference
  - **Output**: `.claude/context/artifacts/reports/mcp-tools-gap-analysis.md`
  - **Verify**: Report identifies all MCP tool references without server configuration

- [ ] **1.4** Identify tools referenced in hooks but not in agent definitions (~30 min) [PARALLEL OK]
  - **Command**: `Grep({ pattern: "toolInput\\.name|tool_name", path: ".claude/hooks", output_mode: "content" })`
  - **Output**: Append to agent-tools-inventory.md
  - **Verify**: Hook tool references documented

- [ ] **1.5** Create canonical approved tools list (~1 hour)
  - **Command**: Manual analysis of inventory results
  - **Output**: `.claude/context/artifacts/approved-tools-list.md`
  - **Verify**: List includes: Core tools, Task tools, MCP tools (with status), Skill tool

- [ ] **1.6** Identify and document all tool mismatches (~1 hour)
  - **Command**: Cross-reference agent tools vs approved list
  - **Output**: `.claude/context/artifacts/reports/tool-mismatch-report.md`
  - **Verify**: Report shows: agents with unapproved tools, agents missing required tools, MCP gaps

- [ ] **1.7** Create tool dependency matrix (~1 hour)
  - **Command**: Analyze which tools require other tools (e.g., Skill requires Read)
  - **Output**: `.claude/context/artifacts/tool-dependency-matrix.md`
  - **Verify**: Matrix shows tool prerequisites and conflicts

#### Phase 1 Success Criteria

- [ ] Complete inventory of tools across all 53 agents
- [ ] Approved tools list finalized
- [ ] All mismatches identified and categorized
- [ ] Tool dependency matrix complete

#### Phase 1 Error Handling

If any task fails:
1. Document error in `.claude/context/memory/issues.md`
2. Continue with remaining parallel tasks
3. Mark incomplete tasks for retry

---

### Phase 2: Error Logging System Design

**Purpose**: Design infrastructure to capture, log, and report agent errors
**Dependencies**: Phase 0 complete (can run parallel with Phase 1)
**Duration**: 8-10 hours
**Parallel OK**: Partial (design tasks parallel, implementation sequential)

#### Tasks

- [ ] **2.1** Define error schema and metadata requirements (~1 hour)
  - **Schema Fields**:
    ```json
    {
      "errorId": "UUID",
      "timestamp": "ISO8601",
      "sessionId": "string",
      "agentName": "string",
      "agentType": "core|domain|specialized|orchestrator",
      "toolName": "string",
      "toolInput": "sanitized object",
      "errorType": "tool_failure|timeout|validation|runtime",
      "errorMessage": "string",
      "stackTrace": "string (max 50 lines)",
      "context": {
        "taskId": "string|null",
        "workingDirectory": "string",
        "relevantFiles": ["string"]
      },
      "recoveryAttempt": "boolean",
      "recoverySuccess": "boolean",
      "severity": "critical|high|medium|low"
    }
    ```
  - **Output**: `.claude/schemas/error-log-schema.json`
  - **Verify**: Schema validates with ajv

- [ ] **2.2** Design sensitive data sanitization patterns (~1 hour) [PARALLEL OK]
  - **Patterns to detect and redact**:
    - Environment variables (`process.env.*`)
    - API keys (pattern: `/[A-Za-z0-9_-]{32,}/`)
    - Passwords (pattern: `/password[=:][^\s]+/i`)
    - Private keys (pattern: `/-----BEGIN.*PRIVATE KEY-----/`)
    - AWS credentials (pattern: `/AKIA[0-9A-Z]{16}/`)
    - Connection strings with passwords
  - **Output**: `.claude/lib/utils/error-sanitizer.cjs`
  - **Verify**: Unit tests for all sanitization patterns

- [ ] **2.3** Design error capture hook architecture (~2 hours)
  - **Hook Types**:
    1. `error-capture-pre-tool.cjs` - Captures tool input for context
    2. `error-capture-post-tool.cjs` - Captures failures from PostToolUse
    3. `error-recovery-monitor.cjs` - Tracks recovery attempts
  - **Integration Points**:
    - PreToolUse: Snapshot context before tool execution
    - PostToolUse: Detect failures, log with context
    - Exception handling wrapper
  - **Output**: `.claude/context/artifacts/designs/error-capture-architecture.md`
  - **Verify**: Architecture diagram and hook specifications complete

- [ ] **2.4** Design error storage and rotation strategy (~1 hour) [PARALLEL OK]
  - **Storage Location**: `.claude/context/artifacts/error-logs/`
  - **Rotation Strategy**:
    - Daily log files: `errors-YYYY-MM-DD.jsonl`
    - Retention: 30 days for detailed logs, 90 days for summaries
    - Max file size: 10MB (rotate if exceeded)
  - **Aggregation**:
    - Daily summary: `daily-summary-YYYY-MM-DD.json`
    - Weekly digest: `weekly-digest-YYYY-WW.json`
  - **Output**: Add to error-capture-architecture.md
  - **Verify**: Rotation logic documented with size limits

- [ ] **2.5** Design error reporting dashboard CLI (~2 hours)
  - **CLI Commands**:
    ```bash
    node .claude/tools/cli/error-report.cjs --today       # Today's errors
    node .claude/tools/cli/error-report.cjs --week        # Weekly summary
    node .claude/tools/cli/error-report.cjs --agent <name> # Agent-specific
    node .claude/tools/cli/error-report.cjs --tool <name>  # Tool-specific
    node .claude/tools/cli/error-report.cjs --patterns    # Error patterns
    ```
  - **Output Formats**: Table, JSON, Markdown
  - **Output**: `.claude/context/artifacts/designs/error-report-cli-spec.md`
  - **Verify**: CLI specification with examples

- [ ] **2.6** Implement error-sanitizer.cjs utility (~2 hours)
  - **Functions**:
    - `sanitizeObject(obj)` - Recursively sanitize object
    - `sanitizeString(str)` - Redact sensitive patterns
    - `sanitizeStackTrace(trace, maxLines)` - Truncate and redact
    - `detectSensitiveData(str)` - Returns detected pattern types
  - **Output**: `.claude/lib/utils/error-sanitizer.cjs`
  - **Verify**: `node --test .claude/lib/utils/error-sanitizer.test.cjs` passes

- [ ] **2.7** Create error-log-schema.json with ajv validation (~30 min)
  - **Output**: `.claude/schemas/error-log-schema.json`
  - **Verify**: `node .claude/tools/cli/validate-schema.cjs error-log` passes

#### Phase 2 Success Criteria

- [ ] Error schema defined and validated
- [ ] Sanitization patterns comprehensive (>95% coverage of known sensitive patterns)
- [ ] Architecture design approved
- [ ] CLI specification complete
- [ ] error-sanitizer.cjs implemented with >90% test coverage

#### Phase 2 Error Handling

If sanitization patterns miss sensitive data:
1. Add pattern to sanitizer immediately
2. Scan existing logs for leaks (manual review)
3. Purge affected logs if found
4. Document as security incident

---

### Phase 3: Agent Tool Assignment Review

**Purpose**: Ensure all agents have correct tool assignments based on their roles
**Dependencies**: Phase 1 complete (needs inventory)
**Duration**: 4-6 hours
**Parallel OK**: Yes (agent categories can be reviewed in parallel)

#### Tasks

- [ ] **3.1** Review core agent tool assignments (~1 hour)
  - **Agents**: developer, planner, architect, qa, technical-writer, pm, reflection-agent, context-compressor, router
  - **Criteria**:
    - Required tools for role present
    - No unnecessary tools (principle of least privilege)
    - MCP tools only if configured
  - **Output**: `.claude/context/artifacts/reports/core-agent-tool-review.md`
  - **Verify**: Each agent has tool justification

- [ ] **3.2** Review domain agent tool assignments (~1 hour) [PARALLEL OK]
  - **Agents**: python-pro, rust-pro, golang-pro, typescript-pro, fastapi-pro, frontend-pro, nodejs-pro, ios-pro, android-pro, java-pro, nextjs-pro, php-pro, sveltekit-expert, tauri-desktop-developer, expo-mobile-developer, data-engineer, graphql-pro, mobile-ux-reviewer, scientific-research-expert, ai-ml-specialist, web3-blockchain-expert, gamedev-pro
  - **Output**: `.claude/context/artifacts/reports/domain-agent-tool-review.md`
  - **Verify**: Domain-specific tools appropriate

- [ ] **3.3** Review specialized agent tool assignments (~1 hour) [PARALLEL OK]
  - **Agents**: code-reviewer, code-simplifier, security-architect, devops, devops-troubleshooter, incident-responder, c4-context, c4-container, c4-component, c4-code, conductor-validator, reverse-engineer, researcher, database-architect
  - **Output**: `.claude/context/artifacts/reports/specialized-agent-tool-review.md`
  - **Verify**: Security-sensitive tools properly restricted

- [ ] **3.4** Review orchestrator tool assignments (~1 hour) [PARALLEL OK]
  - **Agents**: master-orchestrator, swarm-coordinator, evolution-orchestrator, party-orchestrator
  - **Criteria**:
    - MUST have Task tool (orchestrators spawn subagents)
    - MUST have appropriate model selection (opus for complex)
  - **Output**: `.claude/context/artifacts/reports/orchestrator-tool-review.md`
  - **Verify**: All orchestrators have Task tool

- [ ] **3.5** Create recommended tool changes document (~1 hour)
  - **Categories**:
    1. **Add** - Tools missing that should be present
    2. **Remove** - Tools present that should not be
    3. **Update** - Tools that need configuration changes
    4. **Verify** - Tools that need MCP server setup
  - **Output**: `.claude/context/artifacts/reports/tool-assignment-recommendations.md`
  - **Verify**: Each change has rationale and impact assessment

- [ ] **3.6** Update agent definition schema to validate tools (~1 hour)
  - **Schema Changes**:
    - Add `allowedTools` enum in agent schema
    - Add `requiredTools` per agent type
    - Add MCP tool availability check
  - **Output**: Update `.claude/schemas/agent-schema.json`
  - **Verify**: Schema validates all existing agents

#### Phase 3 Success Criteria

- [ ] All 53 agents reviewed
- [ ] Tool assignment recommendations documented
- [ ] Agent schema updated with tool validation
- [ ] No unauthorized tools in agent definitions

---

### Phase 4: Reflection Workflow Integration

**Purpose**: Integrate error review into the daily reflection cycle
**Dependencies**: Phase 2 complete (needs error logging system)
**Duration**: 4-6 hours
**Parallel OK**: No (sequential integration)

#### Tasks

- [ ] **4.1** Analyze current reflection workflow (~30 min)
  - **Current Components**:
    - `unified-reflection-handler.cjs` - Main reflection hook
    - `reflection-queue.jsonl` - Queue for reflection items
    - `reflection-queue-processor.cjs` - Processes queue on SessionEnd
  - **Output**: Understanding of integration points
  - **Verify**: Documented in design file

- [ ] **4.2** Design error review integration for reflection (~1 hour)
  - **Integration Points**:
    1. **Error Summary in Reflection Queue**:
       ```json
       {
         "type": "error_summary",
         "timestamp": "ISO8601",
         "errorCount": 5,
         "criticalErrors": 1,
         "topErrorPatterns": ["timeout", "validation"],
         "affectedAgents": ["developer", "qa"]
       }
       ```
    2. **Daily Error Digest in Reflection Output**:
       - Top 5 error patterns
       - Recovery success rate
       - Agents with most errors
       - Recommended fixes
    3. **Weekly Pattern Analysis**:
       - Recurring error patterns
       - Systemic issues
       - Training data for prevention
  - **Output**: `.claude/context/artifacts/designs/reflection-error-integration-spec.md`
  - **Verify**: Specification complete

- [ ] **4.3** Implement error summary extraction function (~2 hours)
  - **Function**: `extractErrorSummary(dateRange)`
  - **Location**: Add to unified-reflection-handler.cjs or new module
  - **Returns**:
    ```javascript
    {
      totalErrors: number,
      errorsByType: { [type: string]: number },
      errorsByAgent: { [agent: string]: number },
      errorsByTool: { [tool: string]: number },
      topPatterns: string[],
      recoveryRate: number,
      recommendations: string[]
    }
    ```
  - **Output**: `.claude/hooks/reflection/error-summary-extractor.cjs`
  - **Verify**: Unit tests pass

- [ ] **4.4** Update reflection queue processor to include error digest (~1 hour)
  - **Changes**:
    - Add error summary to daily reflection output
    - Include error patterns in learnings extraction
    - Flag critical errors for immediate attention
  - **Output**: Update `reflection-queue-processor.cjs`
  - **Verify**: Reflection output includes error section

- [ ] **4.5** Create weekly error pattern analyzer (~1.5 hours)
  - **Function**: `analyzeWeeklyErrorPatterns()`
  - **Analysis**:
    - Group similar errors by message similarity
    - Identify recurring patterns (>3 occurrences)
    - Calculate trend (increasing/decreasing)
    - Generate recommendations
  - **Output**: `.claude/lib/analysis/error-pattern-analyzer.cjs`
  - **Verify**: Pattern detection accuracy >80%

- [ ] **4.6** Add error review to reflection workflow documentation (~30 min)
  - **Update**: `.claude/workflows/core/reflection-workflow.md`
  - **Add**:
    - Error review phase in daily reflection
    - Weekly error pattern analysis
    - Integration with learnings.md
  - **Verify**: Documentation complete and accurate

#### Phase 4 Success Criteria

- [ ] Error summary integrated into daily reflection
- [ ] Weekly pattern analysis automated
- [ ] Reflection output includes actionable error recommendations
- [ ] Documentation updated

---

### Phase 5: Implementation and Validation

**Purpose**: Implement all designed components and validate end-to-end
**Dependencies**: Phases 1-4 complete
**Duration**: 6-8 hours
**Parallel OK**: Partial

#### Tasks

- [ ] **5.1** Implement error-capture-post-tool.cjs hook (~2 hours)
  - **Trigger**: PostToolUse (all tools)
  - **Logic**:
    1. Check if tool execution resulted in error
    2. Capture context from pre-tool snapshot
    3. Sanitize sensitive data
    4. Write to error log
    5. Queue for reflection
  - **Output**: `.claude/hooks/safety/error-capture-post-tool.cjs`
  - **Verify**: Unit tests + integration test

- [ ] **5.2** Implement error-report.cjs CLI tool (~2 hours) [PARALLEL OK]
  - **Commands**: As specified in Phase 2 Task 2.5
  - **Output**: `.claude/tools/cli/error-report.cjs`
  - **Verify**: `node .claude/tools/cli/error-report.cjs --help` shows all commands

- [ ] **5.3** Register error capture hook in settings.json (~15 min)
  - **Registration**:
    ```json
    {
      "matcher": "",
      "hooks": [{
        "type": "command",
        "command": "node .claude/hooks/safety/error-capture-post-tool.cjs"
      }]
    }
    ```
  - **Output**: Update `.claude/settings.json`
  - **Verify**: Hook runs on PostToolUse

- [ ] **5.4** Apply tool assignment changes from Phase 3 (~1.5 hours)
  - **Changes**: Based on tool-assignment-recommendations.md
  - **Process**:
    1. Backup affected agent files
    2. Apply changes
    3. Run validation
  - **Output**: Updated agent definition files
  - **Verify**: `node .claude/tools/cli/validate-agents.js` passes

- [ ] **5.5** End-to-end validation testing (~1.5 hours)
  - **Test Cases**:
    1. Simulate tool error -> Verify error logged
    2. Check sanitization -> No sensitive data in logs
    3. Run reflection -> Error summary appears
    4. Generate report -> CLI produces correct output
  - **Output**: `.claude/context/artifacts/reports/error-logging-validation-report.md`
  - **Verify**: All test cases pass

- [ ] **5.6** Update CLAUDE.md with error logging documentation (~30 min)
  - **Add**:
    - Error logging configuration section
    - CLI usage examples
    - Troubleshooting guide
  - **Output**: Update `.claude/CLAUDE.md`
  - **Verify**: Documentation accurate

- [ ] **5.7** Create ADR for error logging decisions (~30 min)
  - **ADR**: ADR-065 Error Logging System Architecture
  - **Sections**: Context, Decision, Consequences, Alternatives
  - **Output**: Append to `.claude/context/memory/decisions.md`
  - **Verify**: ADR follows standard format

#### Phase 5 Success Criteria

- [ ] All hooks implemented and registered
- [ ] CLI tool functional
- [ ] Tool assignments updated
- [ ] End-to-end tests pass
- [ ] Documentation complete

---

### Phase FINAL: Evolution and Reflection Check

**Purpose**: Quality assessment and learning extraction

**Tasks**:

1. Spawn reflection-agent to analyze completed work
2. Extract learnings and update memory files
3. Check for evolution opportunities (new agents/skills needed)

**Spawn Command**:
```javascript
Task({
  subagent_type: "reflection-agent",
  description: "Session reflection and learning extraction",
  prompt: "You are REFLECTION-AGENT. Read .claude/agents/core/reflection-agent.md. Analyze the completed work from this plan, extract learnings to memory files, and check for evolution opportunities (patterns that suggest new agents or skills should be created)."
})
```

**Success Criteria**:
- Reflection-agent spawned and completed
- Learnings extracted to `.claude/context/memory/learnings.md`
- Evolution opportunities logged if any detected

---

## Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Sensitive data leaks in error logs | HIGH | MEDIUM | Comprehensive sanitization patterns, automated detection |
| Error log volume overwhelming | MEDIUM | LOW | Rotation strategy, aggregation, severity filtering |
| Performance impact from error hooks | MEDIUM | LOW | Fail-open default, async logging |
| Agents with incorrect tools cause failures | HIGH | MEDIUM | Validation schema, tool-availability-validator.cjs |
| Reflection workflow overwhelmed by errors | MEDIUM | LOW | Summarization, top-N limits |

## Timeline Summary

| Phase | Tasks | Est. Time | Parallel? | Dependencies |
|-------|-------|-----------|-----------|--------------|
| 0 | 4 | 4-6 hours | No | None |
| 1 | 7 | 6-8 hours | Partial | Phase 0 |
| 2 | 7 | 8-10 hours | Partial | Phase 0 |
| 3 | 6 | 4-6 hours | Yes | Phase 1 |
| 4 | 6 | 4-6 hours | No | Phase 2 |
| 5 | 7 | 6-8 hours | Partial | Phases 1-4 |
| FINAL | 3 | 1-2 hours | No | Phase 5 |
| **Total** | **38** | **28-40 hours** | | |

## Deliverables Summary

| Deliverable | Location | Phase |
|-------------|----------|-------|
| Agent Tools Inventory | `.claude/context/artifacts/reports/agent-tools-inventory.md` | 1 |
| Approved Tools List | `.claude/context/artifacts/approved-tools-list.md` | 1 |
| Tool Mismatch Report | `.claude/context/artifacts/reports/tool-mismatch-report.md` | 1 |
| Tool Dependency Matrix | `.claude/context/artifacts/tool-dependency-matrix.md` | 1 |
| Error Log Schema | `.claude/schemas/error-log-schema.json` | 2 |
| Error Sanitizer | `.claude/lib/utils/error-sanitizer.cjs` | 2 |
| Error Capture Architecture | `.claude/context/artifacts/designs/error-capture-architecture.md` | 2 |
| Error Report CLI | `.claude/tools/cli/error-report.cjs` | 5 |
| Tool Assignment Reviews | `.claude/context/artifacts/reports/*-tool-review.md` | 3 |
| Reflection Integration Spec | `.claude/context/artifacts/designs/reflection-error-integration-spec.md` | 4 |
| Error Summary Extractor | `.claude/hooks/reflection/error-summary-extractor.cjs` | 4 |
| Error Pattern Analyzer | `.claude/lib/analysis/error-pattern-analyzer.cjs` | 4 |
| Error Capture Hook | `.claude/hooks/safety/error-capture-post-tool.cjs` | 5 |
| Validation Report | `.claude/context/artifacts/reports/error-logging-validation-report.md` | 5 |
| ADR-065 | `.claude/context/memory/decisions.md` | 5 |

---

## Commit Checkpoint

**Note**: This plan modifies 15+ files across multiple phases. A commit checkpoint should be created after Phase 3 completion:

```bash
git add . && git commit -m "checkpoint: Phase 1-3 foundation complete (tools audit + error logging design)"
```

This creates a recovery point before Phase 4-5 integration work.

---

## Appendix A: Tool Categories Reference

### Core Tools (Always Available)
- Read, Write, Edit, Bash, Grep, Glob
- TaskUpdate, TaskList, TaskCreate, TaskGet
- Skill

### Task Tools (Router/Orchestrator Only)
- Task (spawns subagents)

### MCP Tools (Require Server Configuration)
- mcp__Exa__web_search_exa
- mcp__Exa__get_code_context_exa
- mcp__sequential-thinking__sequentialthinking

### Deprecated/Invalid Tools
- SequentialThinking (use Skill({ skill: 'sequential-thinking' }) instead)
- Search (not a valid tool, use Grep/Glob)
- WebSearch (use mcp__Exa__web_search_exa if configured)

---

## Appendix B: Error Severity Classification

| Severity | Criteria | Example |
|----------|----------|---------|
| CRITICAL | System halt, data loss risk | Hook crash, file corruption |
| HIGH | Feature broken, workaround exists | Tool validation failure |
| MEDIUM | Degraded experience | Slow response, retry succeeded |
| LOW | Cosmetic, logging | Warning message, deprecation notice |

---

## Appendix C: Sanitization Patterns

```javascript
const SANITIZATION_PATTERNS = [
  { name: 'api_key', pattern: /[A-Za-z0-9_-]{32,}/, replacement: '[API_KEY_REDACTED]' },
  { name: 'password', pattern: /password[=:][^\s]+/gi, replacement: 'password=[REDACTED]' },
  { name: 'private_key', pattern: /-----BEGIN.*PRIVATE KEY-----[\s\S]*?-----END.*PRIVATE KEY-----/g, replacement: '[PRIVATE_KEY_REDACTED]' },
  { name: 'aws_key', pattern: /AKIA[0-9A-Z]{16}/, replacement: '[AWS_KEY_REDACTED]' },
  { name: 'env_var', pattern: /process\.env\.[A-Z_]+/g, replacement: '[ENV_VAR_REDACTED]' },
  { name: 'connection_string', pattern: /:\/\/[^:]+:[^@]+@/g, replacement: '://[CREDENTIALS_REDACTED]@' }
];
```
