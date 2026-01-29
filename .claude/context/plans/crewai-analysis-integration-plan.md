# Plan: crewAI Codebase Analysis and Integration

## Overview

Deep dive into the crewAI codebase to identify architectural patterns, features, and capabilities that can enhance our agent-studio framework. This plan follows the EVOLVE workflow with mandatory research validation before any implementation.

**Plan Date**: 2026-01-28
**Framework Version**: Agent-Studio v2.2.1
**Status**: Phase 0 - Research

## Executive Summary

The crewAI framework provides a mature Python-based multi-agent orchestration system with several sophisticated features that could significantly enhance our JavaScript/TypeScript-based agent-studio framework. Key areas of interest include:

1. **Memory Systems**: Multi-tiered memory (short-term, long-term, entity, external, contextual)
2. **Flow Orchestration**: Event-driven workflow framework with decorators (@start, @listen, @router)
3. **Process Types**: Sequential, hierarchical (and planned consensual) execution
4. **Tool System**: Base tool abstraction with MCP integration
5. **Knowledge Integration**: Multi-source knowledge management (PDF, CSV, JSON, etc.)
6. **Event Bus**: Comprehensive event system for tracing, logging, and monitoring
7. **Guardrails**: Task-level validation with retry mechanisms
8. **Security**: Fingerprinting and security configurations

## Key Findings from crewAI Analysis

### Architecture Comparison

| Feature          | crewAI (Python)            | Agent-Studio (JS)  | Gap                     |
| ---------------- | -------------------------- | ------------------ | ----------------------- |
| Agent Definition | Pydantic models            | Markdown files     | Different paradigm      |
| Task Execution   | Sync/Async with futures    | Task tool spawning | Similar approach        |
| Memory           | 5-tier system              | File-based memory  | Enhancement opportunity |
| Workflows        | Flow decorators            | Markdown workflows | Could adopt decorators  |
| Tools            | BaseTool + @tool decorator | Skill system       | Complementary           |
| Events           | Event bus with tracing     | Hook system        | Enhancement opportunity |
| Knowledge        | Multi-source ingestion     | Not implemented    | Major gap               |
| Guardrails       | Task-level validation      | Hook validators    | Enhancement opportunity |
| Processes        | Sequential/Hierarchical    | Router-based       | Could add process types |

### crewAI Key Files Analyzed

- `crew.py` (~1900 lines): Core orchestration, memory init, process execution
- `task.py` (~1100 lines): Task definition, guardrails, execution
- `agent/core.py`: Agent definition and execution
- `flow/flow.py` (~2500 lines): Event-driven workflow framework
- `tools/base_tool.py` (~550 lines): Tool abstraction
- `memory/contextual/contextual_memory.py`: Multi-memory aggregation
- `knowledge/`: Multi-source knowledge management

## Phases

### Phase 0: Research & Planning (FOUNDATION)

**Purpose**: Research crewAI patterns, validate technical approach, assess integration feasibility
**Duration**: 4-6 hours
**Parallel OK**: No (blocking for subsequent phases)

#### Research Requirements (MANDATORY)

Before creating ANY artifact:

- [ ] Minimum 3 external sources consulted on multi-agent orchestration patterns
- [ ] Minimum 3 crewAI documentation/blog sources reviewed
- [ ] Research report generated and saved
- [ ] Design decisions documented with rationale

**Research Output**: `.claude/context/artifacts/research-reports/crewai-integration-research-2026-01-28.md`

#### Constitution Checkpoint

**CRITICAL VALIDATION**: Before proceeding to Phase 1, ALL of the following MUST pass:

1. **Research Completeness**
   - [ ] Research report contains minimum 3 external sources
   - [ ] All [NEEDS CLARIFICATION] items resolved
   - [ ] ADRs created for major decisions

2. **Technical Feasibility**
   - [ ] Python-to-JS pattern translation validated
   - [ ] Dependencies identified and available
   - [ ] No blocking technical issues discovered

3. **Security Review**
   - [ ] Security implications assessed
   - [ ] Memory persistence risks evaluated
   - [ ] External integration security documented

4. **Specification Quality**
   - [ ] Acceptance criteria are measurable
   - [ ] Success criteria are clear and testable
   - [ ] Edge cases considered and documented

**If ANY item fails, return to research phase. DO NOT proceed to implementation.**

#### Phase 0 Tasks

1. **Task 0.1**: Research multi-agent memory patterns (~2 hours)
   - Query: "multi-agent memory systems best practices"
   - Query: "AI agent context persistence patterns"
   - Query: "vector storage for agent memory"
   - **Output**: Memory patterns research section in research report

2. **Task 0.2**: Research event-driven agent orchestration (~2 hours)
   - Query: "event bus patterns for AI agents"
   - Query: "crewAI flow orchestration"
   - Query: "agent workflow state management"
   - **Output**: Event patterns research section in research report

3. **Task 0.3**: Document architectural decisions (~1 hour)
   - Create ADR for memory system enhancement
   - Create ADR for event bus integration
   - Create ADR for knowledge system approach
   - **Output**: `.claude/context/memory/decisions.md` updates

**Success Criteria**: Research complete, decisions documented, constitution checkpoint passed

---

### Phase 1: Deep Exploration of crewAI Codebase

**Purpose**: Comprehensive understanding of crewAI architecture and patterns
**Dependencies**: Phase 0 complete
**Parallel OK**: Yes (tasks 1.1-1.6 can run in parallel)

#### Tasks

- [ ] **1.1** Analyze crewAI Crew orchestration patterns (~1 hour)
  - **Agent**: `architect`
  - **Focus**: Process types, task execution flow, memory initialization
  - **Files**: `crew.py`, `process.py`
  - **Output**: Crew orchestration analysis document
  - **Verify**: Analysis document exists with execution patterns documented

- [ ] **1.2** Analyze crewAI Agent implementation (~1 hour)
  - **Agent**: `architect`
  - **Focus**: Agent definition, tool binding, delegation patterns
  - **Files**: `agent/core.py`, `agents/agent_builder/`
  - **Output**: Agent implementation analysis document
  - **Verify**: Analysis document exists with agent lifecycle documented

- [ ] **1.3** Analyze crewAI Memory system (~1.5 hours)
  - **Agent**: `architect`
  - **Focus**: Short-term, long-term, entity, external, contextual memory
  - **Files**: `memory/**/*.py`
  - **Output**: Memory system analysis document
  - **Verify**: Analysis document exists with all memory types documented

- [ ] **1.4** Analyze crewAI Flow framework (~1.5 hours)
  - **Agent**: `architect`
  - **Focus**: @start, @listen, @router decorators, state management
  - **Files**: `flow/**/*.py`
  - **Output**: Flow framework analysis document
  - **Verify**: Analysis document exists with decorator patterns documented

- [ ] **1.5** Analyze crewAI Tool system (~1 hour)
  - **Agent**: `architect`
  - **Focus**: BaseTool, @tool decorator, MCP integration
  - **Files**: `tools/**/*.py`
  - **Output**: Tool system analysis document
  - **Verify**: Analysis document exists with tool creation patterns documented

- [ ] **1.6** Analyze crewAI Event/Tracing system (~1 hour)
  - **Agent**: `architect`
  - **Focus**: Event bus, event types, tracing listeners
  - **Files**: `events/**/*.py`
  - **Output**: Event system analysis document
  - **Verify**: Analysis document exists with event types cataloged

#### Phase 1 Verification Gate

```bash
# All analysis documents exist
ls .claude/context/artifacts/crewai-analysis/
# Expect: crew-analysis.md, agent-analysis.md, memory-analysis.md, flow-analysis.md, tool-analysis.md, event-analysis.md
```

**Success Criteria**: All 6 analysis documents created with detailed findings

---

### Phase 2: Comparative Analysis

**Purpose**: Compare crewAI patterns with agent-studio and identify gaps/opportunities
**Dependencies**: Phase 1 complete
**Parallel OK**: Yes (tasks 2.1-2.4 can run in parallel)

#### Tasks

- [ ] **2.1** Compare Agent systems (~1 hour)
  - **Agent**: `architect`
  - **Focus**: crewAI Agent vs agent-studio agents (markdown-based)
  - **Our files**: `.claude/agents/**/*.md`
  - **Output**: Agent comparison matrix
  - **Verify**: Matrix document with feature comparison

- [ ] **2.2** Compare Memory systems (~1 hour)
  - **Agent**: `architect`
  - **Focus**: crewAI 5-tier memory vs our file-based memory
  - **Our files**: `.claude/context/memory/*.md`, `.claude/lib/memory/*.cjs`
  - **Output**: Memory comparison matrix with gap analysis
  - **Verify**: Matrix document with identified enhancements

- [ ] **2.3** Compare Workflow systems (~1 hour)
  - **Agent**: `architect`
  - **Focus**: crewAI Flow decorators vs our markdown workflows
  - **Our files**: `.claude/workflows/**/*.md`
  - **Output**: Workflow comparison matrix
  - **Verify**: Matrix document with pattern opportunities

- [ ] **2.4** Compare Hook/Event systems (~1 hour)
  - **Agent**: `architect`
  - **Focus**: crewAI Event bus vs our hook system
  - **Our files**: `.claude/hooks/**/*.cjs`
  - **Output**: Hook/event comparison matrix
  - **Verify**: Matrix document with consolidation opportunities

#### Phase 2 Error Handling

If any task fails:

1. Document error: `echo "Phase 2 failed: [error]" >> .claude/context/memory/issues.md`
2. Return to Phase 1 for clarification if analysis was incomplete
3. Do NOT proceed to Phase 3

#### Phase 2 Verification Gate

```bash
# All comparison matrices exist
ls .claude/context/artifacts/crewai-analysis/comparison/
# Expect: agent-comparison.md, memory-comparison.md, workflow-comparison.md, hook-comparison.md
```

**Success Criteria**: All 4 comparison matrices created with clear gap analysis

---

### Phase 3: Research Validation & Specification

**Purpose**: Validate findings with external research and create specifications
**Dependencies**: Phase 2 complete
**Parallel OK**: Partial (3.1-3.2 parallel, then 3.3-3.4)

#### Commit Checkpoint (REQUIRED for multi-file project)

Before starting Phase 3 implementation:

```bash
git add . && git commit -m "checkpoint: Phase 1-2 crewAI analysis complete"
```

#### Tasks

- [ ] **3.1** Research validation for memory enhancements (~2 hours)
  - **Agent**: `researcher` (invoke research-synthesis skill)
  - **Focus**: Validate memory patterns against industry best practices
  - **Queries**:
    - "vector database for agent memory RAG"
    - "semantic memory vs episodic memory AI agents"
    - "memory consolidation patterns multi-agent systems"
  - **Output**: `.claude/context/artifacts/research-reports/memory-enhancement-validation.md`
  - **Verify**: Research report with 3+ external sources

- [ ] **3.2** Research validation for event system enhancements (~2 hours)
  - **Agent**: `researcher` (invoke research-synthesis skill)
  - **Focus**: Validate event patterns against observability best practices
  - **Queries**:
    - "event sourcing AI agent orchestration"
    - "OpenTelemetry multi-agent tracing"
    - "agent observability patterns"
  - **Output**: `.claude/context/artifacts/research-reports/event-enhancement-validation.md`
  - **Verify**: Research report with 3+ external sources

- [ ] **3.3** Create specification for Memory System Enhancement (~2 hours)
  - **Agent**: `planner` (invoke spec-writing skill)
  - **Focus**: Detailed spec for multi-tier memory system
  - **Based on**: crewAI memory analysis + research validation
  - **Output**: `.claude/context/artifacts/specifications/memory-system-spec.md`
  - **Verify**: Spec document with acceptance criteria

- [ ] **3.4** Create specification for Event Bus Integration (~2 hours)
  - **Agent**: `planner` (invoke spec-writing skill)
  - **Focus**: Detailed spec for enhanced event system
  - **Based on**: crewAI event analysis + research validation
  - **Output**: `.claude/context/artifacts/specifications/event-bus-spec.md`
  - **Verify**: Spec document with acceptance criteria

#### Phase 3 Verification Gate

```bash
# Research reports exist with 3+ sources each
grep -c "Source:" .claude/context/artifacts/research-reports/memory-enhancement-validation.md
grep -c "Source:" .claude/context/artifacts/research-reports/event-enhancement-validation.md
# Both should return >= 3

# Spec documents exist with acceptance criteria
grep "Acceptance Criteria" .claude/context/artifacts/specifications/memory-system-spec.md
grep "Acceptance Criteria" .claude/context/artifacts/specifications/event-bus-spec.md
```

**Success Criteria**: Research validated, specifications created with acceptance criteria

---

### Phase 4: Feature Prioritization & Implementation Planning

**Purpose**: Prioritize enhancements and create implementation tasks
**Dependencies**: Phase 3 complete
**Parallel OK**: No (sequential prioritization)

#### Tasks

- [ ] **4.1** Prioritize enhancement opportunities (~1 hour)
  - **Agent**: `planner`
  - **Focus**: Impact vs effort analysis for all identified enhancements
  - **Input**: All comparison matrices and specifications
  - **Output**: Prioritized enhancement list with rationale
  - **Verify**: Priority matrix with P1/P2/P3 classifications

- [ ] **4.2** Create implementation tasks for P1 features (~1 hour)
  - **Agent**: `planner` (invoke task-breakdown skill)
  - **Focus**: Break down P1 features into Epic -> Story -> Task
  - **Output**: Task list with dependencies
  - **Verify**: TaskCreate calls for all P1 tasks

- [ ] **4.3** Create implementation plan document (~1 hour)
  - **Agent**: `planner` (invoke plan-generator skill)
  - **Focus**: Detailed implementation plan with phases
  - **Output**: `.claude/context/plans/crewai-enhancements-implementation-plan.md`
  - **Verify**: Plan document with phases, tasks, verification gates

#### Prioritization Criteria

| Priority         | Impact | Effort   | Alignment | Example Features                  |
| ---------------- | ------ | -------- | --------- | --------------------------------- |
| P1 (MVP)         | High   | Low-Med  | High      | Memory persistence, Event logging |
| P2 (Enhancement) | High   | Med-High | Med       | Knowledge system, Flow decorators |
| P3 (Future)      | Med    | High     | Low       | Full process types, Guardrails    |

#### Phase 4 Verification Gate

```bash
# Priority matrix exists
ls .claude/context/artifacts/crewai-analysis/priority-matrix.md

# Implementation plan exists
ls .claude/context/plans/crewai-enhancements-implementation-plan.md

# P1 tasks created
TaskList() | grep "P1-"
```

**Success Criteria**: Features prioritized, implementation plan created

---

### Phase 5: Enabler Tasks (Shared Infrastructure)

**Purpose**: Create foundational infrastructure before feature implementation
**Dependencies**: Phase 4 complete
**Parallel OK**: Yes (enabler tasks are independent)

#### Tasks

- [ ] **ENABLER-1.1** Create enhanced memory system schema (~2 hours)
  - **Agent**: `developer`
  - **Focus**: Define memory storage interfaces
  - **Output**: `.claude/lib/memory/interfaces.cjs`
  - **Verify**: Interface file with ShortTermMemory, LongTermMemory, EntityMemory types

- [ ] **ENABLER-1.2** Create event bus infrastructure (~2 hours)
  - **Agent**: `developer`
  - **Focus**: Event bus implementation with typed events
  - **Output**: `.claude/lib/events/event-bus.cjs`
  - **Verify**: Event bus module with emit/on/off methods

- [ ] **ENABLER-1.3** Create knowledge storage interface (~2 hours)
  - **Agent**: `developer`
  - **Focus**: Knowledge source abstraction
  - **Output**: `.claude/lib/knowledge/knowledge-storage.cjs`
  - **Verify**: Interface for multiple knowledge source types

#### Phase 5 Verification Gate

```bash
# All enabler files exist
ls .claude/lib/memory/interfaces.cjs
ls .claude/lib/events/event-bus.cjs
ls .claude/lib/knowledge/knowledge-storage.cjs

# Unit tests pass
node --test .claude/lib/memory/interfaces.test.cjs
node --test .claude/lib/events/event-bus.test.cjs
node --test .claude/lib/knowledge/knowledge-storage.test.cjs
```

**Success Criteria**: All enabler infrastructure created with passing tests

---

### Phase 6: P1 Feature Implementation

**Purpose**: Implement prioritized features following TDD workflow
**Dependencies**: Phase 5 complete (all enablers)
**Parallel OK**: Yes (features are independent after enablers)

#### Tasks

- [ ] **P1-1.1** Implement Short-Term Memory with vector search (~4 hours)
  - **Agent**: `developer` (invoke tdd skill)
  - **Focus**: In-memory vector storage for recent context
  - **Output**: `.claude/lib/memory/short-term-memory.cjs`
  - **Verify**: Unit tests pass, search returns relevant results

- [ ] **P1-1.2** Implement Long-Term Memory with SQLite (~4 hours)
  - **Agent**: `developer` (invoke tdd skill)
  - **Focus**: Persistent storage with metadata
  - **Output**: `.claude/lib/memory/long-term-memory.cjs`
  - **Verify**: Unit tests pass, persistence across restarts

- [ ] **P1-2.1** Implement typed event emission (~3 hours)
  - **Agent**: `developer` (invoke tdd skill)
  - **Focus**: Typed events for task/agent/crew lifecycle
  - **Output**: `.claude/lib/events/event-types.cjs`
  - **Verify**: Event types defined, emission works

- [ ] **P1-2.2** Implement tracing listener (~3 hours)
  - **Agent**: `developer` (invoke tdd skill)
  - **Focus**: OpenTelemetry-compatible tracing
  - **Output**: `.claude/lib/events/tracing-listener.cjs`
  - **Verify**: Traces captured, spans created

#### Phase 6 Error Handling

If any task fails:

1. Run rollback: `git checkout -- .claude/lib/`
2. Document: `echo "Phase 6 failed: $(date)" >> .claude/context/memory/issues.md`
3. Fix issue and retry (do NOT proceed to Phase 7 with failing tests)

#### Phase 6 Verification Gate

```bash
# All P1 implementations exist
ls .claude/lib/memory/short-term-memory.cjs
ls .claude/lib/memory/long-term-memory.cjs
ls .claude/lib/events/event-types.cjs
ls .claude/lib/events/tracing-listener.cjs

# All tests pass
node --test .claude/lib/memory/*.test.cjs
node --test .claude/lib/events/*.test.cjs
```

**Success Criteria**: All P1 features implemented with passing tests

---

### Phase 7: Integration & Documentation

**Purpose**: Integrate new features and update documentation
**Dependencies**: Phase 6 complete
**Parallel OK**: Yes (integration and docs can be parallel)

#### Tasks

- [ ] **7.1** Integrate memory system with agent spawning (~2 hours)
  - **Agent**: `developer`
  - **Focus**: Update Task tool to use new memory
  - **Output**: Updated `.claude/lib/workflow/` modules
  - **Verify**: Integration tests pass

- [ ] **7.2** Integrate event system with hooks (~2 hours)
  - **Agent**: `developer`
  - **Focus**: Connect event bus to existing hook system
  - **Output**: Updated hook modules
  - **Verify**: Events fire during hook execution

- [ ] **7.3** Update CLAUDE.md with new features (~1 hour)
  - **Agent**: `technical-writer`
  - **Focus**: Document new memory and event systems
  - **Output**: Updated `.claude/CLAUDE.md`
  - **Verify**: Documentation includes usage examples

- [ ] **7.4** Create migration guide (~1 hour)
  - **Agent**: `technical-writer`
  - **Focus**: Guide for adopting new features
  - **Output**: `.claude/docs/MIGRATION_CREWAI_FEATURES.md`
  - **Verify**: Guide includes before/after examples

#### Phase 7 Verification Gate

```bash
# Integration tests pass
node --test tests/integration/*.test.cjs

# Documentation updated
grep "Memory System" .claude/CLAUDE.md
grep "Event Bus" .claude/CLAUDE.md

# Migration guide exists
ls .claude/docs/MIGRATION_CREWAI_FEATURES.md
```

**Success Criteria**: Features integrated, documentation updated

---

### Phase FINAL: Evolution & Reflection Check

**Purpose**: Quality assessment and learning extraction
**Dependencies**: Phase 7 complete

#### Tasks

1. Spawn reflection-agent to analyze completed work
2. Extract learnings and update memory files
3. Check for evolution opportunities (new agents/skills needed)

**Spawn Command**:

```javascript
Task({
  subagent_type: 'reflection-agent',
  description: 'Session reflection and learning extraction',
  prompt:
    'You are REFLECTION-AGENT. Read .claude/agents/core/reflection-agent.md. Analyze the completed crewAI analysis and integration work, extract learnings to memory files, and check for evolution opportunities (patterns that suggest new agents or skills should be created).',
});
```

**Success Criteria**:

- Reflection-agent spawned and completed
- Learnings extracted to `.claude/context/memory/learnings.md`
- Evolution opportunities logged if any detected
- Session handoff document created for future reference

---

## Risks

| Risk                                | Impact | Mitigation                  | Rollback                        |
| ----------------------------------- | ------ | --------------------------- | ------------------------------- |
| Python-to-JS translation complexity | High   | Start with simpler patterns | Skip complex features for P2/P3 |
| Memory persistence performance      | Medium | Benchmark early             | Use simpler file-based fallback |
| Event bus overhead                  | Medium | Lazy initialization         | Disable in production initially |
| Breaking existing workflows         | High   | Feature flags               | Revert to previous hooks        |

## Timeline Summary

| Phase     | Tasks  | Est. Time     | Parallel? | Dependencies |
| --------- | ------ | ------------- | --------- | ------------ |
| 0         | 3      | 5 hours       | No        | None         |
| 1         | 6      | 7 hours       | Yes       | Phase 0      |
| 2         | 4      | 4 hours       | Yes       | Phase 1      |
| 3         | 4      | 8 hours       | Partial   | Phase 2      |
| 4         | 3      | 3 hours       | No        | Phase 3      |
| 5         | 3      | 6 hours       | Yes       | Phase 4      |
| 6         | 4      | 14 hours      | Yes       | Phase 5      |
| 7         | 4      | 6 hours       | Yes       | Phase 6      |
| FINAL     | 1      | 1 hour        | No        | Phase 7      |
| **Total** | **32** | **~54 hours** |           |              |

## Enhancement Recommendations

Based on the crewAI analysis, the following enhancements are recommended in priority order:

### P1 - Must Have (MVP)

1. **Enhanced Memory System** - Multi-tier memory (STM, LTM, Entity)
   - Impact: High - Enables context persistence across sessions
   - Effort: Medium - Core infrastructure change
   - crewAI Reference: `memory/` module

2. **Event Bus Integration** - Typed events with tracing
   - Impact: High - Enables observability and debugging
   - Effort: Low - Add-on to existing hooks
   - crewAI Reference: `events/` module

### P2 - Should Have

3. **Knowledge System** - Multi-source knowledge ingestion
   - Impact: High - Enables RAG workflows
   - Effort: High - New system
   - crewAI Reference: `knowledge/` module

4. **Flow Decorators** - @start, @listen, @router patterns
   - Impact: Medium - Better workflow definition
   - Effort: Medium - Pattern translation
   - crewAI Reference: `flow/` module

5. **Task Guardrails** - Validation with retry mechanisms
   - Impact: Medium - Better error handling
   - Effort: Low - Extension of existing validation
   - crewAI Reference: `task.py` guardrail section

### P3 - Could Have

6. **Process Types** - Sequential, Hierarchical, Consensual
   - Impact: Medium - Different execution patterns
   - Effort: High - Architecture change
   - crewAI Reference: `process.py`

7. **Agent Training** - Train/test crew functionality
   - Impact: Low - Advanced use case
   - Effort: High - Complex feature
   - crewAI Reference: `crew.py` train method

8. **Flow Persistence** - State persistence with SQLite
   - Impact: Low - Long-running workflows
   - Effort: Medium - Storage extension
   - crewAI Reference: `flow/persistence/` module

---

## Output Locations

| Artifact            | Location                                                           |
| ------------------- | ------------------------------------------------------------------ |
| This Plan           | `.claude/context/plans/crewai-analysis-integration-plan.md`        |
| Research Reports    | `.claude/context/artifacts/research-reports/`                      |
| Analysis Documents  | `.claude/context/artifacts/crewai-analysis/`                       |
| Comparison Matrices | `.claude/context/artifacts/crewai-analysis/comparison/`            |
| Specifications      | `.claude/context/artifacts/specifications/`                        |
| Implementation Plan | `.claude/context/plans/crewai-enhancements-implementation-plan.md` |
| Priority Matrix     | `.claude/context/artifacts/crewai-analysis/priority-matrix.md`     |

---

## Appendix: crewAI Source Structure Reference

```
crewAI-main/lib/crewai/src/crewai/
├── agent/
│   └── core.py              # Agent definition
├── agents/
│   ├── agent_builder/       # Agent construction
│   └── cache/               # Caching
├── crew.py                  # Main orchestration (~1900 lines)
├── task.py                  # Task definition (~1100 lines)
├── process.py               # Process enum (sequential, hierarchical)
├── flow/
│   ├── flow.py             # Flow framework (~2500 lines)
│   ├── flow_wrappers.py    # Decorators
│   └── persistence/        # State persistence
├── memory/
│   ├── short_term/         # Short-term memory
│   ├── long_term/          # Long-term memory
│   ├── entity/             # Entity memory
│   ├── external/           # External memory
│   └── contextual/         # Contextual aggregation
├── tools/
│   ├── base_tool.py        # Tool abstraction
│   └── agent_tools/        # Built-in tools
├── events/
│   ├── event_bus.py        # Event bus
│   ├── types/              # Event types
│   └── listeners/          # Event listeners
├── knowledge/
│   ├── knowledge.py        # Knowledge management
│   └── source/             # Knowledge sources
└── utilities/              # Helpers and utilities
```
